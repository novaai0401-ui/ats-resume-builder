const assert = require('node:assert/strict');
const test = require('node:test');
const { JwtService } = require('@nestjs/jwt');
const { AuthService } = require('../dist/auth/auth.service.js');
const { JwtStrategy } = require('../dist/auth/jwt.strategy.js');

/**
 * R-106 regression. Before this, logout cleared only refreshTokenHash while
 * JwtStrategy checked signature/type/expiry and nothing else — so a copied
 * access token kept working for its full 7-day life after logout, while
 * /privacy and the API-access card both promised immediate invalidation.
 */

class StubConfig {
  constructor(values = {}) { this.values = values; }
  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : fallback;
  }
}

const CONFIG = new StubConfig({ JWT_SECRET: 'test-secret', JWT_REFRESH_SECRET: 'test-refresh' });

/** Minimal in-memory stand-in for the tables this feature touches. */
function fakePrisma({ tokenVersion = 0 } = {}) {
  const state = { tokenVersion, connectCodes: [], consumed: new Set() };
  return {
    state,
    user: {
      findUnique: async () => ({ id: 'u1', email: 'a@b.com', fullName: 'A', mobile: null, plan: 'FREE', tokenVersion: state.tokenVersion }),
      update: async (args) => {
        if (args.data?.tokenVersion?.increment) state.tokenVersion += args.data.tokenVersion.increment;
        return { id: 'u1' };
      },
    },
    connectCode: {
      create: async ({ data }) => { state.connectCodes.push({ id: `c${state.connectCodes.length}`, ...data }); return data; },
      findUnique: async ({ where }) => state.connectCodes.find((c) => c.codeHash === where.codeHash) || null,
      updateMany: async ({ where, data }) => {
        const row = state.connectCodes.find((c) => c.id === where.id && c.usedAt == null);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    consumedOAuthCode: {
      create: async ({ data }) => {
        if (state.consumed.has(data.jti)) throw new Error('unique constraint');
        state.consumed.add(data.jti);
        return data;
      },
    },
  };
}

test('logout invalidates access tokens immediately, as the privacy copy promises', async () => {
  const prisma = fakePrisma();
  const service = new AuthService(prisma, new JwtService(), CONFIG);
  const strategy = new JwtStrategy(CONFIG, prisma);

  const issued = await service.issueTokensForUser({ id: 'u1', email: 'a@b.com', fullName: 'A' });
  const payload = JSON.parse(Buffer.from(issued.accessToken.split('.')[1], 'base64').toString('utf8'));

  // Valid before logout…
  assert.deepEqual(await strategy.validate(payload), { userId: 'u1', email: 'a@b.com', mobile: undefined });

  await service.logout('u1');

  // …and refused immediately after, without waiting out the 7-day expiry.
  await assert.rejects(() => strategy.validate(payload), /signed out/);
});

test('disconnecting assistants revokes tokens the same way', async () => {
  const prisma = fakePrisma();
  const service = new AuthService(prisma, new JwtService(), CONFIG);
  const strategy = new JwtStrategy(CONFIG, prisma);

  const issued = await service.issueTokensForUser({ id: 'u1', email: 'a@b.com', fullName: 'A' });
  const payload = JSON.parse(Buffer.from(issued.accessToken.split('.')[1], 'base64').toString('utf8'));

  await service.revokeConnectors('u1');
  await assert.rejects(() => strategy.validate(payload), /signed out/);
});

test('tokens minted before R-106 (no tv claim) still work until the first revocation', async () => {
  // Deploying the revocation check must not sign the whole userbase out.
  const prisma = fakePrisma();
  const strategy = new JwtStrategy(CONFIG, prisma);
  const legacy = { sub: 'u1', email: 'a@b.com', typ: 'access' };
  assert.deepEqual(await strategy.validate(legacy), { userId: 'u1', email: 'a@b.com', mobile: undefined });

  prisma.state.tokenVersion = 1;
  await assert.rejects(() => strategy.validate(legacy), /signed out/);
});

test('a token for a deleted account is refused', async () => {
  const prisma = fakePrisma();
  prisma.user.findUnique = async () => null;
  const strategy = new JwtStrategy(CONFIG, prisma);
  await assert.rejects(() => strategy.validate({ sub: 'gone', email: 'x@y.com', typ: 'access', tv: 0 }), /no longer exists/);
});

test('a connect code works exactly once', async () => {
  const prisma = fakePrisma();
  const service = new AuthService(prisma, new JwtService(), CONFIG);

  const { code, expiresAt } = await service.createConnectCode('u1', 'ChatGPT');
  assert.ok(code.length >= 20, 'the code carries real entropy');
  assert.ok(new Date(expiresAt).getTime() > Date.now(), 'and has not already expired');
  // Only the hash is persisted — a database leak yields nothing redeemable.
  assert.ok(prisma.state.connectCodes.every((c) => c.codeHash !== code));

  const session = await service.redeemConnectCode(code);
  assert.ok(session.accessToken, 'first redemption issues a session');

  await assert.rejects(() => service.redeemConnectCode(code), /already used|invalid/);
});

test('an expired connect code is refused', async () => {
  const prisma = fakePrisma();
  const service = new AuthService(prisma, new JwtService(), CONFIG);
  const { code } = await service.createConnectCode('u1');
  prisma.state.connectCodes[0].expiresAt = new Date(Date.now() - 1000);
  await assert.rejects(() => service.redeemConnectCode(code), /invalid, already used, or expired/);
});

test('an OAuth authorization code can be spent only once', async () => {
  const prisma = fakePrisma();
  const service = new AuthService(prisma, new JwtService(), CONFIG);
  const expiry = new Date(Date.now() + 600_000);

  assert.deepEqual(await service.consumeOAuthCode('u1', 'jti-1', expiry), { ok: true });
  await assert.rejects(() => service.consumeOAuthCode('u1', 'jti-1', expiry), /already been used/);
});

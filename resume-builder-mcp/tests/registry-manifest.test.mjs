import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * R-127 — the MCP Registry entry must stay consistent with the package it
 * points at, because every inconsistency here is a REJECTION at publish time,
 * not a warning. Finding that out from a failed `mcp-publisher publish` costs
 * a release cycle; finding it out in CI costs nothing.
 *
 * The registry verifies npm ownership by requiring `mcpName` in package.json
 * to equal `name` in server.json — that pairing is the proof we control the
 * package, so a typo in either is indistinguishable from an impersonation
 * attempt and is refused.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(path.join(here, '..', f), 'utf-8'));

const server = read('server.json');
const pkg = read('package.json');

test('server.json name matches package.json mcpName (registry ownership proof)', () => {
  assert.equal(
    pkg.mcpName,
    server.name,
    'The registry rejects a package whose mcpName does not equal the server name.',
  );
});

test('the declared package version matches the package being published', () => {
  const npmEntry = server.packages.find((p) => p.registryType === 'npm');
  assert.ok(npmEntry, 'server.json must declare the npm package');
  assert.equal(npmEntry.identifier, pkg.name, 'npm identifier must be this package');
  assert.equal(npmEntry.version, pkg.version, 'npm package version must match package.json');
  assert.equal(server.version, pkg.version, 'server version must match package.json');
});

test('server.json pins a dated schema, not a floating one', () => {
  assert.match(
    server.$schema,
    /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/\d{4}-\d{2}-\d{2}\/server\.schema\.json$/,
    'a floating schema URL would let the contract change under us silently',
  );
});

test('only registry-supported sources are referenced', () => {
  // The official registry accepts npm only from registry.npmjs.org; a mirror
  // or private registry is refused.
  for (const p of server.packages) {
    if (p.registryType === 'npm') {
      assert.equal(p.registryBaseUrl, 'https://registry.npmjs.org');
    }
  }
  for (const r of server.remotes ?? []) {
    assert.match(r.url, /^https:\/\//, 'remote endpoints must be https');
    assert.ok(['streamable-http', 'sse'].includes(r.type), `unknown remote type: ${r.type}`);
  }
});

test('the listing describes the product, not a placeholder', () => {
  assert.ok(server.description.length >= 60, 'description is what a client shows in its picker');
  assert.match(server.websiteUrl, /^https:\/\//);
  assert.equal(server.repository.subfolder, 'resume-builder-mcp', 'monorepo path must be declared');
});

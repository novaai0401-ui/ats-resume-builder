import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev_secret'),
    });
  }

  /**
   * R-106 — a valid signature is no longer sufficient.
   *
   * This used to check the signature, `typ` and expiry and nothing else, so
   * a copied access token stayed usable for its full 7-day life even after
   * the user logged out — while /privacy promised the opposite. Every token
   * now carries the revocation counter (`tv`) it was issued at; logout and
   * "disconnect assistants" increment the stored counter, and anything
   * issued before that point stops working on its next request.
   *
   * Cost: one indexed primary-key lookup per authenticated request. That is
   * the price of being able to revoke at all, and it is what the trust copy
   * already claims we do.
   */
  async validate(payload: { sub: string; email: string; mobile?: string; typ?: string; tv?: number }) {
    if (payload.typ && payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true },
    });
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    // Tokens minted before R-106 carry no `tv`; they count as version 0, so
    // deploying this does not sign existing users out. The first logout
    // after deployment bumps the counter and retires them.
    if ((payload.tv ?? 0) < user.tokenVersion) {
      throw new UnauthorizedException('This session was signed out. Sign in again.');
    }

    return { userId: payload.sub, email: payload.email, mobile: payload.mobile };
  }
}

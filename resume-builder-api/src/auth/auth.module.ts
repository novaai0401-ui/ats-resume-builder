import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { SocialAuthService } from './social-auth.service';
import { SocialAuthController } from './social-auth.controller';
import { ResumeModule } from '../resume/resume.module';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleDriveController } from './google-drive.controller';
import { DriveSessionService } from './drive-session.service';
import { GOOGLE_DRIVE_CLIENT, GoogleDriveHttpClient, GoogleDriveService } from './google-drive.service';
import { REDIS_CLIENT, RedisClientService } from './redisClient';
import { GoogleTokenStore } from './tokenStore';

function resolveJwtSecret(config: ConfigService): string {
  const value = config.get<string>('JWT_SECRET');
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a secure value (>=16 chars) in production');
  }
  return value || 'dev_secret';
}

@Module({
  imports: [
    ConfigModule,
    ResumeModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: {
          expiresIn: durationToSeconds(config.get<string>('JWT_EXPIRES_IN', '7d')),
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    SocialAuthService,
    JwtStrategy,
    DriveSessionService,
    RedisClientService,
    GoogleTokenStore,
    GoogleDriveService,
    GoogleDriveHttpClient,
    {
      provide: GOOGLE_DRIVE_CLIENT,
      useExisting: GoogleDriveHttpClient,
    },
    {
      provide: REDIS_CLIENT,
      useExisting: RedisClientService,
    },
  ],
  controllers: [AuthController, SocialAuthController, GoogleAuthController, GoogleDriveController],
  exports: [AuthService],
})
export class AuthModule {}

function durationToSeconds(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 7 * 24 * 60 * 60;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 24 * 60 * 60;
    default:
      return 7 * 24 * 60 * 60;
  }
}

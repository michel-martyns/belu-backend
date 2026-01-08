import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientAuthService } from './client-auth.service';
import { ClientAuthController } from './client-auth.controller';
import { ClientJwtStrategy } from './strategies/client-jwt.strategy';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret:
            configService.get('CLIENT_JWT_SECRET') ||
            configService.get('JWT_SECRET') ||
            'fallback-secret',
          signOptions: {
            expiresIn: configService.get('JWT_EXPIRES_IN') || '15m',
          },
        };
      },
    }),
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientJwtStrategy],
  exports: [ClientAuthService],
})
export class ClientAuthModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('USER_JWT_SECRET') || config.get('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn: '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

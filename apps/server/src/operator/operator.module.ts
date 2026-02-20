import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { OperatorController, OperatorAuthController } from './operator.controller';
import { OperatorService } from './operator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OperatorJwtStrategy } from './operator-jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('OPERATOR_JWT_SECRET') || config.get('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn: '7d',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OperatorController, OperatorAuthController],
  providers: [OperatorService, OperatorJwtStrategy],
  exports: [OperatorService],
})
export class OperatorModule {}

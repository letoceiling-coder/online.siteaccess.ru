import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WidgetGateway } from './gateways/widget.gateway';
import { OperatorGateway } from './gateways/operator.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from './redis.module';
import { CallsModule } from '../calls/calls.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    CallsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN') || '15m',
        },
      }),
      inject: [ConfigService],
    }),
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
  providers: [WidgetGateway, OperatorGateway],
})
export class WebsocketModule {}

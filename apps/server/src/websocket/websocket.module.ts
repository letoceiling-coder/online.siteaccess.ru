import { Module } from '@nestjs/common';
import { WidgetGateway } from './gateways/widget.gateway';
import { OperatorGateway } from './gateways/operator.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from './redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [WidgetGateway, OperatorGateway],
})
export class WebsocketModule {}

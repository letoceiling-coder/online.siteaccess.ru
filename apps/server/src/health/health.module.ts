import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../websocket/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}

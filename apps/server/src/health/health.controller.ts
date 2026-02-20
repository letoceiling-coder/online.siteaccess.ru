import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  @Get('health')
  async getHealth() {
    let db = false;
    let redis = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }

    try {
      await this.redis.ping();
      redis = true;
    } catch {
      redis = false;
    }

    return {
      ok: db && redis,
      ts: new Date().toISOString(),
      db,
      redis,
    };
  }
}

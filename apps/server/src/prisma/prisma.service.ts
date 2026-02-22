import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// Type augmentation to ensure TypeScript recognizes Prisma delegates
declare module '@prisma/client' {
  interface PrismaClient {
    channelMember: {
      findUnique: (args: any) => Promise<any>;
      findMany: (args: any) => Promise<any>;
      create: (args: any) => Promise<any>;
      update: (args: any) => Promise<any>;
      upsert: (args: any) => Promise<any>;
      delete: (args: any) => Promise<any>;
    };
  }
}

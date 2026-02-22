import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { ChannelsModule } from './channels/channels.module';
import { WidgetModule } from './widget/widget.module';
import { HealthModule } from './health/health.module';
import { WebsocketModule } from './websocket/websocket.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { OperatorModule } from './operator/operator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'operator-web', 'dist'),
      serveRoot: '/operator',
      serveStaticOptions: {
        index: 'index.html',
      },
    }),
    PrismaModule,
    ChannelsModule,
    WidgetModule,
    HealthModule,
    WebsocketModule,
    AuthModule,
    ProjectsModule,
    OperatorModule,
  ],
  providers: [
            {
              provide: APP_GUARD,
              useClass: ThrottlerGuard,
            },
  ],
})
export class AppModule {}

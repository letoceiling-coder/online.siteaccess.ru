import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { ChannelsModule } from './channels/channels.module';
import { WidgetModule } from './widget/widget.module';
import { HealthModule } from './health/health.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'widget', 'dist'),
      serveRoot: '/widget/v1',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'widget', 'demo'),
      serveRoot: '/demo',
    }),
    PrismaModule,
    ChannelsModule,
    WidgetModule,
    HealthModule,
    WebsocketModule,
  ],
})
export class AppModule {}

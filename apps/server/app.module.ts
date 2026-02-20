import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { ChannelsModule } from './channels/channels.module';
import { WidgetModule } from './widget/widget.module';
import { HealthModule } from './health/health.module';
import { WebsocketModule } from './websocket/websocket.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';

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
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'operator-web', 'dist'),
      serveRoot: '/operator',
      serveStaticOptions: {
        index: 'index.html',
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'portal', 'dist'),
      serveRoot: '/',
      serveStaticOptions: {
        index: 'index.html',
        exclude: ['/api*', '/widget*', '/operator*', '/demo*'],
      },
    }),
    PrismaModule,
    ChannelsModule,
    WidgetModule,
    HealthModule,
    WebsocketModule,
    AuthModule,
    ProjectsModule,
  ],
})
export class AppModule {}

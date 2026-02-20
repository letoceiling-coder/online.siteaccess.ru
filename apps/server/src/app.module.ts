import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ChannelsModule } from './channels/channels.module';
import { VisitorsModule } from './visitors/visitors.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    PrismaModule,
    ChannelsModule,
    VisitorsModule,
    ConversationsModule,
    MessagesModule,
    AttachmentsModule,
    WebsocketModule,
  ],
})
export class AppModule {}

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { OperatorAuthGuard } from '../middleware/operator-auth.middleware';

@WebSocketGateway({
  namespace: '/operator',
  cors: { origin: true, credentials: true },
})
@UseGuards(OperatorAuthGuard)
@Injectable()
export class OperatorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OperatorGateway.name);

  async handleConnection(client: Socket) {
    const { channelId } = client.data;
    client.join(`channel:${channelId}`);
    this.logger.log(`Operator connected: ${client.id}, channel: ${channelId}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Operator disconnected: ${client.id}`);
  }
}

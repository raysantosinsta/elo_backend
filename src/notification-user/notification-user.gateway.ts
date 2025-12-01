/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/websocket/websocket.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class NotificationUserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map para guardar qual usuário está em qual socket
  private userSockets = new Map<string, Socket>();

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    // Remove o socket do mapa quando desconectar
    for (const [userId, socket] of this.userSockets.entries()) {
      if (socket.id === client.id) {
        this.userSockets.delete(userId);
        break;
      }
    }
    console.log('Client disconnected:', client.id);
  }

  // Método para registrar o usuário (chamado do frontend)
  @SubscribeMessage('register')
  handleRegister(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.userSockets.set(userId, client);
    console.log(`User ${userId} registered with socket ${client.id}`);
  }

  // Método para enviar notificação para um usuário específico
  sendNotificationToUser(userId: string, notification: any) {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit('notification', notification);
      console.log(`Notificação enviada para user ${userId}:`, notification.title);
    } else {
      console.log(`Usuário ${userId} não está online (sem socket ativo)`);
    }
  }

  // Enviar para todos da empresa (opcional)
  broadcastToCompany(companyId: string, notification: any) {
    this.server.emit('notification', { ...notification, companyId });
  }
}
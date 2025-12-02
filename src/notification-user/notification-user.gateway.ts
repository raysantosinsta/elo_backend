// src/websocket/notification-user.gateway.ts
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
  namespace: '/', // opcional
})
export class NotificationUserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // userId → Socket
  private userSockets = new Map<string, Socket>();

  handleConnection(client: Socket) {
    console.log('Cliente conectado → Socket ID:', client.id);
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socket] of this.userSockets.entries()) {
      if (socket.id === client.id) {
        console.log(`Usuário ${userId} desconectado (socket ${client.id})`);
        this.userSockets.delete(userId);
        break;
      }
    }
  }

  @SubscribeMessage('register')
  handleRegister(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!userId) {
      client.disconnect();
      return;
    }

    this.userSockets.set(userId, client);
    client.data.userId = userId; // bom pra debug
    console.log(`Usuário registrado: ${userId} → ${client.id}`);
  }

  // MÉTODO PRINCIPAL USADO PELO TASK SERVICE
  sendNotificationToUser(userId: string, notification: any) {
    const socket = this.userSockets.get(userId);

    if (socket?.connected) {
      socket.emit('notification', {
        ...notification,
        id: Date.now() + Math.random(), // pra frontend não duplicar
        createdAt: new Date().toISOString(),
      });
      console.log(`Notificação enviada para ${userId}: ${notification.title}`);
    } else {
      console.log(`Usuário ${userId} offline → notificação só será vista no banco`);
    }
  }

  // Opcional: enviar para todos da empresa
  broadcastToCompany(companyId: string, notification: any) {
    this.server.to(`company-${companyId}`).emit('notification', notification);
  }
}
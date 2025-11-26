/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/ws' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private connectedUsers = new Map<string, string>(); // socketId -> userId

  handleConnection(client: Socket) {
    console.log(`🔗 Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`🔗 Cliente desconectado: ${client.id}`);
    // Remover usuário da lista de conectados
    for (const [userId, socketId] of this.connectedUsers.entries()) {
      if (socketId === client.id) {
        this.connectedUsers.delete(userId);
        break;
      }
    }
  }

  getUserRoom(userId: string) {
    return `user:${userId}`;
  }

  getCompanyRoom(companyId: string) {
    return `company:${companyId}`;
  }

  getChatRoom(chatId: string) {
    return `chat:${chatId}`;
  }

  @SubscribeMessage('join_user_room')
  handleJoinUserRoom(client: Socket, userId: string) {
    client.join(this.getUserRoom(userId));
    this.connectedUsers.set(userId, client.id);
    console.log(`👤 User ${userId} joined their room (socket: ${client.id})`);
    
    // Confirmar entrada na sala
    client.emit('room_joined', { room: `user:${userId}`, success: true });
  }

  @SubscribeMessage('join_company_room')
  handleJoinCompanyRoom(client: Socket, companyId: string) {
    client.join(this.getCompanyRoom(companyId));
    console.log(`🏢 User joined company room ${companyId}`);
    
    client.emit('room_joined', { room: `company:${companyId}`, success: true });
  }

  @SubscribeMessage('join_chat_room')
  handleJoinChatRoom(client: Socket, chatId: string) {
    client.join(this.getChatRoom(chatId));
    console.log(`💬 User joined chat room ${chatId}`);
    
    client.emit('room_joined', { room: `chat:${chatId}`, success: true });
  }

  @SubscribeMessage('leave_chat_room')
  handleLeaveChatRoom(client: Socket, chatId: string) {
    client.leave(this.getChatRoom(chatId));
    console.log(`🚪 User left chat room ${chatId}`);
  }

  // Notificar um usuário específico
  notifyUser(userId: string, event: string, payload: any) {
    this.server.to(this.getUserRoom(userId)).emit(event, payload);
    console.log(`📨 Notificação enviada para usuário ${userId}: ${event}`);
  }

  // Notificar uma empresa
  notifyCompany(companyId: string, event: string, payload: any) {
    this.server.to(this.getCompanyRoom(companyId)).emit(event, payload);
    console.log(`📨 Notificação enviada para empresa ${companyId}: ${event}`);
  }

  // Notificar um chat específico
  notifyChat(chatId: string, event: string, payload: any) {
    this.server.to(this.getChatRoom(chatId)).emit(event, payload);
    console.log(`📨 Notificação enviada para chat ${chatId}: ${event}`);
  }

  // Notificar todos os usuários conectados
  notifyAll(event: string, payload: any) {
    this.server.emit(event, payload);
    console.log(`📢 Notificação broadcast: ${event}`);
  }

  // Método para obter usuários conectados (útil para admin)
  getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }
}
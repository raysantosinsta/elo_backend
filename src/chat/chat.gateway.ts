import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: 'ws', // Namespace específico
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  // Mapeamento para rastrear conexões: userId -> socketId[] (um user pode ter varias abas)
  private userSockets = new Map<string, Set<string>>();

  afterInit() {
    this.logger.log('✅ ChatGateway inicializado no namespace /ws');
  }

  handleConnection(client: Socket) {
    this.logger.log(`🔗 Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ Cliente desconectado: ${client.id}`);
    this.removeSocketFromUserMap(client.id);
  }

  // --- GERENCIAMENTO DE SALAS ---

  @SubscribeMessage('join_user_room')
  handleJoinUserRoom(client: Socket, userId: string) {
    if (!userId) return;
    const room = `user:${userId}`;
    client.join(room);
    this.addUserSocket(userId, client.id);
    this.logger.verbose(`👤 User ${userId} entrou na sala ${room}`);
  }

  @SubscribeMessage('join_chat_room')
  handleJoinChatRoom(client: Socket, chatId: string) {
    if (!chatId) return;
    const room = `chat:${chatId}`;
    client.join(room);
    this.logger.verbose(`💬 Socket ${client.id} entrou no chat ${room}`);
  }

  @SubscribeMessage('leave_chat_room')
  handleLeaveChatRoom(client: Socket, chatId: string) {
    const room = `chat:${chatId}`;
    client.leave(room);
  }

  // --- MÉTODOS DE ENVIO (Usados pelo Service) ---

  notifyChat(chatId: string, event: string, payload: any) {
    this.server.to(`chat:${chatId}`).emit(event, payload);
  }

  notifyUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  notifyCompany(companyId: string, event: string, payload: any) {
    this.server.to(`company:${companyId}`).emit(event, payload);
  }

  // --- HELPERS ---

  private addUserSocket(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(socketId);
  }

  private removeSocketFromUserMap(socketId: string) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
  }
}
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
// location.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

interface DriverLocation {
  driverId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  timestamp: Date;
  isSimulating: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Em produção, restrinja para seu domínio
    credentials: true,
  },
  namespace: 'locations',
})
@Injectable()
export class LocationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LocationGateway.name);
  
  // Armazena as salas (routeId) e os sockets conectados
  private driverSessions = new Map<string, string>(); // driverId -> socketId
  private routeRooms = new Map<string, Set<string>>(); // routeId -> Set<socketId>
  
  // Última localização conhecida de cada motorista
  private lastLocations = new Map<string, DriverLocation>();

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
    
    // Extrair informações da query (ex: ?driverId=xxx&routeId=yyy)
    const driverId = client.handshake.query.driverId as string;
    const routeId = client.handshake.query.routeId as string;
    const isDriver = client.handshake.query.isDriver === 'true';
    
    if (driverId && routeId) {
      client.data.driverId = driverId;
      client.data.routeId = routeId;
      client.data.isDriver = isDriver;
      
      // Entrar na sala da rota
      client.join(`route:${routeId}`);
      
      // Gerenciar sessões
      if (!this.routeRooms.has(routeId)) {
        this.routeRooms.set(routeId, new Set());
      }
      this.routeRooms.get(routeId)!.add(client.id);
      
      if (isDriver) {
        this.driverSessions.set(driverId, client.id);
        this.logger.log(`🚗 Motorista ${driverId} conectado à rota ${routeId}`);
        
        // Enviar última localização conhecida (se houver) para o motorista
        const lastLoc = this.lastLocations.get(`${driverId}_${routeId}`);
        if (lastLoc) {
          client.emit('location-update', lastLoc);
        }
      } else {
        this.logger.log(`👀 Cliente ${client.id} observando rota ${routeId}`);
        
        // Enviar localização atual do motorista para o novo observador
        const lastLoc = this.lastLocations.get(`${driverId}_${routeId}`);
        if (lastLoc) {
          client.emit('location-update', lastLoc);
        }
      }
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
    
    const { driverId, routeId, isDriver } = client.data;
    
    if (routeId && this.routeRooms.has(routeId)) {
      this.routeRooms.get(routeId)!.delete(client.id);
      if (this.routeRooms.get(routeId)!.size === 0) {
        this.routeRooms.delete(routeId);
      }
    }
    
    if (isDriver && driverId) {
      this.driverSessions.delete(driverId);
      this.logger.log(`🚗 Motorista ${driverId} desconectado`);
      
      // Notificar observadores que o motorista está offline
      this.server.to(`route:${routeId}`).emit('driver-offline', {
        driverId,
        message: 'Motorista está offline',
      });
    }
  }

  @SubscribeMessage('update-location')
  handleUpdateLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      latitude: number; 
      longitude: number; 
      isSimulating?: boolean;
    },
  ) {
    const { driverId, routeId } = client.data;
    
    if (!driverId || !routeId) {
      this.logger.warn(`Cliente ${client.id} tentou atualizar localização sem driverId/routeId`);
      return;
    }
    
    const location: DriverLocation = {
      driverId,
      routeId,
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: new Date(),
      isSimulating: data.isSimulating || false,
    };
    
    // Armazenar última localização
    this.lastLocations.set(`${driverId}_${routeId}`, location);
    
    this.logger.debug(
      `📍 Motorista ${driverId} atualizou posição: ${data.latitude}, ${data.longitude} (${data.isSimulating ? 'simulação' : 'GPS real'})`
    );
    
    // Retransmitir para TODOS os clientes na sala da rota (incluindo observadores)
    // EXCETO o próprio motorista (para não duplicar no frontend)
    client.to(`route:${routeId}`).emit('location-update', location);
    
    // Opcional: enviar também um ACK para o motorista
    client.emit('location-ack', { timestamp: location.timestamp });
  }
  
  // Método para obter a localização atual de um motorista (via HTTP, se necessário)
  async getCurrentLocation(driverId: string, routeId: string): Promise<DriverLocation | null> {
    return this.lastLocations.get(`${driverId}_${routeId}`) || null;
  }
}
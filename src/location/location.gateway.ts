/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/require-await */
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

interface ThrottleInfo {
  lastUpdateTime: number;
  updateCount: number;
  lastResetTime: number;
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
  server: Server | undefined;

  private readonly logger = new Logger(LocationGateway.name);
  
  // Armazena as salas (routeId) e os sockets conectados
  private driverSessions = new Map<string, string>(); // driverId -> socketId
  private routeRooms = new Map<string, Set<string>>(); // routeId -> Set<socketId>
  
  // Última localização conhecida de cada motorista
  private lastLocations = new Map<string, DriverLocation>();
  
  // 🔥 THROTTLE: Controle de frequência de atualizações
  private lastUpdateTime = new Map<string, number>();
  private updateThrottle = new Map<string, ThrottleInfo>();
  
  // 🔥 CONFIGURAÇÕES DE THROTTLE
  private readonly THROTTLE_MS = 1000; // 1 segundo entre atualizações
  private readonly MAX_UPDATES_PER_MINUTE = 30; // Máximo 30 atualizações por minuto
  
  // 🔥 LIMPEZA PERIÓDICA DE MEMÓRIA (a cada 5 minutos)
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Iniciar limpeza periódica de memória
    this.cleanupInterval = setInterval(() => {
      this.cleanupMemory();
    }, 5 * 60 * 1000); // 5 minutos
  }

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
      
      // 🔥 Limpar throttle e cache do motorista desconectado
      const throttleKey = `${driverId}_${routeId}`;
      this.lastUpdateTime.delete(throttleKey);
      this.updateThrottle.delete(throttleKey);
      
      // Notificar observadores que o motorista está offline
      this.server?.to(`route:${routeId}`).emit('driver-offline', {
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

    // 🔥 VALIDAÇÃO DOS DADOS
    if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
      this.logger.warn(`Motorista ${driverId} enviou coordenadas inválidas`);
      return;
    }

    // 🔥 THROTTLE: Verificar última vez que este motorista enviou atualização
    const now = Date.now();
    const throttleKey = `${driverId}_${routeId}`;
    const lastUpdateTime = this.lastUpdateTime.get(throttleKey) || 0;
    
    // Enviar atualização no máximo a cada THROTTLE_MS
    if (now - lastUpdateTime < this.THROTTLE_MS) {
      // Ignora atualizações muito frequentes
      this.logger.debug(`⏳ Throttle ativo para motorista ${driverId} (${now - lastUpdateTime}ms desde última atualização)`);
      return;
    }
    
    // 🔥 VERIFICAR LIMITE DE ATUALIZAÇÕES POR MINUTO
    let throttleInfo = this.updateThrottle.get(throttleKey);
    if (!throttleInfo) {
      throttleInfo = {
        lastUpdateTime: now,
        updateCount: 1,
        lastResetTime: now,
      };
      this.updateThrottle.set(throttleKey, throttleInfo);
    } else {
      // Resetar contagem a cada minuto
      if (now - throttleInfo.lastResetTime > 60000) {
        throttleInfo.updateCount = 1;
        throttleInfo.lastResetTime = now;
      } else {
        throttleInfo.updateCount++;
      }
      
      throttleInfo.lastUpdateTime = now;
      
      // Se excedeu o limite, bloquear
      if (throttleInfo.updateCount > this.MAX_UPDATES_PER_MINUTE) {
        this.logger.warn(`⚠️ Motorista ${driverId} excedeu limite de atualizações (${throttleInfo.updateCount}/${this.MAX_UPDATES_PER_MINUTE})`);
        return;
      }
    }
    
    this.lastUpdateTime.set(throttleKey, now);
    
    // 🔥 VERIFICAR SE A LOCALIZAÇÃO MUDOU SIGNIFICATIVAMENTE (opcional)
    const lastLocation = this.lastLocations.get(`${driverId}_${routeId}`);
    if (lastLocation) {
      const distance = this.calculateDistance(
        lastLocation.latitude,
        lastLocation.longitude,
        data.latitude,
        data.longitude
      );
      
      // Se a distância for muito pequena (< 5 metros), não enviar atualização
      if (distance < 5 && lastLocation.isSimulating === data.isSimulating) {
        this.logger.debug(`📍 Motorista ${driverId} movimentou apenas ${distance.toFixed(1)}m, ignorando...`);
        return;
      }
      
      this.logger.debug(`📍 Motorista ${driverId} movimentou ${distance.toFixed(1)}m`);
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
    
    this.logger.log(
      `📍 Motorista ${driverId} atualizou posição: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)} (${data.isSimulating ? 'simulação' : 'GPS real'})`
    );
    
    // 🔥 RETRANSMITIR PARA OBSERVADORES
    // IMPORTANTE: Usar `client.to` para enviar para TODOS na sala EXCETO o motorista
    client.to(`route:${routeId}`).emit('location-update', location);
    
    // 🔥 OPCIONAL: Enviar também para o próprio motorista (ACK)
    client.emit('location-ack', { 
      timestamp: location.timestamp,
      received: true 
    });
    
    // 🔥 LOG DO NÚMERO DE OBSERVADORES
    const roomSize = this.routeRooms.get(routeId)?.size || 0;
    if (roomSize > 1) {
      this.logger.debug(`   👀 Enviado para ${roomSize - 1} observador(es)`);
    }
  }

  // Adicione este método no LocationGateway

// 🔥 MÉTODO PARA NOTIFICAR QUE A ROTA FOI FINALIZADA
@SubscribeMessage('route-finished')
handleRouteFinished(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { routeId: string; message?: string },
) {
  const { routeId } = data;
  const { driverId } = client.data;
  
  this.logger.log(`🏁 Rota finalizada: ${routeId} pelo motorista ${driverId}`);
  
  // Notificar TODOS os observadores na sala
  this.server?.to(`route:${routeId}`).emit('route-completed', {
    routeId,
    driverId,
    message: data.message || 'Rota finalizada com sucesso!',
    timestamp: new Date(),
  });
  
  // Limpar cache do motorista
  const throttleKey = `${driverId}_${routeId}`;
  this.lastUpdateTime.delete(throttleKey);
  this.updateThrottle.delete(throttleKey);
}
  
  // 🔥 MÉTODO PARA TRANSMITIR LOCALIZAÇÃO EM MASSA (para simulações)
  @SubscribeMessage('batch-update')
  handleBatchUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locations: Array<{ latitude: number; longitude: number; isSimulating?: boolean }> },
  ) {
    const { driverId, routeId } = client.data;
    
    if (!driverId || !routeId) {
      return;
    }
    
    // Processar apenas a última localização do batch
    const lastLocation = data.locations[data.locations.length - 1];
    if (lastLocation) {
      this.handleUpdateLocation(client, {
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        isSimulating: lastLocation.isSimulating,
      });
    }
  }
  
  // 🔥 MÉTODO PARA OBTER STATUS DO MOTORISTA
  @SubscribeMessage('get-driver-status')
  handleGetDriverStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { driverId: string; routeId: string },
  ) {
    const location = this.lastLocations.get(`${data.driverId}_${data.routeId}`);
    const isOnline = this.driverSessions.has(data.driverId);
    
    client.emit('driver-status', {
      driverId: data.driverId,
      routeId: data.routeId,
      isOnline,
      lastLocation: location || null,
      lastUpdate: location?.timestamp || null,
    });
  }
  
  // 🔥 MÉTODO PARA LIMPEZA DE MEMÓRIA
  private cleanupMemory() {
    const now = Date.now();
    let cleanedThrottle = 0;
    let cleanedLocations = 0;
    
    // Limpar throttle antigo (mais de 10 minutos sem atualização)
    for (const [key, info] of this.updateThrottle.entries()) {
      if (now - info.lastUpdateTime > 10 * 60 * 1000) {
        this.updateThrottle.delete(key);
        cleanedThrottle++;
      }
    }
    
    // Limpar lastUpdateTime antigo
    for (const [key, lastTime] of this.lastUpdateTime.entries()) {
      if (now - lastTime > 10 * 60 * 1000) {
        this.lastUpdateTime.delete(key);
      }
    }
    
    // Limpar localizações antigas (motoristas desconectados há mais de 30 min)
    // Nota: Não estamos limpando lastLocations para não perder histórico recente
    
    if (cleanedThrottle > 0) {
      this.logger.log(`🧹 Limpeza de memória: ${cleanedThrottle} entradas de throttle removidas`);
    }
  }
  
  // 🔥 UTILITÁRIO: Calcular distância entre dois pontos (Haversine)
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Raio da Terra em metros
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
  
  // 🔥 MÉTODO PARA OBTER A LOCALIZAÇÃO ATUAL (via HTTP)
  async getCurrentLocation(driverId: string, routeId: string): Promise<DriverLocation | null> {
    return this.lastLocations.get(`${driverId}_${routeId}`) || null;
  }
  
  // 🔥 MÉTODO PARA OBTER ESTATÍSTICAS (para debug)
  getStats() {
    return {
      activeDrivers: this.driverSessions.size,
      activeRooms: this.routeRooms.size,
      cachedLocations: this.lastLocations.size,
      throttledDrivers: this.updateThrottle.size,
    };
  }
}
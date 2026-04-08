/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  RouteStatus,
  TaskStatus,
  type Prisma,
  type Task,
} from '@prisma/client';
import type { Cache } from 'cache-manager';

import { PrismaService } from '../prisma/prisma.service';
import {
  FinalizeTaskDto,
  OptimizeRouteDto,
  RouteOrderType,
} from './dto/optimize-route.dto';
import {
  ConvertRouteToTasksDto,
  CreateRouteDto,
  RouteStopDto,
  UpdateRouteDto,
} from './dto/create-route.dto';

interface RouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  formattedDuration: string;
  formattedDistance: string;
}

/**
 * Service responsável pela lógica de rotas e otimização logística.
 * Ele lida com busca de tarefas geolocalizadas, algoritmos de ordenação (Vizinho Mais Próximo)
 * e cálculos de distância/tempo.
 */
@Injectable()
export class RouteService {
  // Logger permite ver mensagens coloridas no terminal do servidor (útil para debug)
  private readonly logger = new Logger(RouteService.name);

  constructor(
    private prisma: PrismaService, // Conexão com o banco de dados
    @Inject(CACHE_MANAGER) private cacheManager: Cache, // Gerenciador de Cache (Redis/Memória)
  ) {}

  /**
   * Busca tarefas que possuem localização válida (Latitude e Longitude não nulas).
   * Aplica filtros de data e usuário responsável se fornecidos.
   * @param companyId - ID da empresa logada.
   * @param filters - Objeto contendo data inicio/fim e ID do responsável.
   * @returns Lista de tarefas encontradas.
   */
  async getTasksWithLocation(
    companyId: string,
    filters: { startDate?: string; endDate?: string; assignedToId?: string },
  ): Promise<Task[]> {
    // Log para ver todas as tarefas da empresa
    const allTasks = await this.prisma.task.findMany({
      where: { companyId },
      include: { taskAddress: true },
    });

    this.logger.log(
      `📊 [getTasksWithLocation] Total de tarefas na empresa: ${allTasks.length}`,
    );

    allTasks.forEach((task) => {
      this.logger.log(
        `   - ${task.id}: ${task.title} | hasAddress: ${!!task.taskAddress} | lat: ${task.taskAddress?.latitude} | lng: ${task.taskAddress?.longitude}`,
      );
    });

    // 1. Monta o objeto de filtro inicial (WHERE)
    const where: Prisma.TaskWhereInput = {
      companyId,
      // Apenas tarefas Pendentes ou Em Progresso entram na rota
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      // Garante que a tarefa tem endereço com coordenadas salvas
      taskAddress: {
        latitude: { not: null },
        longitude: { not: null },
      },
    };

    // 2. Se houver filtro de data, adiciona ao WHERE
    if (filters.startDate || filters.endDate) {
      where.scheduledDate = {
        // gte = greater than or equal (maior ou igual)
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        // lte = less than or equal (menor ou igual)
        ...(filters.endDate && { lte: new Date(filters.endDate) }),
      };
    }

    // 3. Se houver filtro de motorista/usuário, adiciona ao WHERE
    if (filters.assignedToId && filters.assignedToId !== 'all') {
      where.userAssignedId = filters.assignedToId;
    }

    // 4. Executa a busca no banco
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        taskAddress: true,
        userAssigned: { select: { name: true } },
        column: { select: { id: true } },
      },
    });

    this.logger.log(
      `[getTasksWithLocation] Found ${tasks.length} tasks with location.`,
    );
    // Log detalhado (cuidado em produção com muitos dados)
    if (tasks.length > 0) {
      this.logger.debug(
        `[getTasksWithLocation] Sample Task Address: ${JSON.stringify(tasks[0].taskAddress)}`,
      );
    }

    return tasks;
  }

  /**
   * OTIMIZADOR DE ROTAS (O Coração da Logística).
   * Recebe uma lista de IDs de tarefas e a localização do motorista.
   * Retorna as tarefas ordenadas pela melhor sequência lógica.
   * @param dto - Dados contendo IDs das tarefas e localização inicial do motorista.
   */
  async optimizeRoute(dto: OptimizeRouteDto) {
    this.logger.log('='.repeat(80));
    this.logger.log('🚀 [optimizeRoute] INICIANDO OTIMIZAÇÃO DE ROTA');
    this.logger.log('='.repeat(80));
    this.logger.log(`📦 Quantidade de tarefas: ${dto.taskIds.length}`);
    this.logger.log(
      `📍 Localização motorista: lat=${dto.driverLatitude}, lng=${dto.driverLongitude}`,
    );
    this.logger.log(
      `🎯 Tipo de ordenação: ${dto.orderBy || 'DISTANCE (padrão)'}`,
    );
    this.logger.log(`📋 IDs das tarefas: ${dto.taskIds.join(', ')}`);

    // 1. Busca todas as tarefas solicitadas no banco de dados
    this.logger.log('🔍 [1/6] Buscando tarefas no banco de dados...');

    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: dto.taskIds },
        taskAddress: {
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: {
        taskAddress: true,
        column: { select: { id: true } },
        userAssigned: { select: { id: true, name: true } },
      },
    });

    this.logger.log(
      `✅ [1/6] Tarefas encontradas: ${tasks.length} de ${dto.taskIds.length} solicitadas`,
    );

    // Log detalhado das tarefas encontradas
    tasks.forEach((task, index) => {
      this.logger.log(
        `   ${index + 1}. ID: ${task.id} | Título: ${task.title}`,
      );
      this.logger.log(
        `      Endereço: ${task.taskAddress?.endereco}, ${task.taskAddress?.numero} - ${task.taskAddress?.cidade}`,
      );
      this.logger.log(
        `      Coordenadas: lat=${task.taskAddress?.latitude}, lng=${task.taskAddress?.longitude}`,
      );
    });

    // Verificar tarefas que não foram encontradas
    const foundIds = tasks.map((t) => t.id);
    const missingIds = dto.taskIds.filter((id) => !foundIds.includes(id));
    if (missingIds.length > 0) {
      this.logger.warn(
        `⚠️ Tarefas não encontradas (sem coordenadas válidas): ${missingIds.join(', ')}`,
      );
    }

    if (tasks.length === 0) {
      this.logger.error(`❌ [1/6] Nenhuma tarefa válida encontrada!`);
      this.logger.error(`   IDs solicitados: ${dto.taskIds.join(', ')}`);
      throw new NotFoundException(
        'Nenhuma tarefa válida encontrada. Verifique se todas as tarefas têm endereço com coordenadas.',
      );
    }

    let optimizedOrder: typeof tasks = [];

    // --- CENÁRIO A: ORDENAÇÃO POR PRIORIDADE ---
    if (dto.orderBy === RouteOrderType.PRIORITY) {
      this.logger.log('🎯 [2/6] Usando ordenação por PRIORIDADE');

      optimizedOrder = tasks.sort((a, b) => {
        const priorityA = a.priority ?? 999;
        const priorityB = b.priority ?? 999;
        return priorityA - priorityB;
      });

      this.logger.log('📊 Ordem por prioridade:');
      optimizedOrder.forEach((task, idx) => {
        this.logger.log(
          `   ${idx + 1}. ${task.title} (prioridade: ${task.priority ?? 'N/A'})`,
        );
      });
    }
    // --- CENÁRIO B: ORDENAÇÃO POR PROXIMIDADE (Algoritmo Vizinho Mais Próximo) ---
    else {
      this.logger.log(
        '🎯 [2/6] Usando ordenação por PROXIMIDADE (Vizinho Mais Próximo)',
      );

      // Ponto de partida (Localização do Motorista)
      let currentLocation = {
        lat: Number(dto.driverLatitude),
        lng: Number(dto.driverLongitude),
      };
      this.logger.log(
        `📍 Ponto de partida: lat=${currentLocation.lat}, lng=${currentLocation.lng}`,
      );

      // Cria uma cópia da lista para ir removendo as tarefas já visitadas
      const remainingTasks = [...tasks];
      this.logger.log(`📋 Tarefas pendentes: ${remainingTasks.length}`);

      let iteration = 0;

      // Enquanto houver tarefas na lista de pendentes...
      while (remainingTasks.length > 0) {
        iteration++;
        this.logger.log(
          `\n🔄 [Iteração ${iteration}] Tarefas restantes: ${remainingTasks.length}`,
        );
        this.logger.log(
          `📍 Posição atual: lat=${currentLocation.lat}, lng=${currentLocation.lng}`,
        );

        let nearestTaskIndex = -1;
        let minDistance = Infinity;

        // Percorre todas as tarefas restantes para achar a mais próxima
        for (let i = 0; i < remainingTasks.length; i++) {
          const t = remainingTasks[i];
          const tLat = Number(t.taskAddress?.latitude);
          const tLng = Number(t.taskAddress?.longitude);

          if (!t.taskAddress || isNaN(tLat) || isNaN(tLng)) {
            this.logger.warn(
              `   ⚠️ Tarefa ${t.id} (${t.title}) - coordenadas inválidas, ignorando`,
            );
            continue;
          }

          const dist = this.calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            tLat,
            tLng,
          );

          this.logger.log(
            `   📍 Tarefa: ${t.title} | Distância: ${dist.toFixed(2)} km`,
          );

          if (dist < minDistance) {
            minDistance = dist;
            nearestTaskIndex = i;
          }
        }

        if (nearestTaskIndex === -1) {
          this.logger.warn(
            `⚠️ Nenhuma tarefa válida encontrada na iteração ${iteration}`,
          );
          optimizedOrder.push(...remainingTasks);
          break;
        }

        // Adiciona a tarefa mais próxima na lista otimizada
        const nearestTask = remainingTasks[nearestTaskIndex];
        optimizedOrder.push(nearestTask);
        this.logger.log(
          `✅ Tarefa escolhida: ${nearestTask.title} (distância: ${minDistance.toFixed(2)} km)`,
        );

        // Atualiza a localização atual
        const nextLat = Number(nearestTask.taskAddress?.latitude);
        const nextLng = Number(nearestTask.taskAddress?.longitude);

        if (!isNaN(nextLat) && !isNaN(nextLng)) {
          currentLocation = { lat: nextLat, lng: nextLng };
          this.logger.log(
            `📍 Nova posição: ${nearestTask.taskAddress?.endereco}, ${nearestTask.taskAddress?.numero}`,
          );
        }

        // Remove a tarefa escolhida da lista de pendentes
        remainingTasks.splice(nearestTaskIndex, 1);
      }

      this.logger.log(
        `\n✅ [2/6] Ordenação por proximidade concluída em ${iteration} iterações`,
      );
      this.logger.log('📊 Ordem final da rota:');
      optimizedOrder.forEach((task, idx) => {
        this.logger.log(
          `   ${idx + 1}. ${task.title} (${task.taskAddress?.cidade})`,
        );
      });
    }

    // --- CÁLCULO DE ESTATÍSTICAS DA ROTA ---
    this.logger.log('\n📊 [3/6] Calculando estatísticas da rota...');

    const stats = await this.calculateRouteStats(
      { lat: Number(dto.driverLatitude), lng: Number(dto.driverLongitude) },
      optimizedOrder,
    );

    this.logger.log(`✅ [3/6] Estatísticas calculadas:`);
    this.logger.log(`   Tempo total: ${stats.formattedDuration}`);
    this.logger.log(`   Distância total: ${stats.formattedDistance}`);
    this.logger.log(`   Segundos: ${stats.totalDurationSeconds}`);
    this.logger.log(`   Metros: ${stats.totalDistanceMeters}`);

    // --- VALIDAÇÃO FINAL ---
    this.logger.log('\n🔍 [4/6] Validando rota final...');

    if (optimizedOrder.length !== tasks.length) {
      this.logger.warn(
        `⚠️ Aviso: ${optimizedOrder.length} tarefas otimizadas, mas ${tasks.length} foram encontradas`,
      );
    }

    // Verificar se todas as tarefas originais estão na rota
    const optimizedIds = optimizedOrder.map((t) => t.id);
    const missingInOptimized = tasks.filter(
      (t) => !optimizedIds.includes(t.id),
    );
    if (missingInOptimized.length > 0) {
      this.logger.warn(
        `⚠️ Tarefas não incluídas na rota: ${missingInOptimized.map((t) => t.title).join(', ')}`,
      );
    }

    this.logger.log('\n' + '='.repeat(80));
    this.logger.log(
      `✅ [FINAL] Rota otimizada com ${optimizedOrder.length} paradas`,
    );
    this.logger.log(`   Tempo estimado: ${stats.formattedDuration}`);
    this.logger.log(`   Distância: ${stats.formattedDistance}`);
    this.logger.log('='.repeat(80) + '\n');

    return {
      route: optimizedOrder,
      stats: stats,
    };
  }

  /**
   * Calcula o tempo e distância totais da rota.
   * Tenta usar a API OSRM (Open Source Routing Machine) para dados reais de direção.
   * Se falhar, usa cálculo matemático linear (Haversine) como fallback.
   */
  private async calculateRouteStats(
    startPos: { lat: number; lng: number },
    tasks: Task[],
  ): Promise<RouteStats> {
    try {
      // Filtra tarefas válidas para a API
      const validTasks = tasks.filter((t: any) => {
        const lat = Number(t.taskAddress?.latitude);
        const lng = Number(t.taskAddress?.longitude);
        return !isNaN(lat) && !isNaN(lng);
      });

      if (validTasks.length === 0) {
        this.logger.warn(
          '[calculateRouteStats] Nenhuma tarefa com coordenadas válidas',
        );
        return this.getFallbackStats(startPos, tasks);
      }

      // Monta string de coordenadas
      const coordinates = [
        `${startPos.lng},${startPos.lat}`,
        ...validTasks.map(
          (t: any) =>
            `${Number(t.taskAddress.longitude)},${Number(t.taskAddress.latitude)}`,
        ),
      ].join(';');

      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;

      this.logger.log(`[calculateRouteStats] Chamando OSRM: ${url}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        this.logger.log(
          `[calculateRouteStats] Resposta OSRM: ${JSON.stringify(data).substring(0, 200)}`,
        );

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          return {
            totalDurationSeconds: route.duration,
            totalDistanceMeters: route.distance,
            formattedDuration: this.formatDuration(route.duration),
            formattedDistance: `${(route.distance / 1000).toFixed(1)} km`,
          };
        }
      }
    } catch {
      this.logger.warn(
        'Erro ao consultar OSRM, usando cálculo linear fallback.',
      );
    }

    // --- FALLBACK (PLANO B) ---
    return this.getFallbackStats(startPos, tasks);
  }

  private getFallbackStats(
    startPos: { lat: number; lng: number },
    tasks: Task[],
  ): RouteStats {
    this.logger.log('[calculateRouteStats] Usando fallback linear (Haversine)');

    let totalDistKm = 0;
    let current = startPos;

    for (const task of tasks) {
      const tAddr = (task as any).taskAddress;
      const lat = Number(tAddr?.latitude);
      const lng = Number(tAddr?.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        const dist = this.calculateDistance(current.lat, current.lng, lat, lng);
        this.logger.debug(
          `Distância de (${current.lat},${current.lng}) para (${lat},${lng}): ${dist.toFixed(2)} km`,
        );
        totalDistKm += dist;
        current = { lat, lng };
      }
    }

    // Estima o tempo assumindo uma velocidade média de 30km/h
    const averageSpeedKmH = 30;
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

    this.logger.log(
      `[calculateRouteStats] Fallback: ${totalDistKm.toFixed(2)} km, ${estimatedSeconds.toFixed(0)} segundos`,
    );

    return {
      totalDurationSeconds: estimatedSeconds,
      totalDistanceMeters: totalDistKm * 1000,
      formattedDuration: `~${this.formatDuration(estimatedSeconds)}`,
      formattedDistance: `~${totalDistKm.toFixed(1)} km`,
    };
  }

  /**
   * Finaliza ou Reagenda uma tarefa na rota.
   * Se vier uma nova data (scheduledAt), muda status para PENDING (reagendado).
   * Se não, finaliza como COMPLETED ou FAILED.
   */
  async concludeVisit(
    taskId: string,
    userId: string,
    dto: FinalizeTaskDto,
  ): Promise<{ message: string; task: Task }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    // Determina o novo status baseado na lógica de negócio
    const statusFinal = dto.scheduledAt
      ? TaskStatus.PENDING
      : dto.status === 'COMPLETED'
        ? TaskStatus.COMPLETED
        : TaskStatus.FAILED;

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: statusFinal,
        finalComment: dto.finalComment,
        scheduledDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        dueDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        completionDate: dto.scheduledAt ? null : new Date(),
        userCompletedId: userId,
      },
      include: this.getTaskIncludeDetails(),
    });

    return {
      message: dto.scheduledAt
        ? 'Tarefa reagendada com sucesso'
        : 'Tarefa finalizada com sucesso',
      task: updatedTask,
    };
  }

  // Auxiliar para padronizar os INCLUDES do Prisma
  private getTaskIncludeDetails() {
    return {
      taskAddress: true,
      userAssigned: { select: { name: true } },
      userCompleted: { select: { name: true } },
    };
  }

  // =============================================
  // NOVOS MÉTODOS PARA ROTAS SEM TAREFAS
  // =============================================

  /**
   * CRIA uma nova rota sem criar tarefas
   * Apenas salva os pontos e otimiza a ordem
   */
  /**
   * CRIA uma nova rota sem criar tarefas
   * Apenas salva os pontos e otimiza a ordem (se solicitado)
   * A localização do motorista será definida no momento da execução da rota
   */
  async createRoute(dto: CreateRouteDto, companyId: string, userId: string) {
    this.logger.log(`🚀 [createRoute] Criando rota: ${dto.title}`);
    this.logger.log(`📦 Quantidade de paradas: ${dto.stops.length}`);

    let optimizedStops = [...dto.stops];
    let stats: {
      totalDurationSeconds: number;
      totalDistanceMeters: number;
    };

    // Se for ordenação por distância, otimiza usando a primeira parada como referência
    if (dto.orderBy !== RouteOrderType.PRIORITY && dto.stops.length > 0) {
      // Usa a primeira parada como ponto de partida para otimização
      // Na execução real, a rota será recalculada a partir da localização real do motorista
      const startPos = {
        lat: dto.stops[0].latitude,
        lng: dto.stops[0].longitude,
      };

      this.logger.log(
        `🎯 Otimizando rota por distância usando primeira parada como referência`,
      );
      optimizedStops = this.optimizeStopsByDistance(startPos, dto.stops);

      // Calcula estatísticas com base na ordem otimizada
      stats = await this.calculateRouteStatsFromStops(startPos, optimizedStops);
    } else if (dto.stops.length > 0) {
      // Para ordenação por prioridade, mantém a ordem original
      // Calcula estatísticas usando a primeira parada como referência
      const startPos = {
        lat: dto.stops[0].latitude,
        lng: dto.stops[0].longitude,
      };
      stats = await this.calculateRouteStatsFromStops(startPos, dto.stops);
    } else {
      // Sem paradas, estatísticas vazias
      stats = {
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
      };
    }

    // Cria a rota no banco de dados
    const route = await this.prisma.route.create({
      data: {
        title: dto.title,
        description: dto.description,
        routeDate: dto.routeDate ? new Date(dto.routeDate) : null,
        status: RouteStatus.SCHEDULED,
        totalDistanceMeters: stats.totalDistanceMeters,
        totalDurationSeconds: stats.totalDurationSeconds,
        optimizedAt: new Date(),
        companyId: companyId,
        userCreateId: userId,
        userAssignedId: dto.userAssignedId || null,
        orderBy: dto.orderBy || 'DISTANCE',
        stops: {
          create: optimizedStops.map((stop, index) => ({
            name: stop.name,
            address: stop.address,
            complement: stop.complement || '',
            neighborhood: stop.neighborhood || '',
            city: stop.city,
            state: stop.state,
            zipCode: stop.zipCode,
            latitude: stop.latitude,
            longitude: stop.longitude,
            order: index + 1,
            notes: stop.notes || '',
            companyId: companyId,
          })),
        },
      },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
        userAssigned: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`✅ [createRoute] Rota criada com ID: ${route.id}`);
    this.logger.log(
      `   Distância total: ${(stats.totalDistanceMeters / 1000).toFixed(1)} km`,
    );
    this.logger.log(
      `   Duração estimada: ${this.formatDuration(stats.totalDurationSeconds)}`,
    );
    this.logger.log(
      `   Ordem das paradas: ${optimizedStops.map((_, i) => i + 1).join(' → ')}`,
    );

    return {
      ...route,
      stats: {
        totalDistanceMeters: stats.totalDistanceMeters,
        totalDurationSeconds: stats.totalDurationSeconds,
        formattedDistance: `${(stats.totalDistanceMeters / 1000).toFixed(1)} km`,
        formattedDuration: this.formatDuration(stats.totalDurationSeconds),
      },
    };
  }

  /**
   * Otimiza a ordem das paradas pelo algoritmo do vizinho mais próximo
   */
  private optimizeStopsByDistance(
    startPos: { lat: number; lng: number },
    stops: RouteStopDto[],
  ): RouteStopDto[] {
    this.logger.log(`🎯 Otimizando ${stops.length} paradas por proximidade`);

    const optimized: RouteStopDto[] = [];
    const remaining = [...stops];
    let currentPos = { ...startPos };

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let minDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const stop = remaining[i];
        const distance = this.calculateDistance(
          currentPos.lat,
          currentPos.lng,
          stop.latitude,
          stop.longitude,
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }

      const nearest = remaining[nearestIndex];
      optimized.push(nearest);
      currentPos = { lat: nearest.latitude, lng: nearest.longitude };
      remaining.splice(nearestIndex, 1);
    }

    return optimized;
  }

  /**
   * Calcula estatísticas da rota a partir das paradas (sem tarefas)
   */
  private async calculateRouteStatsFromStops(
    startPos: { lat: number; lng: number },
    stops: RouteStopDto[],
  ) {
    try {
      // Monta string de coordenadas para OSRM
      const coordinates = [
        `${startPos.lng},${startPos.lat}`,
        ...stops.map((stop) => `${stop.longitude},${stop.latitude}`),
      ].join(';');

      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.code === 'Ok' && data.routes?.[0]) {
          return {
            totalDurationSeconds: data.routes[0].duration,
            totalDistanceMeters: data.routes[0].distance,
          };
        }
      }
    } catch (error) {
      this.logger.warn('Erro ao consultar OSRM, usando fallback');
    }

    // Fallback: cálculo linear
    let totalDistKm = 0;
    let current = startPos;

    for (const stop of stops) {
      const dist = this.calculateDistance(
        current.lat,
        current.lng,
        stop.latitude,
        stop.longitude,
      );
      totalDistKm += dist;
      current = { lat: stop.latitude, lng: stop.longitude };
    }

    const avgSpeed = 30; // km/h
    const estimatedSeconds = (totalDistKm / avgSpeed) * 3600;

    return {
      totalDurationSeconds: estimatedSeconds,
      totalDistanceMeters: totalDistKm * 1000,
    };
  }

  /**
   * Busca todas as rotas salvas da empresa
   */
  async findAllRoutes(
    companyId: string,
    filters?: {
      status?: RouteStatus;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<any[]> {
    const where: Prisma.RouteWhereInput = { companyId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      where.routeDate = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        ...(filters.endDate && { lte: new Date(filters.endDate) }),
      };
    }

    const routes = await this.prisma.route.findMany({
      where,
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
        userAssigned: {
          select: { id: true, name: true },
        },
        _count: {
          select: { stops: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return routes.map((route) => ({
      ...route,
      formattedDistance: route.totalDistanceMeters
        ? `${(route.totalDistanceMeters / 1000).toFixed(1)} km`
        : 'Não calculado',
      formattedDuration: route.totalDurationSeconds
        ? this.formatDuration(route.totalDurationSeconds)
        : 'Não calculado',
    }));
  }

 /**
 * Busca uma rota específica com todos os detalhes
 */
async findRouteById(routeId: string, companyId: string): Promise<any> {
  const route = await this.prisma.route.findFirst({
    where: {
      id: routeId,
      companyId,
    },
    include: {
      stops: {
        orderBy: { order: 'asc' },
      },
      userAssigned: { select: { id: true, name: true, contact: true } },
      userCreate: { select: { id: true, name: true } },
    },
  });

  if (!route) {
    throw new NotFoundException('Rota não encontrada');
  }

  // O campo 'notes' já está incluído automaticamente no include de stops
  // Não precisa de select adicional

  return {
    ...route,
    formattedDistance: route.totalDistanceMeters
      ? `${(route.totalDistanceMeters / 1000).toFixed(1)} km`
      : 'Não calculado',
    formattedDuration: route.totalDurationSeconds
      ? this.formatDuration(route.totalDurationSeconds)
      : 'Não calculado',
  };
}

  /**
   * Atualiza uma rota existente e suas paradas.
   * Se orderBy for 'DISTANCE', as paradas são reordenadas antes de salvar.
   */
  async updateRoute(
    routeId: string,
    dto: UpdateRouteDto,
    companyId: string,
    userId: string,
  ): Promise<any> {
    // 1. Validar existência da rota
    const existingRoute = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!existingRoute) {
      throw new NotFoundException('Rota não encontrada');
    }

    let stats: {
      totalDurationSeconds: number;
      totalDistanceMeters: number;
    } | null = null;

    // Inicializa stopsToSave com o que veio no DTO ou array vazio
    let stopsToSave = dto.stops || [];

    // 2. Lógica de Ordenação e Cálculo de Estatísticas
    if (stopsToSave.length > 0) {
      // Se o usuário pediu otimização por distância
      if (dto.orderBy === RouteOrderType.DISTANCE) {
        // Usa a primeira parada enviada como ponto de partida (âncora)
        const startPos = {
          lat: stopsToSave[0].latitude,
          lng: stopsToSave[0].longitude,
        };
        stopsToSave = this.optimizeStopsByDistance(startPos, stopsToSave);
      }

      // Calcula KM e Tempo Real baseado na ordem final (seja manual ou otimizada)
      const statsRefPos = {
        lat: stopsToSave[0].latitude,
        lng: stopsToSave[0].longitude,
      };
      stats = await this.calculateRouteStatsFromStops(statsRefPos, stopsToSave);
    }

    // 3. Persistência no Prisma
    const updatedRoute = await this.prisma.route.update({
      where: { id: routeId },
      data: {
        title: dto.title,
        description: dto.description,
        routeDate: dto.routeDate ? new Date(dto.routeDate) : undefined,
        status: dto.status,
        userAssignedId: dto.userAssignedId,
        orderBy: dto.orderBy, // ADICIONE ESTA LINHA PARA SALVAR NO BANCO
        totalDistanceMeters: stats?.totalDistanceMeters,
        totalDurationSeconds: stats?.totalDurationSeconds,
        optimizedAt: stats ? new Date() : undefined,
        userUpdateId: userId,

        // Substituição atômica de paradas
        ...(dto.stops && {
          stops: {
            deleteMany: {}, // Limpa as antigas
            create: stopsToSave.map((stop, index) => ({
              name: stop.name,
              address: stop.address,
              complement: stop.complement || '',
              neighborhood: stop.neighborhood || '',
              city: stop.city,
              state: stop.state,
              zipCode: stop.zipCode,
              latitude: stop.latitude,
              longitude: stop.longitude,
              order: index + 1, // Grava a ordem 1, 2, 3...
              notes: stop.notes || '',
              companyId,
            })),
          },
        }),
      },
      include: {
        // Inclui paradas ordenadas para o retorno do frontend
        stops: {
          orderBy: { order: 'asc' },
        },
        userAssigned: {
          select: { id: true, name: true, contact: true },
        },
      },
    });

    // 4. Retorno formatado para o Frontend
    return {
      ...updatedRoute,
      formattedDistance: updatedRoute.totalDistanceMeters
        ? `${(updatedRoute.totalDistanceMeters / 1000).toFixed(1)} km`
        : 'Não calculado',
      formattedDuration: updatedRoute.totalDurationSeconds
        ? this.formatDuration(updatedRoute.totalDurationSeconds)
        : 'Não calculado',
    };
  }

  /**
   * Remove uma rota
   */
  async deleteRoute(
    routeId: string,
    companyId: string,
  ): Promise<{ message: string }> {
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    await this.prisma.route.delete({
      where: { id: routeId },
    });

    return { message: 'Rota removida com sucesso' };
  }

  /**
   * Marca uma parada como visitada
   */
  async markStopAsVisited(
    routeId: string,
    stopId: string,
    companyId: string,
    notes?: string,
  ): Promise<any> {
    const stop = await this.prisma.routeStop.findFirst({
      where: {
        id: stopId,
        routeId,
        companyId,
      },
    });

    if (!stop) {
      throw new NotFoundException('Parada não encontrada');
    }

    const updatedStop = await this.prisma.routeStop.update({
      where: { id: stopId },
      data: {
        visited: true,
        visitedAt: new Date(),
        notes: notes || stop.notes,
      },
    });

    const allStops = await this.prisma.routeStop.findMany({
      where: { routeId },
    });

    const allVisited = allStops.every((s) => s.visited);

    if (allVisited) {
      await this.prisma.route.update({
        where: { id: routeId },
        data: { status: RouteStatus.FINISHED },
      });
    }

    return updatedStop;
  }

  /**
   * Converte uma rota salva em tarefas reais
   */
  async convertRouteToTasks(
    routeId: string,
    companyId: string,
    userId: string,
    dto: ConvertRouteToTasksDto,
  ): Promise<{ message: string; tasks: Task[] }> {
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    let columnId = dto.columnId;
    if (!columnId) {
      const defaultColumn = await this.prisma.kanbanColumn.findFirst({
        where: {
          companyId,
          title: 'Pendentes',
        },
      });

      if (!defaultColumn) {
        throw new NotFoundException(
          'Coluna padrão "Pendentes" não encontrada. Crie uma ou especifique uma columnId.',
        );
      }
      columnId = defaultColumn.id;
    }

    const tasks = await this.prisma.$transaction(
      route.stops.map((stop, index) =>
        this.prisma.task.create({
          data: {
            title: stop.name || `Parada ${index + 1} - ${route.title}`,
            description: `Rota: ${route.title}\nEndereço: ${stop.address}\nObservações: ${stop.notes || 'N/A'}`,
            status: TaskStatus.PENDING,
            scheduledDate: route.routeDate || new Date(),
            companyId,
            userCreateId: userId,
            userAssignedId: dto.userAssignedId || route.userAssignedId,
            columnId: columnId!,
            routeId: route.id,
            taskAddress: {
              create: {
                endereco: stop.address,
                numero: '',
                bairro: stop.neighborhood || '',
                cidade: stop.city,
                estado: stop.state,
                cep: stop.zipCode,
                complemento: stop.complement,
                latitude: stop.latitude,
                longitude: stop.longitude,
                companyId,
              },
            },
          },
        }),
      ),
    );

    return {
      message: `Rota convertida em ${tasks.length} tarefas com sucesso`,
      tasks,
    };
  }

  // Auxiliar para formatar segundos em "2h 30min"
  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }

  /**
   * FÓRMULA DE HAVERSINE
   * Calcula a distância em KM entre dois pontos no globo terrestre (Latitude/Longitude).
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  // Converte Graus para Radianos
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

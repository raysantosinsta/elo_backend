/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
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
  // No tasks.service.ts - Modificar a função concludeVisit

  async concludeVisit(
    taskId: string,
    userId: string,
    dto: FinalizeTaskDto,
  ): Promise<{ message: string; task: Task }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    // 🔥 CORREÇÃO: Determinar o status baseado no DTO e observações
    let statusFinal: TaskStatus;

    if (dto.status === 'RESCHEDULED') {
      statusFinal = TaskStatus.RESCHEDULED;
    } else if (dto.status === 'FAILED') {
      statusFinal = TaskStatus.FAILED;
    } else if (dto.status === 'COMPLETED') {
      statusFinal = TaskStatus.COMPLETED;
    } else {
      // Fallback: verificar nas observações
      const notes = dto.finalComment || '';
      if (
        notes.includes('REAGENDADA') ||
        notes.includes('RESCHEDULED') ||
        notes.includes('🔄')
      ) {
        statusFinal = TaskStatus.RESCHEDULED;
      } else if (
        notes.includes('FALHA') ||
        notes.includes('FAILED') ||
        notes.includes('❌')
      ) {
        statusFinal = TaskStatus.FAILED;
      } else {
        statusFinal = TaskStatus.COMPLETED;
      }
    }

    this.logger.log(`[concludeVisit] Task ${taskId} -> status: ${statusFinal}`);

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: statusFinal,
        finalComment: dto.finalComment,
        scheduledDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        completionDate:
          statusFinal === TaskStatus.COMPLETED ? new Date() : null,
        userCompletedId: statusFinal === TaskStatus.COMPLETED ? userId : null,
      },
      include: this.getTaskIncludeDetails(),
    });

    return {
      message:
        statusFinal === TaskStatus.RESCHEDULED
          ? 'Tarefa reagendada com sucesso'
          : statusFinal === TaskStatus.FAILED
            ? 'Tarefa marcada como falha'
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

  // CRIA uma nova rota sem criar tarefas
  // Vincula tarefas existentes com base no título das paradas
  async createRoute(dto: CreateRouteDto, companyId: string, userId: string) {
    this.logger.log('='.repeat(80));
    this.logger.log(`🚀 [createRoute] INICIANDO CRIAÇÃO DE ROTA`);
    this.logger.log(`📝 Título: ${dto.title}`);
    this.logger.log(`📅 Data recebida (raw): ${dto.routeDate}`);
    this.logger.log(`📦 Quantidade de paradas: ${dto.stops.length}`);
    this.logger.log(`🎯 Tipo de ordenação: ${dto.orderBy || 'DISTANCE'}`);

    // 🔥 CORREÇÃO DE TIMEZONE: Processar a data corretamente
    let routeDate: Date | null = null;

    if (dto.routeDate) {
      // Se veio como string no formato YYYY-MM-DD (do input date)
      if (
        typeof dto.routeDate === 'string' &&
        dto.routeDate.match(/^\d{4}-\d{2}-\d{2}$/)
      ) {
        const [year, month, day] = dto.routeDate.split('-');
        // Criar data no UTC com horário 12:00 (meio-dia) para evitar deslocamento de dia
        routeDate = new Date(
          Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            12,
            0,
            0,
          ),
        );
        this.logger.log(
          `   Data convertida para UTC (meio-dia): ${routeDate.toISOString()}`,
        );
        this.logger.log(
          `   Data original selecionada: ${day}/${month}/${year}`,
        );
      }
      // Se for string ISO completa ou outro formato
      else if (typeof dto.routeDate === 'string') {
        routeDate = new Date(dto.routeDate);
        this.logger.log(`   Data como string ISO: ${routeDate.toISOString()}`);
      }
      // Se já for objeto Date
      else if ((dto.routeDate as any) instanceof Date) {
        routeDate = dto.routeDate;
        this.logger.log(`   Data como Date object: ${routeDate}`);
      }
    }

    this.logger.log(
      `📅 Data final para salvar no banco: ${routeDate?.toISOString() || 'null'}`,
    );
    const finalRouteDate = routeDate;
    let optimizedStops = [...dto.stops];
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

    // Calcular estatísticas para todas as paradas
    if (dto.stops.length > 0) {
      if (dto.stops.length === 1) {
        this.logger.log(`📋 Rota com 1 parada - distância será 0`);
        totalDistanceMeters = 0;
        totalDurationSeconds = 0;
        optimizedStops = dto.stops;
      } else {
        const startPos = {
          lat: dto.stops[0].latitude,
          lng: dto.stops[0].longitude,
        };

        if (dto.orderBy === RouteOrderType.DISTANCE) {
          this.logger.log(
            `🎯 Otimizando rota por DISTÂNCIA com ${dto.stops.length} paradas`,
          );
          optimizedStops = this.optimizeStopsByDistance(startPos, dto.stops);
        } else {
          this.logger.log(
            `📋 Mantendo ordem original (${dto.stops.length} parada(s))`,
          );
          optimizedStops = dto.stops;
        }

        const stats = this.calculateRouteStatsFromStops(
          startPos,
          optimizedStops,
        );
        totalDistanceMeters = stats.totalDistanceMeters;
        totalDurationSeconds = stats.totalDurationSeconds;
      }

      this.logger.log(`📊 Estatísticas calculadas:`);
      this.logger.log(
        `   Distância: ${totalDistanceMeters} metros (${(totalDistanceMeters / 1000).toFixed(2)} km)`,
      );
      this.logger.log(
        `   Duração: ${totalDurationSeconds} segundos (${this.formatDuration(totalDurationSeconds)})`,
      );
    }

    // 🔥 BUSCAR TAREFAS EXISTENTES PELOS TÍTULOS DAS PARADAS
    const stopTitles = dto.stops
      .map((stop) => stop.name)
      .filter(
        (name): name is string =>
          name !== null && name !== undefined && name !== '',
      );

    this.logger.log(
      `🔍 Buscando tasks existentes com títulos: ${stopTitles.join(', ')}`,
    );

    let existingTasks: any[] = [];
    if (stopTitles.length > 0) {
      existingTasks = await this.prisma.task.findMany({
        where: {
          companyId: companyId,
          title: { in: stopTitles },
        },
        include: {
          taskAddress: true, // 🔥 INCLUIR O ENDEREÇO PARA PEGAR O CEP
        },
      });
    }

    this.logger.log(`📊 Tasks encontradas: ${existingTasks.length}`);
    existingTasks.forEach((task) => {
      this.logger.log(
        `   - ${task.title} (ID: ${task.id}, status: ${task.status}, CEP: ${task.taskAddress?.cep || 'N/A'})`,
      );
    });

    // 🔥 CRIAR UM MAPA PARA RÁPIDA CONSULTA DE TASK POR TÍTULO
    const taskByTitle = new Map();
    existingTasks.forEach((task) => {
      taskByTitle.set(task.title, task);
    });

    // 🔥 CRIAR A ROTA NO BANCO DE DADOS COM taskId NAS PARADAS
    const route = await this.prisma.route.create({
      data: {
        title: dto.title,
        description: dto.description || '',
        routeDate: finalRouteDate,
        status: RouteStatus.SCHEDULED,
        totalDistanceMeters: totalDistanceMeters,
        totalDurationSeconds: totalDurationSeconds,
        optimizedAt: new Date(),
        companyId: companyId,
        userCreateId: userId,
        userAssignedId: dto.userAssignedId || null,
        orderBy: dto.orderBy || 'DISTANCE',
        stops: {
          create: await Promise.all(
            optimizedStops.map(async (stop, index) => {
              const existingTask = taskByTitle.get(stop.name);

              // 🔥 BUSCAR O ENDEREÇO COMPLETO DA TAREFA EXISTENTE
              let zipCode = '';
              let bairro = '';

              if (existingTask) {
                const taskAddress = await this.prisma.taskAddress.findFirst({
                  where: { taskId: existingTask.id },
                });

                if (taskAddress) {
                  zipCode = taskAddress.cep || '';
                  bairro = taskAddress.bairro || '';
                  this.logger.log(
                    `📦 Parada ${index + 1}: Dados copiados da task "${existingTask.title}": CEP=${zipCode}, Bairro=${bairro}`,
                  );
                }
              }

              // Fallback: usa o que veio no DTO
              if (!zipCode && stop.zipCode) zipCode = stop.zipCode;
              if (!bairro && stop.bairro) bairro = stop.bairro;

              return {
                name: stop.name,
                address: stop.address,
                complement: stop.complement || '',
                neighborhood: (bairro || stop.neighborhood || '').toString(), // ✅ bairro vai aqui
                city: stop.city,
                state: stop.state,
                zipCode: (zipCode || '').toString(),
                latitude: stop.latitude,
                longitude: stop.longitude,
                order: index + 1,
                notes: stop.notes || '',
                companyId: companyId,
                taskId: existingTask?.id || null,
              };
            }),
          ),
        },
      },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
    });

    this.logger.log(`✅ [createRoute] Rota criada com ID: ${route.id}`);
    this.logger.log(
      `   Data salva no banco: ${route.routeDate?.toISOString() || 'null'}`,
    );
    this.logger.log(
      `   Distância total salva: ${route.totalDistanceMeters} metros`,
    );
    this.logger.log(
      `   Duração total salva: ${route.totalDurationSeconds} segundos`,
    );

    // Verificar CEPs salvos nas paradas
    const savedStops = await this.prisma.routeStop.findMany({
      where: { routeId: route.id },
      select: { name: true, zipCode: true },
    });
    this.logger.log(`📦 CEPs salvos nas paradas:`);
    savedStops.forEach((stop) => {
      this.logger.log(`   - ${stop.name}: ${stop.zipCode || 'SEM CEP'}`);
    });

    // 🔥 VINCULAR AS TAREFAS EXISTENTES À ROTA
    if (existingTasks.length > 0) {
      this.logger.log(
        `🔄 Vinculando ${existingTasks.length} tasks à rota ${route.id}`,
      );

      for (const task of existingTasks) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { routeId: route.id },
        });
        this.logger.log(
          `   ✅ Task "${task.title}" (${task.id}) vinculada à rota`,
        );
      }
    } else {
      this.logger.log(`⚠️ Nenhuma task encontrada para vincular à rota`);
    }

    // Buscar a rota completa com usuário atribuído
    const completeRoute = await this.prisma.route.findUnique({
      where: { id: route.id },
      include: {
        stops: { orderBy: { order: 'asc' } },
        userAssigned: { select: { id: true, name: true, contact: true } },
      },
    });

    const formattedDistance =
      totalDistanceMeters > 0
        ? `${(totalDistanceMeters / 1000).toFixed(1)} km`
        : dto.stops.length === 1
          ? '0 km'
          : 'Distância não calculada';

    const formattedDuration =
      totalDurationSeconds > 0
        ? this.formatDuration(totalDurationSeconds)
        : dto.stops.length === 1
          ? '0 min'
          : 'Duração não calculada';

    this.logger.log(`📤 Retorno formatado:`);
    this.logger.log(`   formattedDistance: ${formattedDistance}`);
    this.logger.log(`   formattedDuration: ${formattedDuration}`);

    return {
      ...completeRoute,
      formattedDistance,
      formattedDuration,
      totalDistanceMeters,
      totalDurationSeconds,
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
   * Suporta rotas com 1 ou mais paradas
   */
  private calculateRouteStatsFromStops(
    startPos: { lat: number; lng: number },
    stops: RouteStopDto[],
  ): {
    totalDurationSeconds: number;
    totalDistanceMeters: number;
  } {
    this.logger.log(
      `[calculateRouteStatsFromStops] Iniciando cálculo para ${stops.length} parada(s)`,
    );

    // Se não há paradas, retorna zero
    if (stops.length === 0) {
      this.logger.log(
        `[calculateRouteStatsFromStops] Nenhuma parada - retornando zero`,
      );
      return {
        totalDurationSeconds: 0,
        totalDistanceMeters: 0,
      };
    }

    this.logger.log(
      `[calculateRouteStatsFromStops] Usando Haversine para ${stops.length} parada(s)`,
    );

    let totalDistKm = 0;
    let current = { ...startPos };

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const dist = this.calculateDistance(
        current.lat,
        current.lng,
        stop.latitude,
        stop.longitude,
      );

      this.logger.log(
        `[calculateRouteStatsFromStops] Trecho ${i + 1}: ${dist.toFixed(2)}km`,
      );

      totalDistKm += dist;
      current = { lat: stop.latitude, lng: stop.longitude };
    }

    // Velocidade média estimada: 30 km/h (para cálculo aproximado)
    const averageSpeedKmH = 30;
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

    const result = {
      totalDurationSeconds: Math.round(estimatedSeconds),
      totalDistanceMeters: Math.round(totalDistKm * 1000),
    };

    this.logger.log(
      `[calculateRouteStatsFromStops] 📊 Resultado: ${totalDistKm.toFixed(2)}km, ${Math.round(estimatedSeconds / 60)}min`,
    );
    this.logger.log(`   Distance meters: ${result.totalDistanceMeters}`);
    this.logger.log(`   Duration seconds: ${result.totalDurationSeconds}`);

    return result;
  }

  /**
   * Busca todas as rotas salvas da empresa com suporte a múltiplos filtros
   */
  async findAllRoutes(
    companyId: string,
    filters?: {
      // Filtros de Data
      startDate?: string; // Data da rota inicial
      endDate?: string; // Data da rota final
      createdStartDate?: string; // Data de criação inicial
      createdEndDate?: string; // Data de criação final

      // Filtros de Status e Ordenação
      status?: RouteStatus; // Status da rota
      orderBy?: string; // DISTANCE | PRIORITY
      userAssignedId?: string; // ID do motorista ou 'none'
      search?: string; // Busca por título

      // Filtros de Métricas
      minStops?: number; // Mínimo de paradas
      maxStops?: number; // Máximo de paradas
      minDistance?: number; // Distância mínima (km)
      maxDistance?: number; // Distância máxima (km)
      minDuration?: number; // Duração mínima (minutos)
      maxDuration?: number; // Duração máxima (minutos)

      // Filtros Especiais
      isOverdue?: boolean; // Rotas atrasadas
      isUpcoming?: boolean; // Rotas próximas (próximos 7 dias)
    },
  ): Promise<any[]> {
    this.logger.log(
      `📊 [findAllRoutes] Buscando rotas para empresa ${companyId}`,
    );
    this.logger.log(`📊 Filtros aplicados:`, filters);

    const where: Prisma.RouteWhereInput = { companyId };

    // ============================================
    // 1. Filtro por Status
    // ============================================
    if (filters?.status) {
      where.status = filters.status;
      this.logger.log(`   - Status: ${filters.status}`);
    }

    // ============================================
    // 2. Filtros por Data da Rota (routeDate)
    // ============================================
    if (filters?.startDate || filters?.endDate) {
      where.routeDate = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        where.routeDate.gte = start;
        this.logger.log(`   - Data inicial da rota: ${filters.startDate}`);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.routeDate.lte = end;
        this.logger.log(`   - Data final da rota: ${filters.endDate}`);
      }
    }

    // ============================================
    // 3. Filtro por Data de Criação (createdAt)
    // ============================================
    if (filters?.createdStartDate || filters?.createdEndDate) {
      where.createdAt = {};
      if (filters.createdStartDate) {
        const createdStart = new Date(filters.createdStartDate);
        createdStart.setHours(0, 0, 0, 0);
        where.createdAt.gte = createdStart;
        this.logger.log(`   - Criado a partir de: ${filters.createdStartDate}`);
      }
      if (filters.createdEndDate) {
        const createdEnd = new Date(filters.createdEndDate);
        createdEnd.setHours(23, 59, 59, 999);
        where.createdAt.lte = createdEnd;
        this.logger.log(`   - Criado até: ${filters.createdEndDate}`);
      }
    }

    // ============================================
    // 4. Filtro por Motorista Responsável
    // ============================================
    if (filters?.userAssignedId) {
      if (filters.userAssignedId === 'none') {
        where.userAssignedId = null;
        this.logger.log(`   - Motorista: Não atribuído`);
      } else {
        where.userAssignedId = filters.userAssignedId;
        this.logger.log(`   - Motorista ID: ${filters.userAssignedId}`);
      }
    }

    // ============================================
    // 5. Filtro por Tipo de Ordenação
    // ============================================
    if (filters?.orderBy && filters.orderBy !== 'all') {
      where.orderBy = filters.orderBy;
      this.logger.log(`   - Tipo ordenação: ${filters.orderBy}`);
    }

    // ============================================
    // 6. Filtro por Busca textual (título)
    // ============================================
    if (filters?.search && filters.search.trim() !== '') {
      where.title = {
        contains: filters.search.trim(),
        mode: 'insensitive',
      };
      this.logger.log(`   - Busca: ${filters.search}`);
    }

    // ============================================
    // 7. Filtro por Distância Total (km)
    // ============================================
    if (
      filters?.minDistance !== undefined ||
      filters?.maxDistance !== undefined
    ) {
      where.totalDistanceMeters = {};
      if (filters.minDistance !== undefined) {
        where.totalDistanceMeters.gte = filters.minDistance * 1000;
        this.logger.log(`   - Distância mínima: ${filters.minDistance} km`);
      }
      if (filters.maxDistance !== undefined) {
        where.totalDistanceMeters.lte = filters.maxDistance * 1000;
        this.logger.log(`   - Distância máxima: ${filters.maxDistance} km`);
      }
    }

    // ============================================
    // 8. Filtro por Duração Estimada (minutos)
    // ============================================
    if (
      filters?.minDuration !== undefined ||
      filters?.maxDuration !== undefined
    ) {
      where.totalDurationSeconds = {};
      if (filters.minDuration !== undefined) {
        where.totalDurationSeconds.gte = filters.minDuration * 60;
        this.logger.log(`   - Duração mínima: ${filters.minDuration} min`);
      }
      if (filters.maxDuration !== undefined) {
        where.totalDurationSeconds.lte = filters.maxDuration * 60;
        this.logger.log(`   - Duração máxima: ${filters.maxDuration} min`);
      }
    }

    // ============================================
    // 9. Filtro por Rotas Atrasadas
    // ============================================
    if (filters?.isOverdue === true) {
      where.routeDate = {
        lt: new Date(),
      };
      where.status = {
        not: RouteStatus.FINISHED,
      };
      this.logger.log(`   - Apenas rotas atrasadas`);
    }

    // ============================================
    // 10. Filtro por Rotas Próximas (próximos 7 dias)
    // ============================================
    if (filters?.isUpcoming === true) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(23, 59, 59, 999);

      where.routeDate = {
        gte: today,
        lte: nextWeek,
      };
      where.status = {
        not: RouteStatus.FINISHED,
      };
      this.logger.log(`   - Apenas rotas próximas (próximos 7 dias)`);
    }

    // Executa a busca no banco
    const routes = await this.prisma.route.findMany({
      where,
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
        userAssigned: {
          select: { id: true, name: true, contact: true },
        },
        _count: {
          select: { stops: true },
        },
        tasks: {
          select: { id: true, title: true, status: true, intervalTime: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.log(
      `✅ [findAllRoutes] ${routes.length} rotas encontradas (pré-filtro)`,
    );

    // ============================================
    // 11. Filtro por Quantidade de Paradas (pós-processamento)
    // ============================================
    let filteredRoutes = routes;

    if (filters?.minStops !== undefined || filters?.maxStops !== undefined) {
      filteredRoutes = routes.filter((route) => {
        const stopsCount = route._count?.stops || 0;
        let matches = true;
        if (filters.minStops !== undefined && stopsCount < filters.minStops) {
          matches = false;
        }
        if (filters.maxStops !== undefined && stopsCount > filters.maxStops) {
          matches = false;
        }
        return matches;
      });
      this.logger.log(
        `   - Após filtro de paradas: ${filteredRoutes.length} rotas (min=${filters.minStops}, max=${filters.maxStops})`,
      );
    }

    // No método findAllRoutes, na formatação do retorno
    return filteredRoutes.map((route) => {
      const stopsCount = route._count?.stops || route.stops?.length || 0;
      const totalDistanceMeters = route.totalDistanceMeters || 0;
      const totalDurationSeconds = route.totalDurationSeconds || 0;

      let formattedDistance: string;
      let formattedDuration: string;

      // Para rotas com apenas 1 parada
      if (stopsCount === 1) {
        formattedDistance = 'Distância variável';
        formattedDuration = 'Calcular na execução';
      }
      // Para rotas com mais de 1 parada
      else if (totalDistanceMeters > 0) {
        formattedDistance = `${(totalDistanceMeters / 1000).toFixed(1)} km`;
        formattedDuration = this.formatDuration(totalDurationSeconds);
      } else {
        formattedDistance = 'Distância não calculada';
        formattedDuration = 'Duração não calculada';
      }

      return {
        ...route,
        formattedDistance,
        formattedDuration,
        orderBy: route.orderBy || 'DISTANCE',
        stopsCount,
      };
    });
  }

  /**
   * Busca uma rota específica com todos os detalhes
   */
  async findRouteById(routeId: string, companyId: string): Promise<any> {
    this.logger.log(
      `🔍 [findRouteById] Buscando rota ${routeId} para empresa ${companyId}`,
    );

    const route = await this.prisma.route.findFirst({
      where: {
        id: routeId,
        companyId,
      },
      include: {
        stops: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            address: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            zipCode: true, // 🔥 ADICIONAR ESTA LINHA
            latitude: true,
            longitude: true,
            order: true,
            visited: true,
            visitedAt: true,
            notes: true,
            taskId: true,
          },
        },
        userAssigned: { select: { id: true, name: true, contact: true } },
        userCreate: { select: { id: true, name: true } },
      },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    const stopsCount = route.stops?.length || 0;
    const totalDistanceMeters = route.totalDistanceMeters || 0;
    const totalDurationSeconds = route.totalDurationSeconds || 0;

    let formattedDistance: string;
    let formattedDuration: string;

    if (stopsCount === 1) {
      formattedDistance = 'Distância variável';
      formattedDuration = 'Calcular na execução';
    } else if (totalDistanceMeters > 0) {
      formattedDistance = `${(totalDistanceMeters / 1000).toFixed(1)} km`;
      formattedDuration = this.formatDuration(totalDurationSeconds);
    } else {
      formattedDistance = 'Distância não calculada';
      formattedDuration = 'Duração não calculada';
    }

    this.logger.log(`📤 [findRouteById] Retornando rota com:`);
    this.logger.log(`   stopsCount: ${stopsCount}`);
    this.logger.log(`   formattedDistance: ${formattedDistance}`);
    this.logger.log(`   formattedDuration: ${formattedDuration}`);

    return {
      ...route,
      formattedDistance,
      formattedDuration,
      totalDistanceMeters,
      totalDurationSeconds,
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

    // 🔥 CORREÇÃO DE TIMEZONE: Processar a data corretamente
    let routeDate: Date | null | undefined = undefined;

    if (dto.routeDate) {
      // Se veio como string no formato YYYY-MM-DD (do input date)
      if (
        typeof dto.routeDate === 'string' &&
        dto.routeDate.match(/^\d{4}-\d{2}-\d{2}$/)
      ) {
        const [year, month, day] = dto.routeDate.split('-');
        // Criar data no UTC com horário 12:00 (meio-dia) para evitar deslocamento de dia
        routeDate = new Date(
          Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            12,
            0,
            0,
          ),
        );
        this.logger.log(
          `   Data convertida para UTC (meio-dia): ${routeDate.toISOString()}`,
        );
      }
      // Se for string ISO completa ou outro formato
      else if (typeof dto.routeDate === 'string') {
        routeDate = new Date(dto.routeDate);
        this.logger.log(`   Data como string ISO: ${routeDate.toISOString()}`);
      }
      // Se já for objeto Date
      else if ((dto.routeDate as any) instanceof Date) {
        routeDate = dto.routeDate;
        this.logger.log(`   Data como Date object: ${routeDate}`);
      }
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
      stats = this.calculateRouteStatsFromStops(statsRefPos, stopsToSave);
    }

    // 3. Persistência no Prisma
    const updatedRoute = await this.prisma.route.update({
      where: { id: routeId },
      data: {
        title: dto.title,
        description: dto.description,
        routeDate: routeDate !== undefined ? routeDate : undefined, // 🔥 Usar a data processada
        status: dto.status,
        userAssignedId: dto.userAssignedId,
        orderBy: dto.orderBy,
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
   * Marca uma parada como visitada e atualiza a tarefa associada
   */
  // No route.service.ts - SUBSTITUIR a função existente

  async markStopAsVisited(
    routeId: string,
    stopId: string,
    companyId: string,
    notes?: string,
  ): Promise<any> {
    this.logger.log(
      `[markStopAsVisited] Marcando parada ${stopId} como visitada`,
    );
    this.logger.log(`   Observações: ${notes || 'N/A'}`);

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

    // 🔥 CORREÇÃO: Determinar o status baseado nas observações
    let taskStatus: TaskStatus = TaskStatus.COMPLETED;

    // Verificar se é FALHA (FAILED)
    if (
      notes &&
      (notes.includes('REAGENDADA') ||
        notes.includes('RESCHEDULED') ||
        notes.includes('🔄 TAREFA REAGENDADA'))
    ) {
      taskStatus = TaskStatus.RESCHEDULED;
      this.logger.log(
        `   🔄 Reagendamento detectado - status da tarefa: RESCHEDULED`,
      );
    } else if (
      notes &&
      (notes.includes('❌ ERRO NA VISITA') ||
        notes.includes('FALHA') ||
        notes.includes('FAILED') ||
        notes.includes('❌ VISITA COM FALHA'))
    ) {
      taskStatus = TaskStatus.FAILED;
      this.logger.log(`   ⚠️ Falha detectada - status da tarefa: FAILED`);
    } // Caso contrário, sucesso
    else {
      taskStatus = TaskStatus.COMPLETED;
      this.logger.log(`   ✅ Sucesso - status da tarefa: COMPLETED`);
    }

    // 🔥 BUSCAR A TAREFA ASSOCIADA
    let task: any = null;

    // 1. Tenta buscar pelo taskId salvo na parada
    if (stop.taskId) {
      task = await this.prisma.task.findFirst({
        where: {
          id: stop.taskId,
          companyId,
        },
      });

      if (task) {
        this.logger.log(
          `   📋 Tarefa encontrada pelo taskId: ${task.id} - ${task.title}`,
        );
      }
    }

    // 2. Se não encontrou, tenta pela rota e título
    if (!task && stop.name) {
      task = await this.prisma.task.findFirst({
        where: {
          companyId,
          routeId: routeId,
          title: stop.name,
        },
      });

      if (task) {
        this.logger.log(
          `   📋 Tarefa encontrada pela rota e título: ${task.id} - ${task.title}`,
        );
      }
    }

    // 3. Se ainda não encontrou, tenta apenas pelo título
    if (!task && stop.name) {
      task = await this.prisma.task.findFirst({
        where: {
          companyId,
          title: stop.name,
        },
      });

      if (task) {
        this.logger.log(
          `   📋 Tarefa encontrada apenas pelo título: ${task.id} - ${task.title}`,
        );
      }
    }

    // 🔥 ATUALIZAR A TAREFA COM O STATUS CORRETO
    if (task) {
      const updateData: any = {
        status: taskStatus,
        finalComment: notes
          ? task.finalComment
            ? `${task.finalComment}\n\n${notes}`
            : notes
          : task.finalComment,
        routeId: task.routeId || routeId,
      };

      // Se for COMPLETED, registrar data de conclusão
      if (taskStatus === TaskStatus.COMPLETED) {
        updateData.completionDate = new Date();
      }
      // Se for FAILED, NÃO registrar data de conclusão
      else if (taskStatus === TaskStatus.FAILED) {
        updateData.completionDate = null;
      }

      const updatedTask = await this.prisma.task.update({
        where: { id: task.id },
        data: updateData,
      });

      this.logger.log(
        `   ✅ Tarefa ${task.id} atualizada para status: ${taskStatus}`,
      );
      task = updatedTask;
    } else {
      this.logger.warn(
        `   ⚠️ Nenhuma tarefa encontrada para a parada: "${stop.name}"`,
      );
    }

    // 🔥 ATUALIZAR A PARADA COMO VISITADA
    const updatedStop = await this.prisma.routeStop.update({
      where: { id: stopId },
      data: {
        visited: true,
        visitedAt: new Date(),
        notes: notes || stop.notes,
      },
    });

    // Verificar se todas as paradas foram visitadas
    const allStops = await this.prisma.routeStop.findMany({
      where: { routeId },
    });

    const allVisited = allStops.every((s) => s.visited);

    if (allVisited) {
      await this.prisma.route.update({
        where: { id: routeId },
        data: { status: RouteStatus.FINISHED },
      });
      this.logger.log(`   🎉 Rota ${routeId} finalizada!`);
    }

    return {
      ...updatedStop,
      taskUpdated: !!task,
      taskStatus: task ? taskStatus : null,
      taskId: task?.id || null,
    };
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

  /**
   * Duplica uma rota existente e cria NOVAS tarefas (tasks) clonadas
   * E marca as tarefas originais como CONCLUÍDAS
   */
  async duplicateRouteWithTasks(
    routeId: string,
    companyId: string,
    userId: string,
    body: { title?: string; routeDate?: string; description?: string },
  ) {
    this.logger.log(`[Service] ========== INICIANDO DUPLICAÇÃO ==========`);
    this.logger.log(`[Service] Duplicando rota ${routeId}`);
    this.logger.log(`[Service] userId: ${userId}`);
    this.logger.log(`[Service] body: ${JSON.stringify(body)}`);

    // Busca a rota original com todas as paradas e tasks
    const originalRoute = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
        tasks: {
          include: {
            taskAddress: true,
            userAssigned: true,
            column: true,
          },
        },
      },
    });

    if (!originalRoute) {
      throw new NotFoundException('Rota original não encontrada');
    }

    this.logger.log(`📊 Rota original encontrada: ${originalRoute.id}`);
    this.logger.log(`📊 Título: ${originalRoute.title}`);
    this.logger.log(`📊 Total de stops: ${originalRoute.stops.length}`);
    this.logger.log(`📊 Total de tasks: ${originalRoute.tasks.length}`);

    // 🔥 LOG DETALHADO DAS TASKS ORIGINAIS
    this.logger.log(`📋 LISTA DE TASKS ORIGINAIS:`);
    for (const task of originalRoute.tasks) {
      this.logger.log(
        `   - ID: ${task.id}, Título: ${task.title}, Status: ${task.status}, ColumnId: ${task.columnId}`,
      );
    }

    // Prepara a descrição
    let finalDescription = originalRoute.description || '';
    if (body.description) {
      finalDescription = finalDescription
        ? `${finalDescription}\n\n📝 Observações do reagendamento: ${body.description}`
        : `📝 Observações do reagendamento: ${body.description}`;
    }

    // Buscar coluna padrão (fallback)
    const anyColumn = await this.prisma.kanbanColumn.findFirst({
      where: { companyId: companyId },
    });

    if (!anyColumn) {
      throw new NotFoundException(
        'Nenhuma coluna Kanban encontrada para a empresa',
      );
    }
    this.logger.log(`📊 Coluna fallback: ${anyColumn.id} - ${anyColumn.title}`);

    // Buscar coluna "Concluído"
    const completedColumn = await this.prisma.kanbanColumn.findFirst({
      where: {
        companyId: companyId,
        OR: [
          { title: { equals: 'Concluído', mode: 'insensitive' } },
          { title: { equals: 'Concluido', mode: 'insensitive' } },
          { title: { equals: 'COMPLETED', mode: 'insensitive' } },
          { title: { equals: 'Finalizado', mode: 'insensitive' } },
          { title: { contains: 'conclu', mode: 'insensitive' } },
        ],
      },
    });
    this.logger.log(
      `📊 Coluna concluído: ${completedColumn?.id} - ${completedColumn?.title || 'NÃO ENCONTRADA'}`,
    );

    // ============================================
    // PASSO 1: ATUALIZAR TASKS ORIGINAIS PARA COMPLETED
    // ============================================
    this.logger.log(`🔄 ========== ATUALIZANDO TASKS ORIGINAIS ==========`);
    this.logger.log(
      `🔄 Total de tasks para atualizar: ${originalRoute.tasks.length}`,
    );

    const updatedOriginalTasks: any[] = [];

    for (let idx = 0; idx < originalRoute.tasks.length; idx++) {
      const originalTask = originalRoute.tasks[idx];
      this.logger.log(
        `\n--- Task ${idx + 1}/${originalRoute.tasks.length} ---`,
      );
      this.logger.log(`   ID: ${originalTask.id}`);
      this.logger.log(`   Título: ${originalTask.title}`);
      this.logger.log(`   Status atual: ${originalTask.status}`);
      this.logger.log(`   ColumnId atual: ${originalTask.columnId}`);

      const updateData: any = {
        status: 'COMPLETED',
        completionDate: new Date(),
        userCompletedId: userId,
      };

      this.logger.log(
        `   Dados para atualizar: status=COMPLETED, userCompletedId=${userId}`,
      );

      if (completedColumn) {
        updateData.columnId = completedColumn.id;
        this.logger.log(
          `   Movendo para coluna: ${completedColumn.title} (${completedColumn.id})`,
        );
      }

      const completionNote = `✅ Tarefa concluída automaticamente ao reagendar rota. Nova rota: ${body.title || originalRoute.title} - ${new Date().toISOString()}`;
      updateData.finalComment = originalTask.finalComment
        ? `${originalTask.finalComment}\n\n${completionNote}`
        : completionNote;

      this.logger.log(`   Executando UPDATE no banco...`);

      try {
        const updatedTask = await this.prisma.task.update({
          where: { id: originalTask.id },
          data: updateData,
        });

        updatedOriginalTasks.push(updatedTask);
        this.logger.log(`   ✅ Task ATUALIZADA com SUCESSO!`);
        this.logger.log(`   - Novo status: ${updatedTask.status}`);
        this.logger.log(`   - Nova columnId: ${updatedTask.columnId}`);
        this.logger.log(`   - completionDate: ${updatedTask.completionDate}`);
        this.logger.log(
          `   - finalComment: ${updatedTask.finalComment?.substring(0, 100)}...`,
        );
      } catch (error: any) {
        this.logger.error(
          `   ❌ Erro ao atualizar task ${originalTask.id}: ${error.message}`,
        );
        throw error;
      }
    }

    this.logger.log(
      `\n✅ Total de tasks originais atualizadas: ${updatedOriginalTasks.length}`,
    );

    // ============================================
    // PASSO 2: CRIAR NOVA ROTA
    // ============================================
    this.logger.log(`🔄 ========== CRIANDO NOVA ROTA ==========`);

    const newRoute = await this.prisma.route.create({
      data: {
        title: body.title || `${originalRoute.title} (Reagendada)`,
        description: finalDescription,
        routeDate: body.routeDate
          ? new Date(body.routeDate)
          : originalRoute.routeDate,
        status: 'SCHEDULED',
        totalDistanceMeters: originalRoute.totalDistanceMeters,
        totalDurationSeconds: originalRoute.totalDurationSeconds,
        orderBy: originalRoute.orderBy,
        companyId: companyId,
        userCreateId: userId,
        userAssignedId: originalRoute.userAssignedId,
        stops: {
          create: originalRoute.stops.map((stop, index) => ({
            name: stop.name || `Parada ${index + 1}`,
            address: stop.address,
            complement: stop.complement || '',
            neighborhood: stop.neighborhood || '',
            city: stop.city,
            state: stop.state,
            zipCode: stop.zipCode,
            latitude: stop.latitude,
            longitude: stop.longitude,
            order: index + 1,
            notes: '',
            companyId: companyId,
          })),
        },
      },
      include: {
        stops: { orderBy: { order: 'asc' } },
      },
    });

    this.logger.log(`✅ Nova rota criada: ${newRoute.id}`);
    this.logger.log(`   Título: ${newRoute.title}`);
    this.logger.log(`   Stops: ${newRoute.stops.length}`);

    // ============================================
    // PASSO 3: CRIAR NOVAS TASKS (PENDING)
    // ============================================
    this.logger.log(`🔄 ========== CRIANDO NOVAS TASKS ==========`);
    this.logger.log(
      `🔄 Total de novas tasks a criar: ${newRoute.stops.length}`,
    );

    const createdTasks: any[] = [];

    for (let i = 0; i < newRoute.stops.length; i++) {
      const newStop = newRoute.stops[i];
      const stopName = newStop.name || `Parada ${i + 1}`;
      this.logger.log(`\n--- Nova Task ${i + 1}/${newRoute.stops.length} ---`);
      this.logger.log(`   Nome: ${stopName}`);

      // Buscar task original correspondente
      const originalTask = originalRoute.tasks.find(
        (t) => t.title === stopName,
      );
      this.logger.log(
        `   Task original correspondente: ${originalTask?.id || 'NÃO ENCONTRADA'}`,
      );

      // Definir coluna
      let columnId = originalTask?.columnId;
      if (!columnId || columnId === completedColumn?.id) {
        columnId = anyColumn.id;
        this.logger.log(`   Usando coluna fallback: ${columnId}`);
      } else {
        this.logger.log(`   Usando coluna original: ${columnId}`);
      }

      this.logger.log(`   Criando task com status PENDING...`);

      const newTask = await this.prisma.task.create({
        data: {
          title: stopName,
          description: originalTask?.description
            ? `Rota: ${newRoute.title}\nEndereço: ${newStop.address}\n\n--- Tarefa original (concluída): ${originalTask.description || ''}`
            : `Rota: ${newRoute.title}\nEndereço: ${newStop.address}`,
          status: 'PENDING',
          scheduledDate: newRoute.routeDate || new Date(),
          companyId: companyId,
          userCreateId: userId,
          userAssignedId:
            originalTask?.userAssignedId || originalRoute.userAssignedId,
          columnId: columnId,
          routeId: newRoute.id,
          priority: originalTask?.priority || 1,
          columnOrder: i,
          taskAddress: {
            create: {
              endereco: newStop.address,
              numero: '',
              bairro: newStop.neighborhood || '',
              cidade: newStop.city,
              estado: newStop.state,
              cep: newStop.zipCode,
              complemento: newStop.complement || '',
              latitude: newStop.latitude,
              longitude: newStop.longitude,
              companyId: companyId,
            },
          },
        },
      });

      createdTasks.push(newTask);
      this.logger.log(
        `   ✅ Nova task criada: ${newTask.id} - ${newTask.title} (status: ${newTask.status})`,
      );
    }

    // ============================================
    // PASSO 4: ATUALIZAR DESCRIÇÃO DA ROTA
    // ============================================
    const updatedRoute = await this.prisma.route.update({
      where: { id: newRoute.id },
      data: {
        description: `${finalDescription}\n\n📋 ${createdTasks.length} tarefa(s) criada(s) automaticamente.\n✅ ${updatedOriginalTasks.length} tarefa(s) original(is) concluída(s).`,
      },
      include: {
        stops: { orderBy: { order: 'asc' } },
        tasks: true,
        userAssigned: { select: { id: true, name: true, contact: true } },
      },
    });

    this.logger.log(`\n🎉 ========== PROCESSO CONCLUÍDO ==========`);
    this.logger.log(
      `   - Tasks originais concluídas: ${updatedOriginalTasks.length}`,
    );
    this.logger.log(`   - Novas tasks criadas: ${createdTasks.length}`);
    this.logger.log(`   - Nova rota ID: ${newRoute.id}`);

    // 🔥 VERIFICAÇÃO FINAL - Buscar tasks atualizadas para confirmar
    const verificationTasks = await this.prisma.task.findMany({
      where: { id: { in: updatedOriginalTasks.map((t) => t.id) } },
      select: { id: true, title: true, status: true, completionDate: true },
    });

    this.logger.log(`\n🔍 VERIFICAÇÃO FINAL - Tasks após atualização:`);
    for (const task of verificationTasks) {
      this.logger.log(
        `   - ${task.title}: status=${task.status}, completionDate=${task.completionDate}`,
      );
    }

    return {
      message: `Rota reagendada com sucesso. ${createdTasks.length} nova(s) tarefa(s) criada(s). ${updatedOriginalTasks.length} tarefa(s) original(is) concluída(s).`,
      originalRouteId: routeId,
      newRoute: updatedRoute,
      tasksCreated: createdTasks.length,
      tasksCompleted: updatedOriginalTasks.length,
    };
  }

  // routes.service.ts - Adicione este método após o método deleteRoute

  /**
   * Busca todas as tarefas associadas a uma rota
   * @param routeId - ID da rota
   * @param companyId - ID da empresa (para validação de segurança)
   * @returns Lista de tarefas com id, title, intervalTime e status
   */
  async getTasksByRoute(routeId: string, companyId: string) {
    this.logger.log(`[getTasksByRoute] Buscando tasks da rota ${routeId}`);

    // Primeiro, verificar se a rota existe e pertence à empresa
    const route = await this.prisma.route.findFirst({
      where: {
        id: routeId,
        companyId: companyId,
      },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    // Buscar todas as tasks vinculadas a esta rota
    const tasks = await this.prisma.task.findMany({
      where: {
        routeId: routeId,
        companyId: companyId,
      },
      select: {
        id: true,
        title: true,
        intervalTime: true,
        status: true,
        scheduledDate: true,
        createdAt: true,
        taskAddress: {
          select: {
            endereco: true,
            cidade: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    this.logger.log(
      `[getTasksByRoute] Encontradas ${tasks.length} tasks para a rota ${routeId}`,
    );

    return tasks;
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

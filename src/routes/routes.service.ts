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
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

// No arquivo optimize-route.dto.ts ou onde estiver a interface
export interface RouteStats {
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  formattedDuration: string;
  formattedDistance: string;
  estimatedFuel?: number; // 🔥 ADICIONAR
  formattedFuel?: string; // 🔥 ADICIONAR
}

// Interface para comparação de rotas
interface RouteComparison {
  distance: {
    planned: number | null;
    actual: number | null;
    difference: number | null;
    percentage: string | null;
  };
  time: {
    planned: number | null;
    actual: number | null;
    difference: number | null;
    percentage: string | null;
  };
  fuel: {
    planned: number | null;
    actual: number | null;
    difference: number | null;
    percentage: string | null;
  };
}

// No arquivo dto/optimize-route.dto.ts
export interface CompleteRouteDto {
  actualDistance?: number;
  actualFuel?: number;
  actualTime?: number;
  distanciaReal?: number;
  combustivelReal?: number;
  duracaoReal?: number;
  observacoes?: string;
}

/**
 * Service responsável pela lógica de rotas e otimização logística.
 * Ele lida com busca de tarefas geolocalizadas, algoritmos de ordenação (Vizinho Mais Próximo)
 * e cálculos de distância/tempo.
 */
@Injectable()
export class RouteService {
  private readonly logger = new Logger(RouteService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { }

  private readonly FUEL_EFFICIENCY_KM_PER_L = 30; // 20 km por litro (você pode ajustar)

  // ============================================
  // MÉTODOS DE ROTA REALIZADA (NOVOS)
  // ============================================

  /**
   * Inicia uma rota (motorista começou a executar)
   */
  async startRoute(
    routeId: string,
    companyId: string,
    userId: string,
  ): Promise<any> {
    this.logger.log(`[startRoute] Iniciando rota ${routeId}`);

    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    if (route.status !== RouteStatus.SCHEDULED) {
      throw new BadRequestException(
        'Apenas rotas agendadas podem ser iniciadas',
      );
    }

    const updatedRoute = await this.prisma.route.update({
      where: { id: routeId },
      data: {
        status: RouteStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    this.logger.log(
      `[startRoute] Rota ${routeId} iniciada em ${updatedRoute.startedAt}`,
    );

    return {
      message: 'Rota iniciada com sucesso',
      route: updatedRoute,
    };
  }

  /**
 * Retorna estatísticas resumidas de todas as rotas
 */
  async getRoutesSummary(companyId: string): Promise<any> {
    this.logger.log(`[getRoutesSummary] Gerando resumo para empresa ${companyId}`);

    const routes = await this.prisma.route.findMany({
      where: { companyId },
      include: {
        _count: {
          select: { stops: true }
        }
      }
    });

    const summary = {
      total: routes.length,
      byStatus: {
        scheduled: routes.filter((r) => r.status === 'SCHEDULED').length,
        inProgress: routes.filter((r) => r.status === 'IN_PROGRESS').length,
        finished: routes.filter((r) => r.status === 'FINISHED').length,
        canceled: routes.filter((r) => r.status === 'CANCELED').length,
      },
      totalStops: routes.reduce(
        (acc, route) => acc + (route._count?.stops || 0),
        0,
      ),
      totalDistance: routes.reduce(
        (acc, route) => acc + (route.totalDistanceMeters || 0),
        0,
      ),
      averageDistancePerRoute:
        routes.length > 0
          ? routes.reduce(
            (acc, route) => acc + (route.totalDistanceMeters || 0),
            0,
          ) /
          routes.length /
          1000
          : 0,
      lastRoutes: routes.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        stopsCount: r._count?.stops || 0,
        createdAt: r.createdAt,
      })),
    };

    return summary;
  }

  async completeRoute(
    routeId: string,
    companyId: string,
    userId: string,
    dto: CompleteRouteDto,
  ): Promise<any> {
    // 🔥 USA OS NOMES EM INGLÊS
    const distReal = dto.actualDistance;
    const fuelReal = dto.actualFuel;
    const timeReal = dto.actualTime;

    this.logger.log(`[completeRoute] ========== FINALIZANDO ROTA ==========`);
    this.logger.log(`   Rota ID: ${routeId}`);
    this.logger.log(`   actualDistance: ${distReal ?? 'N/A'} km`);
    this.logger.log(`   actualFuel: ${fuelReal ?? 'N/A'} L`);
    this.logger.log(`   actualTime: ${timeReal ?? 'N/A'} minutos`);

    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
      include: { stops: true },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    if (route.status !== RouteStatus.IN_PROGRESS) {
      throw new BadRequestException('Apenas rotas em andamento podem ser finalizadas');
    }

    const now = new Date();

    // Prepara os dados para atualização
    const updateData: any = {
      status: RouteStatus.FINISHED,
      completedAt: now,
    };

    // 🔥 SALVA DISTÂNCIA REAL
    if (distReal !== undefined && distReal !== null && distReal > 0) {
      updateData.actualDistance = distReal;
      this.logger.log(`   ✅ Salvando actualDistance: ${distReal} km`);
    }

    // 🔥 SALVA COMBUSTÍVEL REAL
    if (fuelReal !== undefined && fuelReal !== null && fuelReal > 0) {
      updateData.actualFuel = fuelReal;
      this.logger.log(`   ✅ Salvando actualFuel: ${fuelReal} L`);
    }

    // 🔥 SALVA TEMPO REAL (se veio no DTO)
    if (timeReal !== undefined && timeReal !== null && timeReal > 0) {
      updateData.actualTime = timeReal;
      this.logger.log(`   ✅ Salvando actualTime: ${timeReal} minutos`);
    } else if (route.startedAt) {
      // Se não veio, calcula baseado no startedAt
      const tempoRealSegundos = Math.floor((now.getTime() - new Date(route.startedAt).getTime()) / 1000);
      const tempoRealMinutos = Math.floor(tempoRealSegundos / 60);
      updateData.actualTime = tempoRealMinutos;
      this.logger.log(`   ✅ Salvando actualTime (calculado): ${tempoRealMinutos} minutos`);
    }

    // Adiciona observações
    if (dto.observacoes) {
      updateData.description = route.description
        ? `${route.description}\n\n📝 ${dto.observacoes}`
        : `📝 ${dto.observacoes}`;
    }

    // 🔥 EXECUTA A ATUALIZAÇÃO
    const updatedRoute = await this.prisma.route.update({
      where: { id: routeId },
      data: updateData,
    });

    this.logger.log(`[completeRoute] ROTA FINALIZADA COM SUCESSO!`);
    this.logger.log(`   📊 RESULTADO SALVO:`);
    this.logger.log(`   - actualDistance: ${updatedRoute.actualDistance ?? 'NÃO SALVO'} km`);
    this.logger.log(`   - actualTime: ${updatedRoute.actualTime ?? 'NÃO SALVO'} min`);
    this.logger.log(`   - actualFuel: ${updatedRoute.actualFuel ?? 'NÃO SALVO'} L`);

    return {
      message: 'Rota finalizada com sucesso',
      route: updatedRoute,
    };
  }

  /**
   * Calcula comparação entre rota prevista e realizada
   */
  private calcularComparacaoRota(
    prevista: any,
    realizada: any,
  ): RouteComparison {
    const comparacao: RouteComparison = {
      distance: {
        planned: prevista.totalDistanceMeters
          ? prevista.totalDistanceMeters / 1000
          : null,
        actual: realizada.actualDistance ?? null,
        difference: null,
        percentage: null,
      },
      time: {
        planned: prevista.totalDurationSeconds ?? null,
        actual: realizada.actualTime ?? null,
        difference: null,
        percentage: null,
      },
      fuel: {
        planned: prevista.estimatedFuel ?? null,
        actual: realizada.actualFuel ?? null,
        difference: null,
        percentage: null,
      },
    };

    // Calcula diferença de distância
    if (
      comparacao.distance.planned !== null &&
      comparacao.distance.actual !== null
    ) {
      comparacao.distance.difference =
        comparacao.distance.actual - comparacao.distance.planned;
      comparacao.distance.percentage = (
        (comparacao.distance.difference / comparacao.distance.planned) *
        100
      ).toFixed(1);
    }

    // Calcula diferença de tempo
    if (comparacao.time.planned !== null && comparacao.time.actual !== null) {
      comparacao.time.difference =
        comparacao.time.actual - comparacao.time.planned;
      comparacao.time.percentage = (
        (comparacao.time.difference / comparacao.time.planned) *
        100
      ).toFixed(1);
    }

    // Calcula diferença de combustível
    if (comparacao.fuel.planned !== null && comparacao.fuel.actual !== null) {
      comparacao.fuel.difference =
        comparacao.fuel.actual - comparacao.fuel.planned;
      comparacao.fuel.percentage = (
        (comparacao.fuel.difference / comparacao.fuel.planned) *
        100
      ).toFixed(1);
    }

    return comparacao;
  }

  /**
   * Busca todas as rotas com dados de performance (para relatórios)
   */
  async findAllRoutesWithPerformance(
    companyId: string,
    filters?: {
      startDate?: string;
      endDate?: string;
      onlyFinished?: boolean;
    },
  ): Promise<any[]> {
    this.logger.log(
      `[findAllRoutesWithPerformance] Buscando rotas com performance`,
    );

    const where: Prisma.RouteWhereInput = { companyId };

    if (filters?.onlyFinished) {
      where.status = RouteStatus.FINISHED;
    }

    if (filters?.startDate || filters?.endDate) {
      where.routeDate = {};
      if (filters.startDate) {
        where.routeDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.routeDate.lte = new Date(filters.endDate);
      }
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
      },
      orderBy: {
        routeDate: 'desc',
      },
    });

    // Adiciona dados de performance e comparação
    return routes.map((route) => {
      const comparacao = this.calcularComparacaoRota(route, route);

      return {
        ...route,
        formattedDistancePlanned: route.totalDistanceMeters
          ? `${(route.totalDistanceMeters / 1000).toFixed(1)} km`
          : 'Não calculada',
        formattedDistanceActual: route.actualDistance
          ? `${route.actualDistance.toFixed(1)} km`
          : 'Não realizada',
        formattedTimePlanned: route.totalDurationSeconds
          ? this.formatDuration(route.totalDurationSeconds)
          : 'Não calculado',
        formattedTimeActual: route.actualTime
          ? this.formatDuration(route.actualTime)
          : 'Não realizado',
        fuelEfficiency:
          route.actualDistance && route.actualFuel
            ? (route.actualDistance / route.actualFuel).toFixed(1) // km por litro
            : null,
        comparacao,
        isComplete: !!route.completedAt,
      };
    });
  }

  /**
   * Atualiza apenas o consumo de combustível previsto de uma rota
   */
  async updateFuelEstimate(
    routeId: string,
    companyId: string,
    estimatedFuel: number,
  ): Promise<any> {
    this.logger.log(
      `[updateFuelEstimate] Atualizando combustível previsto da rota ${routeId} para ${estimatedFuel} L`,
    );

    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    const updatedRoute = await this.prisma.route.update({
      where: { id: routeId },
      data: {
        estimatedFuel,
      },
    });

    return {
      message: 'Combustível previsto atualizado com sucesso',
      route: updatedRoute,
    };
  }

  // ============================================
  // MÉTODOS EXISTENTES (VOCÊ JÁ TEM)
  // ============================================

  /**
   * Busca tarefas que possuem localização válida
   */
  async getTasksWithLocation(
    companyId: string,
    filters: { startDate?: string; endDate?: string; assignedToId?: string },
  ): Promise<Task[]> {
    // ... seu código existente ...
    const allTasks = await this.prisma.task.findMany({
      where: { companyId },
      include: { taskAddress: true },
    });

    this.logger.log(
      `📊 [getTasksWithLocation] Total de tarefas na empresa: ${allTasks.length}`,
    );

    const where: Prisma.TaskWhereInput = {
      companyId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      taskAddress: {
        latitude: { not: null },
        longitude: { not: null },
      },
    };

    if (filters.startDate || filters.endDate) {
      where.scheduledDate = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        ...(filters.endDate && { lte: new Date(filters.endDate) }),
      };
    }

    if (filters.assignedToId && filters.assignedToId !== 'all') {
      where.userAssignedId = filters.assignedToId;
    }

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

    return tasks;
  }

  /**
   * Otimiza rota baseada nas tarefas selecionadas
   */
  async optimizeRoute(dto: OptimizeRouteDto) {
    this.logger.log('='.repeat(80));
    this.logger.log('🚀 [optimizeRoute] INICIANDO OTIMIZAÇÃO DE ROTA');
    this.logger.log('='.repeat(80));

    this.logger.log(`📦 DTO recebido:`);
    this.logger.log(`   taskIds: ${JSON.stringify(dto.taskIds)}`);
    this.logger.log(`   Quantidade de taskIds: ${dto.taskIds.length}`);
    this.logger.log(`   driverLatitude: ${dto.driverLatitude}`);
    this.logger.log(`   driverLongitude: ${dto.driverLongitude}`);
    this.logger.log(`   orderBy: ${dto.orderBy || 'DISTANCE (padrão)'}`);

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

    if (tasks.length === 0) {
      throw new NotFoundException(
        'Nenhuma tarefa válida encontrada. Verifique se todas as tarefas têm endereço com coordenadas.',
      );
    }

    let optimizedOrder: typeof tasks = [];

    if (dto.orderBy === RouteOrderType.PRIORITY) {
      this.logger.log('🎯 [2/6] Usando ordenação por PRIORIDADE');
      optimizedOrder = tasks.sort((a, b) => {
        const priorityA = a.priority ?? 999;
        const priorityB = b.priority ?? 999;
        return priorityA - priorityB;
      });
    } else {
      this.logger.log('🎯 [2/6] Usando ordenação por PROXIMIDADE');
      let currentLocation = {
        lat: Number(dto.driverLatitude),
        lng: Number(dto.driverLongitude),
      };
      const remainingTasks = [...tasks];

      while (remainingTasks.length > 0) {
        let nearestTaskIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < remainingTasks.length; i++) {
          const t = remainingTasks[i];
          const tLat = Number(t.taskAddress?.latitude);
          const tLng = Number(t.taskAddress?.longitude);

          if (!t.taskAddress || isNaN(tLat) || isNaN(tLng)) continue;

          const dist = this.calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            tLat,
            tLng,
          );

          if (dist < minDistance) {
            minDistance = dist;
            nearestTaskIndex = i;
          }
        }

        if (nearestTaskIndex === -1) break;

        const nearestTask = remainingTasks[nearestTaskIndex];
        optimizedOrder.push(nearestTask);

        currentLocation = {
          lat: Number(nearestTask.taskAddress?.latitude),
          lng: Number(nearestTask.taskAddress?.longitude),
        };
        remainingTasks.splice(nearestTaskIndex, 1);
      }
    }

    this.logger.log(
      `✅ [3/6] Ordenação concluída: ${optimizedOrder.length} tarefas na rota`,
    );

    const stats = await this.calculateRouteStats(
      { lat: Number(dto.driverLatitude), lng: Number(dto.driverLongitude) },
      optimizedOrder,
    );

    // 🔥 CALCULAR COMBUSTÍVEL PREVISTO BASEADO NA DISTÂNCIA
    const distanciaKm = stats.totalDistanceMeters / 1000;
    const estimatedFuel = distanciaKm / this.FUEL_EFFICIENCY_KM_PER_L;

    this.logger.log(`⛽ [optimizeRoute] Cálculo de combustível:`);
    this.logger.log(`   Distância total: ${distanciaKm.toFixed(2)} km`);
    this.logger.log(`   Eficiência: ${this.FUEL_EFFICIENCY_KM_PER_L} km/L`);
    this.logger.log(`   Combustível previsto: ${estimatedFuel.toFixed(2)} L`);

    this.logger.log('\n' + '='.repeat(80));
    this.logger.log(
      `✅ [FINAL] Rota otimizada com ${optimizedOrder.length} paradas`,
    );
    this.logger.log(`   Tempo estimado: ${stats.formattedDuration}`);
    this.logger.log(`   Distância: ${stats.formattedDistance}`);
    this.logger.log(`   Combustível estimado: ${estimatedFuel.toFixed(2)} L`);
    this.logger.log('='.repeat(80) + '\n');

    return {
      route: optimizedOrder,
      stats: {
        ...stats,
        estimatedFuel: estimatedFuel,
        formattedFuel: `${estimatedFuel.toFixed(1)} L`,
      },
    };
  }

  /**
   * Calcula o tempo e distância totais da rota
   */
  private async calculateRouteStats(
    startPos: { lat: number; lng: number },
    tasks: Task[],
  ): Promise<RouteStats> {
    // ... seu código existente ...
    try {
      const validTasks = tasks.filter((t: any) => {
        const lat = Number(t.taskAddress?.latitude);
        const lng = Number(t.taskAddress?.longitude);
        return !isNaN(lat) && !isNaN(lng);
      });

      if (validTasks.length === 0) {
        return this.getFallbackStats(startPos, tasks);
      }

      const coordinates = [
        `${startPos.lng},${startPos.lat}`,
        ...validTasks.map(
          (t: any) =>
            `${Number(t.taskAddress.longitude)},${Number(t.taskAddress.latitude)}`,
        ),
      ].join(';');

      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
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
        totalDistKm += dist;
        current = { lat, lng };
      }
    }

    const averageSpeedKmH = 30;
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

    return {
      totalDurationSeconds: estimatedSeconds,
      totalDistanceMeters: totalDistKm * 1000,
      formattedDuration: `~${this.formatDuration(estimatedSeconds)}`,
      formattedDistance: `~${totalDistKm.toFixed(1)} km`,
    };
  }

  /**
   * Finaliza ou Reagenda uma tarefa na rota
   */
  async concludeVisit(
    taskId: string,
    userId: string,
    dto: FinalizeTaskDto,
  ): Promise<{ message: string; task: Task }> {
    // ... seu código existente ...
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    let statusFinal: TaskStatus;

    if (dto.status === 'RESCHEDULED') {
      statusFinal = TaskStatus.RESCHEDULED;
    } else if (dto.status === 'FAILED') {
      statusFinal = TaskStatus.FAILED;
    } else if (dto.status === 'COMPLETED') {
      statusFinal = TaskStatus.COMPLETED;
    } else {
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

  private getTaskIncludeDetails() {
    return {
      taskAddress: true,
      userAssigned: { select: { name: true } },
      userCompleted: { select: { name: true } },
    };
  }

  /**
   * Cria uma nova rota
   */
  async createRoute(dto: CreateRouteDto, companyId: string, userId: string) {
    this.logger.log('='.repeat(80));
    this.logger.log(`🚀 [createRoute] INICIANDO CRIAÇÃO DE ROTA`);
    this.logger.log(`📝 Título: ${dto.title}`);
    this.logger.log(`📅 Data recebida (raw): ${dto.routeDate}`);
    this.logger.log(`📦 Quantidade de paradas: ${dto.stops.length}`);
    this.logger.log(`🎯 Tipo de ordenação: ${dto.orderBy || 'DISTANCE'}`);

    let routeDate: Date | null = null;

    if (dto.routeDate) {
      if (
        typeof dto.routeDate === 'string' &&
        dto.routeDate.match(/^\d{4}-\d{2}-\d{2}$/)
      ) {
        const [year, month, day] = dto.routeDate.split('-');
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
      } else if (typeof dto.routeDate === 'string') {
        routeDate = new Date(dto.routeDate);
      } else if ((dto.routeDate as any) instanceof Date) {
        routeDate = dto.routeDate;
      }
    }

    const finalRouteDate = routeDate;
    let optimizedStops = [...dto.stops];
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

    // 🔥 FUNÇÃO PARA VALIDAR E CORRIGIR COORDENADAS
    const validateAndFixCoordinates = (lat: number, lng: number, name: string = 'sem nome'): { latitude: number; longitude: number; fixed: boolean } => {
      let latitude = lat;
      let longitude = lng;
      let fixed = false;

      this.logger.log(`🔍 [validateCoordinates] Validando parada: ${name}`);
      this.logger.log(`   Original: lat=${latitude}, lng=${longitude}`);

      // Verificar se é NaN
      if (isNaN(latitude) || isNaN(longitude)) {
        this.logger.error(`   ❌ Coordenada NaN!`);
        return { latitude: 0, longitude: 0, fixed: true };
      }

      // Verificar se é zero
      if (latitude === 0 && longitude === 0) {
        this.logger.error(`   ❌ Coordenada zero!`);
        return { latitude: 0, longitude: 0, fixed: true };
      }

      // 🔥 CORREÇÃO: Se latitude > 90 e longitude <= 90, estão trocadas
      if (Math.abs(latitude) > 90 && Math.abs(longitude) <= 90) {
        this.logger.warn(`   ⚠️ Coordenadas parecem trocadas! Corrigindo...`);
        const temp = latitude;
        latitude = longitude;
        longitude = temp;
        fixed = true;
        this.logger.log(`   ✅ Corrigido: lat=${latitude}, lng=${longitude}`);
      }

      // 🔥 CORREÇÃO: Se latitude é positiva e longitude negativa, mas valor absoluto da latitude é pequeno (possível Brasil)
      // Brasil tem latitude negativa (Sul), então se for positiva, pode estar errada
      if (latitude > 0 && latitude < 10 && longitude < 0 && longitude > -80) {
        this.logger.warn(`   ⚠️ Latitude positiva (${latitude}) detectada para endereço no Brasil. Verificar se está correta.`);
      }

      // Validar se está dentro do Brasil (aproximadamente)
      const isValidLat = latitude >= -34 && latitude <= 5;
      const isValidLng = longitude >= -74 && longitude <= -34;

      if (!isValidLat) {
        this.logger.warn(`   ⚠️ Latitude (${latitude}) fora do intervalo esperado para Brasil (-34 a 5)`);
      }
      if (!isValidLng) {
        this.logger.warn(`   ⚠️ Longitude (${longitude}) fora do intervalo esperado para Brasil (-74 a -34)`);
      }

      if (isValidLat && isValidLng) {
        this.logger.log(`   ✅ Coordenada válida para o Brasil!`);
      }

      return { latitude, longitude, fixed };
    };

    // 🔥 VALIDAR E CORRIGIR COORDENADAS DAS PARADAS ANTES DE PROCESSAR
    const validatedStops = dto.stops.map(stop => {
      const stopName = stop.name || `Parada sem nome`;
      const validated = validateAndFixCoordinates(stop.latitude, stop.longitude, stopName);

      // Se foi corrigido, atualizar o objeto
      if (validated.fixed) {
        this.logger.warn(`   🔧 Parada "${stopName}" teve coordenadas corrigidas!`);
      }

      return {
        ...stop,
        latitude: validated.latitude,
        longitude: validated.longitude,
      };
    });

    if (validatedStops.length > 0) {
      if (validatedStops.length === 1) {
        totalDistanceMeters = 0;
        totalDurationSeconds = 0;
        optimizedStops = validatedStops;
        this.logger.log(`📋 Rota com 1 parada - distância será 0`);
      } else {
        const startPos = {
          lat: validatedStops[0].latitude,
          lng: validatedStops[0].longitude,
        };

        this.logger.log(`📍 [startPos] Ponto de partida: lat=${startPos.lat}, lng=${startPos.lng}`);

        if (dto.orderBy === RouteOrderType.DISTANCE) {
          this.logger.log(
            `🎯 Otimizando rota por DISTÂNCIA com ${validatedStops.length} paradas`,
          );
          optimizedStops = this.optimizeStopsByDistance(startPos, validatedStops);
        } else {
          this.logger.log(
            `📋 Mantendo ordem original (${validatedStops.length} parada(s))`,
          );
          optimizedStops = validatedStops;
        }

        const stats = this.calculateRouteStatsFromStops(
          startPos,
          optimizedStops,
        );
        totalDistanceMeters = stats.totalDistanceMeters;
        totalDurationSeconds = stats.totalDurationSeconds;
        const estimatedFuelFromStats = stats.estimatedFuel;

        this.logger.log(
          `⛽ [createRoute] Combustível calculado pelo stats: ${estimatedFuelFromStats.toFixed(2)} L`,
        );
      }
    }

    // 🔥 CALCULAR COMBUSTÍVEL PREVISTO BASEADO NA DISTÂNCIA
    let calculatedFuel: number | null = null;

    if (totalDistanceMeters > 0) {
      const distanciaKm = totalDistanceMeters / 1000;
      calculatedFuel = distanciaKm / this.FUEL_EFFICIENCY_KM_PER_L;

      this.logger.log(`⛽ [createRoute] Cálculo automático de combustível:`);
      this.logger.log(`   Distância: ${distanciaKm.toFixed(2)} km`);
      this.logger.log(`   Eficiência: ${this.FUEL_EFFICIENCY_KM_PER_L} km/L`);
      this.logger.log(
        `   Combustível calculado: ${calculatedFuel.toFixed(2)} L`,
      );
    } else {
      this.logger.log(
        `⛽ [createRoute] Distância zero, combustível não calculado`,
      );
    }

    // 🔥 USAR O VALOR DO DTO SE FOI ENVIADO, SENÃO USA O CALCULADO
    const finalEstimatedFuel = (dto as any).estimatedFuel ?? calculatedFuel;

    this.logger.log(
      `⛽ [createRoute] Combustível final: ${finalEstimatedFuel !== null ? finalEstimatedFuel.toFixed(2) + ' L' : 'Não definido'}`,
    );

    const stopTitles = validatedStops
      .map((stop) => stop.name)
      .filter(
        (name): name is string =>
          name !== null && name !== undefined && name !== '',
      );

    let existingTasks: any[] = [];
    if (stopTitles.length > 0) {
      existingTasks = await this.prisma.task.findMany({
        where: { companyId: companyId, title: { in: stopTitles } },
        include: { taskAddress: true },
      });
    }

    this.logger.log(`📊 Tasks encontradas: ${existingTasks.length}`);

    const taskByTitle = new Map();
    existingTasks.forEach((task) => {
      taskByTitle.set(task.title, task);
    });

    // 🔥 LOG DAS COORDENADAS QUE SERÃO SALVAS
    this.logger.log(`\n📦 [STOPS] Paradas que serão salvas:`);
    optimizedStops.forEach((stop, index) => {
      const stopName = stop.name || `Parada ${index + 1}`;
      this.logger.log(`   ${index + 1}. ${stopName}`);
      this.logger.log(`      Endereço: ${stop.address}, ${stop.city}/${stop.state}`);
      this.logger.log(`      Coordenadas: lat=${stop.latitude}, lng=${stop.longitude}`);
    });

    // 🔥 CRIA A ROTA COM O COMBUSTÍVEL CALCULADO
    const route = await this.prisma.route.create({
      data: {
        title: dto.title,
        description: dto.description || '',
        routeDate: finalRouteDate,
        status: RouteStatus.SCHEDULED,
        totalDistanceMeters: totalDistanceMeters,
        totalDurationSeconds: totalDurationSeconds,
        estimatedFuel: finalEstimatedFuel,
        optimizedAt: new Date(),
        companyId: companyId,
        userCreateId: userId,
        userAssignedId: dto.userAssignedId || null,
        orderBy: dto.orderBy || 'DISTANCE',
        stops: {
          create: await Promise.all(
            optimizedStops.map(async (stop, index) => {
              const existingTask = taskByTitle.get(stop.name);
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

              if (!zipCode && stop.zipCode) zipCode = stop.zipCode;
              if (!bairro && stop.bairro) bairro = stop.bairro;

              const stopName = stop.name || `Parada ${index + 1}`;

              return {
                name: stopName,
                address: stop.address,
                complement: stop.complement || '',
                neighborhood: (bairro || stop.neighborhood || '').toString(),
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
      include: { stops: { orderBy: { order: 'asc' } } },
    });

    this.logger.log(`✅ [createRoute] Rota criada com ID: ${route.id}`);
    this.logger.log(`   Distância total: ${route.totalDistanceMeters} metros`);
    this.logger.log(`   Duração total: ${route.totalDurationSeconds} segundos`);
    this.logger.log(
      `   Combustível previsto: ${route.estimatedFuel !== null ? route.estimatedFuel.toFixed(2) + ' L' : 'Não definido'}`,
    );

    // 🔥 VERIFICAR COORDENADAS SALVAS
    const savedStops = await this.prisma.routeStop.findMany({
      where: { routeId: route.id },
      select: { name: true, latitude: true, longitude: true, address: true, city: true, state: true },
    });

    this.logger.log(`\n🔍 [VERIFICAÇÃO] Coordenadas salvas no banco:`);
    savedStops.forEach((stop) => {
      this.logger.log(`   📍 ${stop.name}`);
      this.logger.log(`      Endereço: ${stop.address}, ${stop.city}/${stop.state}`);
      this.logger.log(`      Coordenadas salvas: lat=${stop.latitude}, lng=${stop.longitude}`);
    });

    if (existingTasks.length > 0) {
      this.logger.log(
        `🔄 Vinculando ${existingTasks.length} tasks à rota ${route.id}`,
      );
      for (const task of existingTasks) {
        await this.prisma.task.update({
          where: { id: task.id },
          data: { routeId: route.id },
        });
        this.logger.log(`   ✅ Task "${task.title}" vinculada à rota`);
      }
    }

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

    const formattedFuel =
      route.estimatedFuel !== null
        ? `${route.estimatedFuel.toFixed(1)} L`
        : 'Não calculado';

    this.logger.log(`📤 Retorno formatado:`);
    this.logger.log(`   formattedDistance: ${formattedDistance}`);
    this.logger.log(`   formattedDuration: ${formattedDuration}`);
    this.logger.log(`   formattedFuel: ${formattedFuel}`);

    return {
      ...completeRoute,
      formattedDistance,
      formattedDuration,
      formattedFuel,
      totalDistanceMeters,
      totalDurationSeconds,
      estimatedFuel: route.estimatedFuel,
    };
  }

  /**
   * Otimiza a ordem das paradas
   */
  private optimizeStopsByDistance(
    startPos: { lat: number; lng: number },
    stops: RouteStopDto[],
  ): RouteStopDto[] {
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
   * Calcula estatísticas da rota a partir das paradas
   */
  private calculateRouteStatsFromStops(
    startPos: { lat: number; lng: number },
    stops: RouteStopDto[],
  ): {
    totalDurationSeconds: number;
    totalDistanceMeters: number;
    estimatedFuel: number;
    formattedFuel: string;
  } {
    if (stops.length === 0) {
      this.logger.log(
        `[calculateRouteStatsFromStops] Nenhuma parada - retornando zero`,
      );
      return {
        totalDurationSeconds: 0,
        totalDistanceMeters: 0,
        estimatedFuel: 0,
        formattedFuel: '0 L',
      };
    }

    this.logger.log(
      `[calculateRouteStatsFromStops] Calculando para ${stops.length} parada(s)`,
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

      this.logger.log(`   Trecho ${i + 1}: ${dist.toFixed(2)} km`);
      totalDistKm += dist;
      current = { lat: stop.latitude, lng: stop.longitude };
    }

    const averageSpeedKmH = 30;
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

    // 🔥 CALCULAR COMBUSTÍVEL PREVISTO BASEADO NA DISTÂNCIA
    const estimatedFuel = totalDistKm / this.FUEL_EFFICIENCY_KM_PER_L;

    this.logger.log(`[calculateRouteStatsFromStops] 📊 Resultado:`);
    this.logger.log(`   Distância total: ${totalDistKm.toFixed(2)} km`);
    this.logger.log(
      `   Duração estimada: ${Math.round(estimatedSeconds / 60)} min`,
    );
    this.logger.log(`   Velocidade média: ${averageSpeedKmH} km/h`);
    this.logger.log(`   Eficiência: ${this.FUEL_EFFICIENCY_KM_PER_L} km/L`);
    this.logger.log(
      `   ⛽ Combustível estimado: ${estimatedFuel.toFixed(2)} L`,
    );

    return {
      totalDurationSeconds: Math.round(estimatedSeconds),
      totalDistanceMeters: Math.round(totalDistKm * 1000),
      estimatedFuel: estimatedFuel,
      formattedFuel: `${estimatedFuel.toFixed(1)} L`,
    };
  }

  /**
   * Busca todas as rotas
   */
  async findAllRoutes(
    companyId: string,
    filters?: {
      startDate?: string;
      endDate?: string;
      createdStartDate?: string;
      createdEndDate?: string;
      status?: RouteStatus;
      orderBy?: string;
      userAssignedId?: string;
      search?: string;
      minStops?: number;
      maxStops?: number;
      minDistance?: number;
      maxDistance?: number;
      minDuration?: number;
      maxDuration?: number;
      isOverdue?: boolean;
      isUpcoming?: boolean;
    },
  ): Promise<any[]> {
    // ... seu código existente ...
    const where: Prisma.RouteWhereInput = { companyId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.startDate || filters?.endDate) {
      where.routeDate = {};
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        where.routeDate.gte = start;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.routeDate.lte = end;
      }
    }

    if (filters?.createdStartDate || filters?.createdEndDate) {
      where.createdAt = {};
      if (filters.createdStartDate) {
        const createdStart = new Date(filters.createdStartDate);
        createdStart.setHours(0, 0, 0, 0);
        where.createdAt.gte = createdStart;
      }
      if (filters.createdEndDate) {
        const createdEnd = new Date(filters.createdEndDate);
        createdEnd.setHours(23, 59, 59, 999);
        where.createdAt.lte = createdEnd;
      }
    }

    if (filters?.userAssignedId) {
      if (filters.userAssignedId === 'none') {
        where.userAssignedId = null;
      } else {
        where.userAssignedId = filters.userAssignedId;
      }
    }

    if (filters?.orderBy && filters.orderBy !== 'all') {
      where.orderBy = filters.orderBy;
    }

    if (filters?.search && filters.search.trim() !== '') {
      where.title = { contains: filters.search.trim(), mode: 'insensitive' };
    }

    if (
      filters?.minDistance !== undefined ||
      filters?.maxDistance !== undefined
    ) {
      where.totalDistanceMeters = {};
      if (filters.minDistance !== undefined) {
        where.totalDistanceMeters.gte = filters.minDistance * 1000;
      }
      if (filters.maxDistance !== undefined) {
        where.totalDistanceMeters.lte = filters.maxDistance * 1000;
      }
    }

    if (
      filters?.minDuration !== undefined ||
      filters?.maxDuration !== undefined
    ) {
      where.totalDurationSeconds = {};
      if (filters.minDuration !== undefined) {
        where.totalDurationSeconds.gte = filters.minDuration * 60;
      }
      if (filters.maxDuration !== undefined) {
        where.totalDurationSeconds.lte = filters.maxDuration * 60;
      }
    }

    if (filters?.isOverdue === true) {
      where.routeDate = { lt: new Date() };
      where.status = { not: RouteStatus.FINISHED };
    }

    if (filters?.isUpcoming === true) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(23, 59, 59, 999);
      where.routeDate = { gte: today, lte: nextWeek };
      where.status = { not: RouteStatus.FINISHED };
    }

    const routes = await this.prisma.route.findMany({
      where,
      include: {
        stops: { orderBy: { order: 'asc' } },
        userAssigned: { select: { id: true, name: true, contact: true } },
        _count: { select: { stops: true } },
        tasks: {
          select: { id: true, title: true, status: true, intervalTime: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let filteredRoutes = routes;

    if (filters?.minStops !== undefined || filters?.maxStops !== undefined) {
      filteredRoutes = routes.filter((route) => {
        const stopsCount = route._count?.stops || 0;
        let matches = true;
        if (filters.minStops !== undefined && stopsCount < filters.minStops)
          matches = false;
        if (filters.maxStops !== undefined && stopsCount > filters.maxStops)
          matches = false;
        return matches;
      });
    }

    return filteredRoutes.map((route) => {
      const stopsCount = route._count?.stops || route.stops?.length || 0;
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
   * Busca rota por ID
   */
  async findRouteById(routeId: string, companyId: string): Promise<any> {
    // ... seu código existente ...
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
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
            zipCode: true,
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

    return {
      ...route,
      formattedDistance,
      formattedDuration,
      totalDistanceMeters,
      totalDurationSeconds,
    };
  }

  /**
   * Atualiza uma rota
   */
  async updateRoute(
    routeId: string,
    dto: UpdateRouteDto,
    companyId: string,
    userId: string,
  ): Promise<any> {
    // ... seu código existente ...
    const existingRoute = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!existingRoute) {
      throw new NotFoundException('Rota não encontrada');
    }

    let routeDate: Date | null | undefined = undefined;

    if (dto.routeDate) {
      if (
        typeof dto.routeDate === 'string' &&
        dto.routeDate.match(/^\d{4}-\d{2}-\d{2}$/)
      ) {
        const [year, month, day] = dto.routeDate.split('-');
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
      } else if (typeof dto.routeDate === 'string') {
        routeDate = new Date(dto.routeDate);
      } else if ((dto.routeDate as any) instanceof Date) {
        routeDate = dto.routeDate;
      }
    }

    let stats: {
      totalDurationSeconds: number;
      totalDistanceMeters: number;
    } | null = null;
    let stopsToSave = dto.stops || [];

    if (stopsToSave.length > 0) {
      if (dto.orderBy === RouteOrderType.DISTANCE) {
        const startPos = {
          lat: stopsToSave[0].latitude,
          lng: stopsToSave[0].longitude,
        };
        stopsToSave = this.optimizeStopsByDistance(startPos, stopsToSave);
      }
      const statsRefPos = {
        lat: stopsToSave[0].latitude,
        lng: stopsToSave[0].longitude,
      };
      stats = this.calculateRouteStatsFromStops(statsRefPos, stopsToSave);
    }

    const updatedRoute = await this.prisma.route.update({
      where: { id: routeId },
      data: {
        title: dto.title,
        description: dto.description,
        routeDate: routeDate !== undefined ? routeDate : undefined,
        status: dto.status,
        userAssignedId: dto.userAssignedId,
        orderBy: dto.orderBy,
        totalDistanceMeters: stats?.totalDistanceMeters,
        totalDurationSeconds: stats?.totalDurationSeconds,
        estimatedFuel: (dto as any).estimatedFuel, // 🔥 NOVO
        optimizedAt: stats ? new Date() : undefined,
        userUpdateId: userId,
        ...(dto.stops && {
          stops: {
            deleteMany: {},
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
              order: index + 1,
              notes: stop.notes || '',
              companyId,
            })),
          },
        }),
      },
      include: {
        stops: { orderBy: { order: 'asc' } },
        userAssigned: { select: { id: true, name: true, contact: true } },
      },
    });

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
    // ... seu código existente ...
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    await this.prisma.route.delete({ where: { id: routeId } });
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
    // ... seu código existente ...
    this.logger.log(
      `[markStopAsVisited] Marcando parada ${stopId} como visitada`,
    );

    const stop = await this.prisma.routeStop.findFirst({
      where: { id: stopId, routeId, companyId },
    });

    if (!stop) {
      throw new NotFoundException('Parada não encontrada');
    }

    let taskStatus: TaskStatus = TaskStatus.COMPLETED;

    if (
      notes &&
      (notes.includes('REAGENDADA') ||
        notes.includes('RESCHEDULED') ||
        notes.includes('🔄'))
    ) {
      taskStatus = TaskStatus.RESCHEDULED;
    } else if (
      notes &&
      (notes.includes('FALHA') ||
        notes.includes('FAILED') ||
        notes.includes('❌'))
    ) {
      taskStatus = TaskStatus.FAILED;
    }

    let task: any = null;

    if (stop.taskId) {
      task = await this.prisma.task.findFirst({
        where: { id: stop.taskId, companyId },
      });
    }

    if (!task && stop.name) {
      task = await this.prisma.task.findFirst({
        where: { companyId, routeId, title: stop.name },
      });
    }

    if (!task && stop.name) {
      task = await this.prisma.task.findFirst({
        where: { companyId, title: stop.name },
      });
    }

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

      if (taskStatus === TaskStatus.COMPLETED) {
        updateData.completionDate = new Date();
      } else if (taskStatus === TaskStatus.FAILED) {
        updateData.completionDate = null;
      }

      await this.prisma.task.update({
        where: { id: task.id },
        data: updateData,
      });
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
        data: { status: RouteStatus.FINISHED, completedAt: new Date() },
      });
    }

    return updatedStop;
  }

  /**
   * Converte rota em tarefas
   */
  async convertRouteToTasks(
    routeId: string,
    companyId: string,
    userId: string,
    dto: ConvertRouteToTasksDto,
  ): Promise<{ message: string; tasks: Task[] }> {
    // ... seu código existente ...
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
      include: { stops: { orderBy: { order: 'asc' } } },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    let columnId = dto.columnId;
    if (!columnId) {
      const defaultColumn = await this.prisma.kanbanColumn.findFirst({
        where: { companyId, title: 'Pendentes' },
      });
      if (!defaultColumn) {
        throw new NotFoundException('Coluna padrão "Pendentes" não encontrada');
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
   * Duplica rota com tarefas
   */
  async duplicateRouteWithTasks(
    routeId: string,
    companyId: string,
    userId: string,
    body: { title?: string; routeDate?: string; description?: string },
  ) {
    // ... seu código existente (mantenha como está) ...
    this.logger.log(`[Service] Duplicando rota ${routeId}`);

    const originalRoute = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
      include: {
        stops: { orderBy: { order: 'asc' } },
        tasks: {
          include: { taskAddress: true, userAssigned: true, column: true },
        },
      },
    });

    if (!originalRoute) {
      throw new NotFoundException('Rota original não encontrada');
    }

    let finalDescription = originalRoute.description || '';
    if (body.description) {
      finalDescription = finalDescription
        ? `${finalDescription}\n\n📝 Observações do reagendamento: ${body.description}`
        : `📝 Observações do reagendamento: ${body.description}`;
    }

    const anyColumn = await this.prisma.kanbanColumn.findFirst({
      where: { companyId },
    });
    if (!anyColumn) {
      throw new NotFoundException('Nenhuma coluna Kanban encontrada');
    }

    const completedColumn = await this.prisma.kanbanColumn.findFirst({
      where: {
        companyId,
        OR: [
          { title: { equals: 'Concluído', mode: 'insensitive' } },
          { title: { equals: 'Finalizado', mode: 'insensitive' } },
          { title: { contains: 'conclu', mode: 'insensitive' } },
        ],
      },
    });

    // Atualizar tasks originais para COMPLETED
    const updatedOriginalTasks: any[] = [];
    for (const originalTask of originalRoute.tasks) {
      const updateData: any = {
        status: 'COMPLETED',
        completionDate: new Date(),
        userCompletedId: userId,
      };
      if (completedColumn) {
        updateData.columnId = completedColumn.id;
      }
      const completionNote = `✅ Tarefa concluída automaticamente ao reagendar rota. Nova rota: ${body.title || originalRoute.title}`;
      updateData.finalComment = originalTask.finalComment
        ? `${originalTask.finalComment}\n\n${completionNote}`
        : completionNote;

      const updatedTask = await this.prisma.task.update({
        where: { id: originalTask.id },
        data: updateData,
      });
      updatedOriginalTasks.push(updatedTask);
    }

    // Criar nova rota
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
        estimatedFuel: originalRoute.estimatedFuel, // 🔥 COPIAR COMBUSTÍVEL PREVISTO
        orderBy: originalRoute.orderBy,
        companyId,
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
            companyId,
          })),
        },
      },
      include: { stops: { orderBy: { order: 'asc' } } },
    });

    // Criar novas tasks
    const createdTasks: any[] = [];
    for (let i = 0; i < newRoute.stops.length; i++) {
      const newStop = newRoute.stops[i];
      const originalTask = originalRoute.tasks.find(
        (t) => t.title === newStop.name,
      );

      let columnId = originalTask?.columnId;
      if (!columnId || columnId === completedColumn?.id) {
        columnId = anyColumn.id;
      }

      const newTask = await this.prisma.task.create({
        data: {
          title: newStop.name || `Parada ${i + 1}`,
          description: `Rota: ${newRoute.title}\nEndereço: ${newStop.address}`,
          status: 'PENDING',
          scheduledDate: newRoute.routeDate || new Date(),
          companyId,
          userCreateId: userId,
          userAssignedId:
            originalTask?.userAssignedId || originalRoute.userAssignedId,
          columnId,
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
              companyId,
            },
          },
        },
      });
      createdTasks.push(newTask);
    }

    const updatedRoute = await this.prisma.route.update({
      where: { id: newRoute.id },
      data: {
        description: `${finalDescription}\n\n📋 ${createdTasks.length} tarefa(s) criada(s) automaticamente.`,
      },
      include: {
        stops: { orderBy: { order: 'asc' } },
        tasks: true,
        userAssigned: { select: { id: true, name: true, contact: true } },
      },
    });

    return {
      message: `Rota reagendada com sucesso. ${createdTasks.length} nova(s) tarefa(s) criada(s).`,
      originalRouteId: routeId,
      newRoute: updatedRoute,
      tasksCreated: createdTasks.length,
      tasksCompleted: updatedOriginalTasks.length,
    };
  }

  /**
   * Busca tarefas por rota
   */
  async getTasksByRoute(routeId: string, companyId: string) {
    // ... seu código existente ...
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, companyId },
    });

    if (!route) {
      throw new NotFoundException('Rota não encontrada');
    }

    const tasks = await this.prisma.task.findMany({
      where: { routeId, companyId },
      select: {
        id: true,
        title: true,
        intervalTime: true,
        status: true,
        scheduledDate: true,
        createdAt: true,
        taskAddress: { select: { endereco: true, cidade: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return tasks;
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }

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

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

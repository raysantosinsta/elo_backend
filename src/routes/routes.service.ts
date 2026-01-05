/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common'; // Adicionei Logger
import { TaskStatus, type Prisma, type Task } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { PrismaService } from '../prisma/prisma.service';
import {
  FinalizeTaskDto,
  OptimizeRouteDto,
  RouteOrderType,
} from './dto/optimize-route.dto';

@Injectable()
export class RouteService {
  private readonly logger = new Logger(RouteService.name);

  constructor(
    private prisma: PrismaService,
    // Se usar cache em algum lugar, injete aqui, senão pode remover
    @Inject(CACHE_MANAGER) private cacheManager: Cache, 
  ) {}

  // 1. Buscar tarefas disponíveis (apenas as que têm Lat/Lng válidas)
  async getTasksWithLocation(
      companyId: string, 
      filters: { startDate?: string; endDate?: string; assignedToId?: string }
  ) {
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

    return this.prisma.task.findMany({
      where,
      include: {
        taskAddress: true,
        userAssigned: { select: { name: true } },
        column: { select: { id: true } },
      },
    });
  }

  // 2. Otimizar Rota (Corrigido conversão de tipos)
  async optimizeRoute(dto: OptimizeRouteDto) {
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
        userAssigned: { select: { id: true, name: true } } // Incluindo para exibir no front
      },
    });

    if (tasks.length === 0) {
      throw new NotFoundException('Nenhuma tarefa válida encontrada.');
    }

    let optimizedOrder: typeof tasks = [];

    // --- CENÁRIO A: ORDENAÇÃO POR PRIORIDADE ---
    if (dto.orderBy === RouteOrderType.PRIORITY) {
      optimizedOrder = tasks.sort((a, b) => {
        const priorityA = a.priority ?? 999;
        const priorityB = b.priority ?? 999;
        return priorityA - priorityB;
      });
    }
    // --- CENÁRIO B: ORDENAÇÃO POR PROXIMIDADE (Vizinho Mais Próximo) ---
    else {
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

          // CORREÇÃO CRÍTICA: Converter explicitamente para Number
          const tLat = Number(t.taskAddress?.latitude);
          const tLng = Number(t.taskAddress?.longitude);

          // Validação robusta (isNaN verifica se a conversão falhou)
          if (!t.taskAddress || isNaN(tLat) || isNaN(tLng)) {
            continue;
          }

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

        if (nearestTaskIndex === -1) {
          // Se sobrou algo mas as coordenadas são inválidas, adiciona ao final
          optimizedOrder.push(...remainingTasks);
          break;
        }

        const nearestTask = remainingTasks[nearestTaskIndex];
        optimizedOrder.push(nearestTask);

        // Atualiza a "localização atual"
        const nextLat = Number(nearestTask.taskAddress?.latitude);
        const nextLng = Number(nearestTask.taskAddress?.longitude);

        if (!isNaN(nextLat) && !isNaN(nextLng)) {
          currentLocation = { lat: nextLat, lng: nextLng };
        }

        remainingTasks.splice(nearestTaskIndex, 1);
      }
    }

    // --- CÁLCULO DE TEMPO TOTAL ---
    const stats = await this.calculateRouteStats(
      { lat: Number(dto.driverLatitude), lng: Number(dto.driverLongitude) },
      optimizedOrder,
    );

    return {
      route: optimizedOrder,
      stats: stats,
    };
  }

  private async calculateRouteStats(
    startPos: { lat: number; lng: number },
    tasks: Task[],
  ) {
    try {
      // Filtra e converte para garantir números
      const validTasks = tasks.filter((t: any) => {
         const lat = Number(t.taskAddress?.latitude);
         const lng = Number(t.taskAddress?.longitude);
         return !isNaN(lat) && !isNaN(lng);
      });

      // Monta string para OSRM: lng,lat;lng,lat...
      const coordinates = [
        `${startPos.lng},${startPos.lat}`,
        ...validTasks.map(
          (t: any) => `${Number(t.taskAddress.longitude)},${Number(t.taskAddress.latitude)}`,
        ),
      ].join(';');

      // Chama OSRM (Demo server) - Nota: OSRM público pode falhar, por isso o fallback é importante
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;
      
      // Fetch nativo do Node 18+
      const response = await fetch(url);
      
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
    } catch (error) {
      this.logger.warn('Erro ao consultar OSRM, usando cálculo linear fallback.', error);
    }

    // Fallback: Cálculo Linear (Haversine)
    let totalDistKm = 0;
    let current = startPos;

    for (const task of tasks) {
      const tAddr = (task as any).taskAddress;
      const lat = Number(tAddr?.latitude);
      const lng = Number(tAddr?.longitude);

      if (!isNaN(lat) && !isNaN(lng)) {
        totalDistKm += this.calculateDistance(
          current.lat,
          current.lng,
          lat,
          lng,
        );
        current = { lat, lng };
      }
    }

    // Estimativa: 30km/h (8.33 m/s)
    const averageSpeedKmH = 30; 
    const estimatedSeconds = (totalDistKm / averageSpeedKmH) * 3600;

    return {
      totalDurationSeconds: estimatedSeconds,
      totalDistanceMeters: totalDistKm * 1000,
      formattedDuration: `~${this.formatDuration(estimatedSeconds)}`,
      formattedDistance: `~${totalDistKm.toFixed(1)} km`,
    };
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }

  async concludeVisit(taskId: string, userId: string, dto: FinalizeTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

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

  private getTaskIncludeDetails() {
    return {
      taskAddress: true,
      userAssigned: { select: { name: true } },
      userCompleted: { select: { name: true } },
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
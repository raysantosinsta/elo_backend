/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus, type Prisma, type Task } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  FinalizeTaskDto,
  OptimizeRouteDto,
  RouteOrderType,
} from './dto/optimize-route.dto';

@Injectable()
export class RouteService {
  constructor(private prisma: PrismaService) {}

  // 1. Buscar tarefas disponíveis (apenas as que têm Lat/Lng válidas)
  async getTasksWithLocation(
      companyId: string, 
      filters: { startDate?: string; endDate?: string; assignedToId?: string }
  ) {
    // Construção dinâmica do WHERE
    const where: Prisma.TaskWhereInput = {
      companyId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      taskAddress: {
        latitude: { not: null },
        longitude: { not: null },
      },
    };

    // Filtro de Data (Intervalo) no scheduledDate
    if (filters.startDate || filters.endDate) {
        where.scheduledDate = {
            ...(filters.startDate && { gte: new Date(filters.startDate) }),
            ...(filters.endDate && { lte: new Date(filters.endDate) }),
        };
    }

    // Filtro de Responsável (ignora se for 'all' ou undefined)
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

  // 2. Otimizar Rota (Completa e Ajustada)
  async optimizeRoute(dto: OptimizeRouteDto) {
    // Busca as tarefas garantindo que latitude e longitude existem no banco
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
      },
    });

    if (tasks.length === 0) {
      throw new NotFoundException('Nenhuma tarefa válida encontrada.');
    }

    let optimizedOrder: typeof tasks = [];

    // --- CENÁRIO A: ORDENAÇÃO POR PRIORIDADE ---
    if (dto.orderBy === RouteOrderType.PRIORITY) {
      // Ordena: 1 (Alta) -> 2 (Média) -> 3 (Baixa) -> Null (Sem prioridade)
      optimizedOrder = tasks.sort((a, b) => {
        const priorityA = a.priority ?? 999;
        const priorityB = b.priority ?? 999;
        return priorityA - priorityB;
      });
    }
    // --- CENÁRIO B: ORDENAÇÃO POR PROXIMIDADE (Vizinho Mais Próximo) ---
    else {
      let currentLocation = {
        lat: dto.driverLatitude,
        lng: dto.driverLongitude,
      };
      const remainingTasks = [...tasks];

      while (remainingTasks.length > 0) {
        let nearestTaskIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < remainingTasks.length; i++) {
          const t = remainingTasks[i];

          // --- CORREÇÃO DO TYPESCRIPT AQUI ---
          const tLat = t.taskAddress?.latitude;
          const tLng = t.taskAddress?.longitude;

          // Validação explícita: se não for número, pula
          if (
            !t.taskAddress ||
            typeof tLat !== 'number' ||
            typeof tLng !== 'number'
          ) {
            continue;
          }

          const dist = this.calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            tLat, // Agora o TS sabe que é number
            tLng, // Agora o TS sabe que é number
          );

          if (dist < minDistance) {
            minDistance = dist;
            nearestTaskIndex = i;
          }
        }

        // Se não encontrou nenhuma válida restante (segurança)
        if (nearestTaskIndex === -1) {
          // Adiciona o que sobrou (se houver) e encerra para evitar loop infinito
          optimizedOrder.push(...remainingTasks);
          break;
        }

        const nearestTask = remainingTasks[nearestTaskIndex];
        optimizedOrder.push(nearestTask);

        // Atualiza a "localização atual" para a próxima iteração
        // Novamente, validamos antes de atribuir
        const nextLat = nearestTask.taskAddress?.latitude;
        const nextLng = nearestTask.taskAddress?.longitude;

        if (typeof nextLat === 'number' && typeof nextLng === 'number') {
          currentLocation = {
            lat: nextLat,
            lng: nextLng,
          };
        }

        remainingTasks.splice(nearestTaskIndex, 1);
      }
    }

    // --- CÁLCULO DE TEMPO TOTAL (NOVO) ---
    const stats = await this.calculateRouteStats(
      { lat: dto.driverLatitude, lng: dto.driverLongitude },
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
      // Filtra tarefas sem lat/lng para não quebrar a URL
      const validTasks = tasks.filter(
        (t: any) =>
          t.taskAddress?.latitude != null && t.taskAddress?.longitude != null,
      );

      // Monta string: lng,lat;lng,lat...
      const coordinates = [
        `${startPos.lng},${startPos.lat}`,
        ...validTasks.map(
          (t: any) => `${t.taskAddress.longitude},${t.taskAddress.latitude}`,
        ),
      ].join(';');

      // Chama OSRM (Demo server)
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`;
      const response = await fetch(url);
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
    } catch (error) {
      console.error('Erro OSRM:', error);
    }

    // Fallback: Cálculo Linear se a API falhar
    let totalDistKm = 0;
    let current = startPos;

    for (const task of tasks) {
      const tAddr = (task as any).taskAddress;
      if (tAddr?.latitude && tAddr?.longitude) {
        totalDistKm += this.calculateDistance(
          current.lat,
          current.lng,
          tAddr.latitude,
          tAddr.longitude,
        );
        current = { lat: tAddr.latitude, lng: tAddr.longitude };
      }
    }

    const estimatedSeconds = (totalDistKm * 1000) / 8.33; // ~30km/h

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

    // Se o motorista definiu uma data, a tarefa deve voltar para PENDING para aparecer na lista futura
    // Caso contrário, assume o status que o motorista escolheu (COMPLETED ou FAILED)
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
        // Se houver data, atualiza. Se não, mantém a atual ou limpa.
        scheduledDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        dueDate: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        completionDate: dto.scheduledAt ? null : new Date(), // Só marca conclusão real se não houver reagendamento
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

  // Adicione este método para incluir detalhes da tarefa
  private getTaskIncludeDetails() {
    return {
      taskAddress: true,
      userAssigned: { select: { name: true } },
      userCompleted: { select: { name: true } },
    };
  }

  // Helper Matemático
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

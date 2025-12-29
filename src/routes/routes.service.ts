/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Task, TaskAddress, TaskStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { FinalizeTaskDto, OptimizeRouteDto, RouteOrderType } from './dto/optimize-route.dto';

@Injectable()
export class RouteService {
  constructor(private prisma: PrismaService) {}

  // 1. Buscar tarefas disponíveis (apenas as que têm Lat/Lng válidas)
  async getTasksWithLocation(companyId: string) {
    return this.prisma.task.findMany({
      where: {
        companyId,
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
        taskAddress: {
          latitude: { not: null }, // Garante que não é null
          longitude: { not: null }, // Garante que não é null
        },
      },
      include: {
        taskAddress: true,
        userAssigned: { select: { name: true } },
        column: { select: { id: true } } // <--- Garante que a relação existe
      },
    });
  }

  // 2. Otimizar Rota
  async optimizeRoute(dto: OptimizeRouteDto) {
    // Busca as tarefas garantindo que latitude e longitude existem
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
        column: { select: { id: true } } // Importante para o Frontend
      },
    });

    if (tasks.length === 0)
      throw new NotFoundException('Nenhuma tarefa válida encontrada.');

    // --- CENÁRIO A: ORDENAÇÃO POR PRIORIDADE ---
    if (dto.orderBy === RouteOrderType.PRIORITY) {
        // Ordena: 1 (Alta) -> 2 (Média) -> 3 (Baixa) -> Null (Sem prioridade)
        return tasks.sort((a, b) => {
            const priorityA = a.priority ?? 999; // Se for null, joga pro fim
            const priorityB = b.priority ?? 999;
            return priorityA - priorityB;
        });
    }

    // --- CENÁRIO B: ORDENAÇÃO POR PROXIMIDADE (Algoritmo Vizinho Mais Próximo) ---
    // (Este é o padrão se orderBy for DISTANCE ou undefined)
    
    const optimizedOrder: typeof tasks = [];
    let currentLocation = { lat: dto.driverLatitude, lng: dto.driverLongitude };
    
    // Clonamos o array para ir removendo as tarefas visitadas
    const remainingTasks = [...tasks];

    while (remainingTasks.length > 0) {
      let nearestTaskIndex = -1;
      let minDistance = Infinity;

      for (let i = 0; i < remainingTasks.length; i++) {
        const t = remainingTasks[i];

        // Verificação de segurança (embora o 'where' do banco já garanta)
        if (
          !t.taskAddress ||
          t.taskAddress.latitude === null ||
          t.taskAddress.longitude === null
        ) {
          continue;
        }

        const dist = this.calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          t.taskAddress.latitude,
          t.taskAddress.longitude,
        );

        if (dist < minDistance) {
          minDistance = dist;
          nearestTaskIndex = i;
        }
      }

      // Se por algum motivo não achou (ex: array sobrou só com inválidos)
      if (nearestTaskIndex === -1) {
        break;
      }

      const nearestTask = remainingTasks[nearestTaskIndex];

      // Adiciona na lista ordenada
      optimizedOrder.push(nearestTask);

      // Atualiza a "localização atual" para ser a desta tarefa
      // (O motorista vai daqui para a próxima mais próxima)
      if (nearestTask.taskAddress?.latitude && nearestTask.taskAddress?.longitude) {
          currentLocation = {
            lat: nearestTask.taskAddress.latitude,
            lng: nearestTask.taskAddress.longitude,
          };
      }

      // Remove da lista de pendentes
      remainingTasks.splice(nearestTaskIndex, 1);
    }

    return optimizedOrder;
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

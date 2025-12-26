/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Task, TaskAddress, TaskStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { FinalizeTaskDto, OptimizeRouteDto } from './dto/optimize-route.dto';

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
      include: { taskAddress: true },
    });

    if (tasks.length === 0)
      throw new NotFoundException('Nenhuma tarefa válida encontrada.');

    // CORREÇÃO AQUI: Tipamos o array explicitamente usando o tipo de 'tasks'
    const optimizedOrder: typeof tasks = [];

    let currentLocation = { lat: dto.driverLatitude, lng: dto.driverLongitude };

    // Clonamos o array
    const remainingTasks = [...tasks];

    while (remainingTasks.length > 0) {
      let nearestTaskIndex = -1; // Índice da tarefa mais próxima
      let minDistance = Infinity; // Distância mínima até a próxima tarefa

      for (let i = 0; i < remainingTasks.length; i++) {
        const t = remainingTasks[i]; // Tarefa atual

        // VERIFICAÇÃO DE SEGURANÇA
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

      // Se não encontrou nenhuma
      if (nearestTaskIndex === -1) {
        break;
      }

      const nearestTask = remainingTasks[nearestTaskIndex];

      // Segunda verificação para o TypeScript permitir a atribuição abaixo
      if (
        nearestTask.taskAddress &&
        nearestTask.taskAddress.latitude !== null &&
        nearestTask.taskAddress.longitude !== null
      ) {
        optimizedOrder.push(nearestTask);

        // Atualiza a localização atual
        currentLocation = {
          lat: nearestTask.taskAddress.latitude,
          lng: nearestTask.taskAddress.longitude,
        };
      }

      // Remove da lista
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OptimizeRouteDto, FinalizeTaskDto } from './dto/optimize-route.dto';
import { TaskStatus, type Prisma } from '@prisma/client';

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

    if (tasks.length === 0) throw new NotFoundException('Nenhuma tarefa válida encontrada.');

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
        if (!t.taskAddress || t.taskAddress.latitude === null || t.taskAddress.longitude === null) {
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
      if (nearestTask.taskAddress && nearestTask.taskAddress.latitude !== null && nearestTask.taskAddress.longitude !== null) {
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

  // 3. Finalizar Visita
  async concludeVisit(taskId: string, userId: string, dto: FinalizeTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { taskAddress: true },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    const newStatus = dto.status === 'COMPLETED' ? TaskStatus.COMPLETED : TaskStatus.FAILED;

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: newStatus,
        finalComment: dto.finalComment,
        completionDate: new Date(),
        userCompletedId: userId,
      },
    });
    
    return this.rescheduleTask(task, dto.status);
  }

  // Helper de Reagendamento
 // Helper de Reagendamento
  private async rescheduleTask(originalTask: any, outcome: 'COMPLETED' | 'FAILED') {
    const daysToAdd = outcome === 'FAILED' ? 1 : 30; 
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);

    const newTitle = outcome === 'FAILED' 
      ? `Reagendamento: ${originalTask.title}` 
      : `Visita Periódica: ${originalTask.title}`;

    // CORREÇÃO: Tipagem explícita para permitir undefined OU o objeto de criação
    let addressCreateData: Prisma.TaskAddressCreateNestedOneWithoutTaskInput | undefined;

    if (originalTask.taskAddress) {
        addressCreateData = {
          create: {
            cep: originalTask.taskAddress.cep,
            endereco: originalTask.taskAddress.endereco,
            numero: originalTask.taskAddress.numero,
            bairro: originalTask.taskAddress.bairro,
            cidade: originalTask.taskAddress.cidade,
            estado: originalTask.taskAddress.estado,
            latitude: originalTask.taskAddress.latitude,
            longitude: originalTask.taskAddress.longitude,
            companyId: originalTask.companyId,
          }
        };
    }

    const newTask = await this.prisma.task.create({
      data: {
        title: newTitle,
        description: `Gerado automaticamente.`,
        status: TaskStatus.PENDING,
        companyId: originalTask.companyId,
        userCreateId: originalTask.userCreateId,
        columnId: originalTask.columnId,
        scheduledDate: nextDate,
        dueDate: nextDate,
        taskAddress: addressCreateData, // Agora o TypeScript aceita isso
      },
    });

    return { message: 'Visita finalizada e nova tarefa reagendada.', newTask };
  }

  // Helper Matemático
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; 
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
}
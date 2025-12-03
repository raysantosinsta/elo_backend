/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class ReportsTasksService {
  constructor(private prisma: PrismaService) {}

  async getTasksReport(companyId: string, filters: any) {
    const where: Prisma.TaskWhereInput = { companyId };

    // --- Filtros ---
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.priority && filters.priority !== 'all') {
      where.priority = Number(filters.priority);
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    // --- Buscar Tarefas ---
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { name: true, email: true } },
        column: { select: { title: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // --- Calcular Métricas ---
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const pending = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
    
    const today = new Date();
    const overdue = tasks.filter(t => 
      t.dueDate && 
      new Date(t.dueDate) < today && 
      t.status !== 'COMPLETED' && 
      t.status !== 'FAILED'
    ).length;

    const completionRate = total > 0 ? ((completed / total) * 100) : 0;

    // Dados para Gráfico de Pizza (Status)
    const byStatus = [
      { name: 'Concluída', value: completed, color: '#10b981' },
      { name: 'Em Andamento', value: tasks.filter(t => t.status === 'IN_PROGRESS').length, color: '#3b82f6' },
      { name: 'Pendente', value: tasks.filter(t => t.status === 'PENDING').length, color: '#94a3b8' },
      { name: 'Falhou', value: tasks.filter(t => t.status === 'FAILED').length, color: '#ef4444' },
    ].filter(i => i.value > 0);

    // Dados para Gráfico de Barras (Prioridade)
    const byPriority = [1, 2, 3, 4, 5].map(p => ({
      name: `Nível ${p}`,
      value: tasks.filter(t => t.priority === p).length
    }));

    return {
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        assignedTo: t.assignedTo,
        column: t.column
      })),
      summary: {
        totalTasks: total,
        completedTasks: completed,
        pendingTasks: pending,
        overdueTasks: overdue,
        completionRate,
        avgCompletionTime: 'N/A', 
        byStatus,
        byPriority
      }
    };
  }
}

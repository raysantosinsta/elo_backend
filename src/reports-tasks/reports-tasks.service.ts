/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export interface TaskReportFilters {
    status?: TaskStatus | 'all';
    priority?: string | 'all';
    startDate?: string;
    endDate?: string;
}

@Injectable()
export class ReportsTasksService {
    constructor(private prisma: PrismaService) {}

    async getTasksReport(companyId: string, filters: TaskReportFilters) {
        // Filtro base: SEMPRE filtra pelo companyId passado pelo controller (que veio do token)
        const where: Prisma.TaskWhereInput = { companyId };

        // --- 1. Construção dos Filtros ---
        if (filters.status && filters.status !== 'all') {
            where.status = filters.status;
        }

        if (filters.priority && filters.priority !== 'all') {
            const priorityNumber = Number(filters.priority);
            if (isNaN(priorityNumber)) {
                throw new BadRequestException('A prioridade deve ser um número válido.');
            }
            where.priority = priorityNumber;
        }

        if (filters.startDate || filters.endDate) {
            const dateCondition: Prisma.DateTimeFilter = {};
            if (filters.startDate) dateCondition.gte = new Date(filters.startDate);
            if (filters.endDate) dateCondition.lte = new Date(filters.endDate);

            where.createdAt = dateCondition;
        }

        // --- 2. Buscar Tarefas ---
        const tasks = await this.prisma.task.findMany({
            where,
            include: {
                userAssigned: { select: { name: true, email: true } },
                column: { select: { title: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // --- 3. Calcular Métricas ---
        const total = tasks.length;
        
        const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);
        const completed = completedTasks.length;

        const pending = tasks.filter(t => t.status === TaskStatus.PENDING || t.status === TaskStatus.IN_PROGRESS).length;
        
        const today = new Date();
        const overdue = tasks.filter(t => 
            t.dueDate && 
            new Date(t.dueDate) < today && 
            t.status !== TaskStatus.COMPLETED && 
            t.status !== TaskStatus.FAILED
        ).length;

        const completionRate = total > 0 ? ((completed / total) * 100) : 0;

        let totalCompletionTimeMs = 0;
        let tasksWithCompletionTime = 0;

        for (const task of completedTasks) {
            if (task.completionDate && task.createdAt) {
                const createdTime = task.createdAt.getTime();
                const completedTime = task.completionDate.getTime();
                
                const timeDiffMs = completedTime - createdTime;

                if (timeDiffMs >= 0) {
                    totalCompletionTimeMs += timeDiffMs;
                    tasksWithCompletionTime++;
                }
            }
        }

        const avgCompletionTimeMs = tasksWithCompletionTime > 0 
            ? totalCompletionTimeMs / tasksWithCompletionTime 
            : 0;

        const avgCompletionTime = avgCompletionTimeMs > 0 
            ? `${(avgCompletionTimeMs / (1000 * 60 * 60 * 24)).toFixed(1)} dias`
            : 'N/A';
        
        
        // --- 4. Dados para Gráficos ---
        const statusCounts = tasks.reduce((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {} as Record<TaskStatus, number>);

        const byStatus = [
            { name: 'Concluída', value: statusCounts[TaskStatus.COMPLETED] || 0, color: '#10b981' },
            { name: 'Em Andamento', value: statusCounts[TaskStatus.IN_PROGRESS] || 0, color: '#3b82f6' },
            { name: 'Pendente', value: statusCounts[TaskStatus.PENDING] || 0, color: '#94a3b8' },
            { name: 'Falhou', value: statusCounts[TaskStatus.FAILED] || 0, color: '#ef4444' },
        ].filter(i => i.value > 0);

        const byPriority = [1, 2, 3, 4, 5].map(p => ({
            name: `Nível ${p}`,
            value: tasks.filter(t => t.priority === p).length
        }));

        // --- 5. Retorno ---
        return {
            tasks: tasks.map(t => ({
                id: t.id,
                title: t.title,
                status: t.status,
                priority: t.priority,
                dueDate: t.dueDate,
                createdAt: t.createdAt,
                completionDate: t.completionDate, 
                assignedTo: t.userAssigned, 
                column: t.column
            })),
            summary: {
                totalTasks: total,
                completedTasks: completed,
                pendingTasks: pending,
                overdueTasks: overdue,
                completionRate: parseFloat(completionRate.toFixed(2)),
                avgCompletionTime, 
                byStatus,
                byPriority
            }
        };
    }
}
/* eslint-disable prettier/prettier */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

// --- Tipagem do Input de Filtros ---
export interface TaskReportFilters {
    status?: TaskStatus | 'all';
    priority?: string | 'all'; // Recebe string, mas converte para number
    startDate?: string;
    endDate?: string;
}

@Injectable()
export class ReportsTasksService {
    constructor(private prisma: PrismaService) {}

    /**
     * Gera um relatório detalhado de tarefas para uma empresa, com métricas e dados para gráficos.
     */
    async getTasksReport(companyId: string, filters: TaskReportFilters) {
        // CORREÇÃO 1: Usar userAssignedId e companyId do schema
        const where: Prisma.TaskWhereInput = { companyId };

        // --- 1. Construção dos Filtros ---
        if (filters.status && filters.status !== 'all') {
            where.status = filters.status;
        }

        if (filters.priority && filters.priority !== 'all') {
            // Garante que a prioridade seja convertida corretamente para number
            const priorityNumber = Number(filters.priority);
            if (isNaN(priorityNumber)) {
                throw new BadRequestException('A prioridade deve ser um número válido.');
            }
            where.priority = priorityNumber;
        }

        if (filters.startDate || filters.endDate) {
            // Filtro de data de criação
            const dateCondition: Prisma.DateTimeFilter = {};
            if (filters.startDate) dateCondition.gte = new Date(filters.startDate);
            if (filters.endDate) dateCondition.lte = new Date(filters.endDate);

            where.createdAt = dateCondition;
        }

        // --- 2. Buscar Tarefas ---
        const tasks = await this.prisma.task.findMany({
            where,
            include: {
                // CORREÇÃO 2: Usar o nome correto da relação (userAssigned)
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

        // --- Cálculo de Tempo Médio de Conclusão ---
        let totalCompletionTimeMs = 0;
        let tasksWithCompletionTime = 0;

        for (const task of completedTasks) {
            // O schema usa completionDate e createdAt
            if (task.completionDate && task.createdAt) {
                const createdTime = task.createdAt.getTime();
                const completedTime = task.completionDate.getTime();
                
                const timeDiffMs = completedTime - createdTime;

                if (timeDiffMs >= 0) { // Garante que a data de conclusão não é anterior à criação
                    totalCompletionTimeMs += timeDiffMs;
                    tasksWithCompletionTime++;
                }
            }
        }

        const avgCompletionTimeMs = tasksWithCompletionTime > 0 
            ? totalCompletionTimeMs / tasksWithCompletionTime 
            : 0;

        // Conversão para dias ou string formatada
        const avgCompletionTime = avgCompletionTimeMs > 0 
            ? `${(avgCompletionTimeMs / (1000 * 60 * 60 * 24)).toFixed(1)} dias`
            : 'N/A';
        
        
        // --- 4. Dados para Gráficos ---

        const statusCounts = tasks.reduce((acc, t) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {} as Record<TaskStatus, number>);

        // Dados para Gráfico de Pizza (Status)
        const byStatus = [
            { name: 'Concluída', value: statusCounts[TaskStatus.COMPLETED] || 0, color: '#10b981' },
            { name: 'Em Andamento', value: statusCounts[TaskStatus.IN_PROGRESS] || 0, color: '#3b82f6' },
            { name: 'Pendente', value: statusCounts[TaskStatus.PENDING] || 0, color: '#94a3b8' },
            { name: 'Falhou', value: statusCounts[TaskStatus.FAILED] || 0, color: '#ef4444' },
        ].filter(i => i.value > 0);

        // Dados para Gráfico de Barras (Prioridade)
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
                // CORREÇÃO: Usar completionDate
                completionDate: t.completionDate, 
                // CORREÇÃO: Usar userAssigned
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
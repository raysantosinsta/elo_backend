import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { BudgetStatus, TaskStatus, UserRole, UserStatus, Prisma } from '@prisma/client';
import { format } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

// --- Tipos de Filtro para o Controller/Serviço ---
interface ReportParams {
    companyId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    requesterRole: string;
}

interface ProfessionalDetailsParams {
    userId: string;
    companyId?: string;
    startDate?: Date;
    endDate?: Date;
}

@Injectable()
export class ReportsService {
    private readonly logger = new Logger(ReportsService.name);

    constructor(private prisma: PrismaService) {}

    /**
     * Gera um relatório resumido com métricas de desempenho para uma lista de profissionais.
     */
    async getProfessionalReport(params: ReportParams) {
        const { companyId, startDate, endDate, status, requesterRole } = params;

        // 1. Validação e Segurança (Permissões de Empresa)
        let validCompanyId: string | undefined = companyId;
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

        if (companyId && !uuidRegex.test(companyId)) {
            if (requesterRole !== UserRole.MASTER) {
                throw new BadRequestException('ID da empresa inválido.');
            }
            validCompanyId = undefined;
        }
        
        // Garante que não-MASTER só vejam sua empresa
        if (requesterRole !== UserRole.MASTER && !validCompanyId) {
            throw new ForbiddenException('Você só pode ver profissionais da sua empresa.');
        }

        // 2. Filtros de Banco de Dados
        const statusFilter = status && Object.values(UserStatus).includes(status as UserStatus)
            ? (status as UserStatus)
            : undefined;

        const where: Prisma.UserWhereInput = {
            // isProfessional não é um campo do modelo User, mas Role pode implicar isso
            // Exemplo: Filtra por 'EMPLOYER' (Assumindo que EMPLOYER são os profissionais)
            role: { in: [UserRole.ADMIN, UserRole.EMPLOYER] }, 
            
            ...(validCompanyId && { companyId: validCompanyId }),
            ...(statusFilter && { status: statusFilter }),
        };

        // 3. Busca inicial leve (limitada a 10 para evitar sobrecarga)
        const professionals = await this.prisma.user.findMany({
            where,
            take: 10,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                professionalRole: true,
                contact: true, // CORREÇÃO: Usar 'contact' em vez de 'phone'
                company: {
                    select: { id: true, name: true }
                }
            },
            orderBy: { name: 'asc' },
        });

        this.logger.log(`Gerando relatório para ${professionals.length} profissionais...`);

        // 4. Processamento de Métricas (Mapeamento Assíncrono)
        const professionalsWithMetrics = await Promise.all(
            professionals.map(async (professional) => {
                const dateCondition = startDate && endDate ? {
                    gte: startDate,
                    lte: endDate
                } as Prisma.DateTimeFilter : undefined;

                // Executa as queries DESTE profissional em paralelo
                const [
                    taskStats,
                    budgetStats,
                    recentCompletedTasks,
                    totalTasks,
                    completedTasks,
                    pendingTasks,
                    inProgressTasks,
                    totalBudgets,
                    approvedBudgets
                ] = await Promise.all([
                    // Tarefas por status
                    this.prisma.task.groupBy({
                        by: ['status'],
                        where: {
                            userAssignedId: professional.id, // CORREÇÃO: Usar userAssignedId
                            ...(dateCondition ? { createdAt: dateCondition } : {})
                        },
                        _count: true,
                    }),
                    // Orçamentos por status
                    this.prisma.budget.groupBy({
                        by: ['status'],
                        where: {
                            OR: [{ userCreateId: professional.id }, { userAssignedId: professional.id }],
                            ...(dateCondition ? { createdAt: dateCondition } : {})
                        },
                        _count: true,
                    }),
                    // 5 Últimas tarefas concluídas
                    this.prisma.task.findMany({
                        where: { userAssignedId: professional.id, status: TaskStatus.COMPLETED },
                        take: 5,
                        orderBy: { completionDate: 'desc' }, // CORREÇÃO: Usar completionDate
                        select: { id: true, title: true, completionDate: true, column: { select: { title: true } } }
                    }),
                    // Contagens Rápidas
                    this.prisma.task.count({ where: { userAssignedId: professional.id } }),
                    this.prisma.task.count({ where: { userAssignedId: professional.id, status: TaskStatus.COMPLETED } }),
                    this.prisma.task.count({ where: { userAssignedId: professional.id, status: TaskStatus.PENDING } }),
                    this.prisma.task.count({ where: { userAssignedId: professional.id, status: TaskStatus.IN_PROGRESS } }),
                    this.prisma.budget.count({ where: { OR: [{ userCreateId: professional.id }, { userAssignedId: professional.id }] } }),
                    this.prisma.budget.count({ where: { OR: [{ userCreateId: professional.id }, { userAssignedId: professional.id }], status: BudgetStatus.APPROVED } })
                ]);

                const completionRate = totalTasks > 0
                    ? Math.round((completedTasks / totalTasks) * 100)
                    : 0;

                return {
                    ...professional,
                    taskStats,
                    budgetStats,
                    recentCompletedTasks,
                    metrics: {
                        totalTasks,
                        completedTasks,
                        completionRate,
                        pendingTasks,
                        inProgressTasks,
                        totalBudgets,
                        approvedBudgets
                    }
                };
            })
        );

        return {
            professionals: professionalsWithMetrics,
            summary: {
                totalProfessionals: professionals.length,
                activeProfessionals: professionals.filter(p => p.status === UserStatus.ACTIVE).length,
                inactiveProfessionals: professionals.filter(p => p.status === UserStatus.INACTIVE).length,
                companies: Array.from(new Set(professionals.map(p => p.company?.name).filter(Boolean))),
            },
            filters: { companyId, startDate, endDate, status },
        };
    }

    /**
     * Retorna detalhes aprofundados e métricas de um profissional específico.
     */
    async getProfessionalDetails(params: ProfessionalDetailsParams) {
        const { userId, companyId, startDate, endDate } = params;

        const professional = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
                professionalRole: true,
                contact: true,
                companyId: true,
                createdAt: true,
                company: {
                    select: { id: true, name: true, email: true, telefone: true },
                },
            },
        });

        if (!professional) throw new NotFoundException('Profissional não encontrado.');

        // Validação de segurança: Profissional pertence à empresa solicitada?
        if (companyId && professional.companyId !== companyId) {
            throw new ForbiddenException('Acesso negado. O profissional não pertence à sua empresa.');
        }

        const dateCondition = startDate && endDate ? {
            gte: startDate,
            lte: endDate
        } as Prisma.DateTimeFilter : undefined;

        const [
            tasksByStatus,
            tasksByPriority,
            budgetsByStatus,
            recentActivities,
            productivityByMonth,
            timeline
        ] = await Promise.all([
            // Tarefas por Status
            this.prisma.task.groupBy({
                by: ['status'],
                where: {
                    userAssignedId: userId,
                    ...(dateCondition ? { createdAt: dateCondition } : {})
                },
                _count: true,
                _avg: { priority: true },
            }),
            // Tarefas por Prioridade
            this.prisma.task.groupBy({
                by: ['priority'],
                where: {
                    userAssignedId: userId,
                    ...(dateCondition ? { createdAt: dateCondition } : {})
                },
                _count: true,
            }),
            // Orçamentos
            this.prisma.budget.groupBy({
                by: ['status'],
                where: {
                    OR: [{ userCreateId: userId }, { userAssignedId: userId }],
                    ...(dateCondition ? { createdAt: dateCondition } : {}),
                },
                _count: true,
                _sum: { total: true },
            }),
            // Atividades Recentes
            this.prisma.task.findMany({
                where: {
                    userAssignedId: userId,
                    ...(dateCondition ? { createdAt: dateCondition } : {})
                },
                take: 10,
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true, title: true, status: true, priority: true, updatedAt: true,
                    column: { select: { title: true } },
                },
            }),
            this.getMonthlyProductivity(userId, startDate, endDate),
            this.getProfessionalTimeline(userId, dateCondition)
        ]);

        const totalTasks = tasksByStatus.reduce((sum, item) => sum + (item._count as number), 0);
        const completedTasks = (tasksByStatus.find(t => t.status === TaskStatus.COMPLETED)?._count as number) || 0;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const totalBudgets = budgetsByStatus.reduce((sum, item) => sum + (item._count as number), 0);
        
        // Uso de optional chaining e tratamento para BigInt (Decimal no Prisma)
        const totalBudgetValue = budgetsByStatus.reduce((sum, item) => sum + (item._sum?.total?.toNumber() || 0), 0); 

        return {
            professional: professional, // Sem necessidade de remover 'password' se você usou 'select' na query
            statistics: {
                tasks: {
                    byStatus: tasksByStatus,
                    byPriority: tasksByPriority,
                    total: totalTasks,
                    completed: completedTasks,
                    completionRate,
                    averagePriority: tasksByStatus[0]?._avg?.priority || 0,
                },
                budgets: {
                    byStatus: budgetsByStatus,
                    total: totalBudgets,
                    totalValue: totalBudgetValue,
                    averageValue: totalBudgets > 0 ? totalBudgetValue / totalBudgets : 0,
                },
                productivity: productivityByMonth,
            },
            recentActivities,
            timeline,
        };
    }

    // --- MÉTODOS PRIVADOS ---

    private async getMonthlyProductivity(userId: string, startDate?: Date, endDate?: Date) {
        try {
            const tasks = await this.prisma.task.findMany({
                where: {
                    userAssignedId: userId, // CORREÇÃO: Usar userAssignedId
                    ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
                },
                select: { createdAt: true, status: true, priority: true },
            });

            // ... (Lógica de agrupamento por mês permanece a mesma)
            const groupedByMonth = tasks.reduce((acc, task) => {
                const month = format(task.createdAt, 'yyyy-MM');
                if (!acc[month]) {
                    acc[month] = { month, total_tasks: 0, completed_tasks: 0, priorities: [] };
                }
                acc[month].total_tasks++;
                if (task.status === TaskStatus.COMPLETED) acc[month].completed_tasks++;
                acc[month].priorities.push(task.priority);
                return acc;
            }, {} as Record<string, any>);

            return Object.values(groupedByMonth)
                .map((item: any) => ({
                    month: item.month,
                    total_tasks: item.total_tasks,
                    completed_tasks: item.completed_tasks,
                    avg_priority: item.priorities.length > 0
                        ? parseFloat((item.priorities.reduce((a: number, b: number) => a + b, 0) / item.priorities.length).toFixed(2))
                        : 0,
                }))
                .sort((a: any, b: any) => b.month.localeCompare(a.month))
                .slice(0, 12);

        } catch (error) {
            this.logger.error('Erro no cálculo de produtividade mensal.', error);
            return [];
        }
    }

    private async getProfessionalTimeline(userId: string, dateCondition?: Prisma.DateTimeFilter) {
        // CORREÇÃO: Assegurar que 'dateCondition' é aplicado a 'createdAt'
        const [tasks, budgets] = await Promise.all([
            this.prisma.task.findMany({
                where: {
                    userAssignedId: userId, // CORREÇÃO: Usar userAssignedId
                    ...(dateCondition ? { createdAt: dateCondition } : {})
                },
                select: {
                    id: true, title: true, status: true, createdAt: true, completionDate: true,
                    column: { select: { title: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            }),
            this.prisma.budget.findMany({
                where: {
                    OR: [{ userCreateId: userId }, { userAssignedId: userId }],
                    ...(dateCondition ? { createdAt: dateCondition } : {}),
                },
                select: { id: true, title: true, status: true, createdAt: true, total: true },
                orderBy: { createdAt: 'desc' },
                take: 20,
            })
        ]);

        return [
            ...tasks.map(task => ({
                type: 'task',
                id: task.id,
                title: task.title,
                status: task.status,
                // CORREÇÃO: Usar completionDate se estiver COMPLETED, senão createdAt (não temos updatedAt)
                date: task.completionDate || task.createdAt, 
                description: `Tarefa ${task.status} - ${task.column.title}`,
                icon: task.status === TaskStatus.COMPLETED ? 'check-circle' : 'clock',
            })),
            ...budgets.map(budget => ({
                type: 'budget',
                id: budget.id,
                title: budget.title,
                status: budget.status,
                date: budget.createdAt,
                description: `Orçamento ${budget.status} - R$ ${budget.total.toNumber()}`, // CORREÇÃO: Chamar .toNumber()
                icon: budget.status === BudgetStatus.APPROVED ? 'dollar-sign' : 'file-text',
            })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 15);
    }
}
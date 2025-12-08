import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { BudgetStatus, TaskStatus, UserStatus, Prisma } from '@prisma/client';
import { format } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  async getProfessionalReport(params: {
    companyId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    requesterRole: string;
  }) {
    const { companyId, startDate, endDate, status, requesterRole } = params;

    // 1. Validação de CompanyID
    let validCompanyId: string | undefined = companyId;
    if (companyId) {
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(companyId)) {
        this.logger.warn(`CompanyId inválido: ${companyId}`);
        validCompanyId = undefined;
        if (requesterRole !== 'MASTER') {
          throw new ForbiddenException('ID da empresa inválido');
        }
      }
    }

    if (requesterRole !== 'MASTER' && !validCompanyId) {
      throw new ForbiddenException('Você só pode ver profissionais da sua empresa');
    }

    // 2. Filtros de Banco de Dados
    const statusFilter = status && Object.values(UserStatus).includes(status as UserStatus)
      ? (status as UserStatus)
      : undefined;

    const where: Prisma.UserWhereInput = {
      isProfessional: true,
      ...(validCompanyId && { companyId: validCompanyId }),
      ...(statusFilter && { status: statusFilter }),
    };

    // 3. Busca inicial leve
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
        phone: true,
        company: {
          select: { id: true, name: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    this.logger.log(`Gerando relatório para ${professionals.length} profissionais (Modo Sequencial)...`);

    // 4. Processamento Sequencial
    // CORREÇÃO 1: Tipagem explícita do array para evitar erro de 'never[]'
    const professionalsWithMetrics: any[] = [];

    for (const professional of professionals) {
      // CORREÇÃO 2: Definição limpa do filtro de data para evitar erro de tipo no WhereInput
      const dateCondition = startDate && endDate ? {
        gte: startDate,
        lte: endDate
      } : undefined;

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
            assignedToId: professional.id, 
            ...(dateCondition ? { createdAt: dateCondition } : {}) 
          },
          _count: true,
        }),
        // Orçamentos por status
        this.prisma.budget.groupBy({
          by: ['status'],
          where: { 
            OR: [{ createdById: professional.id }, { assignedToId: professional.id }],
            ...(dateCondition ? { createdAt: dateCondition } : {}) 
          },
          _count: true,
        }),
        // 5 Últimas tarefas concluídas
        this.prisma.task.findMany({
          where: { assignedToId: professional.id, status: TaskStatus.COMPLETED },
          take: 5,
          orderBy: { completedAt: 'desc' },
          select: { id: true, title: true, completedAt: true, column: { select: { title: true } } }
        }),
        // Contagens Rápidas
        this.prisma.task.count({ where: { assignedToId: professional.id } }),
        this.prisma.task.count({ where: { assignedToId: professional.id, status: TaskStatus.COMPLETED } }),
        this.prisma.task.count({ where: { assignedToId: professional.id, status: TaskStatus.PENDING } }),
        this.prisma.task.count({ where: { assignedToId: professional.id, status: TaskStatus.IN_PROGRESS } }),
        this.prisma.budget.count({ where: { OR: [{ createdById: professional.id }, { assignedToId: professional.id }] } }),
        this.prisma.budget.count({ where: { OR: [{ createdById: professional.id }, { assignedToId: professional.id }], status: BudgetStatus.APPROVED } })
      ]);

      const completionRate = totalTasks > 0 
        ? Math.round((completedTasks / totalTasks) * 100) 
        : 0;

      professionalsWithMetrics.push({
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
      });
    }

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

  async getProfessionalDetails(params: {
    userId: string;
    companyId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { userId, companyId, startDate, endDate } = params;

    const professional = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: { id: true, name: true, email: true, telefone: true },
        },
      },
    });

    if (!professional) throw new NotFoundException('Profissional não encontrado');
    
    // Validação de segurança simples
    if (companyId && professional.companyId !== companyId) {
        // Logica de permissão aqui se necessário
    }

    // CORREÇÃO 2: Filtro de data limpo
    const dateCondition = startDate && endDate ? {
      gte: startDate,
      lte: endDate
    } : undefined;

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
          assignedToId: userId, 
          ...(dateCondition ? { createdAt: dateCondition } : {}) 
        },
        _count: true,
        _avg: { priority: true },
      }),
      // Tarefas por Prioridade
      this.prisma.task.groupBy({
        by: ['priority'],
        where: { 
          assignedToId: userId, 
          ...(dateCondition ? { createdAt: dateCondition } : {}) 
        },
        _count: true,
      }),
      // Orçamentos
      this.prisma.budget.groupBy({
        by: ['status'],
        where: {
          OR: [{ createdById: userId }, { assignedToId: userId }],
          ...(dateCondition ? { createdAt: dateCondition } : {}),
        },
        _count: true,
        _sum: { total: true },
      }),
      // Atividades Recentes
      this.prisma.task.findMany({
        where: { 
          assignedToId: userId, 
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

    // CORREÇÃO 3: Casting explícito para number para resolver erro do operador '+'
    const totalTasks = tasksByStatus.reduce((sum, item) => sum + (item._count as number), 0);
    const completedTasks = (tasksByStatus.find(t => t.status === TaskStatus.COMPLETED)?._count as number) || 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const totalBudgets = budgetsByStatus.reduce((sum, item) => sum + (item._count as number), 0);
    const totalBudgetValue = budgetsByStatus.reduce((sum, item) => sum + (item._sum?.total?.toNumber() || 0), 0);

    return {
      professional: { ...professional, password: undefined },
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
          assignedToId: userId,
          ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
        },
        select: { createdAt: true, status: true, priority: true },
      });

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
      this.logger.error('Erro no cálculo de produtividade', error);
      return [];
    }
  }

  private async getProfessionalTimeline(userId: string, dateCondition?: any) {
    // Note que aqui dateCondition já é o objeto { gte: ..., lte: ... } ou undefined
    // Precisamos passá-lo para createdAt corretamente
    
    const [tasks, budgets] = await Promise.all([
      this.prisma.task.findMany({
        where: { 
          assignedToId: userId, 
          ...(dateCondition ? { createdAt: dateCondition } : {}) 
        },
        select: {
          id: true, title: true, status: true, createdAt: true, completedAt: true,
          column: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.budget.findMany({
        where: {
          OR: [{ createdById: userId }, { assignedToId: userId }],
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
        date: task.completedAt || task.createdAt,
        description: `Tarefa ${task.status} - ${task.column.title}`,
        icon: task.status === TaskStatus.COMPLETED ? 'check-circle' : 'clock',
      })),
      ...budgets.map(budget => ({
        type: 'budget',
        id: budget.id,
        title: budget.title,
        status: budget.status,
        date: budget.createdAt,
        description: `Orçamento ${budget.status} - R$ ${budget.total}`,
        icon: budget.status === BudgetStatus.APPROVED ? 'dollar-sign' : 'file-text',
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
     .slice(0, 15);
  }
}
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/reports/reports.service.ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BudgetStatus, TaskStatus, UserStatus } from '@prisma/client';
import { format } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) { }

  async getProfessionalReport(params: {
    companyId?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    requesterRole: string;
  }) {
    const { companyId, startDate, endDate, status, requesterRole } = params;

    // VALIDAÇÃO: Se companyId não for um UUID válido, definir como undefined
    let validCompanyId: string | undefined = companyId;

    if (companyId) {
      // Verificar se é um UUID válido
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      if (!uuidRegex.test(companyId)) {
        console.warn(`⚠️ CompanyId inválido recebido: ${companyId}`);
        validCompanyId = undefined;

        // Se não for MASTER e recebeu companyId inválido, usar o companyId do usuário
        if (requesterRole !== 'MASTER') {
          throw new ForbiddenException('ID da empresa inválido');
        }
      }
    }

    // Construir where para profissionais
    const where: any = {
      isProfessional: true,
      ...(validCompanyId && { companyId: validCompanyId }),
      ...(status && { status }),
    };

    // Se não for MASTER, só pode ver profissionais da própria empresa
    if (requesterRole !== 'MASTER' && !validCompanyId) {
      throw new ForbiddenException('Você só pode ver profissionais da sua empresa');
    }

    // Buscar profissionais com estatísticas
    const professionals = await this.prisma.user.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            assignedTasks: true,
            completedTasks: true,
            createdBudgets: true,
            assignedBudgets: true,
            sentMessages: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Calcular métricas adicionais para cada profissional
    const professionalsWithMetrics = await Promise.all(
      professionals.map(async (professional) => {
        // Tarefas por status
        const taskStats = await this.prisma.task.groupBy({
          by: ['status'],
          where: {
            assignedToId: professional.id,
            ...(startDate && endDate && {
              createdAt: {
                gte: startDate,
                lte: endDate,
              },
            }),
          },
          _count: true,
        });

        // Orçamentos por status
        const budgetStats = await this.prisma.budget.groupBy({
          by: ['status'],
          where: {
            OR: [
              { createdById: professional.id },
              { assignedToId: professional.id },
            ],
            ...(startDate && endDate && {
              createdAt: {
                gte: startDate,
                lte: endDate,
              },
            }),
          },
          _count: true,
        });

        // Tarefas concluídas recentemente
        const recentCompletedTasks = await this.prisma.task.findMany({
          where: {
            assignedToId: professional.id,
            status: TaskStatus.COMPLETED,
          },
          take: 5,
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            title: true,
            completedAt: true,
            column: {
              select: {
                title: true,
              },
            },
          },
        });

        // Performance (taxa de conclusão)
        const totalTasks = await this.prisma.task.count({
          where: { assignedToId: professional.id },
        });

        const completedTasks = await this.prisma.task.count({
          where: {
            assignedToId: professional.id,
            status: TaskStatus.COMPLETED,
          },
        });

        const completionRate = totalTasks > 0
          ? Math.round((completedTasks / totalTasks) * 100)
          : 0;

        return {
          ...professional,
          password: undefined, // Remover senha
          taskStats,
          budgetStats,
          recentCompletedTasks,
          metrics: {
            totalTasks,
            completedTasks,
            completionRate,
            pendingTasks: await this.prisma.task.count({
              where: {
                assignedToId: professional.id,
                status: TaskStatus.PENDING,
              },
            }),
            inProgressTasks: await this.prisma.task.count({
              where: {
                assignedToId: professional.id,
                status: TaskStatus.IN_PROGRESS,
              },
            }),
            totalBudgets: await this.prisma.budget.count({
              where: {
                OR: [
                  { createdById: professional.id },
                  { assignedToId: professional.id },
                ],
              },
            }),
            approvedBudgets: await this.prisma.budget.count({
              where: {
                OR: [
                  { createdById: professional.id },
                  { assignedToId: professional.id },
                ],
                status: BudgetStatus.APPROVED,
              },
            }),
          },
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
      filters: {
        companyId,
        startDate,
        endDate,
        status,
      },
    };
  }

  async getProfessionalDetails(params: {
    userId: string;
    companyId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    console.log('📊 [REPORTS] getProfessionalDetails chamado com:', params);
    const { userId, companyId, startDate, endDate } = params;

    // Verificar se profissional existe e tem permissão
    const professional = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            email: true,
            telefone: true,
          },
        },
      },
    });

    console.log('👤 Profissional encontrado:', professional ? 'Sim' : 'Não');

    if (!professional) {
      throw new NotFoundException('Profissional não encontrado');
    }

    if (companyId && professional.companyId !== companyId) {
      throw new ForbiddenException('Profissional não pertence a esta empresa');
    }

    // Período de filtro
    const dateFilter = startDate && endDate ? {
      gte: startDate,
      lte: endDate,
    } : undefined;

    // Estatísticas detalhadas
    const [
      tasksByStatus,
      tasksByPriority,
      budgetsByStatus,
      recentActivities,
      productivityByMonth,
    ] = await Promise.all([
      // Tarefas por status
      this.prisma.task.groupBy({
        by: ['status'],
        where: {
          assignedToId: userId,
          ...(dateFilter && { createdAt: dateFilter }),
        },
        _count: true,
        _avg: {
          priority: true,
        },
      }),

      // Tarefas por prioridade
      this.prisma.task.groupBy({
        by: ['priority'],
        where: {
          assignedToId: userId,
          ...(dateFilter && { createdAt: dateFilter }),
        },
        _count: true,
      }),

      // Orçamentos por status
      this.prisma.budget.groupBy({
        by: ['status'],
        where: {
          OR: [
            { createdById: userId },
            { assignedToId: userId },
          ],
          ...(dateFilter && { createdAt: dateFilter }),
        },
        _count: true,
        _sum: {
          total: true,
        },
      }),

      // Atividades recentes
      this.prisma.task.findMany({
        where: {
          assignedToId: userId,
          ...(dateFilter && { createdAt: dateFilter }),
        },
        take: 10,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          updatedAt: true,
          column: {
            select: {
              title: true,
            },
          },
        },
      }),

      // Produtividade por mês
      this.getMonthlyProductivity(userId, startDate, endDate),
    ]);

    // Calcular métricas
    const totalTasks = tasksByStatus.reduce((sum, item) => sum + item._count, 0);
    const completedTasks = tasksByStatus.find(t => t.status === TaskStatus.COMPLETED)?._count || 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const totalBudgets = budgetsByStatus.reduce((sum, item) => sum + item._count, 0);
    const totalBudgetValue = budgetsByStatus.reduce((sum, item) =>
      sum + (item._sum?.total?.toNumber() || 0), 0
    );

    return {
      professional: {
        ...professional,
        password: undefined,
      },
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
      timeline: await this.getProfessionalTimeline(userId, dateFilter),
    };
  }

  private async getMonthlyProductivity(userId: string, startDate?: Date, endDate?: Date) {
    try {
      console.log('📊 Executando query de produtividade mensal (Prisma puro)');

      // Buscar tarefas do usuário
      const tasks = await this.prisma.task.findMany({
        where: {
          assignedToId: userId,
          ...(startDate && endDate ? {
            createdAt: {
              gte: startDate,
              lte: endDate,
            }
          } : {}),
        },
        select: {
          createdAt: true,
          status: true,
          priority: true,
        },
      });

      console.log(`📦 ${tasks.length} tarefas encontradas`);

      // Agrupar por mês
      const groupedByMonth = tasks.reduce((acc, task) => {
        const month = format(task.createdAt, 'yyyy-MM');

        if (!acc[month]) {
          acc[month] = {
            month,
            total_tasks: 0,
            completed_tasks: 0,
            priorities: [],
          };
        }

        acc[month].total_tasks++;

        if (task.status === 'COMPLETED') {
          acc[month].completed_tasks++;
        }

        acc[month].priorities.push(task.priority);

        return acc;
      }, {} as Record<string, any>);

      // Calcular média e formatar
      const results = Object.values(groupedByMonth)
        .map((item: any) => {
          const avgPriority = item.priorities.length > 0
            ? item.priorities.reduce((sum: number, p: number) => sum + p, 0) / item.priorities.length
            : 0;

          return {
            month: item.month,
            total_tasks: item.total_tasks,
            completed_tasks: item.completed_tasks,
            avg_priority: parseFloat(avgPriority.toFixed(2)),
          };
        })
        .sort((a: any, b: any) => b.month.localeCompare(a.month))
        .slice(0, 12);

      console.log('✅ Resultados:', results);
      return results;

    } catch (error) {
      console.error('❌ Erro no cálculo de produtividade:', error);
      return [];
    }
  }

  private async getProfessionalTimeline(userId: string, dateFilter?: any) {
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedToId: userId,
        ...(dateFilter && { createdAt: dateFilter }), // Isso usa o campo do Prisma, está correto
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true, // Campo do Prisma
        completedAt: true, // Campo do Prisma
        column: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' }, // Campo do Prisma
      take: 20,
    });

    const budgets = await this.prisma.budget.findMany({
      where: {
        OR: [
          { createdById: userId },
          { assignedToId: userId },
        ],
        ...(dateFilter && { createdAt: dateFilter }), // Campo do Prisma
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true, // Campo do Prisma
        total: true,
      },
      orderBy: { createdAt: 'desc' }, // Campo do Prisma
      take: 20,
    });

    // Combinar e ordenar cronologicamente
    const timeline = [
      ...tasks.map(task => ({
        type: 'task' as const,
        id: task.id,
        title: task.title,
        status: task.status,
        date: task.completedAt || task.createdAt,
        description: `Tarefa ${task.status.toLowerCase()} - ${task.column.title}`,
        icon: task.status === 'COMPLETED' ? 'check-circle' : 'clock',
      })),
      ...budgets.map(budget => ({
        type: 'budget' as const,
        id: budget.id,
        title: budget.title,
        status: budget.status,
        date: budget.createdAt,
        description: `Orçamento ${budget.status.toLowerCase()} - R$ ${budget.total}`,
        icon: budget.status === 'APPROVED' ? 'dollar-sign' : 'file-text',
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 15);

    return timeline;
  }
}
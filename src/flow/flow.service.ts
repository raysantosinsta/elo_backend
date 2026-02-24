/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { Counter, Histogram } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateFlowDto,
  CreateFlowItemDto,
  CreateStageDto,
  DateFilterType,
  FlowFilterDto,
} from './dto/create-flow.dto';

// --- MÉTRICAS ---
const flowOpsCounter = new Counter({
  name: 'product_flow_ops_total',
  help: 'Total de operações de fluxo de produção',
  labelNames: ['operation', 'status'],
});

const dbLatency = new Histogram({
  name: 'db_latency_flow_seconds',
  help: 'Latência de banco para operações de fluxo',
  labelNames: ['method'],
});

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);
  private readonly CACHE_TTL = 30000;

  constructor(
    private prisma: PrismaService,
    private readonly cls: ClsService, // 🔥 USADO PARA PEGAR TENANT ID
    private supabase: SupabaseService,
    private auditService: AuditService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectMetric('flow_item_moves_total')
    public moveCounter: Counter<string>,
    @InjectMetric('db_operation_duration_seconds')
    public dbHistogram: Histogram<string>,
  ) {}

  // ===========================================================================
  // 🔥 MÉTODO UTILITÁRIO PARA PEGAR COMPANY ID DO CLS
  // ===========================================================================
  private getCompanyIdFromContext(): string {
    const companyId = this.cls.get<string>('tenantId');
    if (!companyId) {
      this.logger.error('❌ companyId não encontrado no CLS');
      throw new ForbiddenException('Empresa não identificada');
    }
    return companyId;
  }

  // ===========================================================================
  // MÉTODOS REFATORADOS - SEM companyId NOS PARÂMETROS
  // ===========================================================================

  async getFilteredItemsByFlow(flowId: string, filters: FlowFilterDto) {
    const companyId = this.getCompanyIdFromContext(); // 🔥 PEGA DO CLS

    const {
      isOverdue,
      isUpcoming,
      assignedToId,
      supplierId,
      status,
      productRef,
    } = filters;

    this.logger.log(
      `🔍 FILTRANDO ITENS do fluxo ${flowId} para empresa ${companyId}`,
    );

    // Primeiro verifica se o fluxo pertence à empresa
    const flow = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    const whereClause: any = {
      companyId,
      flowId,
    };

    // Aplicar filtros básicos
    if (assignedToId) {
      whereClause.assignedToId = assignedToId;
    }

    if (supplierId) {
      whereClause.supplierId = supplierId === 'internal' ? null : supplierId;
    }

    if (status) {
      whereClause.status = status;
    }

    if (productRef && productRef.trim() !== '') {
      whereClause.productRef = {
        contains: productRef.trim(),
        mode: 'insensitive',
      };
    }

    // Lógica para itens ATRASADOS (overdue)
    if (isOverdue === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      whereClause.AND = [
        {
          dueDate: {
            not: null,
          },
        },
        {
          dueDate: {
            lt: today,
          },
        },
        {
          status: {
            not: 'CONCLUIDO',
          },
        },
      ];
    }

    // Lógica para itens PRÓXIMOS A VENCER
    if (isUpcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause.AND = [
        {
          productionStartedAt: {
            not: null,
          },
        },
        {
          productionStartedAt: {
            gte: today,
            lte: endOfDay,
          },
        },
        {
          status: {
            not: 'CONCLUIDO',
          },
        },
      ];
    }

    // Buscar itens
    const items = await this.prisma.flowItem.findMany({
      where: whereClause,
      include: {
        stage: {
          select: {
            id: true,
            name: true,
            order: true,
            color: true,
          },
        },
        flow: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    return items;
  }

  // 🟢 GERENCIAMENTO DE TEMPLATES
  async getTemplates() {
    const companyId = this.getCompanyIdFromContext();
    return this.prisma.flowTemplate.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async applyTemplate(flowId: string, templateId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Template não encontrado');

    const structure = template.structure as any[];
    const lastStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'desc' },
    });

    let nextOrder = (lastStage?.order ?? -1) + 1;
    const stagesCreated: any[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      for (const s of structure) {
        const stage = await tx.flowStage.create({
          data: {
            name: s.name,
            color: s.color || '#2C3E50',
            order: nextOrder++,
            flowId,
            companyId,
            allowedRole: s.allowedRole || null,
          },
        });
        stagesCreated.push(stage);
      }
      await this.invalidateFlowCache(companyId, flowId);
      return { success: true, stages: stagesCreated };
    });

    await this.auditService.log({
      action: 'APPLY_TEMPLATE',
      entity: 'FLOW_TEMPLATE',
      entityId: templateId,
      userId,
      companyId,
      metadata: {
        templateName: template.name,
        flowId,
        stagesAdded: stagesCreated.length,
      },
    });

    return result;
  }

  async saveTemplate(flowId: string, name: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const stages = await this.prisma.flowStage.findMany({
      where: { flowId, flow: { companyId } },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) throw new BadRequestException('Fluxo sem etapas.');

    const structure = stages.map((s) => ({
      name: s.name,
      color: s.color,
      allowedRole: s.allowedRole,
    }));

    const template = await this.prisma.flowTemplate.create({
      data: { name, companyId, structure },
    });

    await this.auditService.log({
      action: 'SAVE_TEMPLATE',
      entity: 'FLOW_TEMPLATE',
      entityId: template.id,
      userId,
      companyId,
      metadata: {
        templateName: name,
        flowId,
        stagesCount: stages.length,
      },
    });

    return template;
  }

  async deleteTemplate(templateId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Template não encontrado');

    await this.prisma.flowTemplate.delete({ where: { id: templateId } });

    await this.auditService.log({
      action: 'DELETE_TEMPLATE',
      entity: 'FLOW_TEMPLATE',
      entityId: templateId,
      userId,
      companyId,
      metadata: {
        templateName: template.name,
      },
    });

    return { success: true };
  }

  // 🔵 GERENCIAMENTO DE FLUXO
  async createFlow(userId: string, dto: CreateFlowDto) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(
      `📝 Criando fluxo na empresa ${companyId} pelo usuário ${userId}`,
    );

    const flow = await this.prisma.productFlow.create({
      data: {
        name: dto.name,
        companyId,
        color: (dto as any).color || '#D35400',
        deadline: dto.deadline ? new Date(dto.deadline) : null,
      },
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'FLOW',
      entityId: flow.id,
      userId,
      companyId,
      oldData: null,
      newData: {
        name: flow.name,
        color: flow.color,
        deadline: flow.deadline,
        companyId: flow.companyId,
      },
      metadata: {
        flowName: flow.name,
        createdAt: flow.createdAt,
      },
    });

    await this.invalidateFlowCache(companyId);
    return flow;
  }

  async updateFlow(
    flowId: string,
    data: { name?: string; color?: string; deadline?: Date | null },
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(`📝 Atualizando fluxo ${flowId} na empresa ${companyId}`);

    const flow = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.color !== undefined) {
      updateData.color = data.color;
    }

    if (data.deadline !== undefined) {
      updateData.deadline = data.deadline ? new Date(data.deadline) : null;
    }

    const oldData = {
      name: flow.name,
      color: flow.color,
      deadline: flow.deadline,
    };

    const updatedFlow = await this.prisma.productFlow.update({
      where: { id: flowId },
      data: updateData,
      include: {
        stages: { orderBy: { order: 'asc' } },
        _count: { select: { items: true, stages: true } },
      },
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'FLOW',
      entityId: flowId,
      userId,
      companyId,
      oldData,
      newData: {
        name: updatedFlow.name,
        color: updatedFlow.color,
        deadline: updatedFlow.deadline,
      },
    });

    await this.invalidateFlowCache(companyId, flowId);
    return updatedFlow;
  }

  async getFlows() {
    const companyId = this.getCompanyIdFromContext();

    const cacheKey = `flows_list_${companyId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const flows = await this.prisma.productFlow.findMany({
      where: { companyId },
      include: {
        stages: { orderBy: { order: 'asc' } },
        _count: { select: { items: true, stages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const flowsWithCountdown = flows.map((flow) => {
      let daysRemaining: number | null = null;
      let deadlineStatus: 'normal' | 'warning' | 'overdue' | 'expired' =
        'normal';

      if (flow.deadline) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deadline = new Date(flow.deadline);
        deadline.setHours(0, 0, 0, 0);

        const diffTime = deadline.getTime() - today.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
          deadlineStatus = 'expired';
        } else if (daysRemaining === 0) {
          deadlineStatus = 'overdue';
        } else if (daysRemaining <= 3) {
          deadlineStatus = 'warning';
        } else {
          deadlineStatus = 'normal';
        }
      }

      return {
        ...flow,
        daysRemaining,
        deadlineStatus,
        deadlineFormatted: flow.deadline
          ? new Date(flow.deadline).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : null,
      };
    });

    await this.cacheManager.set(cacheKey, flowsWithCountdown, this.CACHE_TTL);
    return flowsWithCountdown;
  }

  async deleteFlow(flowId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const flow = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        items: { include: { images: true, audios: true, videos: true } },
      },
    });
    if (!flow) throw new NotFoundException('Fluxo não encontrado');

    await this.cleanUpFlowFiles(flow.items);
    await this.prisma.$transaction([
      this.prisma.flowItem.deleteMany({ where: { flowId } }),
      this.prisma.flowStage.deleteMany({ where: { flowId } }),
      this.prisma.productFlow.delete({ where: { id: flowId } }),
    ]);

    await this.auditService.log({
      action: 'DELETE',
      entity: 'FLOW',
      entityId: flowId,
      userId,
      companyId,
      oldData: {
        name: flow.name,
        itemsCount: flow.items.length,
      },
    });

    await this.invalidateFlowCache(companyId, flowId);
    return { success: true };
  }

  // 🟠 GERENCIAMENTO DE ETAPAS
  async createStage(flowId: string, data: CreateStageDto, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const lastStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'desc' },
    });

    const stage = await this.prisma.flowStage.create({
      data: {
        ...data,
        flowId,
        order: (lastStage?.order ?? -1) + 1,
        companyId,
      },
    });

    await this.auditService.log({
      action: 'CREATE_STAGE',
      entity: 'FLOW_STAGE',
      entityId: stage.id,
      userId,
      companyId,
      metadata: {
        flowId,
        stageName: stage.name,
      },
      newData: {
        name: stage.name,
        color: stage.color,
        order: stage.order,
        allowedRole: stage.allowedRole,
      },
    });

    await this.invalidateFlowCache(companyId, flowId);
    return stage;
  }

  async updateStage(stageId: string, data: any, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const stage = await this.prisma.flowStage.findFirst({
      where: { id: stageId, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    const oldData = {
      name: stage.name,
      color: stage.color,
      order: stage.order,
      allowedRole: stage.allowedRole,
    };

    const updated = await this.prisma.flowStage.update({
      where: { id: stageId },
      data: {
        name: data.name,
        color: data.color,
        order: data.order,
        allowedRole: data.allowedRole,
      },
    });

    await this.auditService.log({
      action: 'UPDATE_STAGE',
      entity: 'FLOW_STAGE',
      entityId: stageId,
      userId,
      companyId,
      oldData,
      newData: {
        name: updated.name,
        color: updated.color,
        order: updated.order,
        allowedRole: updated.allowedRole,
      },
    });

    await this.invalidateFlowCache(companyId, stage.flowId);
    return updated;
  }

  async deleteStage(stageId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const stage = await this.prisma.flowStage.findFirst({
      where: { id: stageId, companyId },
      include: {
        items: { include: { images: true, audios: true, videos: true } },
      },
    });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    await this.cleanUpFlowFiles(stage.items);
    await this.prisma.$transaction([
      this.prisma.flowItem.deleteMany({ where: { stageId } }),
      this.prisma.flowStage.delete({ where: { id: stageId } }),
    ]);

    await this.auditService.log({
      action: 'DELETE_STAGE',
      entity: 'FLOW_STAGE',
      entityId: stageId,
      userId,
      companyId,
      oldData: {
        name: stage.name,
        flowId: stage.flowId,
        itemsCount: stage.items.length,
      },
    });

    await this.invalidateFlowCache(companyId, stage.flowId);
    return { success: true };
  }

  // 🟡 GERENCIAMENTO DE ITENS E KANBAN
  async getKanbanBoard(flowId: string) {
    const companyId = this.getCompanyIdFromContext();

    const board = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { orderInStage: 'asc' },
              include: {
                images: { take: 1, select: { url: true, id: true } },
                assignedTo: { select: { name: true, id: true } },
                supplier: { select: { name: true } },
                _count: {
                  select: { images: true, audios: true, videos: true },
                },
              },
            },
          },
        },
      },
    });
    if (!board) throw new NotFoundException('Fluxo não encontrado');
    return board;
  }

  async createFlowItem(flowId: string, userId: string, dto: CreateFlowItemDto) {
    const companyId = this.getCompanyIdFromContext();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });
    if (!user) throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      const targetStage = dto.stageId
        ? await tx.flowStage.findFirst({
            where: { id: dto.stageId, flowId, companyId },
          })
        : await tx.flowStage.findFirst({
            where: { flowId, companyId },
            orderBy: { order: 'asc' },
          });

      if (!targetStage) throw new BadRequestException('Etapa inválida.');
      this.validateStageAccess(user, targetStage);

      const lastItem = await tx.flowItem.findFirst({
        where: { stageId: targetStage.id },
        orderBy: { orderInStage: 'desc' },
      });

      const dataToCreate: any = {
        title: dto.title,
        flowId: flowId,
        companyId: companyId,
        stageId: targetStage.id,
        orderInStage: (lastItem?.orderInStage ?? -1) + 1,
        enteredAt: new Date(),
        orderNumber: dto.orderNumber || '',
        productRef: dto.productRef || '',
        quantity: dto.quantity || 1,
        priority: dto.priority || 3,
        status: dto.status || 'PENDENTE',
        description: dto.description || null,
        assignedToId: dto.assignedToId || null,
        supplierId: dto.supplierId || null,
      };

      if (dto.dueDate) {
        dataToCreate.dueDate = new Date(dto.dueDate);
      }
      if (dto.productionStartedAt) {
        dataToCreate.productionStartedAt = new Date(dto.productionStartedAt);
      }
      if (dto.deliveryAt) {
        dataToCreate.deliveryAt = new Date(dto.deliveryAt);
      }

      const item = await tx.flowItem.create({
        data: dataToCreate,
      });

      await this.auditService.log({
        action: 'CREATE_ITEM',
        entity: 'FLOW_ITEM',
        entityId: item.id,
        userId,
        companyId,
        newData: {
          title: item.title,
          flowId: item.flowId,
          stageId: item.stageId,
          orderNumber: item.orderNumber,
          productRef: item.productRef,
          quantity: item.quantity,
          priority: item.priority,
          status: item.status,
          dueDate: item.dueDate,
          productionStartedAt: item.productionStartedAt,
          deliveryAt: item.deliveryAt,
          assignedToId: item.assignedToId,
          supplierId: item.supplierId,
        },
      });

      await this.invalidateFlowCache(companyId, flowId);
      return item;
    });
  }

  async updateFlowItem(itemId: string, userId: string, data: any) {
    const companyId = this.getCompanyIdFromContext();

    const [item, user] = await Promise.all([
      this.prisma.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: { stage: true },
      }),
      this.prisma.user.findFirst({ where: { id: userId, companyId } }),
    ]);

    if (!item || !user)
      throw new NotFoundException('Item ou usuário não encontrado');
    this.validateStageAccess(user, item.stage!);

    const oldData = {
      title: item.title,
      description: item.description,
      priority: item.priority,
      quantity: item.quantity,
      supplierId: item.supplierId,
      assignedToId: item.assignedToId,
      stageId: item.stageId,
      orderNumber: item.orderNumber,
      productRef: item.productRef,
      status: item.status,
      dueDate: item.dueDate,
      productionStartedAt: item.productionStartedAt,
      deliveryAt: item.deliveryAt,
    };

    if (data.stageId && data.stageId !== item.stageId) {
      const newStage = await this.prisma.flowStage.findFirst({
        where: { id: data.stageId, companyId },
      });
      if (!newStage) throw new BadRequestException('Etapa de destino inválida');
      this.validateStageAccess(user, newStage);
    }

    const updateData: any = {
      title: data.title,
      description: data.description,
      priority: data.priority,
      quantity: data.quantity,
      supplierId: data.supplierId,
      assignedToId: data.assignedToId,
      stageId: data.stageId,
      orderNumber: data.orderNumber,
      productRef: data.productRef,
      status: data.status,
      updatedAt: new Date(),
    };

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }
    if (data.productionStartedAt !== undefined) {
      updateData.productionStartedAt = data.productionStartedAt
        ? new Date(data.productionStartedAt)
        : null;
    }
    if (data.deliveryAt !== undefined) {
      updateData.deliveryAt = data.deliveryAt
        ? new Date(data.deliveryAt)
        : null;
    }

    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: updateData,
    });

    await this.auditService.log({
      action: 'UPDATE_ITEM',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      oldData,
      newData: {
        title: updated.title,
        description: updated.description,
        priority: updated.priority,
        quantity: updated.quantity,
        supplierId: updated.supplierId,
        assignedToId: updated.assignedToId,
        stageId: updated.stageId,
        orderNumber: updated.orderNumber,
        productRef: updated.productRef,
        status: updated.status,
        dueDate: updated.dueDate,
        productionStartedAt: updated.productionStartedAt,
        deliveryAt: updated.deliveryAt,
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return updated;
  }

  async moveItem(
    itemId: string,
    newStageId: string,
    userId: string,
    newOrder?: number,
  ) {
    console.log('[MOVE_ITEM] Início da movimentação', {
      itemId,
      newStageId,
      userId,
    });

    return this.executeWithResilience('move_item', async () => {
      return this.prisma.$transaction(async (tx) => {
        const companyId = this.cls.get<string>('tenantId');

        const [item, nextStage, user] = await Promise.all([
          tx.flowItem.findFirst({
            where: { id: itemId, companyId },
            include: {
              stage: true,
              assignedTo: true,
            },
          }),
          tx.flowStage.findFirst({
            where: { id: newStageId, companyId },
          }),
          tx.user.findFirst({
            where: { id: userId, companyId },
          }),
        ]);

        if (!item || !nextStage || !user) {
          throw new NotFoundException('Item, etapa ou usuário não encontrado');
        }

        console.log(
          '[MOVE_ITEM] Validando permissão apenas na ORIGEM:',
          item.stage?.name,
        );
        this.validateStageAccess(user, item.stage!);

        const oldStageId = item.stageId;
        const oldAssignedToId = item.assignedToId;

        // =========================================================================
        // 🔥 NOVA LÓGICA: Atribuir responsável baseado no cargo da coluna destino
        // =========================================================================
        let newAssignedToId = item.assignedToId; // Mantém o atual por padrão

        if (
          nextStage.allowedRole &&
          nextStage.allowedRole.trim() !== '' &&
          nextStage.allowedRole !== 'all' &&
          nextStage.allowedRole !== 'null'
        ) {
          // Busca um responsável com o cargo da coluna destino
          const responsibleId = await this.findResponsibleByRole(
            companyId,
            nextStage.allowedRole,
          );

          if (responsibleId) {
            newAssignedToId = responsibleId;
            console.log(
              `[MOVE_ITEM] ✅ Responsável automático encontrado: ${responsibleId} para cargo ${nextStage.allowedRole}`,
            );
          } else {
            console.log(
              `[MOVE_ITEM] ⚠️ Nenhum usuário encontrado com o cargo: ${nextStage.allowedRole}`,
            );
            // Opcional: Se quiser remover o responsável quando não encontrar
            // newAssignedToId = null;
          }
        } else {
          console.log(
            '[MOVE_ITEM] ℹ️ Coluna sem cargo específico, mantendo responsável atual',
          );
        }

        // Lógica de reordenação
        let finalOrder: number;

        if (newOrder !== undefined && newOrder >= 0) {
          await tx.flowItem.updateMany({
            where: {
              stageId: newStageId,
              orderInStage: { gte: newOrder },
              id: { not: itemId },
            },
            data: { orderInStage: { increment: 1 } },
          });
          finalOrder = newOrder;
        } else {
          const last = await tx.flowItem.findFirst({
            where: { stageId: newStageId },
            orderBy: { orderInStage: 'desc' },
            select: { orderInStage: true },
          });
          finalOrder = (last?.orderInStage ?? -1) + 1;
        }

        // Atualiza o item com o novo responsável (se mudou)
        const updateData: any = {
          stageId: newStageId,
          orderInStage: finalOrder,
          updatedAt: new Date(),
        };

        // Só atualiza o assignedToId se encontrou um novo responsável
        if (newAssignedToId !== oldAssignedToId) {
          updateData.assignedToId = newAssignedToId;
        }

        const updated = await tx.flowItem.update({
          where: { id: itemId },
          data: updateData,
          include: {
            assignedTo: {
              select: { id: true, name: true },
            },
          },
        });

        // Registrar auditoria com informações do responsável
        const metadata: any = {
          fromStageId: oldStageId,
          fromStageName: item.stage?.name,
          toStageId: newStageId,
          toStageName: nextStage.name,
          newOrder: finalOrder,
        };

        // Adiciona informações de responsável se houve mudança
        if (newAssignedToId !== oldAssignedToId) {
          metadata.responsibleChanged = true;
          metadata.oldResponsibleId = oldAssignedToId;
          metadata.newResponsibleId = newAssignedToId;
          metadata.newResponsibleName = updated.assignedTo?.name;
          metadata.reason = `Atribuído automaticamente pelo cargo da coluna: ${nextStage.allowedRole}`;
        }

        await this.auditService.log({
          action: 'MOVE_ITEM',
          entity: 'FLOW_ITEM',
          entityId: itemId,
          userId,
          companyId,
          metadata,
        });

        await this.invalidateFlowCache(companyId, item.flowId);

        console.log('[MOVE_ITEM] Movimentação concluída com sucesso', {
          newStage: nextStage.name,
          newResponsible: updated.assignedTo?.name || 'Não atribuído',
        });

        return updated;
      });
    });
  }

  async advanceItemToNextStage(itemId: string, userId: string) {
    const companyId = this.cls.get<string>('tenantId');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: {
          stage: true,
          assignedTo: true,
        },
      });
      if (!item || !item.stage) throw new NotFoundException();

      const user = await tx.user.findFirst({
        where: { id: userId, companyId },
      });
      if (!user) throw new ForbiddenException();

      this.validateStageAccess(user, item.stage);

      const allStages = await tx.flowStage.findMany({
        where: { flowId: item.flowId },
        orderBy: { order: 'asc' },
      });

      const currentIndex = allStages.findIndex((s) => s.id === item.stageId);
      const nextStage = allStages[currentIndex + 1];

      if (!nextStage) throw new BadRequestException('Fim da esteira.');

      const oldStageId = item.stageId;
      const oldAssignedToId = item.assignedToId;

      // =========================================================================
      // 🔥 MESMA LÓGICA: Atribuir responsável baseado no cargo da coluna destino
      // =========================================================================
      let newAssignedToId = item.assignedToId;

      if (
        nextStage.allowedRole &&
        nextStage.allowedRole.trim() !== '' &&
        nextStage.allowedRole !== 'all' &&
        nextStage.allowedRole !== 'null'
      ) {
        const responsibleId = await this.findResponsibleByRole(
          companyId,
          nextStage.allowedRole,
        );

        if (responsibleId) {
          newAssignedToId = responsibleId;
        }
      }

      const updateData: any = {
        stageId: nextStage.id,
        updatedAt: new Date(),
      };

      if (newAssignedToId !== oldAssignedToId) {
        updateData.assignedToId = newAssignedToId;
      }

      const updated = await tx.flowItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
        },
      });

      const metadata: any = {
        fromStageId: oldStageId,
        fromStageName: item.stage.name,
        toStageId: nextStage.id,
        toStageName: nextStage.name,
        fromOrder: currentIndex,
        toOrder: currentIndex + 1,
      };

      if (newAssignedToId !== oldAssignedToId) {
        metadata.responsibleChanged = true;
        metadata.oldResponsibleId = oldAssignedToId;
        metadata.newResponsibleId = newAssignedToId;
        metadata.newResponsibleName = updated.assignedTo?.name;
        metadata.reason = `Atribuído automaticamente pelo cargo da coluna: ${nextStage.allowedRole}`;
      }

      await this.auditService.log({
        action: 'ADVANCE_ITEM',
        entity: 'FLOW_ITEM',
        entityId: itemId,
        userId,
        companyId,
        metadata,
      });

      await this.invalidateFlowCache(companyId!, item.flowId);
      return updated;
    });
  }

  async deleteItem(itemId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { images: true, audios: true, videos: true },
    });
    if (!item) throw new NotFoundException();

    await this.cleanUpFlowFiles([item]);
    await this.prisma.flowItem.delete({ where: { id: itemId } });

    await this.auditService.log({
      action: 'DELETE_ITEM',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      oldData: {
        title: item.title,
        flowId: item.flowId,
        stageId: item.stageId,
        orderNumber: item.orderNumber,
        productRef: item.productRef,
      },
      metadata: {
        mediaCount: {
          images: item.images.length,
          audios: item.audios.length,
          videos: item.videos.length,
        },
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return { success: true };
  }

  // 📁 MÍDIAS E SUPORTE
  async addMediaToItem(
    itemId: string,
    file: Express.Multer.File,
    type: 'image' | 'audio' | 'video',
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
    });
    if (!item) throw new NotFoundException();

    const upload = await this.supabase.uploadFlowFile(itemId, file, type);
    const data = {
      itemId,
      companyId,
      uploadedById: userId,
      url: upload.url,
      filename: upload.filename,
      size: upload.size,
    };

    let media;
    if (type === 'image') {
      media = await this.prisma.flowImage.create({ data });
    } else if (type === 'audio') {
      media = await this.prisma.flowAudio.create({
        data: { ...data, duration: 0 },
      });
    } else {
      media = await this.prisma.flowVideo.create({
        data: { ...data, duration: 0 },
      });
    }

    await this.auditService.log({
      action: `ADD_${type.toUpperCase()}`,
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      metadata: {
        mediaId: media.id,
        filename: upload.filename,
        url: upload.url,
        size: upload.size,
        type,
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return media;
  }

  async deleteMedia(
    itemId: string,
    type: 'image' | 'audio' | 'video',
    mediaId: string,
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    const model: any =
      type === 'image'
        ? this.prisma.flowImage
        : type === 'audio'
          ? this.prisma.flowAudio
          : this.prisma.flowVideo;

    const media = await model.findFirst({
      where: { id: mediaId, itemId, companyId },
    });

    if (media) {
      if (media.url)
        await this.supabase
          .deleteFlowFile(media.url)
          .catch((e) => this.logger.error(e));

      await model.delete({ where: { id: mediaId } });

      await this.auditService.log({
        action: `DELETE_${type.toUpperCase()}`,
        entity: 'FLOW_ITEM',
        entityId: itemId,
        userId,
        companyId,
        metadata: {
          mediaId,
          filename: media.filename,
          url: media.url,
          type,
        },
      });
    }

    await this.invalidateFlowCache(companyId);
    return { success: true };
  }

  private async cleanUpFlowFiles(items: any[]) {
    for (const item of items) {
      const allMedia = [
        ...(item.images || []),
        ...(item.audios || []),
        ...(item.videos || []),
      ];
      for (const m of allMedia)
        if (m.url) await this.supabase.deleteFlowFile(m.url);
    }
  }

  // 🔄 FUNÇÕES DE FILTRO
  async getFilteredItems(filters: FlowFilterDto) {
    const companyId = this.getCompanyIdFromContext();

    const {
      startDate,
      endDate,
      dateType,
      isOverdue,
      isUpcoming,
      assignedToId,
      supplierId,
      status,
      productRef,
    } = filters;

    this.logger.log(`🔍 FILTRANDO ITENS para empresa ${companyId}`);

    const whereClause: any = {
      companyId,
    };

    if (assignedToId) {
      whereClause.assignedToId = assignedToId;
    }

    if (supplierId) {
      whereClause.supplierId = supplierId === 'internal' ? null : supplierId;
    }

    if (status) {
      whereClause.status = status;
    }

    if (productRef && productRef.trim() !== '') {
      whereClause.productRef = {
        contains: productRef.trim(),
        mode: 'insensitive',
      };
    }

    if (startDate || endDate) {
      const dateField =
        dateType === DateFilterType.DUE_DATE
          ? 'dueDate'
          : 'productionStartedAt';

      const dateFilter: any = {};

      if (startDate) {
        dateFilter.gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.lte = endDateTime;
      }

      whereClause[dateField] = dateFilter;
    }

    if (isOverdue === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      whereClause.AND = [
        {
          dueDate: {
            not: null,
          },
        },
        {
          dueDate: {
            lt: today,
          },
        },
        {
          status: {
            not: 'CONCLUIDO',
          },
        },
      ];
    }

    if (isUpcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause.AND = [
        {
          productionStartedAt: {
            not: null,
          },
        },
        {
          productionStartedAt: {
            gte: today,
            lte: endOfDay,
          },
        },
        {
          status: {
            not: 'CONCLUIDO',
          },
        },
      ];
    }

    try {
      const items = await this.prisma.flowItem.findMany({
        where: whereClause,
        include: {
          stage: {
            select: {
              id: true,
              name: true,
              order: true,
              color: true,
            },
          },
          flow: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          supplier: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          images: {
            select: {
              id: true,
              url: true,
              filename: true,
            },
          },
          audios: {
            select: {
              id: true,
              url: true,
              filename: true,
            },
          },
          videos: {
            select: {
              id: true,
              url: true,
              filename: true,
            },
          },
        },
        orderBy: {
          [dateType === DateFilterType.DUE_DATE
            ? 'dueDate'
            : 'productionStartedAt']: 'asc',
        },
      });

      return items;
    } catch (error) {
      this.logger.error('❌ Erro ao filtrar itens:', error);
      throw new BadRequestException('Erro ao aplicar filtros');
    }
  }

  async getFilteredKanbanBoard(flowId: string, filters: FlowFilterDto) {
    const companyId = this.getCompanyIdFromContext();

    const board = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              include: {
                images: { take: 1, select: { url: true, id: true } },
                assignedTo: { select: { name: true, id: true } },
                supplier: { select: { name: true, id: true } },
              },
            },
          },
        },
      },
    });

    if (!board) {
      throw new BadRequestException('Fluxo não encontrado');
    }

    if (!this.hasFilters(filters)) {
      return board;
    }

    const filteredItems = await this.getFilteredItems(filters);

    const filteredStages = board.stages.map((stage) => ({
      ...stage,
      items: stage.items.filter((item) =>
        filteredItems.some((filteredItem) => filteredItem.id === item.id),
      ),
    }));

    return {
      ...board,
      stages: filteredStages,
    };
  }

  // No FlowService, adicione este método:
  private async findResponsibleByRole(
    companyId: string,
    allowedRole: string,
  ): Promise<string | null> {
    if (
      !allowedRole ||
      allowedRole.trim() === '' ||
      allowedRole === 'all' ||
      allowedRole === 'null'
    ) {
      return null;
    }

    // Busca usuários com o cargo correspondente
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        professionalRole: {
          contains: allowedRole,
          mode: 'insensitive',
        },
      },
      orderBy: {
        createdAt: 'asc', // Pega o mais antigo primeiro (ou use 'id' para mais recente)
      },
      take: 1, // Pega apenas o primeiro
    });

    return users.length > 0 ? users[0].id : null;
  }

  private hasFilters(filters: FlowFilterDto): boolean {
    return !!(
      filters.startDate ||
      filters.endDate ||
      filters.isOverdue === 'true' ||
      filters.isUpcoming === 'true' ||
      filters.assignedToId ||
      filters.supplierId ||
      filters.status
    );
  }

  // 🛡️ LÓGICA DE SEGURANÇA (mantida igual)
  private validateStageAccess(
    user: { role: string; professionalRole: string | null },
    stage: { name: string; allowedRole: string | null },
  ) {
    // ... (mesmo código anterior)
    if (['MASTER', 'ADMIN'].includes(user.role)) {
      return true;
    }

    if (
      !stage.allowedRole ||
      stage.allowedRole.trim() === '' ||
      stage.allowedRole === 'null' ||
      stage.allowedRole === 'all'
    ) {
      return true;
    }

    const userRole = user.professionalRole?.trim().toLowerCase() || '';
    const required = stage.allowedRole.trim().toLowerCase();

    const roles = userRole.split(',').map((r) => r.trim());
    const hasAccess = roles.some((r) => r === required);

    if (!hasAccess) {
      throw new ForbiddenException(
        `Acesso restrito ao cargo: ${stage.allowedRole}`,
      );
    }

    return true;
  }

  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    retries = 3,
  ): Promise<T> {
    const endTimer = this.dbHistogram.labels(operation).startTimer();
    let attempt = 0;
    while (attempt < retries) {
      try {
        const result = await fn();
        endTimer();
        return result;
      } catch (error: any) {
        attempt++;
        if (
          attempt >= retries ||
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        ) {
          endTimer();
          throw error;
        }
        await new Promise((res) => setTimeout(res, 200 * attempt));
      }
    }
    throw new InternalServerErrorException('Database unavailable');
  }

  private async invalidateFlowCache(companyId: string, flowId?: string) {
    await this.cacheManager.del(`flows_list_${companyId}`);
    if (flowId) {
      await this.cacheManager.del(`flow_board_${flowId}`);
      await this.cacheManager.del(`flow_stats_${flowId}`);
    }
  }
}

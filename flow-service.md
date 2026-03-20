/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prefer-let */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prefer-let */
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
  UpdateFlowItemDto,
  UpdateItemStageDeadlineDto,
  BulkUpdateItemStagesDto,
  MoveItemWithDeadlineDto,
  DeadlineDashboardQueryDto,
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

// --- CONSTANTES ---
const CORTE_KEYWORDS = ['corte', 'cortador', 'cortar', 'cut'];
const MODELAGEM_KEYWORDS = ['modelagem', 'modelista', 'modelo', 'pilotagem'];
const DISTRIBUICAO_KEYWORDS = [
  'distribuição',
  'distribuicao',
  'expedição',
  'expedicao',
];

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);
  private readonly CACHE_TTL = 30000;

  constructor(
    private prisma: PrismaService,
    private readonly cls: ClsService,
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
  // 🔥 MÉTODO PARA VERIFICAR SE UMA ETAPA É DE CORTE
  // ===========================================================================
  private isCorteStage(stageName: string): boolean {
    const name = stageName?.toLowerCase().trim() || '';
    const result = CORTE_KEYWORDS.some((keyword) => name.includes(keyword));
    this.logger.debug(
      `🔍 [isCorteStage] "${stageName}" -> ${result ? 'É CORTE' : 'NÃO É CORTE'}`,
    );
    return result;
  }

  // // ===========================================================================
  // // 🔥 MÉTODO PARA VERIFICAR SE UMA ETAPA É DE MODELAGEM
  // // ===========================================================================
  // private isModelagemStage(stageName: string): boolean {
  //   const name = stageName?.toLowerCase().trim() || '';
  //   return MODELAGEM_KEYWORDS.some((keyword) => name.includes(keyword));
  // }

  // ===========================================================================
  // 🔥 MÉTODO PARA VERIFICAR PERMISSÃO DO CAMPO productRef
  // ===========================================================================
  private async canManageProductRef(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        professionalRole: true,
      },
    });

    if (!user) return false;

    // Admin e Master sempre podem
    if (['MASTER', 'ADMIN'].includes(user.role)) {
      return true;
    }

    // Employee só pode se tiver cargo de modelagem
    if (user.role === 'EMPLOYER') {
      const professionalRole = user.professionalRole?.toLowerCase() || '';
      return MODELAGEM_KEYWORDS.some((keyword) =>
        professionalRole.includes(keyword),
      );
    }

    return false;
  }

  // ===========================================================================
  // 🔥 VALIDA SE O FLUXO POSSUI MODELAGEM E CORTE
  // ===========================================================================
  private async validateModelagemAndCorte(stages: any[]): Promise<void> {
    this.logger.log('🔍 Validando se fluxo possui Modelagem e Corte...');

    let hasModelagem = false;
    let hasCorte = false;

    for (const stage of stages) {
      const stageName = stage.name?.toLowerCase().trim() || '';

      if (!hasModelagem) {
        hasModelagem = MODELAGEM_KEYWORDS.some((keyword) =>
          stageName.includes(keyword),
        );
        if (hasModelagem) {
          this.logger.debug(`✅ Modelagem encontrada: "${stage.name}"`);
        }
      }

      if (!hasCorte) {
        hasCorte = this.isCorteStage(stage.name);
        if (hasCorte) {
          this.logger.debug(`✅ Corte encontrado: "${stage.name}"`);
        }
      }

      if (hasModelagem && hasCorte) break;
    }

    this.logger.log('📊 Resultado da validação:', {
      hasModelagem,
      hasCorte,
      totalStages: stages.length,
      stageNames: stages.map((s) => s.name),
    });

    if (!hasModelagem || !hasCorte) {
      const missing: string[] = [];
      if (!hasModelagem) missing.push('Modelagem');
      if (!hasCorte) missing.push('Corte');

      throw new BadRequestException(
        `❌ Etapas obrigatórias não encontradas: ${missing.join(' e ')}.`,
      );
    }

    this.logger.log('✅ Validação passou: Fluxo possui Modelagem e Corte');
  }

  // ===========================================================================
  // 🔥 MÉTODO PARA VALIDAR QUANTIDADE ANTES DE MOVER
  // ===========================================================================
  private async validateQuantityBeforeMove(
    itemId: string,
    targetStageId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    this.logger.log(
      `🔍 Validando quantidade para movimentação do item ${itemId} para stage ${targetStageId}`,
    );

    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: {
        stage: true,
        flow: {
          include: {
            stages: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        name: true,
      },
    });

    const adminRoles = ['MASTER', 'ADMIN'];
    const isAdmin = user && adminRoles.includes(user.role);

    const targetStage = await this.prisma.flowStage.findFirst({
      where: { id: targetStageId, companyId },
    });

    if (!targetStage) {
      throw new NotFoundException('Etapa destino não encontrada');
    }

    const sortedStages = [...item.flow.stages].sort(
      (a, b) => a.order - b.order,
    );

    const distribuicaoIndex = sortedStages.findIndex((s) =>
      DISTRIBUICAO_KEYWORDS.some((keyword) =>
        s.name.toLowerCase().includes(keyword.toLowerCase()),
      ),
    );

    if (distribuicaoIndex === -1) {
      this.logger.debug(
        'ℹ️ Nenhuma etapa de Distribuição encontrada - pulando validação',
      );
      return;
    }

    const targetStageIndex = sortedStages.findIndex(
      (s) => s.id === targetStageId,
    );

    const isMovingToAfterDistribuicao = targetStageIndex > distribuicaoIndex;

    if (isMovingToAfterDistribuicao) {
      this.logger.log(
        `📋 Item sendo movido para após DISTRIBUIÇÃO (${targetStage.name})`,
      );

      if (item.quantity === null || item.quantity === undefined) {
        throw new BadRequestException(
          isAdmin
            ? '⚠️ Quantidade não definida! Como ADMIN, você precisa definir uma quantidade.'
            : 'Quantidade não definida.',
        );
      }

      const quantityNum = Number(item.quantity);

      if (isNaN(quantityNum)) {
        throw new BadRequestException(
          isAdmin
            ? `⚠️ Quantidade inválida ("${item.quantity}")!`
            : 'Quantidade inválida.',
        );
      }

      if (quantityNum <= 0) {
        this.logger.error(
          `❌ BLOQUEADO: ${isAdmin ? 'Admin' : 'Usuário'} ${user?.name} tentou mover item com quantidade ${quantityNum}`,
        );
        throw new BadRequestException(
          `⚠️ Quantidade deve ser maior que zero para mover para após Distribuição.`,
        );
      }

      this.logger.debug(`✅ Quantidade válida: ${quantityNum}`);
    }
  }

  // ===========================================================================
  // 🟢 GERENCIAMENTO DE TEMPLATES
  // ===========================================================================

  async getTemplates() {
    const companyId = this.getCompanyIdFromContext();
    return this.prisma.flowTemplate.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async saveTemplate(flowId: string, name: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const stages = await this.prisma.flowStage.findMany({
      where: { flowId, flow: { companyId } },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) {
      throw new BadRequestException('Fluxo sem etapas.');
    }

    await this.validateModelagemAndCorte(stages);

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

  async applyTemplate(flowId: string, templateId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Template não encontrado');

    const structure = template.structure as any[];

    await this.validateModelagemAndCorte(
      structure.map((s) => ({ name: s.name })),
    );

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

  // ===========================================================================
  // 🔵 GERENCIAMENTO DE FLUXO
  // ===========================================================================

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

  // ===========================================================================
  // 🟠 GERENCIAMENTO DE ETAPAS
  // ===========================================================================

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

  async getFlowStages(flowId: string) {
    const companyId = this.getCompanyIdFromContext();

    const stages = await this.prisma.flowStage.findMany({
      where: {
        flowId,
        companyId,
      },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        order: true,
        _count: {
          select: { items: true },
        },
      },
    });

    return stages;
  }

  // ===========================================================================
  // 🟡 KANBAN E FILTROS
  // ===========================================================================

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

  async getKanbanBoardByStageName(flowId: string, stageName: string) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(
      `🔍 Filtrando kanban por stage name: "${stageName}" para flow ${flowId}`,
    );

    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId,
      },
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

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    if (!stageName || stageName.trim() === '') {
      return flow;
    }

    const stageNameLower = stageName.trim().toLowerCase();

    const filteredStages = flow.stages
      .filter((stage) => stage.name.toLowerCase().includes(stageNameLower))
      .map((stage) => ({
        ...stage,
        items: stage.items,
      }));

    if (filteredStages.length === 0) {
      this.logger.warn(
        `⚠️ Nenhuma stage encontrada com o nome: "${stageName}"`,
      );
      return {
        ...flow,
        stages: [],
      };
    }

    this.logger.log(
      `✅ Encontradas ${filteredStages.length} stage(s) com o nome "${stageName}"`,
    );

    return {
      ...flow,
      stages: filteredStages,
    };
  }

  async getFilteredKanbanBoard(flowId: string, filters: FlowFilterDto) {
    const companyId = this.getCompanyIdFromContext();

    console.log('\n');
    console.log('='.repeat(80));
    console.log('🔍 [getFilteredKanbanBoard] INICIANDO FILTRAGEM');
    console.log('='.repeat(80));
    console.log('📌 flowId:', flowId);
    console.log('📌 filters:', JSON.stringify(filters, null, 2));

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

    // FILTRO POR NOME DA COLUNA
    if (filters.stageName && filters.stageName.trim() !== '') {
      const stageNameLower = filters.stageName.trim().toLowerCase();

      const matchingStages = board.stages.filter((stage) => {
        const stageName = stage.name.toLowerCase();
        return stageName.includes(stageNameLower);
      });

      if (matchingStages.length === 0) {
        return { ...board, stages: [] };
      }

      const hasOtherFilters = this.hasFilters(filters);

      if (!hasOtherFilters) {
        return { ...board, stages: matchingStages };
      }

      const filteredItems = await this.getFilteredItems(filters);
      const filteredItemIds = new Set(filteredItems.map((item) => item.id));

      const finalStages = matchingStages.map((stage) => ({
        ...stage,
        items: stage.items.filter((item) => filteredItemIds.has(item.id)),
      }));

      return { ...board, stages: finalStages };
    }

    // FILTRO GLOBAL (SEM COLUNA ESPECÍFICA)
    if (!this.hasFilters(filters)) {
      return board;
    }

    const filteredItems = await this.getFilteredItems(filters);
    const filteredItemIds = new Set(filteredItems.map((item) => item.id));

    const filteredStages = board.stages.map((stage) => ({
      ...stage,
      items: stage.items.filter((item) => filteredItemIds.has(item.id)),
    }));

    const stagesWithItems = filteredStages.filter(
      (stage) => stage.items.length > 0,
    );

    return {
      ...board,
      stages: stagesWithItems,
    };
  }

  // ===========================================================================
  // 🔥 FILTROS DE ITENS
  // ===========================================================================

  async getFilteredItemsByFlow(flowId: string, filters: FlowFilterDto) {
    const companyId = this.getCompanyIdFromContext();

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

    if (isOverdue === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      whereClause.AND = [
        { dueDate: { not: null } },
        { dueDate: { lt: today } },
        { status: { not: 'CONCLUIDO' } },
      ];
    }

    if (isUpcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      sevenDaysFromNow.setHours(23, 59, 59, 999);

      whereClause.AND = [
        { dueDate: { not: null } },
        { dueDate: { gte: today, lte: sevenDaysFromNow } },
        { status: { not: 'CONCLUIDO' } },
      ];
    }

    const items = await this.prisma.flowItem.findMany({
      where: whereClause,
      include: {
        stage: { select: { id: true, name: true, order: true, color: true } },
        flow: { select: { id: true, name: true, color: true } },
        supplier: { select: { id: true, name: true, category: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return items;
  }

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

    const whereClause: any = { companyId };

    if (assignedToId) whereClause.assignedToId = assignedToId;
    if (supplierId)
      whereClause.supplierId = supplierId === 'internal' ? null : supplierId;
    if (status) whereClause.status = status;
    if (productRef?.trim()) {
      whereClause.productRef = {
        contains: productRef.trim(),
        mode: 'insensitive',
      };
    }

    if (isUpcoming === 'true') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);
      sevenDaysFromNow.setUTCHours(23, 59, 59, 999);

      whereClause.dueDate = { gte: today, lte: sevenDaysFromNow };
      whereClause.status = { not: 'CONCLUIDO' };
    } else if (isOverdue === 'true') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      whereClause.dueDate = { lt: today };
      whereClause.status = { not: 'CONCLUIDO' };
    } else if (startDate || endDate) {
      const dateField =
        dateType === DateFilterType.DUE_DATE
          ? 'dueDate'
          : 'productionStartedAt';
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);
      whereClause[dateField] = dateFilter;
    }

    const items = await this.prisma.flowItem.findMany({
      where: whereClause,
      include: {
        stage: { select: { id: true, name: true, order: true, color: true } },
        flow: { select: { id: true, name: true, color: true } },
        supplier: { select: { id: true, name: true, category: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        images: { select: { id: true, url: true, filename: true } },
        audios: { select: { id: true, url: true, filename: true } },
        videos: { select: { id: true, url: true, filename: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return items;
  }

  private hasFilters(filters: FlowFilterDto): boolean {
    return !!(
      filters.startDate ||
      filters.endDate ||
      filters.isOverdue === 'true' ||
      filters.isUpcoming === 'true' ||
      filters.assignedToId ||
      filters.supplierId ||
      filters.status ||
      filters.productRef ||
      filters.dateType
    );
  }

  // ===========================================================================
  // 🟢 CRIAÇÃO DE ITENS (SIMPLES) - OTIMIZADO
  // ===========================================================================

  async createFlowItem(flowId: string, userId: string, dto: CreateFlowItemDto) {
    const companyId = this.getCompanyIdFromContext();

    // Validação de permissão para productRef
    if (dto.productRef) {
      const canManage = await this.canManageProductRef(userId, companyId);
      if (!canManage) {
        throw new ForbiddenException(
          'Você não tem permissão para gerenciar a referência do produto.',
        );
      }
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });

    if (!user) {
      throw new ForbiddenException('Usuário não encontrado');
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Validação de duplicidade (apenas se necessário)
        if (dto.title?.trim() || dto.productRef?.trim()) {
          const orConditions: Array<{ title?: string; productRef?: string }> =
            [];

          if (dto.title?.trim()) {
            orConditions.push({ title: dto.title.trim() });
          }

          if (dto.productRef?.trim()) {
            orConditions.push({ productRef: dto.productRef.trim() });
          }

          const existingItem = await tx.flowItem.findFirst({
            where: { companyId, OR: orConditions },
          });

          if (existingItem) {
            if (dto.title && existingItem.title === dto.title.trim()) {
              throw new BadRequestException(
                `Já existe um item com o título "${dto.title}"`,
              );
            }
            if (
              dto.productRef &&
              existingItem.productRef === dto.productRef.trim()
            ) {
              throw new BadRequestException(
                `Já existe um item com a referência "${dto.productRef}"`,
              );
            }
          }
        }

        const flow = await tx.productFlow.findFirst({
          where: { id: flowId, companyId },
        });
        if (!flow) throw new BadRequestException('Fluxo não encontrado');

        const targetStage = dto.stageId
          ? await tx.flowStage.findFirst({
              where: { id: dto.stageId, flowId, companyId },
            })
          : await tx.flowStage.findFirst({
              where: { flowId, companyId },
              orderBy: { order: 'asc' },
            });

        if (!targetStage) {
          throw new BadRequestException('Etapa inválida');
        }

        this.validateStageAccess(user, targetStage);

        const lastItem = await tx.flowItem.findFirst({
          where: { stageId: targetStage.id },
          orderBy: { orderInStage: 'desc' },
          select: { orderInStage: true },
        });

        const orderInStage = (lastItem?.orderInStage ?? -1) + 1;

        const dataToCreate: any = {
          title: dto.title?.trim() ?? 'Sem título',
          flowId,
          companyId,
          stageId: targetStage.id,
          orderInStage,
          enteredAt: new Date(),
          orderNumber: dto.orderNumber?.trim() ?? '',
          productRef: dto.productRef?.trim() ?? '',
          quantity: dto.quantity ?? 1,
          priority: dto.priority ?? 3,
          status: dto.status ?? 'PENDENTE',
          description: dto.description?.trim() ?? null,
          assignedToId: dto.assignedToId ?? null,
          supplierId: dto.supplierId ?? null,
        };

        if (dto.dueDate) dataToCreate.dueDate = new Date(dto.dueDate);
        if (dto.productionStartedAt)
          dataToCreate.productionStartedAt = new Date(dto.productionStartedAt);
        if (dto.deliveryAt) dataToCreate.deliveryAt = new Date(dto.deliveryAt);

        const item = await tx.flowItem.create({ data: dataToCreate });

        await this.auditService.log({
          action: 'CREATE_ITEM',
          entity: 'FLOW_ITEM',
          entityId: item.id,
          userId,
          companyId,
          oldData: null,
          newData: {
            title: item.title,
            productRef: item.productRef,
            quantity: item.quantity,
            status: item.status,
            stageId: item.stageId,
          },
          metadata: { flowId: item.flowId, stageName: targetStage.name },
        });

        await this.invalidateFlowCache(companyId, flowId);
        return item;
      },
      {
        timeout: 10000, // Timeout de 10 segundos para criação do item
        maxWait: 10000,
      },
    );
  }

  // ===========================================================================
  // 🔥 NOVO: CRIAR ITEM COM PRAZOS POR ETAPA (CORRIGIDO)
  // ===========================================================================

  // ===========================================================================
  // 🔥 CRIAR ITEM COM PRAZOS POR ETAPA (CORRIGIDO)
  // ===========================================================================

  async createFlowItemWithStages(
    flowId: string,
    userId: string,
    dto: CreateFlowItemDto,
  ) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(`🎯 Criando item com prazos por etapa no fluxo ${flowId}`);

    // Primeiro cria o item normalmente
    const item = await this.createFlowItem(flowId, userId, dto);

    // Busca todas as etapas do fluxo
    const stages = await this.prisma.flowStage.findMany({
      where: { flowId, companyId },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) {
      return item;
    }

    // Data de início (usa a data de entrada do item ou a data atual)
    const startDate = item.enteredAt || new Date();
    const totalStages = stages.length;

    // Define dias por etapa (padrão ou calculado)
    let daysPerStage = 7; // padrão: 7 dias por etapa

    if (dto.dueDate) {
      const dueDateObj = new Date(dto.dueDate);
      const totalDays = Math.ceil(
        (dueDateObj.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Garante pelo menos 1 dia por etapa
      daysPerStage = Math.max(1, Math.ceil(totalDays / totalStages));

      this.logger.debug(
        `📊 DueDate: ${dto.dueDate}, Total dias: ${totalDays}, Dias por etapa: ${daysPerStage}`,
      );
    }

    // Cria registros de prazo para cada etapa
    const itemStages = await this.prisma.$transaction(
      async (tx) => {
        const created = [];
        let currentDeadline: Date | null = null;

        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];

          // 🔥 CÁLCULO PROGRESSIVO
          const deadline = new Date(startDate);
          deadline.setDate(deadline.getDate() + daysPerStage * (i + 1));

          // Garante que o prazo não seja anterior à data atual
          if (deadline < new Date()) {
            const tempDate = new Date();
            tempDate.setDate(tempDate.getDate() + (i + 1));
            deadline.setTime(tempDate.getTime());
          }

          // Se for a etapa atual, guarda o prazo para atualizar o item
          if (stage.id === item.stageId) {
            currentDeadline = deadline;
          }

          const itemStage = await tx.flowItemStage.create({
            data: {
              itemId: item.id,
              stageId: stage.id,
              companyId,
              order: stage.order,
              status: stage.id === item.stageId ? 'ATUAL' : 'PENDENTE',
              deadline,
              suggestedDeadline: deadline,
              actualDeadline: stage.id === item.stageId ? new Date() : null,
              // 🔥 NOVO: Guarda o prazo sugerido original da etapa
              basedOnSuggestedDeadline: stage.suggestedDeadline,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            include: {
              stage: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  order: true,
                },
              },
            },
          });

          created.push(itemStage as never);

          this.logger.debug(
            `✅ Etapa ${i + 1}/${totalStages}: ${stage.name} - Prazo: ${deadline.toISOString()}`,
          );
        }

        // 🔥 NOVO: Atualiza o dueDate do item com o prazo da etapa atual
        if (currentDeadline) {
          await tx.flowItem.update({
            where: { id: item.id },
            data: {
              dueDate: currentDeadline,
              updatedAt: new Date(),
            },
          });
        }

        return created;
      },
      {
        timeout: 30000,
        maxWait: 30000,
        isolationLevel: 'ReadCommitted',
      },
    );

    this.logger.log(
      `✅ Criados ${itemStages.length} registros de prazo para o item ${item.id}`,
    );

    // Busca o item atualizado com o novo dueDate
    const updatedItem = await this.prisma.flowItem.findUnique({
      where: { id: item.id },
    });

    return {
      ...updatedItem,
      itemStages,
    };
  }

  // ===========================================================================
  // 🔥 GERENCIAMENTO DE PRAZOS POR ETAPA - CORRIGIDO
  // ===========================================================================

  async getItemStages(itemId: string) {
    const companyId = this.getCompanyIdFromContext();

    const itemStages = await this.prisma.flowItemStage.findMany({
      where: {
        itemId,
        companyId,
      },
      include: {
        stage: {
          select: {
            id: true,
            name: true,
            color: true,
            order: true,
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    if (itemStages.length === 0) {
      // Se não tem registros, busca o item e cria automaticamente
      const item = await this.prisma.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: {
          flow: {
            include: {
              stages: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      });

      if (!item) {
        throw new NotFoundException('Item não encontrado');
      }

      // Cria os registros automaticamente com prazos progressivos
      return this.prisma.$transaction(
        async (tx) => {
          const created = [];
          const totalStages = item.flow.stages.length;

          // Define a data base (usa a data de entrada ou data atual)
          const baseDate = item.enteredAt || new Date();
          let currentDeadline: Date | null = null;

          // Se tem dueDate, calcula dias totais disponíveis para distribuir
          let daysPerStage = 7; // padrão: 7 dias por etapa

          if (item.dueDate) {
            const dueDateObj = new Date(item.dueDate);
            const totalDays = Math.ceil(
              (dueDateObj.getTime() - baseDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );

            // Distribui os dias proporcionalmente entre as etapas
            daysPerStage = Math.max(1, Math.ceil(totalDays / totalStages));
          }

          for (let i = 0; i < item.flow.stages.length; i++) {
            const stage = item.flow.stages[i];

            // 🔥 CÁLCULO PROGRESSIVO
            const deadline = new Date(baseDate);
            deadline.setDate(deadline.getDate() + daysPerStage * (i + 1));

            // Se for a etapa atual, guarda o prazo
            if (stage.id === item.stageId) {
              currentDeadline = deadline;
            }

            const itemStage = await tx.flowItemStage.create({
              data: {
                itemId: item.id,
                stageId: stage.id,
                companyId,
                order: stage.order,
                status: stage.id === item.stageId ? 'ATUAL' : 'PENDENTE',
                deadline,
                suggestedDeadline: deadline,
                actualDeadline: stage.id === item.stageId ? new Date() : null,
                // 🔥 NOVO: Guarda o prazo sugerido original da etapa
                basedOnSuggestedDeadline: stage.suggestedDeadline,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              include: {
                stage: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                    order: true,
                  },
                },
              },
            });
            created.push(itemStage as never);
          }

          // 🔥 NOVO: Atualiza o dueDate do item se necessário
          if (
            currentDeadline &&
            item.dueDate?.getTime() !== currentDeadline.getTime()
          ) {
            await tx.flowItem.update({
              where: { id: item.id },
              data: {
                dueDate: currentDeadline,
                updatedAt: new Date(),
              },
            });
          }

          return created;
        },
        {
          timeout: 60000,
          maxWait: 60000,
          isolationLevel: 'ReadCommitted',
        },
      );
    }

    return itemStages;
  }

  async updateItemStageDeadline(
    itemId: string,
    stageId: string,
    dto: UpdateItemStageDeadlineDto,
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const adminRoles = ['MASTER', 'ADMIN'];
    const isAdmin = adminRoles.includes(user.role);

    // Verifica se o item existe
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Se não for admin, verifica se é a etapa atual
    if (!isAdmin) {
      if (item.stageId !== stageId) {
        throw new ForbiddenException(
          'Você só pode atualizar o prazo da etapa atual do item',
        );
      }
    }

    const itemStage = await this.prisma.flowItemStage.findFirst({
      where: {
        itemId,
        stageId,
        companyId,
      },
    });

    if (!itemStage) {
      throw new NotFoundException(
        'Registro de prazo não encontrado para esta etapa',
      );
    }

    // =========================================================================
    // 🔥 VALIDAÇÕES DE DATAS
    // =========================================================================
    const itemCreatedAt = item.createdAt;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dto.suggestedDeadline) {
      const suggestedDate = new Date(dto.suggestedDeadline);

      if (suggestedDate < itemCreatedAt) {
        throw new BadRequestException(
          `Prazo sugerido (${suggestedDate.toLocaleDateString()}) não pode ser anterior à criação do item (${itemCreatedAt.toLocaleDateString()})`,
        );
      }

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (suggestedDate < oneYearAgo) {
        throw new BadRequestException(
          'Prazo sugerido não pode ser há mais de 1 ano atrás',
        );
      }
    }

    if (dto.actualDeadline) {
      const actualDate = new Date(dto.actualDeadline);

      if (actualDate < itemCreatedAt) {
        throw new BadRequestException(
          `Data de conclusão (${actualDate.toLocaleDateString()}) não pode ser anterior à criação do item (${itemCreatedAt.toLocaleDateString()})`,
        );
      }

      if (dto.status === 'CONCLUIDO' && actualDate > new Date()) {
        throw new BadRequestException(
          'Data de conclusão não pode ser no futuro',
        );
      }
    }

    if (dto.status === 'CONCLUIDO' && !dto.actualDeadline) {
      throw new BadRequestException(
        'Para marcar uma etapa como CONCLUIDO, é necessário informar a data real de conclusão (actualDeadline)',
      );
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (dto.suggestedDeadline !== undefined) {
      updateData.suggestedDeadline = new Date(dto.suggestedDeadline);
      updateData.deadline = new Date(dto.suggestedDeadline);
    }

    if (dto.actualDeadline !== undefined) {
      updateData.actualDeadline = new Date(dto.actualDeadline);
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    const updated = await this.prisma.flowItemStage.update({
      where: { id: itemStage.id },
      data: updateData,
      include: {
        stage: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    // 🔥 NOVO: Se a etapa atual foi atualizada, sincroniza o dueDate do item
    if (item.stageId === stageId && dto.suggestedDeadline) {
      await this.prisma.flowItem.update({
        where: { id: itemId },
        data: {
          dueDate: new Date(dto.suggestedDeadline),
          updatedAt: new Date(),
        },
      });
    }

    await this.auditService.log({
      action: 'UPDATE_ITEM_STAGE_DEADLINE',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      metadata: {
        stageId,
        stageName: updated.stage.name,
        oldSuggestedDeadline: itemStage.suggestedDeadline,
        newSuggestedDeadline: updated.suggestedDeadline,
        oldActualDeadline: itemStage.actualDeadline,
        newActualDeadline: updated.actualDeadline,
        oldStatus: itemStage.status,
        newStatus: updated.status,
        isAdmin,
      },
    });

    return updated;
  }

  async bulkUpdateItemStages(
    itemId: string,
    updates: BulkUpdateItemStagesDto['updates'],
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const adminRoles = ['MASTER', 'ADMIN'];
    const isAdmin = adminRoles.includes(user.role);

    if (!isAdmin) {
      throw new ForbiddenException(
        'Apenas administradores podem atualizar múltiplos prazos',
      );
    }

    // Busca o item para validar datas
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    const results = [];
    const errors = [] as any;

    // Processa cada update individualmente (não em transação)
    for (const update of updates) {
      try {
        // Valida se o stageId é um UUID válido
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(update.stageId)) {
          throw new BadRequestException(
            `ID de etapa inválido: ${update.stageId}`,
          );
        }

        const itemStage = await this.prisma.flowItemStage.findFirst({
          where: {
            itemId,
            stageId: update.stageId,
            companyId,
          },
        });

        if (!itemStage) {
          errors.push({
            stageId: update.stageId,
            error: 'Registro de prazo não encontrado para esta etapa',
          });
          continue;
        }

        // =========================================================================
        // 🔥 VALIDAÇÕES DE DATAS (copiadas do update individual)
        // =========================================================================
        const itemCreatedAt = item.createdAt;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (update.suggestedDeadline) {
          const suggestedDate = new Date(update.suggestedDeadline);

          if (suggestedDate < itemCreatedAt) {
            throw new BadRequestException(
              `Prazo sugerido (${suggestedDate.toLocaleDateString()}) não pode ser anterior à criação do item (${itemCreatedAt.toLocaleDateString()})`,
            );
          }

          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          if (suggestedDate < oneYearAgo) {
            throw new BadRequestException(
              'Prazo sugerido não pode ser há mais de 1 ano atrás',
            );
          }
        }

        if (update.actualDeadline) {
          const actualDate = new Date(update.actualDeadline);

          if (actualDate < itemCreatedAt) {
            throw new BadRequestException(
              `Data de conclusão (${actualDate.toLocaleDateString()}) não pode ser anterior à criação do item`,
            );
          }

          if (update.status === 'CONCLUIDO' && actualDate > new Date()) {
            throw new BadRequestException(
              'Data de conclusão não pode ser no futuro',
            );
          }
        }

        if (update.status === 'CONCLUIDO' && !update.actualDeadline) {
          throw new BadRequestException(
            'Para marcar uma etapa como CONCLUIDO, é necessário informar a data real de conclusão',
          );
        }

        const updateData: any = {
          updatedAt: new Date(),
        };

        if (update.suggestedDeadline !== undefined) {
          updateData.suggestedDeadline = new Date(update.suggestedDeadline);
          updateData.deadline = new Date(update.suggestedDeadline);
        }

        if (update.actualDeadline !== undefined) {
          updateData.actualDeadline = new Date(update.actualDeadline);
        }

        if (update.status !== undefined) {
          updateData.status = update.status;
        }

        if (update.notes !== undefined) {
          updateData.notes = update.notes;
        }

        const updated = await this.prisma.flowItemStage.update({
          where: { id: itemStage.id },
          data: updateData,
          include: {
            stage: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        });

        results.push(updated as never);
      } catch (error) {
        errors.push({
          stageId: update.stageId,
          error: error.message,
        });
      }
    }

    await this.auditService.log({
      action: 'BULK_UPDATE_ITEM_STAGES',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      metadata: {
        updatesCount: updates.length,
        successfulUpdates: results.length,
        failedUpdates: errors.length,
        errors,
      },
    });

    // Se houver erros, retorna parcial com aviso
    if (errors.length > 0) {
      return {
        success: false,
        message: `${results.length} atualizações feitas, ${errors.length} falhas`,
        results,
        errors,
      };
    }

    return results;
  }

  async recalculateItemDeadlines(itemId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: {
        flow: {
          include: {
            stages: {
              orderBy: { order: 'asc' },
            },
          },
        },
        itemStages: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Se não tem prazo final definido, não recalcula
    if (!item.dueDate) {
      throw new BadRequestException('Item não possui prazo final definido');
    }

    const stages = item.flow.stages;
    const totalStages = stages.length;
    const now = new Date();
    const dueDate = new Date(item.dueDate);

    // Calcula dias totais disponíveis
    const totalDays = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (totalDays <= 0) {
      throw new BadRequestException('Prazo final já expirou');
    }

    // Distribui os dias proporcionalmente
    const daysPerStage = Math.ceil(totalDays / totalStages);

    const updates = [];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const itemStage = item.itemStages.find((is) => is.stageId === stage.id);

      if (itemStage) {
        const suggestedDeadline = new Date(now);
        suggestedDeadline.setDate(
          suggestedDeadline.getDate() + daysPerStage * (i + 1),
        );

        const updated = await this.prisma.flowItemStage.update({
          where: { id: itemStage.id },
          data: {
            suggestedDeadline,
            updatedAt: new Date(),
          },
          include: {
            stage: {
              select: { id: true, name: true },
            },
          },
        });

        updates.push(updated as never);
      }
    }

    await this.auditService.log({
      action: 'RECALCULATE_ITEM_DEADLINES',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      metadata: {
        totalStages,
        totalDays,
        daysPerStage,
      },
    });

    return {
      itemId,
      recalculated: updates.length,
      stages: updates,
    };
  }

  async moveItemWithDeadline(
    itemId: string,
    dto: MoveItemWithDeadlineDto,
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(`🎯 Movendo item ${itemId} com atualização de prazo`);

    const {
      newStageId,
      newOrder,
      selectedResponsibleId,
      selectedSupplierId,
      newQuantity,
    } = dto;

    // Move o item
    const movedItem = await this.moveItem(
      itemId,
      newStageId,
      userId,
      newOrder,
      selectedResponsibleId,
      selectedSupplierId,
      newQuantity,
    );

    // Atualiza os prazos
    const itemStage = await this.prisma.flowItemStage.findFirst({
      where: { itemId, stageId: newStageId, companyId },
    });

    if (itemStage) {
      await this.prisma.flowItemStage.update({
        where: { id: itemStage.id },
        data: {
          status: 'ATUAL',
          actualDeadline: new Date(),
          updatedAt: new Date(),
        },
      });

      await this.prisma.flowItem.update({
        where: { id: itemId },
        data: {
          dueDate: itemStage.deadline,
          updatedAt: new Date(),
        },
      });

      // Marca etapas anteriores como concluídas
      const currentStage = await this.prisma.flowStage.findFirst({
        where: { id: newStageId, companyId },
      });

      if (currentStage) {
        const previousStages = await this.prisma.flowItemStage.findMany({
          where: {
            itemId,
            companyId,
            order: { lt: currentStage.order },
          },
        });

        for (const prevStage of previousStages) {
          if (prevStage.status !== 'CONCLUIDO') {
            await this.prisma.flowItemStage.update({
              where: { id: prevStage.id },
              data: {
                status: 'CONCLUIDO',
                actualDeadline: prevStage.actualDeadline || new Date(),
                updatedAt: new Date(),
              },
            });
          }
        }
      }
    }

    // ✅ Retorna o movedItem (já temos todas as informações)
    return movedItem;
  }

  // ===========================================================================
  // 🔥 DASHBOARD DE PRAZOS - CORRIGIDO (USANDO DTO COMPLETO)
  // ===========================================================================

  async getDeadlineDashboard(query: DeadlineDashboardQueryDto) {
    const companyId = this.getCompanyIdFromContext();

    const { flowId, period } = query;

    this.logger.log(
      `📊 Buscando dashboard de prazos - flowId: ${flowId}, period: ${period}`,
    );

    // =========================================================================
    // 🔥 CONSTRUIR WHERE CLAUSE COM FILTROS
    // =========================================================================
    const where: any = { companyId };

    // Filtro por fluxo específico
    if (flowId) {
      where.flowId = flowId;
    }

    // =========================================================================
    // 🔥 APLICAR FILTRO DE PERÍODO
    // =========================================================================
    let startDate: Date | null = null;
    const now = new Date();

    if (period && period !== 'all') {
      switch (period) {
        case 'today':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          startDate.setHours(0, 0, 0, 0);
          break;
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
      }

      // Aplica filtro de data no where
      where.createdAt = {
        gte: startDate,
      };

      this.logger.debug(
        `📅 Período filtrado: ${period} - desde ${startDate.toISOString()}`,
      );
    }

    // =========================================================================
    // 🔥 BUSCAR ITENS COM SEUS PRAZOS
    // =========================================================================
    const items = await this.prisma.flowItem.findMany({
      where,
      include: {
        flow: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        stage: {
          select: {
            id: true,
            name: true,
            order: true,
          },
        },
        itemStages: {
          include: {
            stage: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.log(`📊 Encontrados ${items.length} itens para análise`);

    // =========================================================================
    // 🔥 CALCULAR ESTATÍSTICAS
    // =========================================================================
    const now_date = new Date();
    const totalItems = items.length;
    let itemsComPrazo = 0;
    let itemsAtrasados = 0;
    let itemsHoje = 0;
    let itemsSemana = 0;
    let itemsConcluidos = 0;

    // Timeline de prazos
    const timeline: any[] = [];

    // Estatísticas por fluxo
    const byFlow: Record<string, number> = {};

    // Estatísticas por responsável
    const byResponsible: Record<string, number> = {};

    // Estatísticas por etapa
    const byStage: Record<string, number> = {};

    items.forEach((item) => {
      // Contagem por fluxo
      const flowName = item.flow?.name || 'Sem fluxo';
      byFlow[flowName] = (byFlow[flowName] || 0) + 1;

      // Contagem por responsável (se houver)
      if (item.assignedToId) {
        // Nota: Para pegar o nome do responsável, precisaria incluir no findMany
        // Como não incluímos, usamos o ID como chave
        byResponsible[item.assignedToId] =
          (byResponsible[item.assignedToId] || 0) + 1;
      } else {
        byResponsible['Não atribuído'] =
          (byResponsible['Não atribuído'] || 0) + 1;
      }

      // Contagem por etapa atual
      const stageName = item.stage?.name || 'Sem etapa';
      byStage[stageName] = (byStage[stageName] || 0) + 1;

      // Itens concluídos
      if (item.status === 'CONCLUIDO') {
        itemsConcluidos++;
      }

      // Análise de prazos
      if (item.dueDate) {
        itemsComPrazo++;
        const dueDate = new Date(item.dueDate);

        // Verifica atraso (itens não concluídos com prazo vencido)
        if (dueDate < now_date && item.status !== 'CONCLUIDO') {
          itemsAtrasados++;
        }

        // Verifica se é hoje
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDateDay = new Date(dueDate);
        dueDateDay.setHours(0, 0, 0, 0);

        if (dueDateDay.getTime() === today.getTime()) {
          itemsHoje++;
        }

        // Verifica se é na semana
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);

        if (dueDateDay >= today && dueDateDay <= weekFromNow) {
          itemsSemana++;
        }

        // Adiciona à timeline (apenas para itens não concluídos ou com prazo relevante)
        if (item.status !== 'CONCLUIDO' || dueDate >= now_date) {
          timeline.push({
            date: dueDate,
            itemId: item.id,
            title: item.title,
            productRef: item.productRef,
            flowName: item.flow?.name,
            flowColor: item.flow?.color,
            stageName: item.stage?.name,
            status: item.status,
            quantity: item.quantity,
            type: 'item_due_date',
          });
        }
      }

      // Adiciona prazos das etapas à timeline
      if (item.itemStages && item.itemStages.length > 0) {
        item.itemStages.forEach((stage) => {
          if (stage.suggestedDeadline) {
            // Só adiciona se for uma data futura ou se a etapa não estiver concluída
            if (
              stage.status !== 'CONCLUIDO' ||
              stage.suggestedDeadline >= now_date
            ) {
              timeline.push({
                date: stage.suggestedDeadline,
                itemId: item.id,
                title: `${item.title} - ${stage.stage.name}`,
                productRef: item.productRef,
                flowName: item.flow?.name,
                flowColor: item.flow?.color,
                stageName: stage.stage.name,
                stageColor: stage.stage.color,
                status: stage.status,
                quantity: item.quantity,
                type: 'stage_deadline',
                isItemStage: true,
              });
            }
          }

          // Contagem de etapas por status para estatísticas adicionais
          if (stage.status === 'ATRASADO') {
            // Poderia incrementar contador de etapas atrasadas
          }
        });
      }
    });

    // =========================================================================
    // 🔥 ORDENAR TIMELINE POR DATA
    // =========================================================================
    timeline.sort((a, b) => a.date.getTime() - b.date.getTime());

    // =========================================================================
    // 🔥 CALCULAR MÉTRICAS ADICIONAIS
    // =========================================================================
    const percentualConclusao =
      totalItems > 0 ? Math.round((itemsConcluidos / totalItems) * 100) : 0;

    const percentualAtraso =
      itemsComPrazo > 0
        ? Math.round((itemsAtrasados / itemsComPrazo) * 100)
        : 0;

    // Calcular tempo médio de produção (para itens concluídos)
    let tempoMedioProducao = 0;
    const itensConcluidosComData = items.filter(
      (item) =>
        item.status === 'CONCLUIDO' &&
        item.productionStartedAt &&
        item.updatedAt,
    );

    if (itensConcluidosComData.length > 0) {
      const somaDias = itensConcluidosComData.reduce((acc, item) => {
        const inicio = new Date(item.productionStartedAt!);
        const fim = new Date(item.updatedAt);
        const dias = Math.ceil(
          (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24),
        );
        return acc + dias;
      }, 0);
      tempoMedioProducao = Math.round(somaDias / itensConcluidosComData.length);
    }

    // =========================================================================
    // 🔥 MONTAR RESPOSTA
    // =========================================================================
    return {
      summary: {
        totalItems,
        itemsComPrazo,
        itemsAtrasados,
        itemsHoje,
        itemsSemana,
        itemsConcluidos,
        percentualConclusao,
        percentualAtraso,
        tempoMedioProducao,
      },
      charts: {
        byFlow,
        byResponsible,
        byStage,
      },
      timeline: timeline.slice(0, 100), // Limita a 100 itens na timeline
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        productRef: item.productRef,
        quantity: item.quantity,
        orderNumber: item.orderNumber,
        flowId: item.flowId,
        flowName: item.flow?.name,
        flowColor: item.flow?.color,
        stageId: item.stageId,
        stageName: item.stage?.name,
        stageOrder: item.stage?.order,
        dueDate: item.dueDate,
        status: item.status,
        assignedToId: item.assignedToId,
        supplierId: item.supplierId,
        productionStartedAt: item.productionStartedAt,
        enteredAt: item.enteredAt,
        completedAt: item.status === 'CONCLUIDO' ? item.updatedAt : null,
        itemStages: item.itemStages.map((stage) => ({
          id: stage.id,
          stageId: stage.stageId,
          stageName: stage.stage.name,
          stageColor: stage.stage.color,
          stageOrder: stage.order,
          deadline: stage.deadline,
          suggestedDeadline: stage.suggestedDeadline,
          actualDeadline: stage.actualDeadline,
          status: stage.status,
          notes: stage.notes,
          isCurrentStage: stage.stageId === item.stageId,
        })),
      })),
      filters: {
        flowId: flowId || 'todos',
        period: period || 'week',
        appliedDateFilter: startDate
          ? {
              from: startDate.toISOString(),
              to: new Date().toISOString(),
            }
          : null,
      },
      metadata: {
        totalStagesCount: items.reduce(
          (acc, item) => acc + (item.itemStages?.length || 0),
          0,
        ),
        averageStagesPerItem:
          items.length > 0
            ? Math.round(
                (items.reduce(
                  (acc, item) => acc + (item.itemStages?.length || 0),
                  0,
                ) /
                  items.length) *
                  10,
              ) / 10
            : 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ===========================================================================
  // 🔥 ATUALIZAR ITEM
  // ===========================================================================

  async updateFlowItem(
    itemId: string,
    userId: string,
    data: UpdateFlowItemDto,
  ) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(`📝 Atualizando item ${itemId} pelo usuário ${userId}`);

    const [item, user] = await Promise.all([
      this.prisma.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: { stage: true, assignedTo: true, supplier: true },
      }),
      this.prisma.user.findFirst({
        where: { id: userId, companyId },
      }),
    ]);

    if (!item) throw new NotFoundException('Item não encontrado');
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Validação de permissão para productRef
    if (data.productRef !== undefined && data.productRef !== item.productRef) {
      const canManage = await this.canManageProductRef(userId, companyId);
      if (!canManage) {
        throw new ForbiddenException(
          'Você não tem permissão para alterar a referência do produto.',
        );
      }
    }

    // Validação de duplicidade
    if (data.title || data.productRef) {
      const orConditions: any[] = [];

      if (data.title && data.title !== item.title) {
        orConditions.push({ title: data.title });
      }

      if (data.productRef && data.productRef !== item.productRef) {
        orConditions.push({ productRef: data.productRef });
      }

      if (orConditions.length > 0) {
        const existingItem = await this.prisma.flowItem.findFirst({
          where: { companyId, NOT: { id: itemId }, OR: orConditions },
        });

        if (existingItem) {
          if (existingItem.title === data.title) {
            throw new BadRequestException(
              `Já existe outro item com o título "${data.title}"`,
            );
          } else if (
            data.productRef &&
            existingItem.productRef === data.productRef
          ) {
            throw new BadRequestException(
              `Já existe outro item com a referência "${data.productRef}"`,
            );
          }
        }
      }
    }

    const adminRoles = ['MASTER', 'ADMIN'];
    const isAdmin = adminRoles.includes(user.role);

    if (!isAdmin) {
      this.validateStageAccess(user, item.stage!);
    }

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
      if (updateData[key] === undefined) delete updateData[key];
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

    const changedFields = Object.keys(updateData).filter((key) => {
      if (key === 'updatedAt') return false;
      const oldValue = oldData[key as keyof typeof oldData];
      const newValue = updateData[key];
      return JSON.stringify(oldValue) !== JSON.stringify(newValue);
    });

    const oldChangedData: Record<string, any> = {};
    const newChangedData: Record<string, any> = {};

    changedFields.forEach((field) => {
      oldChangedData[field] = oldData[field as keyof typeof oldData];
      newChangedData[field] = updateData[field];
    });

    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    await this.auditService.log({
      action: 'UPDATE_ITEM',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      oldData: oldChangedData,
      newData: newChangedData,
      metadata: {
        isAdmin,
        adminRole: isAdmin ? user.role : undefined,
        userId: user.id,
        userName: user.name,

        // Informações da mudança
        changedFields,
        totalChanged: changedFields.length,
        timestamp: new Date().toISOString(),

        // Informações adicionais (opcional)
        entityId: itemId,
        entityType: 'FLOW_ITEM',
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return updated;
  }

  // ===========================================================================
  // 🔥 MOVER ITEM (ORIGINAL)
  // ===========================================================================

  async moveItem(
    itemId: string,
    newStageId: string,
    userId: string,
    newOrder?: number,
    selectedResponsibleId?: string,
    selectedSupplierId?: string,
    newQuantity?: number,
  ) {
    const startTime = Date.now();

    this.logger.log('🎯 [MOVE_ITEM] ========================================');

    let flowId: string | undefined;
    let isLastStage = false;

    const result = await this.executeWithResilience('move_item', async () => {
      return this.prisma.$transaction(
        async (tx) => {
          const companyId = this.cls.get<string>('tenantId');
          if (!companyId)
            throw new ForbiddenException('Empresa não identificada');

          if (newQuantity !== undefined) {
            await tx.flowItem.update({
              where: { id: itemId },
              data: { quantity: newQuantity },
            });
          }

          const user = await tx.user.findFirst({
            where: { id: userId, companyId, status: 'ACTIVE' },
            select: {
              id: true,
              role: true,
              name: true,
              professionalRole: true,
            },
          });

          if (!user) throw new NotFoundException('Usuário não encontrado');

          const adminRoles = ['MASTER', 'ADMIN', 'MANAGER'];
          const isAdmin = adminRoles.includes(user.role);

          await this.validateQuantityBeforeMove(
            itemId,
            newStageId,
            companyId,
            userId,
          );

          const [item, nextStage, allStages] = await Promise.all([
            tx.flowItem.findFirst({
              where: { id: itemId, companyId },
              include: {
                stage: true,
                assignedTo: true,
                supplier: true,
                flow: { select: { id: true, name: true,
                    color: true, } },
              },
            }),
            tx.flowStage.findFirst({ where: { id: newStageId, companyId } }),
            tx.flowStage.findMany({
              where: {
                flowId: (
                  await tx.flowItem.findUnique({ where: { id: itemId } })
                )?.flowId,
              },
              orderBy: { order: 'desc' },
            }),
          ]);

          if (!item) throw new NotFoundException('Item não encontrado');
          if (!nextStage)
            throw new NotFoundException('Etapa destino não encontrada');

          flowId = item.flowId;
          const lastStage = allStages[0];
          isLastStage = newStageId === lastStage?.id;

          if (!isAdmin) {
            this.validateStageAccess(user, item.stage!);
          }

          const oldStageId = item.stageId;
          const oldAssignedToId = item.assignedToId;
          const oldSupplierId = item.supplierId;

          const isOficina = nextStage.name.trim().toLowerCase() === 'oficina';

          if (!isAdmin) {
            if (isOficina) {
              if (!selectedSupplierId) {
                throw new BadRequestException(
                  'É obrigatório selecionar uma oficina',
                );
              }
              if (selectedResponsibleId) {
                throw new BadRequestException(
                  'Não é permitido atribuir funcionário para oficina',
                );
              }
            } else {
              if (selectedSupplierId) {
                throw new BadRequestException(
                  'Não é permitido atribuir oficina para colunas que não sejam "Oficina"',
                );
              }
            }
          }

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

          const updateData: any = {
            stageId: newStageId,
            orderInStage: finalOrder,
            updatedAt: new Date(),
          };

          if (isAdmin) {
            if (selectedResponsibleId) {
              updateData.assignedToId = selectedResponsibleId;
              updateData.supplierId = null;
            }
            if (selectedSupplierId) {
              updateData.supplierId = selectedSupplierId;
              updateData.assignedToId = null;
            }
          } else {
            if (isOficina) {
              updateData.assignedToId = null;
              updateData.supplierId = selectedSupplierId;
            } else {
              updateData.supplierId = null;
              if (selectedResponsibleId) {
                updateData.assignedToId = selectedResponsibleId;
              }
            }
          }

          const updated = await tx.flowItem.update({
            where: { id: itemId },
            data: updateData,
            include: {
              assignedTo: { select: { id: true, name: true } },
              supplier: { select: { id: true, name: true } },
            },
          });

          const metadata: any = {
            fromStageId: oldStageId,
            fromStageName: item.stage?.name,
            toStageId: newStageId,
            toStageName: nextStage.name,
            newOrder: finalOrder,
            isOficina,
            isAdmin,
            adminRole: isAdmin ? user.role : undefined,
            executionTimeMs: Date.now() - startTime,
          };

          if (isOficina) {
            metadata.oldSupplierId = oldSupplierId;
            metadata.newSupplierId = selectedSupplierId;
            metadata.newSupplierName = updated.supplier?.name;
          } else {
            metadata.oldResponsibleId = oldAssignedToId;
            metadata.newResponsibleId = selectedResponsibleId;
            metadata.newResponsibleName = updated.assignedTo?.name;
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

          try {
            this.moveCounter.inc({
              operation: 'move',
              status: 'success',
              from_stage: oldStageId || 'unknown',
              to_stage: newStageId,
              is_admin: String(isAdmin),
            });
          } catch (metricError) {
            this.logger.error(
              `Erro ao incrementar métrica: ${metricError.message}`,
            );
          }

          return updated;
        },
        { timeout: 30000, maxWait: 30000, isolationLevel: 'ReadCommitted' },
      );
    });

    if (isLastStage && flowId) {
      const companyId = this.cls.get<string>('tenantId');
      this.logger.log(
        `⏰ Agendando conclusão para item ${itemId} em 3 segundos`,
      );

      setTimeout(async () => {
        try {
          if (companyId) {
            await this.completeItemAfterDelay(itemId, userId, companyId);
          }
        } catch (error) {
          this.logger.error(
            `❌ Erro ao concluir item agendado ${itemId}:`,
            error,
          );
        }
      }, 3000);
    }

    return result;
  }

  // ===========================================================================
  // 🔥 AVANÇAR ITEM PARA PRÓXIMA ETAPA
  // ===========================================================================

  async advanceItemToNextStage(itemId: string, userId: string) {
    const companyId = this.cls.get<string>('tenantId');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: { stage: true, assignedTo: true },
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

      let newAssignedToId = item.assignedToId;

      if (
        nextStage.allowedRole &&
        nextStage.allowedRole.trim() !== '' &&
        nextStage.allowedRole !== 'all' &&
        nextStage.allowedRole !== 'null'
      ) {
        const responsibleId = await this.findResponsibleByRole(
          companyId!,
          nextStage.allowedRole,
        );
        if (responsibleId) newAssignedToId = responsibleId;
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
        include: { assignedTo: { select: { id: true, name: true } } },
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
        companyId: companyId!,
        metadata,
      });

      await this.invalidateFlowCache(companyId!, item.flowId);
      return updated;
    });
  }

  // ===========================================================================
  // 🔥 CONCLUIR ITEM APÓS DELAY
  // ===========================================================================

  private async completeItemAfterDelay(
    itemId: string,
    userId: string,
    companyId: string,
  ) {
    this.logger.log(`⏰ Executando conclusão agendada para item ${itemId}`);

    return this.executeWithResilience('complete_item', async () => {
      return this.prisma.$transaction(async (tx) => {
        const item = await tx.flowItem.findFirst({
          where: { id: itemId, companyId },
          include: {
            flow: { select: { id: true, name: true } },
            stage: { select: { id: true, name: true, order: true } },
          },
        });

        if (!item) {
          this.logger.warn(`Item ${itemId} não encontrado`);
          return;
        }

        const lastStage = await tx.flowStage.findFirst({
          where: { flowId: item.flowId },
          orderBy: { order: 'desc' },
        });

        if (!lastStage) return;

        if (item.stageId !== lastStage.id) {
          this.logger.log(`Item ${itemId} não está mais na última etapa`);
          return;
        }

        if (item.status === 'CONCLUIDO') {
          this.logger.log(`Item ${itemId} já está concluído`);
          return;
        }

        const updatedItem = await tx.flowItem.update({
          where: { id: itemId },
          data: { status: 'CONCLUIDO', updatedAt: new Date() },
        });

        this.logger.log(`✅ Item ${itemId} concluído com sucesso!`);

        await this.auditService.log({
          action: 'COMPLETE_ITEM',
          entity: 'FLOW_ITEM',
          entityId: itemId,
          userId,
          companyId,
          metadata: {
            flowId: item.flowId,
            flowName: item.flow?.name,
            productRef: item.productRef,
            stageId: item.stageId,
            stageName: item.stage?.name,
            completedAfter: '3s delay',
          },
        });

        await this.invalidateFlowCache(companyId, item.flowId);
        return updatedItem;
      });
    });
  }

  // ===========================================================================
  // 🔥 DELETAR ITEM
  // ===========================================================================

  async deleteItem(itemId: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { images: true, audios: true, videos: true, itemStages: true },
    });

    if (!item) throw new NotFoundException();

    await this.cleanUpFlowFiles([item]);

    // Deleta registros de prazos primeiro
    if (item.itemStages.length > 0) {
      await this.prisma.flowItemStage.deleteMany({
        where: { itemId },
      });
    }

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
        stagesCount: item.itemStages.length,
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return { success: true };
  }

  // ===========================================================================
  // 🔥 ITENS CONCLUÍDOS (DASHBOARD)
  // ===========================================================================

  async getCompletedItems(options?: {
    page?: number;
    limit?: number;
    flowId?: string;
    startDate?: Date;
    endDate?: Date;
    productRef?: string;
    assignedToId?: string;
    supplierId?: string;
  }) {
    const companyId = this.getCompanyIdFromContext();

    console.log('\n' + '='.repeat(80));
    console.log('📊 [GET_COMPLETED_ITEMS] ========================');

    const where: any = { companyId, status: 'CONCLUIDO' };

    if (options?.flowId) where.flowId = options.flowId;
    if (options?.productRef) {
      where.productRef = { contains: options.productRef, mode: 'insensitive' };
    }
    if (options?.assignedToId) where.assignedToId = options.assignedToId;
    if (options?.supplierId) where.supplierId = options.supplierId;

    if (options?.startDate || options?.endDate) {
      where.updatedAt = {};
      if (options.startDate) where.updatedAt.gte = options.startDate;
      if (options.endDate) where.updatedAt.lte = options.endDate;
    }

    const total = await this.prisma.flowItem.count({ where });

    const page = options?.page || 1;
    const limit = options?.limit || 100;
    const skip = (page - 1) * limit;

    const items = await this.prisma.flowItem.findMany({
      where,
      include: {
        flow: { select: { id: true, name: true, color: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        supplier: { select: { id: true, name: true, category: true } },
        stage: { select: { id: true, name: true, order: true } },
        images: { take: 1, select: { id: true, url: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    });

    const formattedItems = items.map((item) => ({
      id: item.id,
      title: item.title,
      productRef: item.productRef,
      quantity: item.quantity,
      orderNumber: item.orderNumber,
      description: item.description,
      flowId: item.flowId,
      flowName: item.flow?.name,
      flowColor: item.flow?.color || '#D35400',
      assignedToId: item.assignedToId,
      assignedToName: item.assignedTo?.name,
      supplierId: item.supplierId,
      supplierName: item.supplier?.name,
      completedAt: item.updatedAt,
      dueDate: item.dueDate,
      productionStartedAt: item.productionStartedAt,
      enteredAt: item.enteredAt,
      stageId: item.stageId,
      stageName: item.stage?.name,
      productionTime: item.productionStartedAt
        ? this.calculateProductionDays(item.productionStartedAt, item.updatedAt)
        : null,
      wasOverdue: item.dueDate
        ? new Date(item.dueDate) < item.updatedAt
        : false,
      delayDays:
        item.dueDate && new Date(item.dueDate) < item.updatedAt
          ? Math.ceil(
              (item.updatedAt.getTime() - new Date(item.dueDate).getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : 0,
      imageUrl: item.images[0]?.url,
    }));

    const result = {
      data: formattedItems,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      limit,
    };

    return result;
  }

  async getCompletionStats(
    period: 'today' | 'week' | 'month' | 'year' = 'week',
  ) {
    const companyId = this.getCompanyIdFromContext();

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const completedItems = await this.prisma.flowItem.findMany({
      where: {
        companyId,
        status: 'CONCLUIDO',
        updatedAt: { gte: startDate },
      },
      include: {
        flow: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    const totalCompleted = completedItems.length;

    const byFlow = completedItems.reduce(
      (acc, item) => {
        const flowName = item.flow?.name || 'Sem fluxo';
        acc[flowName] = (acc[flowName] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const byResponsible = completedItems.reduce(
      (acc, item) => {
        const name = item.assignedTo?.name || 'Não atribuído';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const itemsWithProductionTime = completedItems.filter(
      (item) => item.productionStartedAt,
    );

    const avgProductionTime =
      itemsWithProductionTime.length > 0
        ? itemsWithProductionTime.reduce((sum, item) => {
            const days = this.calculateProductionDays(
              item.productionStartedAt!,
              item.updatedAt,
            );
            return sum + days;
          }, 0) / itemsWithProductionTime.length
        : 0;

    const overdueCount = completedItems.filter(
      (item) => item.dueDate && new Date(item.dueDate) < item.updatedAt,
    ).length;

    return {
      period,
      startDate,
      endDate: new Date(),
      total: totalCompleted,
      byFlow,
      byResponsible,
      averages: {
        productionTime: Math.round(avgProductionTime * 10) / 10,
        perDay: Math.round((totalCompleted / 7) * 10) / 10,
      },
      overdue: {
        count: overdueCount,
        percentage:
          totalCompleted > 0
            ? Math.round((overdueCount / totalCompleted) * 100)
            : 0,
      },
    };
  }

  private calculateProductionDays(startDate: Date, endDate: Date): number {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  // ===========================================================================
  // 📁 MÍDIAS
  // ===========================================================================

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
      if (media.url) {
        await this.supabase
          .deleteFlowFile(media.url)
          .catch((e) => this.logger.error(e));
      }

      await model.delete({ where: { id: mediaId } });

      await this.auditService.log({
        action: `DELETE_${type.toUpperCase()}`,
        entity: 'FLOW_ITEM',
        entityId: itemId,
        userId,
        companyId,
        metadata: { mediaId, filename: media.filename, url: media.url, type },
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
      for (const m of allMedia) {
        if (m.url) await this.supabase.deleteFlowFile(m.url);
      }
    }
  }

  // ===========================================================================
  // 🔧 MÉTODOS AUXILIARES
  // ===========================================================================

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

    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        professionalRole: { contains: allowedRole, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });

    return users.length > 0 ? users[0].id : null;
  }

  private validateStageAccess(
    user: { role: string; professionalRole: string | null },
    stage: { name: string; allowedRole: string | null },
  ) {
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
          error instanceof NotFoundException ||
          error instanceof BadRequestException
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

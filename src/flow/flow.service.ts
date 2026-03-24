/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { differenceInCalendarDays } from 'date-fns'; // Certifique-se de ter date-fns instalado

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

  async createStage(flowId: string, data: CreateStageDto, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    const lastStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'desc' },
    });

    const stage = await this.prisma.flowStage.create({
      data: {
        name: data.name,
        color: data.color,
        order: (lastStage?.order ?? -1) + 1,
        flowId,
        companyId,
        allowedRole: data.allowedRole || null,
        defaultDays: data.defaultDays ?? 1, // 🔥 NOVO CAMPO COM PADRÃO 1
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
        defaultDays: stage.defaultDays, // 🔥 LOG DO NOVO CAMPO
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
      defaultDays: stage.defaultDays, // 🔥 ADICIONAR
    };

    const updated = await this.prisma.flowStage.update({
      where: { id: stageId },
      data: {
        name: data.name,
        color: data.color,
        order: data.order,
        allowedRole: data.allowedRole,
        defaultDays: data.defaultDays, // 🔥 ADICIONAR
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
        defaultDays: updated.defaultDays, // 🔥 ADICIONAR
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
        defaultDays: true, // 🔥 ADICIONE ESTA LINHA
        _count: {
          select: { items: true },
        },
      },
    });

    return stages;
  }

  async getKanbanBoard(flowId: string) {
    const companyId = this.getCompanyIdFromContext();

    const board = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            color: true,
            order: true,
            allowedRole: true,
            defaultDays: true, // 🔥 JÁ TEM
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

    // 🔥 ADICIONE ESTE LOG
    console.log('🔍 DEBUG - Stages retornadas:');
    board.stages.forEach((stage) => {
      console.log(`   ${stage.name}: defaultDays = ${stage.defaultDays}`);
    });

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
          select: {
            id: true,
            name: true,
            color: true,
            order: true,
            allowedRole: true,
            defaultDays: true, // 🔥 ADICIONE ESTA LINHA
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
          select: {
            id: true,
            name: true,
            color: true,
            order: true,
            allowedRole: true,
            defaultDays: true, // 🔥 ADICIONE ESTA LINHA
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

  private async createMissingItemStagesWithStages(
    item: any,
    stages: any[],
    tx: any,
  ): Promise<any[]> {
    this.logger.log(`🔄 Criando registros de prazo para item ${item.id}`);

    const companyId = this.getCompanyIdFromContext();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasDefaultDays = stages.some(
      (s) => s.defaultDays && s.defaultDays > 0,
    );

    let deadlinesMap: Map<string, Date> = new Map();

    if (hasDefaultDays) {
      deadlinesMap = this.calculateDeadlinesFromDefaultDays(
        stages,
        today,
        item.stageId,
      );
      this.logger.log(`📊 Usando dias padrão das etapas para calcular prazos`);
    }

    const createdOrUpdated: any[] = [];
    let currentDeadline: Date | null = null;
    let lastCalculatedDeadline: Date | null = null;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const isCurrent = stage.id === item.stageId;
      const isLastStage = i === stages.length - 1;

      let deadline: Date;
      let suggestedDeadline: Date;

      const calculatedDeadline = deadlinesMap.get(stage.id);

      if (calculatedDeadline) {
        // Etapa com prazo calculado
        deadline = new Date(calculatedDeadline);
        suggestedDeadline = new Date(calculatedDeadline);

        if (isCurrent) {
          currentDeadline = new Date(deadline);
        }

        lastCalculatedDeadline = new Date(deadline);

        this.logger.debug(
          `Etapa ${stage.name} → prazo calculado: ${deadline.toISOString().split('T')[0]}`,
        );
      } else if (isLastStage && lastCalculatedDeadline) {
        // 🔥 ÚLTIMA ETAPA: herda o prazo da etapa anterior + 1 dia
        deadline = new Date(lastCalculatedDeadline);
        deadline.setDate(deadline.getDate() + 1);
        suggestedDeadline = new Date(deadline);

        this.logger.debug(
          `Etapa ${stage.name} (ÚLTIMA ETAPA) → prazo herdado: ${deadline.toISOString().split('T')[0]} (baseado na etapa anterior)`,
        );
      } else {
        // 🔥 FALLBACK: usa a data atual + índice
        deadline = new Date(today);
        deadline.setDate(deadline.getDate() + (i + 1));
        suggestedDeadline = new Date(deadline);

        this.logger.debug(
          `Etapa ${stage.name} → prazo fallback: ${deadline.toISOString().split('T')[0]}`,
        );
      }

      const itemStage = await tx.flowItemStage.create({
        data: {
          item: {
            connect: { id: item.id },
          },
          stage: {
            connect: { id: stage.id },
          },
          company: {
            connect: { id: companyId },
          },
          order: stage.order,
          status: isCurrent ? 'ATUAL' : 'PENDENTE',
          deadline: deadline, // 🔥 SEMPRE TEM UM VALOR
          suggestedDeadline: suggestedDeadline,
          actualDeadline: isCurrent ? new Date() : null,
          basedOnSuggestedDeadline: stage.defaultDays || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      createdOrUpdated.push(itemStage);
    }

    // Sincroniza dueDate do item com a etapa atual
    if (currentDeadline) {
      await tx.flowItem.update({
        where: { id: item.id },
        data: { dueDate: currentDeadline, updatedAt: new Date() },
      });
      this.logger.log(
        `🔄 dueDate sincronizado para ${currentDeadline.toISOString().split('T')[0]}`,
      );
    }

    return createdOrUpdated;
  }

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
        // ────────────────────────────────────────────────
        // 1. Validação de duplicidade
        // ────────────────────────────────────────────────
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

        // ────────────────────────────────────────────────
        // 2. Valida fluxo e etapa destino
        // ────────────────────────────────────────────────
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
          throw new BadRequestException('Etapa inválida ou fluxo sem etapas');
        }

        this.validateStageAccess(user, targetStage);

        // Define ordem na coluna
        const lastItem = await tx.flowItem.findFirst({
          where: { stageId: targetStage.id },
          orderBy: { orderInStage: 'desc' },
          select: { orderInStage: true },
        });

        const orderInStage = (lastItem?.orderInStage ?? -1) + 1;

        // ────────────────────────────────────────────────
        // 3. Dados do novo item
        // ────────────────────────────────────────────────
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

        // Cria o item
        const item = await tx.flowItem.create({ data: dataToCreate });

        // 🔥 CORREÇÃO: Buscar as stages do fluxo ANTES de criar os registros
        const stages = await tx.flowStage.findMany({
          where: { flowId, companyId },
          orderBy: { order: 'asc' },
        });

        if (!stages || stages.length === 0) {
          this.logger.warn(
            `⚠️ Nenhuma stage encontrada para o fluxo ${flowId}`,
          );
          return item;
        }

        // ────────────────────────────────────────────────
        // 4. Cria registros de prazo para TODAS as etapas
        // ────────────────────────────────────────────────
        this.logger.log(
          `[createFlowItem] Criando registros de prazo para item ${item.id}`,
        );

        // 🔥 Chama o método passando o item e as stages já carregadas
        await this.createMissingItemStagesWithStages(item, stages, tx);

        // ────────────────────────────────────────────────
        // 5. Sincroniza o dueDate do item com o prazo da etapa ATUAL
        // ────────────────────────────────────────────────
        await this.syncItemDueDateWithCurrentStage(item.id, tx);

        // ────────────────────────────────────────────────
        // 6. Auditoria
        // ────────────────────────────────────────────────
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
            dueDate: item.dueDate,
          },
          metadata: {
            flowId: item.flowId,
            stageName: targetStage.name,
            stagesCreated: true,
          },
        });

        await this.invalidateFlowCache(companyId, flowId);

        return item;
      },
      {
        timeout: 60000,
        maxWait: 60000,
      },
    );
  }

  async createFlowItemWithStages(
    flowId: string,
    userId: string,
    dto: CreateFlowItemDto,
  ) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log('========================================');
    this.logger.log('🎯 [REQUISITO 3] CRIANDO ITEM COM PRAZOS POR ETAPA');
    this.logger.log('========================================');
    this.logger.log(`📦 flowId: ${flowId}`);
    this.logger.log(`📦 userId: ${userId}`);
    this.logger.log(`📦 dto:`, dto);

    // Primeiro cria o item normalmente
    const item = await this.createFlowItem(flowId, userId, dto);
    this.logger.log(`✅ Item criado: ${item.id} - ${item.title}`);

    // Busca todas as etapas do fluxo
    const stages = await this.prisma.flowStage.findMany({
      where: { flowId, companyId },
      orderBy: { order: 'asc' },
    });

    this.logger.log(`📋 Etapas encontradas: ${stages.length}`);
    stages.forEach((s, i) => {
      this.logger.log(
        `   ${i + 1}. ${s.name} (ID: ${s.id}) - dias padrão: ${s.defaultDays || 'não definido'}`,
      );
    });

    if (stages.length === 0) {
      this.logger.warn('⚠️ Nenhuma etapa encontrada!');
      return item;
    }

    // Data de início
    const startDate = new Date(); // 🔥 Usa HOJE como base
    startDate.setHours(0, 0, 0, 0);
    const totalStages = stages.length;

    // 🔥 NOVA LÓGICA: CALCULA PRAZOS BASEADO NOS DIAS PADRÃO DAS ETAPAS
    let currentDate = new Date(startDate);
    let currentDeadline: Date | null = null;

    // Ordena as etapas por ordem (já vem ordenado)
    const sortedStages = [...stages].sort((a, b) => a.order - b.order);

    // Encontra o índice da etapa atual
    const currentStageIndex = sortedStages.findIndex(
      (s) => s.id === item.stageId,
    );

    this.logger.log(`📊 Calculando prazos baseado nos dias padrão:`);
    this.logger.log(
      `   Etapa atual (índice ${currentStageIndex}): ${sortedStages[currentStageIndex]?.name}`,
    );

    // Cria registros de prazo para cada etapa
    const itemStages = await this.prisma.$transaction(async (tx) => {
      const created = [];

      for (let i = 0; i < sortedStages.length; i++) {
        const stage = sortedStages[i];
        const isCurrent = stage.id === item.stageId;

        let deadline: Date;

        if (i < currentStageIndex) {
          // Etapas anteriores: calcula com base na data atual menos os dias
          // Isso é útil para histórico, mas na prática essas etapas já passaram
          let daysBack = 0;
          for (let j = i; j < currentStageIndex; j++) {
            daysBack += sortedStages[j].defaultDays || 1;
          }
          deadline = new Date(startDate);
          deadline.setDate(deadline.getDate() - daysBack);

          this.logger.log(
            `📅 Etapa anterior ${stage.name}: prazo estimado ${deadline.toISOString().split('T')[0]}`,
          );
        } else if (i === currentStageIndex) {
          // Etapa atual: prazo = hoje
          deadline = new Date(startDate);
          currentDeadline = new Date(deadline);

          this.logger.log(
            `📅 Etapa ATUAL ${stage.name}: prazo = ${deadline.toISOString().split('T')[0]}`,
          );
        } else {
          // Etapas futuras: soma os dias padrão sequencialmente
          const defaultDays = stage.defaultDays || 1;
          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + defaultDays);
          deadline = new Date(currentDate);

          this.logger.log(
            `📅 Etapa ${stage.name}: +${defaultDays} dias → ${deadline.toISOString().split('T')[0]}`,
          );
        }

        const itemStage = await tx.flowItemStage.create({
          data: {
            itemId: item.id,
            stageId: stage.id,
            companyId,
            order: stage.order,
            status: isCurrent ? 'ATUAL' : 'PENDENTE',
            deadline,
            suggestedDeadline: deadline,
            actualDeadline: isCurrent ? new Date() : null,
            basedOnSuggestedDeadline: stage.defaultDays || null, // 🔥 USA DEFAULTDAYS
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        this.logger.log(`   ✅ Registro criado: ${itemStage.id}`);
        created.push(itemStage as never);
      }

      // Atualiza o dueDate do item com o prazo da etapa atual
      if (currentDeadline) {
        this.logger.log(
          `🔄 Atualizando dueDate do item de ${item.dueDate} para ${currentDeadline.toISOString()}`,
        );

        await tx.flowItem.update({
          where: { id: item.id },
          data: {
            dueDate: currentDeadline,
            updatedAt: new Date(),
          },
        });
      }

      return created;
    });

    this.logger.log(
      `✅ [REQUISITO 3] Criados ${itemStages.length} registros de prazo`,
    );
    this.logger.log('========================================\n');

    const updatedItem = await this.prisma.flowItem.findUnique({
      where: { id: item.id },
    });

    return {
      ...updatedItem,
      itemStages,
    };
  }

  private async createMissingItemStages(item: any): Promise<any[]> {
    this.logger.log(
      `🔄 Criando/Atualizando registros de prazo para item ${item.id}`,
    );

    const companyId = this.getCompanyIdFromContext();

    // 🔥 CORREÇÃO: Buscar as stages do fluxo se não estiverem no item
    let stages = item.flow?.stages;

    if (!stages || stages.length === 0) {
      this.logger.log(`📋 Buscando stages do fluxo ${item.flowId}...`);

      // Busca as stages do fluxo
      stages = await this.prisma.flowStage.findMany({
        where: {
          flowId: item.flowId,
          companyId,
        },
        orderBy: { order: 'asc' },
      });

      if (!stages || stages.length === 0) {
        this.logger.warn(
          `⚠️ Nenhuma stage encontrada para o fluxo ${item.flowId}`,
        );
        return [];
      }

      this.logger.log(`✅ Encontradas ${stages.length} stages para o fluxo`);
    }

    const totalStages = stages.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const createdOrUpdated: any[] = [];
    const created: any[] = [];
    let currentDeadline: Date | null = null;

    await this.prisma.$transaction(async (tx) => {
      for (const stage of stages) {
        // 1. Pega o suggestedDeadline da etapa (coluna)
        const stageSuggested = stage.suggestedDeadline
          ? new Date(stage.suggestedDeadline)
          : null;

        let deadline: Date;
        let daysSuggested: number | null = null;

        // Prioridade: se a etapa tem prazo sugerido definido
        if (stageSuggested) {
          deadline = new Date(stageSuggested);
          // Calcula quantos dias esse prazo representa a partir de HOJE
          daysSuggested = differenceInCalendarDays(deadline, today);
          this.logger.debug(
            `Etapa ${stage.name} → usando suggestedDeadline da etapa: ${deadline.toISOString()} (${daysSuggested} dias)`,
          );
        }
        // Fallback: se item tem dueDate → distribui sequencialmente
        else if (item.dueDate) {
          const dueDateObj = new Date(item.dueDate);
          dueDateObj.setHours(0, 0, 0, 0);

          const totalDays = Math.max(
            0,
            differenceInCalendarDays(dueDateObj, today),
          );

          const daysPerStage =
            totalDays > 0 ? Math.ceil(totalDays / totalStages) : 3;
          deadline = new Date(today);
          deadline.setDate(
            deadline.getDate() + daysPerStage * (stage.order || 1),
          );

          if (deadline > dueDateObj) deadline = new Date(dueDateObj);

          daysSuggested = daysPerStage;

          this.logger.debug(
            `Etapa ${stage.name} → calculado sequencialmente: ${deadline.toISOString()} (${daysSuggested} dias)`,
          );
        }
        // Último fallback: 3 dias por etapa
        else {
          const daysPerStage = 3;
          deadline = new Date(today);
          deadline.setDate(
            deadline.getDate() + daysPerStage * (stage.order || 1),
          );
          daysSuggested = daysPerStage;

          this.logger.debug(
            `Etapa ${stage.name} → fallback 3 dias: ${deadline.toISOString()}`,
          );
        }

        const isCurrent = stage.id === item.stageId;
        if (isCurrent) currentDeadline = new Date(deadline);

        // Upsert do registro flowItemStage
        const itemStage = await tx.flowItemStage.upsert({
          where: {
            itemId_stageId: { itemId: item.id, stageId: stage.id },
          },
          update: {
            deadline,
            suggestedDeadline: stageSuggested || deadline,
            status: isCurrent ? 'ATUAL' : 'PENDENTE',
            actualDeadline: isCurrent ? new Date() : null,
            basedOnSuggestedDeadline: daysSuggested,
            updatedAt: new Date(),
          },
          create: {
            itemId: item.id,
            stageId: stage.id,
            companyId,
            order: stage.order,
            status: isCurrent ? 'ATUAL' : 'PENDENTE',
            deadline,
            suggestedDeadline: stageSuggested || deadline,
            actualDeadline: isCurrent ? new Date() : null,
            basedOnSuggestedDeadline: daysSuggested,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        created.push(itemStage);
      }

      // Sincroniza dueDate do item com a etapa atual
      if (currentDeadline) {
        await tx.flowItem.update({
          where: { id: item.id },
          data: { dueDate: currentDeadline, updatedAt: new Date() },
        });
        this.logger.log(
          `🔄 dueDate sincronizado para ${currentDeadline.toISOString()}`,
        );
      }
    });

    this.logger.log(
      `✅ ${createdOrUpdated.length} registros processados para item ${item.id}`,
    );
    return createdOrUpdated;
  }

  async getItemStages(itemId: string) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log('========================================');
    this.logger.log('📋 [REQUISITO 4] BUSCANDO HISTÓRICO DE PRAZOS');
    this.logger.log('========================================');
    this.logger.log(`🔍 itemId: ${itemId}`);

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

    this.logger.log(`📊 Encontrados ${itemStages.length} registros`);

    if (itemStages.length === 0) {
      this.logger.warn(
        '⚠️ Nenhum registro encontrado! Verificando se item existe...',
      );

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
        this.logger.error('❌ Item não encontrado!');
        throw new NotFoundException('Item não encontrado');
      }

      this.logger.log(
        `🔄 Item encontrado, mas sem registros. Criando automaticamente...`,
      );
      this.logger.log(
        `📋 Fluxo: ${item.flow.name} com ${item.flow.stages.length} etapas`,
      );

      // 🔥 CHAMADA CORRETA para o método que acabamos de criar
      const created = await this.createMissingItemStages(item);

      this.logger.log(`✅ ${created.length} registros criados automaticamente`);
      return created;
    }

    // Log detalhado de cada etapa
    itemStages.forEach((stage, index) => {
      this.logger.log(`${index + 1}. ${stage.stage.name}:`);
      this.logger.log(`   - status: ${stage.status}`);
      this.logger.log(`   - deadline: ${stage.deadline}`);
      this.logger.log(`   - suggestedDeadline: ${stage.suggestedDeadline}`);
      this.logger.log(
        `   - actualDeadline: ${stage.actualDeadline || 'não concluída'}`,
      );
      this.logger.log(
        `   - isCurrentStage: ${stage.stageId === itemStages.find((s) => s.status === 'ATUAL')?.stageId}`,
      );
    });

    this.logger.log('========================================\n');
    return itemStages;
  }

  // ===========================================================================
  // 🔥 VERSÃO FINAL: updateItemStageDeadline – SOMENTE ADM/MASTER PODE ALTERAR PRAZOS
  // ===========================================================================
  async updateItemStageDeadline(
    itemId: string,
    stageId: string,
    dto: UpdateItemStageDeadlineDto,
    userId: string,
  ) {
    const companyId = this.getCompanyIdFromContext();

    // REQUISITO ATENDIDO: SOMENTE ADMIN/MASTER PODE ALTERAR PRAZOS
    await this.requireAdminForDeadlineChange(
      userId,
      companyId,
      'updateItemStageDeadline',
    );

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { role: true, name: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Busca o item para validações
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Busca o registro da etapa que está sendo alterada
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
    // VALIDAÇÕES DE DATAS (mantidas iguais)
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

    // =========================================================================
    // Preparação dos dados de atualização
    // =========================================================================
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

    const oldSuggestedDeadline = itemStage.suggestedDeadline;

    // =========================================================================
    // Transação completa: atualização + cascata + sincronização
    // =========================================================================
    let cascadeResult: any = null;
    let updatedItemStage: any = null;

    await this.prisma.$transaction(async (tx) => {
      // Atualiza o registro da etapa
      updatedItemStage = await tx.flowItemStage.update({
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

      // Aplica cascata apenas se alterou suggestedDeadline
      if (dto.suggestedDeadline) {
        cascadeResult = await this.recalculateDownstreamStages(
          itemId,
          stageId,
          new Date(dto.suggestedDeadline),
          userId,
          companyId,
        );
      }

      // SINCRONIZAÇÃO CENTRALIZADA DO DUE DATE
      const shouldSyncDueDate =
        item.stageId === stageId || // alterou a etapa atual
        dto.status === 'ATUAL' || // mudou para ATUAL
        (cascadeResult && cascadeResult.impact?.length > 0); // cascata ocorreu

      if (shouldSyncDueDate) {
        await this.syncItemDueDateWithCurrentStage(itemId, tx);
        this.logger.log(
          `🔄 [UPDATE_STAGE_DEADLINE] dueDate sincronizado (trigger: ${
            item.stageId === stageId
              ? 'etapa_atual'
              : dto.status === 'ATUAL'
                ? 'status_atual'
                : 'cascata'
          })`,
        );
      }
    });

    // =========================================================================
    // Auditoria detalhada
    // =========================================================================
    await this.auditService.log({
      action: 'UPDATE_ITEM_STAGE_DEADLINE',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      metadata: {
        stageId,
        stageName: updatedItemStage.stage.name,
        oldSuggestedDeadline,
        newSuggestedDeadline: updatedItemStage.suggestedDeadline,
        oldActualDeadline: itemStage.actualDeadline,
        newActualDeadline: updatedItemStage.actualDeadline,
        oldStatus: itemStage.status,
        newStatus: updatedItemStage.status,
        performedByRole: user.role,
        cascadeApplied: !!cascadeResult,
        cascadeUpdatedCount: cascadeResult?.impact?.length || 0,
        dueDateSynced: true,
        syncTriggeredBy:
          item.stageId === stageId
            ? 'etapa_atual'
            : dto.status === 'ATUAL'
              ? 'status_atual'
              : cascadeResult?.impact?.length > 0
                ? 'cascata'
                : 'nenhum',
      },
    });

    // =========================================================================
    // Resposta com feedback
    // =========================================================================
    const response: any = {
      ...updatedItemStage,
      message: `✅ Prazo da etapa ${updatedItemStage.stage.name} atualizado com sucesso (operação exclusiva para administradores)`,
    };

    if (cascadeResult && cascadeResult.impact?.length > 0) {
      response.cascade = {
        applied: true,
        fromStageId: stageId,
        updatedStages: cascadeResult.impact.map((i: any) => ({
          stageId: i.stageId,
          stageName: i.stageName,
          oldDeadline: i.oldDeadline,
          newDeadline: i.newDeadline,
        })),
      };

      if (cascadeResult.dueDateChanged) {
        response.cascade.dueDateImpact = {
          oldDueDate: cascadeResult.oldDueDate,
          newDueDate: cascadeResult.newDueDate,
          message: `⚠️ Prazo final ajustado para ${cascadeResult.newDueDate?.toLocaleDateString()} devido ao efeito cascata`,
        };
      }
    }

    return response;
  }

  // ===========================================================================
  // 🔥 VERSÃO FINAL: bulkUpdateItemStages – SOMENTE ADM/MASTER PODE ALTERAR MÚLTIPLOS PRAZOS
  // ===========================================================================
  async bulkUpdateItemStages(
    itemId: string,
    updates: any[],
    userId: string,
    companyId: string,
  ) {
    // LOG INICIAL
    console.log('\n' + '='.repeat(80));
    console.log('🔥 [SERVICE] bulkUpdateItemStages INICIADO');
    console.log('='.repeat(80));
    console.log('📦 itemId:', itemId);
    console.log('📦 updates recebidos:', JSON.stringify(updates, null, 2));
    console.log('='.repeat(80) + '\n');

    this.logger.log(
      `📦 [BULK_UPDATE] Iniciando bulk update para item ${itemId}`,
    );
    this.logger.log(
      `📦 Updates recebidos: ${JSON.stringify(updates, null, 2)}`,
    );

    // REQUISITO ATENDIDO: SOMENTE ADMIN/MASTER PODE ALTERAR MÚLTIPLOS PRAZOS
    await this.requireAdminForDeadlineChange(
      userId,
      companyId,
      'bulkUpdateItemStages',
    );

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { role: true, name: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Busca o item para validações e para saber qual é a etapa atual
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: {
        flow: {
          include: {
            stages: { orderBy: { order: 'asc' } },
          },
        },
        itemStages: {
          include: { stage: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    this.logger.log(`📋 Item encontrado: ${item.title} (${item.id})`);
    this.logger.log(
      `📋 Fluxo: ${item.flow.name} com ${item.flow.stages.length} etapas`,
    );

    const results: any[] = [];
    const errors: any[] = [];
    const updatedStages = new Map<string, Date>(); // stageId → suggestedDeadline alterado

    let affectedCurrentStage = false; // flag: se alguma atualização afetou a etapa atual
    let setToAtual = false; // flag: se algum status mudou para 'ATUAL'

    // No método bulkUpdateItemStages, localize a função parseDate e substitua:

    const parseDate = (dateValue: any): Date | null => {
      if (!dateValue) return null;
      try {
        let date: Date;
        if (typeof dateValue === 'string') {
          // 🔥 CORREÇÃO: Se for string ISO, extrai apenas a data e cria em UTC
          if (dateValue.includes('T')) {
            // Extrai a parte da data (YYYY-MM-DD)
            const dateOnly = dateValue.split('T')[0];
            const [year, month, day] = dateOnly.split('-').map(Number);
            // Cria data em UTC com hora 12:00 para evitar deslocamento
            date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
          }
          // Se for apenas YYYY-MM-DD
          else if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateValue.split('-').map(Number);
            date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
          } else {
            date = new Date(dateValue);
          }
        } else if (dateValue instanceof Date) {
          // Se já é Date, normaliza para UTC meio-dia
          date = new Date(
            Date.UTC(
              dateValue.getFullYear(),
              dateValue.getMonth(),
              dateValue.getDate(),
              12,
              0,
              0,
            ),
          );
        } else {
          date = new Date(dateValue);
        }

        if (isNaN(date.getTime())) return null;

        this.logger.debug(`parseDate: ${dateValue} -> ${date.toISOString()}`);
        return date;
      } catch (error) {
        this.logger.error(`❌ Erro ao converter data: ${dateValue}`, error);
        return null;
      }
    };

    // =========================================================================
    // PROCESSAR CADA UPDATE INDIVIDUALMENTE
    // =========================================================================
    for (const update of updates) {
      this.logger.log(`🔄 Processando update para stageId: ${update.stageId}`);

      try {
        // Validação de UUID
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(update.stageId)) {
          throw new BadRequestException(
            `ID de etapa inválido: ${update.stageId}`,
          );
        }

        const itemStage = await this.prisma.flowItemStage.findFirst({
          where: { itemId, stageId: update.stageId, companyId },
        });

        if (!itemStage) {
          this.logger.warn(
            `⚠️ Registro não encontrado para stageId: ${update.stageId}`,
          );
          errors.push({
            stageId: update.stageId,
            error: 'Registro de prazo não encontrado',
          });
          continue;
        }

        const updateData: any = { updatedAt: new Date() };

        // Processa suggestedDeadline
        if (update.suggestedDeadline !== undefined) {
          const suggestedDate = parseDate(update.suggestedDeadline);
          console.log('📅 Data original:', update.suggestedDeadline);
          console.log('📅 Data após parse:', suggestedDate?.toISOString());
          console.log(
            '📅 Data local:',
            suggestedDate?.toLocaleDateString('pt-BR'),
          );
          if (!suggestedDate)
            throw new BadRequestException(
              `Data inválida: ${update.suggestedDeadline}`,
            );

          const suggestedOnly = new Date(suggestedDate);
          suggestedOnly.setHours(0, 0, 0, 0);
          const createdOnly = new Date(item.createdAt);
          createdOnly.setHours(0, 0, 0, 0);
          if (suggestedOnly < createdOnly)
            throw new BadRequestException(
              'Prazo sugerido anterior à criação do item',
            );

          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          oneYearAgo.setHours(0, 0, 0, 0);
          if (suggestedOnly < oneYearAgo)
            throw new BadRequestException(
              'Prazo sugerido há mais de 1 ano atrás',
            );

          updateData.suggestedDeadline = suggestedDate;
          updateData.deadline = suggestedDate;
          updatedStages.set(update.stageId, suggestedDate);
        }

        // Processa actualDeadline
        if (update.actualDeadline !== undefined) {
          const actualDate = parseDate(update.actualDeadline);
          if (!actualDate)
            throw new BadRequestException(
              `Data inválida: ${update.actualDeadline}`,
            );

          const actualOnly = new Date(actualDate);
          actualOnly.setHours(0, 0, 0, 0);
          const createdOnly = new Date(item.createdAt);
          createdOnly.setHours(0, 0, 0, 0);
          if (actualOnly < createdOnly)
            throw new BadRequestException(
              'Data de conclusão anterior à criação',
            );

          if (update.status === 'CONCLUIDO' && actualDate > new Date()) {
            throw new BadRequestException(
              'Data de conclusão não pode ser no futuro',
            );
          }

          updateData.actualDeadline = actualDate;
        }

        if (update.status !== undefined) {
          updateData.status = update.status;
          if (update.status === 'ATUAL') setToAtual = true;
        }

        if (update.notes !== undefined) {
          updateData.notes = update.notes;
        }

        if (update.status === 'CONCLUIDO' && !update.actualDeadline) {
          throw new BadRequestException(
            'Para CONCLUIDO é necessário actualDeadline',
          );
        }

        if (Object.keys(updateData).length <= 1) {
          this.logger.log(
            `⚠️ Nenhuma alteração real para stageId: ${update.stageId}`,
          );
          continue;
        }

        // Atualiza o registro
        const updated = await this.prisma.flowItemStage.update({
          where: { id: itemStage.id },
          data: updateData,
          include: {
            stage: { select: { id: true, name: true, color: true } },
          },
        });

        results.push(updated);

        // Verifica se afetou a etapa atual
        if (item.stageId === update.stageId) {
          affectedCurrentStage = true;
        }
      } catch (error: any) {
        this.logger.error(
          `❌ Erro ao processar stageId ${update.stageId}: ${error.message}`,
        );
        errors.push({ stageId: update.stageId, error: error.message });
      }
    }

    // =========================================================================
    // APLICA CASCATA (se houver alterações de suggestedDeadline)
    // =========================================================================
    type CascadeResultType = {
      impact: {
        stageId: string;
        stageName: string;
        oldDeadline: Date;
        newDeadline: Date;
      }[];
      dueDateChanged: boolean;
      oldDueDate?: Date;
      newDueDate?: Date;
    };

    let cascadeResult: CascadeResultType | null = null;

    if (updatedStages.size > 0) {
      this.logger.log(
        `🔄 Aplicando cascata para ${updatedStages.size} etapa(s) alterada(s)`,
      );

      const stages = item.flow.stages;
      let firstUpdatedStage: { id: string; deadline: Date } | null = null;
      let minOrder = Infinity;

      for (const [stageId, deadline] of updatedStages.entries()) {
        const stage = stages.find((s) => s.id === stageId);
        if (stage && stage.order < minOrder) {
          minOrder = stage.order;
          firstUpdatedStage = { id: stageId, deadline };
        }
      }

      if (firstUpdatedStage) {
        try {
          cascadeResult = await this.recalculateDownstreamStages(
            itemId,
            firstUpdatedStage.id,
            firstUpdatedStage.deadline,
            userId,
            companyId,
          );
        } catch (err) {
          this.logger.error('❌ Erro na cascata:', err);
        }
      }
    }

    // =========================================================================
    // SINCRONIZAÇÃO FINAL DO DUE DATE (centralizada) – só se houve alteração relevante
    // =========================================================================
    const shouldSyncDueDate =
      affectedCurrentStage ||
      setToAtual ||
      (cascadeResult && cascadeResult.impact?.length > 0);

    if (shouldSyncDueDate) {
      await this.prisma.$transaction(async (tx) => {
        await this.syncItemDueDateWithCurrentStage(itemId, tx);
        this.logger.log(
          `🔄 [BULK_UPDATE] dueDate sincronizado com sucesso (trigger: ${
            affectedCurrentStage
              ? 'etapa_atual'
              : setToAtual
                ? 'status_atual'
                : 'cascata'
          })`,
        );
      });
    }

    // =========================================================================
    // BUSCA TODOS OS STAGES ATUALIZADOS (para retorno)
    // =========================================================================
    const allUpdatedStages = await this.prisma.flowItemStage.findMany({
      where: { itemId, companyId },
      include: {
        stage: { select: { id: true, name: true, color: true, order: true } },
      },
      orderBy: { stage: { order: 'asc' } },
    });

    // =========================================================================
    // AUDITORIA – registra que foi operação exclusiva de admin
    // =========================================================================
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
        cascadeApplied: !!cascadeResult,
        cascadeUpdatedCount: cascadeResult?.impact?.length || 0,
        dueDateSynced: shouldSyncDueDate,
        syncTriggeredBy: shouldSyncDueDate
          ? affectedCurrentStage
            ? 'etapa_atual'
            : setToAtual
              ? 'status_atual'
              : 'cascata'
          : 'nenhum',
        performedByRole: user.role,
        operationRestrictedTo: 'MASTER/ADMIN',
        timestamp: new Date().toISOString(),
      },
    });

    // =========================================================================
    // RESPOSTA FINAL
    // =========================================================================
    const response: any = {
      message: `${results.length} atualizações realizadas com sucesso (operação exclusiva para administradores)`,
      results,
      success: errors.length === 0,
      updatedStages: allUpdatedStages,
    };

    if (errors.length > 0) {
      response.message = `${results.length} atualizações feitas, ${errors.length} falhas`;
      response.errors = errors;
    }

    if (cascadeResult && cascadeResult.impact?.length > 0) {
      response.cascade = {
        applied: true,
        fromStageId: cascadeResult.impact[0]?.stageId,
        updatedStages: cascadeResult.impact.map((i: any) => ({
          stageId: i.stageId,
          stageName: i.stageName,
          oldDeadline: i.oldDeadline,
          newDeadline: i.newDeadline,
        })),
      };

      if (cascadeResult.dueDateChanged) {
        response.cascade.dueDateImpact = {
          oldDueDate: cascadeResult.oldDueDate,
          newDueDate: cascadeResult.newDueDate,
          message: `⚠️ Prazo final ajustado para ${cascadeResult.newDueDate?.toLocaleDateString()} devido ao efeito cascata`,
        };
      }
    }

    this.logger.log(
      `✅ [BULK_UPDATE] Finalizado. ${results.length} sucessos, ${errors.length} falhas`,
    );
    this.logger.log(
      `📦 Retornando ${allUpdatedStages.length} stages atualizados`,
    );

    return response;
  }

  private async recalculateDownstreamStages(
  itemId: string,
  fromStageId: string,
  newDeadlineInput: Date,
  userId: string,
  companyId: string,
  tx?: any,
) {
  const prisma = tx || this.prisma;
  
  const item = await prisma.flowItem.findUnique({
    where: { id: itemId },
    include: {
      flow: { include: { stages: { orderBy: { order: 'asc' } } } },
      itemStages: { include: { stage: true } },
    },
  });

  if (!item) return { impact: [], dueDateChanged: false };

  const stages = item.flow.stages;
  const fromIndex = stages.findIndex((s: any) => s.id === fromStageId);

  if (fromIndex === -1) return { impact: [], dueDateChanged: false };

  // Tipagem explícita para evitar o erro 'never'
  const impact: Array<{ stageId: string; stageName: string; oldDeadline: Date; newDeadline: Date }> = [];
  
  let lastDeadline = new Date(newDeadlineInput);
  lastDeadline.setHours(0, 0, 0, 0);

  // Começa a partir da etapa seguinte
  for (let i = fromIndex + 1; i < stages.length; i++) {
    const stageConfig = stages[i];
    const itemStageRecord = item.itemStages.find((is: any) => is.stageId === stageConfig.id);

    if (itemStageRecord) {
      const oldDate = new Date(itemStageRecord.deadline);
      const newDate = new Date(lastDeadline);
      newDate.setDate(newDate.getDate() + (stageConfig.defaultDays || 1));

      await prisma.flowItemStage.update({
        where: { id: itemStageRecord.id },
        data: {
          deadline: newDate,
          suggestedDeadline: newDate,
          updatedAt: new Date(),
        },
      });

      impact.push({
        stageId: stageConfig.id,
        stageName: stageConfig.name,
        oldDeadline: oldDate,
        newDeadline: newDate,
      });
      
      lastDeadline = new Date(newDate);
    }
  }

  // Atualiza o prazo final do item baseado na última etapa da cascata
  await prisma.flowItem.update({
    where: { id: itemId },
    data: { dueDate: lastDeadline }
  });

  return { impact, dueDateChanged: impact.length > 0, newDueDate: lastDeadline };
}

  async getItemStagesWithDetails(itemId: string) {
    return this.prisma.flowItemStage.findMany({
      where: { itemId },
      include: {
        stage: true,
      },
      orderBy: {
        stage: {
          order: 'asc',
        },
      },
    });
  }

 async moveItemWithDeadline(
  itemId: string,
  dto: MoveItemWithDeadlineDto,
  userId: string,
) {
  this.logger.log('🎯 [REQUISITO 1] MOVENDO ITEM COM ATUALIZAÇÃO DE PRAZO');
  const companyId = this.getCompanyIdFromContext();

  // 1. Move o item (isso altera a coluna, mas ainda não recalcula a data logicamente)
  const movedItem = await this.moveItem(
    itemId,
    dto.newStageId,
    userId,
    dto.newOrder,
    dto.selectedResponsibleId,
    dto.selectedSupplierId,
    dto.newQuantity,
  );

  const user = await this.prisma.user.findFirst({
    where: { id: userId, companyId },
    select: { role: true },
  });

  const isAdmin = user && ['MASTER', 'ADMIN'].includes(user.role);

  await this.prisma.$transaction(async (tx) => {
    // Busca a configuração da etapa destino para saber os dias padrão
    const targetStage = await tx.flowStage.findUnique({
      where: { id: dto.newStageId }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 🔥 CÁLCULO REAL: Hoje (24) + Dias da Etapa (3) = 27
    const daysToAdd = targetStage?.defaultDays || 1;
    const newDeadline = new Date(today);
    newDeadline.setDate(today.getDate() + daysToAdd);

    // 2. Atualiza o registro da etapa específica para o novo prazo calculado
    await tx.flowItemStage.updateMany({
      where: { itemId, stageId: dto.newStageId, companyId },
      data: {
        status: 'ATUAL',
        deadline: newDeadline,
        suggestedDeadline: newDeadline,
        actualDeadline: new Date(),
        updatedAt: new Date(),
      },
    });

    // 3. Marca anteriores como concluídas
    await tx.flowItemStage.updateMany({
      where: {
        itemId,
        companyId,
        order: { lt: targetStage?.order || 0 },
        status: { not: 'CONCLUIDO' }
      },
      data: {
        status: 'CONCLUIDO',
        actualDeadline: new Date(),
        updatedAt: new Date(),
      },
    });

    // 4. 🔥 DISPARA CASCATA: Isso vai empurrar as datas de TODAS as etapas seguintes
    await this.recalculateDownstreamStages(
      itemId,
      dto.newStageId,
      newDeadline,
      userId,
      companyId,
      tx
    );

    // 5. Sincroniza o cabeçalho do item (o dueDate principal)
    if (isAdmin) {
      await this.syncItemDueDateWithCurrentStage(itemId, tx);
    }
  });

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
        include: {
          stage: true,
          assignedTo: true,
          supplier: true,
          flow: {
            include: {
              stages: {
                orderBy: { order: 'asc' },
              },
            },
          },
          itemStages: true,
        },
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

    // Flag para verificar se a etapa atual mudou
    let stageChanged = false;
    let oldStageId = item.stageId;
    let newStageId = data.stageId;

    if (data.stageId && data.stageId !== item.stageId) {
      const newStage = await this.prisma.flowStage.findFirst({
        where: { id: data.stageId, companyId },
      });
      if (!newStage) throw new BadRequestException('Etapa de destino inválida');
      stageChanged = true;
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

    let oldDueDate = item.dueDate;
    let newDueDate: Date | null = null;

    if (data.dueDate !== undefined) {
      newDueDate = data.dueDate ? new Date(data.dueDate) : null;
      updateData.dueDate = newDueDate;
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedItem = await tx.flowItem.update({
        where: { id: itemId },
        data: updateData,
        include: {
          assignedTo: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true } },
        },
      });

      // 🔥 NOVO: Se a etapa atual mudou, atualiza o status dos registros flowItemStage
      if (stageChanged && newStageId) {
        this.logger.log(
          `🔄 Etapa atual alterada de ${oldStageId} para ${newStageId}`,
        );

        // Marca a nova etapa como ATUAL
        const newItemStage = await tx.flowItemStage.findFirst({
          where: {
            itemId,
            stageId: newStageId,
            companyId,
          },
        });

        if (newItemStage) {
          await tx.flowItemStage.update({
            where: { id: newItemStage.id },
            data: {
              status: 'ATUAL',
              actualDeadline: new Date(),
              updatedAt: new Date(),
            },
          });
        }

        // Marca a etapa anterior como CONCLUIDA (se não for a mesma)
        if (oldStageId && newStageId && oldStageId !== newStageId) {
          const oldItemStage = await tx.flowItemStage.findFirst({
            where: {
              itemId,
              stageId: oldStageId, // oldStageId agora é garantido como string
              companyId,
            },
          });

          if (oldItemStage && oldItemStage.status !== 'CONCLUIDO') {
            await tx.flowItemStage.update({
              where: { id: oldItemStage.id },
              data: {
                status: 'CONCLUIDO',
                actualDeadline: oldItemStage.actualDeadline || new Date(),
                updatedAt: new Date(),
              },
            });
          }
        }
      }

      // 🔥 NOVO: Se admin alterou dueDate, redistribui prazos das etapas
      type RedistributionResult = {
        applied: boolean;
        updatedStages: {
          stageId: string;
          stageName: string;
          oldDeadline: Date;
          newDeadline: Date;
        }[];
        daysPerStage: number;
      };

      let redistributionResult: RedistributionResult | null = null;

      if (
        isAdmin &&
        newDueDate &&
        oldDueDate?.getTime() !== newDueDate.getTime()
      ) {
        this.logger.log(
          `🔄 DueDate alterado, redistribuindo prazos das etapas restantes`,
        );

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentStageIndex = item.flow.stages.findIndex(
          (s) => s.id === (newStageId || item.stageId),
        );
        const remainingStages = item.flow.stages.length - currentStageIndex;

        const daysAvailable = Math.ceil(
          (newDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        const daysPerStage = Math.max(
          1,
          Math.floor(daysAvailable / remainingStages),
        );

        let currentDate = new Date(today);
        const updatedStages: {
          stageId: string;
          stageName: string;
          oldDeadline: Date;
          newDeadline: Date;
        }[] = [];

        for (let i = currentStageIndex; i < item.flow.stages.length; i++) {
          const stage = item.flow.stages[i];
          const itemStage = item.itemStages.find(
            (is) => is.stageId === stage.id,
          );

          if (itemStage) {
            const oldDeadline =
              itemStage.suggestedDeadline || itemStage.deadline;

            if (i === currentStageIndex) {
              // Etapa atual mantém a data de hoje
              currentDate = new Date(today);
            } else {
              currentDate.setDate(currentDate.getDate() + daysPerStage);
            }

            // Garante que última etapa seja exatamente o novo dueDate
            if (i === item.flow.stages.length - 1) {
              currentDate = new Date(newDueDate);
            }

            await tx.flowItemStage.update({
              where: { id: itemStage.id },
              data: {
                suggestedDeadline: new Date(currentDate),
                deadline: new Date(currentDate),
                updatedAt: new Date(),
              },
            });

            updatedStages.push({
              stageId: stage.id,
              stageName: stage.name,
              oldDeadline,
              newDeadline: new Date(currentDate),
            });
          }
        }

        redistributionResult = {
          applied: true,
          updatedStages,
          daysPerStage,
        };
      }

      // 🔥 CRÍTICO: SEMPRE sincronizar dueDate com a etapa atual
      // Isso garante que o dueDate reflita o prazo da etapa atual em TODOS os casos
      await this.syncItemDueDateWithCurrentStage(itemId, tx);
      this.logger.log(
        `🔄 [UPDATE_FLOW_ITEM] dueDate sincronizado com a etapa atual após atualização`,
      );

      return { updatedItem, redistributionResult };
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
        changedFields,
        totalChanged: changedFields.length,
        timestamp: new Date().toISOString(),
        entityId: itemId,
        entityType: 'FLOW_ITEM',
        dueDateRedistributed: !!updated.redistributionResult,
        dueDateSynced: true, // ✅ Garantido
        stageChanged,
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);

    // Retorna com feedback claro
    const response: any = {
      ...updated.updatedItem,
      message: `✅ Item atualizado com sucesso`,
    };

    if (updated.redistributionResult) {
      response.redistribution = {
        message: `📊 Prazos das etapas redistribuídos automaticamente com base no novo prazo final`,
        daysPerStage: updated.redistributionResult.daysPerStage,
        updatedStages: updated.redistributionResult.updatedStages,
      };
    }

    return response;
  }

  // ===========================================================================
  // 🔥 MOVER ITEM (AJUSTADO PARA RECALCULAR PRAZOS AUTOMATICAMENTE)
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

    this.logger.log('🎯 [MOVE_ITEM] Iniciando movimentação com recálculo de prazos');

    let flowId: string | undefined;
    let isLastStage = false;

    const result = await this.executeWithResilience('move_item', async () => {
      return this.prisma.$transaction(
        async (tx) => {
          const companyId = this.cls.get<string>('tenantId');
          if (!companyId)
            throw new ForbiddenException('Empresa não identificada');

          // 1. Busca dados necessários para o cálculo
          const user = await tx.user.findFirst({
            where: { id: userId, companyId, status: 'ACTIVE' },
            select: { id: true, role: true, name: true },
          });

          if (!user) throw new NotFoundException('Usuário não encontrado');

          const isAdmin = ['MASTER', 'ADMIN', 'MANAGER'].includes(user.role);

          const [item, nextStage, allStages] = await Promise.all([
            tx.flowItem.findFirst({
              where: { id: itemId, companyId },
              include: { stage: true },
            }),
            tx.flowStage.findFirst({ where: { id: newStageId, companyId } }),
            tx.flowStage.findMany({
              where: {
                flowId: (
                  await tx.flowItem.findUnique({ where: { id: itemId } })
                )?.flowId,
              },
              orderBy: { order: 'asc' }, // Ordenado para lógica de cascata
            }),
          ]);

          if (!item || !nextStage) throw new NotFoundException('Item ou Etapa não encontrados');

          flowId = item.flowId;
          isLastStage = newStageId === allStages[allStages.length - 1]?.id;

          // 2. LÓGICA DE RECALCULO DE PRAZO (O QUE VOCÊ PRECISA)
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Novo Prazo da Etapa Atual = Hoje + Dias Padrão (Ex: 24/03 + 3 dias = 27/03)
          const daysToAdd = nextStage.defaultDays || 1;
          const newDeadline = new Date(today);
          newDeadline.setDate(today.getDate() + daysToAdd);

          // 3. ATUALIZA O REGISTRO DE PRAZO DA ETAPA NO BANCO
          // Isso garante que o syncItemDueDate pegue o valor novo (27) e não o antigo (26)
          await tx.flowItemStage.updateMany({
            where: { itemId, stageId: newStageId, companyId },
            data: {
              status: 'ATUAL',
              deadline: newDeadline,
              suggestedDeadline: newDeadline,
              actualDeadline: new Date(),
              updatedAt: new Date(),
            },
          });

          // 4. Marca etapas anteriores como CONCLUÍDO
          await tx.flowItemStage.updateMany({
            where: {
              itemId,
              companyId,
              order: { lt: nextStage.order },
              status: { not: 'CONCLUIDO' },
            },
            data: {
              status: 'CONCLUIDO',
              actualDeadline: new Date(),
              updatedAt: new Date(),
            },
          });

          // 5. Atualiza o Item Principal (Coluna, Quantidade, Responsável)
          const updateData: any = {
            stageId: newStageId,
            updatedAt: new Date(),
          };

          if (newQuantity !== undefined) updateData.quantity = newQuantity;

          // Lógica original de atribuição
          if (isAdmin) {
            if (selectedResponsibleId) {
              updateData.assignedToId = selectedResponsibleId;
              updateData.supplierId = null;
            } else if (selectedSupplierId) {
              updateData.supplierId = selectedSupplierId;
              updateData.assignedToId = null;
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

          // 6. 🔥 DISPARA CASCATA PARA EMPURRAR ETAPAS FUTURAS
          // Se a atual foi para dia 27, a próxima será 27 + dias_dela
          await this.recalculateDownstreamStages(
            itemId,
            newStageId,
            newDeadline,
            userId,
            companyId,
            tx
          );

          // 7. Sincroniza o cabeçalho do item (O dueDate principal do card)
          // Removida a trava estrita de Admin para que o prazo mude visualmente para todos
          await this.syncItemDueDateWithCurrentStage(itemId, tx);

          this.logger.log(`✅ [MOVE_ITEM] Sucesso: Novo prazo definido para ${newDeadline.toISOString().split('T')[0]}`);

          return updated;
        },
        { timeout: 30000, maxWait: 30000, isolationLevel: 'ReadCommitted' },
      );
    });

    // Lógica de agendamento de conclusão se for última etapa
    if (isLastStage && flowId) {
      const companyId = this.getCompanyIdFromContext();
      setTimeout(async () => {
        try {
          if (companyId) await this.completeItemAfterDelay(itemId, userId, companyId);
        } catch (error) {
          this.logger.error(`❌ Erro ao concluir item agendado ${itemId}:`, error);
        }
      }, 3000);
    }

    await this.invalidateFlowCache(this.getCompanyIdFromContext(), flowId);
    return result;
  }

  // ===========================================================================
  // 🔥 AVANÇAR ITEM PARA PRÓXIMA ETAPA (AJUSTADO - COM SINCRONIZAÇÃO DE DUE DATE)
  // ===========================================================================

  async advanceItemToNextStage(itemId: string, userId: string) {
    const companyId = this.cls.get<string>('tenantId');

    return this.prisma.$transaction(async (tx) => {
      // 1. Busca item e etapa atual
      const item = await tx.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: { stage: true, assignedTo: true },
      });

      if (!item || !item.stage) {
        throw new NotFoundException('Item ou etapa atual não encontrado');
      }

      const user = await tx.user.findFirst({
        where: { id: userId, companyId },
      });

      if (!user) throw new ForbiddenException('Usuário não encontrado');

      // Valida permissão de acesso à etapa atual
      this.validateStageAccess(user, item.stage);

      // 2. Busca todas as etapas ordenadas
      const allStages = await tx.flowStage.findMany({
        where: { flowId: item.flowId },
        orderBy: { order: 'asc' },
      });

      const currentIndex = allStages.findIndex((s) => s.id === item.stageId);
      const nextStage = allStages[currentIndex + 1];

      if (!nextStage) {
        throw new BadRequestException('Fim da esteira. Não há próxima etapa.');
      }

      const oldStageId = item.stageId;
      const oldAssignedToId = item.assignedToId;

      // 3. Atribuição automática por cargo da próxima etapa (se configurado)
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
        if (responsibleId) {
          newAssignedToId = responsibleId;
        }
      }

      // 4. Dados a atualizar no item
      const updateData: any = {
        stageId: nextStage.id,
        updatedAt: new Date(),
      };

      if (newAssignedToId !== oldAssignedToId) {
        updateData.assignedToId = newAssignedToId;
      }

      // 5. Atualiza o item (avança para próxima etapa)
      const updated = await tx.flowItem.update({
        where: { id: itemId },
        data: updateData,
        include: { assignedTo: { select: { id: true, name: true } } },
      });

      // ────────────────────────────────────────────────
      // Ponto crítico: sincroniza o dueDate com o prazo da NOVA etapa atual
      // Isso garante o requisito "prazo do item sempre atualizado com o prazo da etapa"
      // ────────────────────────────────────────────────
      await this.syncItemDueDateWithCurrentStage(itemId, tx);

      this.logger.log(
        `🔄 [ADVANCE_ITEM] dueDate sincronizado com o prazo da nova etapa ${nextStage.name}`,
      );

      // 6. Auditoria detalhada
      const metadata: any = {
        fromStageId: oldStageId,
        fromStageName: item.stage.name,
        toStageId: nextStage.id,
        toStageName: nextStage.name,
        fromOrder: currentIndex,
        toOrder: currentIndex + 1,
        dueDateSynced: true, // sinaliza que a sincronização ocorreu
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

      // 7. Invalida cache
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

  async getItemById(itemId: string) {
    const companyId = this.getCompanyIdFromContext();

    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: {
        stage: true,
        assignedTo: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        images: true,
        audios: true,
        videos: true,
        itemStages: {
          include: {
            stage: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    return item;
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

    const updates = await this.prisma.$transaction(async (tx) => {
      // 🔥 CORREÇÃO: Definir o tipo do array explicitamente
      const updatedStages: Array<{
        id: string;
        status: string;
        deadline: Date;
        suggestedDeadline: Date | null;
        actualDeadline: Date | null;
        order: number;
        notes: string | null;
        stage: { id: string; name: string };
      }> = [];

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const itemStage = item.itemStages.find((is) => is.stageId === stage.id);

        if (itemStage) {
          const suggestedDeadline = new Date(now);
          suggestedDeadline.setDate(
            suggestedDeadline.getDate() + daysPerStage * (i + 1),
          );

          const updated = await tx.flowItemStage.update({
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

          updatedStages.push(updated);
        }
      }

      // 🔥 CRÍTICO: Sincronizar dueDate com a etapa atual após recalcular
      await this.syncItemDueDateWithCurrentStage(itemId, tx);
      this.logger.log(
        `🔄 [RECALCULATE_DEADLINES] dueDate sincronizado com a etapa atual`,
      );

      return updatedStages;
    });

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
        dueDateSynced: true,
      },
    });

    return {
      itemId,
      recalculated: updates.length,
      stages: updates,
    };
  }

  private async syncItemDueDateWithCurrentStage(
    itemId: string,
    tx?: any,
  ): Promise<void> {
    const prisma = tx || this.prisma;

    // Busca a etapa ATUAL do item
    const currentStageRecord = await prisma.flowItemStage.findFirst({
      where: {
        itemId,
        companyId: this.getCompanyIdFromContext(),
        status: 'ATUAL',
      },
      select: {
        deadline: true,
      },
      orderBy: {
        order: 'desc',
      },
    });

    let newDueDate: Date | null = null;

    // 🔥 SE A ETAPA ATUAL NÃO TEM PRAZO, USA O PRAZO DA ETAPA ANTERIOR?
    if (currentStageRecord?.deadline) {
      newDueDate = new Date(currentStageRecord.deadline);
      newDueDate.setHours(0, 0, 0, 0);
    } else {
      // 🔥 Opção 1: Mantém null (sem prazo)
      // 🔥 Opção 2: Busca o prazo da etapa anterior (se houver)
      const previousStageRecord = await prisma.flowItemStage.findFirst({
        where: {
          itemId,
          companyId: this.getCompanyIdFromContext(),
          status: 'CONCLUIDO',
        },
        orderBy: {
          order: 'desc',
        },
        select: {
          deadline: true,
        },
      });

      if (previousStageRecord?.deadline) {
        newDueDate = new Date(previousStageRecord.deadline);
        newDueDate.setHours(0, 0, 0, 0);
      }
    }

    // Atualiza o dueDate do item
    await prisma.flowItem.update({
      where: { id: itemId },
      data: {
        dueDate: newDueDate,
        updatedAt: new Date(),
      },
    });

    this.logger.debug(
      `[syncItemDueDate] Item ${itemId} → dueDate sincronizado para ${newDueDate ? newDueDate.toISOString() : 'null'}`,
    );
  }

  private async requireAdminForDeadlineChange(
    userId: string,
    companyId: string,
    action: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { role: true },
    });

    if (!user) {
      throw new ForbiddenException('Usuário não encontrado');
    }

    const adminRoles = ['MASTER', 'ADMIN'];
    if (!adminRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Apenas administradores (MASTER/ADMIN) podem realizar esta operação que altera prazos: ${action}`,
      );
    }
  }

  private calculateDeadlinesFromDefaultDays(
    stages: any[],
    startDate: Date,
    currentStageId: string,
  ): Map<string, Date> {
    const deadlines = new Map();

    const sortedStages = [...stages].sort((a, b) => a.order - b.order);

    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    const currentIndex = sortedStages.findIndex((s) => s.id === currentStageId);
    const totalStages = sortedStages.length;

    this.logger.log(
      `📊 Calculando prazos a partir da etapa atual (índice ${currentIndex})`,
    );
    this.logger.log(`📊 Total de etapas: ${totalStages}`);

    for (let i = 0; i < sortedStages.length; i++) {
      const stage = sortedStages[i];
      const defaultDays = stage.defaultDays || 1;

      if (i < currentIndex) {
        // Etapas anteriores: não calculamos (já passaram)
        deadlines.set(stage.id, null);
        continue;
      }

      if (i === currentIndex) {
        // Etapa atual: soma seus dias padrão
        const deadline = new Date(currentDate);
        deadline.setDate(deadline.getDate() + defaultDays);
        deadlines.set(stage.id, deadline);
        this.logger.debug(
          `   ${stage.name} (ATUAL): +${defaultDays} dias → ${deadline.toISOString().split('T')[0]}`,
        );

        // Atualiza currentDate para a próxima etapa
        currentDate = new Date(deadline);
      } else {
        // Etapas seguintes: soma os dias padrão
        const deadline = new Date(currentDate);
        deadline.setDate(deadline.getDate() + defaultDays);
        deadlines.set(stage.id, deadline);
        this.logger.debug(
          `   ${stage.name}: +${defaultDays} dias → ${deadline.toISOString().split('T')[0]}`,
        );

        currentDate = new Date(deadline);
      }
    }

    return deadlines;
  }
}

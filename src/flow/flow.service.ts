/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
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

// --- CONSTANTES ---
const CORTE_KEYWORDS = ['corte', 'cortador', 'cortar', 'cut'];

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

  // ===========================================================================
  // 🔥 MÉTODO PARA VALIDAR QUANTIDADE ANTES DE MOVER - BLOQUEIA TODOS COM QTD ZERO
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

    // Busca o item com sua etapa atual
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

    // Busca o usuário (para mensagem personalizada)
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

    // Busca a etapa de destino
    const targetStage = await this.prisma.flowStage.findFirst({
      where: { id: targetStageId, companyId },
    });

    if (!targetStage) {
      throw new NotFoundException('Etapa destino não encontrada');
    }

    // Ordena todas as etapas do fluxo
    const sortedStages = [...item.flow.stages].sort(
      (a, b) => a.order - b.order,
    );

    // Encontra o índice da etapa de Corte
    const corteIndex = sortedStages.findIndex((s) => this.isCorteStage(s.name));

    // Se não tem coluna Corte, não aplica a regra
    if (corteIndex === -1) {
      return;
    }

    // Encontra os índices
    const currentStageIndex = sortedStages.findIndex(
      (s) => s.id === item.stageId,
    );

    const targetStageIndex = sortedStages.findIndex(
      (s) => s.id === targetStageId,
    );

    // Verifica posições em relação ao Corte
    const hasPassedCorte = currentStageIndex > corteIndex;
    const isMovingToAfterCorte = targetStageIndex > corteIndex;

    // Se o item já passou do Corte OU está tentando mover para depois do Corte
    if (!isAdmin && (hasPassedCorte || isMovingToAfterCorte)) {
      // Validar se quantidade existe
      if (item.quantity === null || item.quantity === undefined) {
        const message = isAdmin
          ? '⚠️ Quantidade não definida! Como ADMIN, você precisa definir uma quantidade para mover itens para depois da coluna Corte.'
          : 'Quantidade não definida.';

        throw new BadRequestException(message);
      }

      // Converter para número
      const quantityNum = Number(item.quantity);

      // Verificar se é NaN
      if (isNaN(quantityNum)) {
        const message = isAdmin
          ? `⚠️ Quantidade inválida ("${item.quantity}")! Como ADMIN, você precisa definir uma quantidade numérica válida.`
          : 'Quantidade inválida.';

        throw new BadRequestException(message);
      }

      // 🔥 VERIFICAÇÃO CRÍTICA: quantidade deve ser > 0
      if (quantityNum < 1) {
        const message = isAdmin
          ? `⚠️ Quantidade zero (${quantityNum})! Você está tentando mover um item para depois da coluna Corte com quantidade zero. Como ADMIN, defina uma quantidade maior que zero antes de prosseguir.`
          : 'Quantidade deve ser maior que zero.';

        this.logger.error(
          `❌ BLOQUEADO: ${isAdmin ? 'Admin' : 'Usuário'} ${user?.name} tentou mover item com quantidade ${quantityNum}`,
        );
        throw new BadRequestException(message);
      }

      this.logger.debug(`✅ Quantidade válida: ${quantityNum}`);
    }
  }

  // ===========================================================================
  // MÉTODOS REFATORADOS - SEM companyId NOS PARÂMETROS
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

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      sevenDaysFromNow.setHours(23, 59, 59, 999);

      // 🔥 LOG DETALHADO COM TRATAMENTO PARA NULL
      console.log('\n' + '='.repeat(50));
      console.log('🔍 FILTRO UPCOMING - BACKEND');
      console.log('='.repeat(50));
      console.log('today (UTC):', today.toISOString());
      console.log('sevenDaysFromNow (UTC):', sevenDaysFromNow.toISOString());

      // Buscar TODOS os itens com dueDate para debug
      const allItemsWithDueDate = await this.prisma.flowItem.findMany({
        where: {
          companyId,
          dueDate: { not: null },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          status: true,
        },
      });

      console.log('\n📋 TODOS os itens com dueDate:');
      allItemsWithDueDate.forEach((item) => {
        // 🔥 CORREÇÃO: Verificar se dueDate não é null antes de usar
        if (item.dueDate) {
          const dueDate = new Date(item.dueDate);
          const isInRange = dueDate >= today && dueDate <= sevenDaysFromNow;
          console.log(
            `   "${item.title}": dueDate=${item.dueDate.toISOString()}, status=${item.status}, inRange=${isInRange}`,
          );
        } else {
          console.log(
            `   "${item.title}": dueDate=null, status=${item.status}, inRange=false`,
          );
        }
      });

      console.log('='.repeat(50) + '\n');

      // 🔥 CORREÇÃO: Usar a sintaxe correta para o where clause
      whereClause.AND = [
        {
          dueDate: {
            not: null,
          },
        },
        {
          dueDate: {
            gte: today,
            lte: sevenDaysFromNow,
          },
        },
        {
          status: {
            not: 'CONCLUIDO',
          },
        },
      ];
    }

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

    // 🔥 VALIDAR SE O TEMPLATE TEM MODELAGEM E CORTE
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

  // No arquivo flow.service.ts, dentro da classe FlowService

  /**
   * 🔥 VALIDA SE O FLUXO POSSUI MODELAGEM E CORTE
   * @param stages Lista de etapas do fluxo
   * @throws BadRequestException se não encontrar modelagem OU corte
   */
  private async validateModelagemAndCorte(stages: any[]): Promise<void> {
    this.logger.log('🔍 Validando se fluxo possui Modelagem e Corte...');

    // Palavras-chave para identificar modelagem
    const MODELAGEM_KEYWORDS = [
      'modelagem',
      'modelista',
      'modelo',
      'pilotagem',
    ];

    // Palavras-chave para identificar corte (já existe a constante CORTE_KEYWORDS)
    // CORTE_KEYWORDS = ['corte', 'cortador', 'cortar', 'cut'];

    let hasModelagem = false;
    let hasCorte = false;

    // Verifica cada stage
    for (const stage of stages) {
      const stageName = stage.name?.toLowerCase().trim() || '';

      // Verifica se é MODELAGEM
      if (!hasModelagem) {
        hasModelagem = MODELAGEM_KEYWORDS.some((keyword) =>
          stageName.includes(keyword),
        );
        if (hasModelagem) {
          this.logger.debug(`✅ Modelagem encontrada: "${stage.name}"`);
        }
      }

      // Verifica se é CORTE (usa o método existente)
      if (!hasCorte) {
        hasCorte = this.isCorteStage(stage.name);
        if (hasCorte) {
          this.logger.debug(`✅ Corte encontrado: "${stage.name}"`);
        }
      }

      // Se já encontrou ambos, pode parar
      if (hasModelagem && hasCorte) {
        break;
      }
    }

    // 🔥 LOG DETALHADO
    this.logger.log('📊 Resultado da validação:', {
      hasModelagem,
      hasCorte,
      totalStages: stages.length,
      stageNames: stages.map((s) => s.name),
    });

    // 🔥 BLOQUEIA SE FALTAR ALGUMA
    if (!hasModelagem || !hasCorte) {
      const missing = [] as any;
      if (!hasModelagem) missing.push('Modelagem');
      if (!hasCorte) missing.push('Corte');

      const errorMessage = `❌ Não é possível salvar o template. Etapas obrigatórias não encontradas: ${missing.join(' e ')}.`;

      this.logger.error(errorMessage);
      throw new BadRequestException(errorMessage);
    }

    this.logger.log('✅ Validação passou: Fluxo possui Modelagem e Corte');
  }

  async saveTemplate(flowId: string, name: string, userId: string) {
    const companyId = this.getCompanyIdFromContext();

    // 🔥 PASSO 1: Buscar as stages do fluxo
    const stages = await this.prisma.flowStage.findMany({
      where: { flowId, flow: { companyId } },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) throw new BadRequestException('Fluxo sem etapas.');

    // 🔥 PASSO 2: VERIFICAR SE EXISTEM MODELAGEM E CORTE
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

    console.log('\n' + '='.repeat(80));
    console.log('🎯 [createFlowItem] INICIANDO CRIAÇÃO DE ITEM');
    console.log('='.repeat(80));
    console.log('📦 Dados recebidos:', {
      flowId,
      userId,
      companyId,
      dto: {
        title: dto.title,
        description: dto.description,
        productRef: dto.productRef,
        quantity: dto.quantity,
        status: dto.status,
        stageId: dto.stageId,
        assignedToId: dto.assignedToId,
        supplierId: dto.supplierId,
        dueDate: dto.dueDate,
        productionStartedAt: dto.productionStartedAt,
        deliveryAt: dto.deliveryAt,
        orderNumber: dto.orderNumber,
        priority: dto.priority,
      },
    });

    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
    });

    if (!user) {
      console.error('❌ Usuário não encontrado:', { userId, companyId });
      throw new ForbiddenException(
        'Usuário não encontrado ou não pertence à empresa',
      );
    }

    console.log('✅ Usuário encontrado:', {
      id: user.id,
      name: user.name,
      role: user.role,
      professionalRole: user.professionalRole,
    });

    return this.prisma.$transaction(async (tx) => {
      // ──────────────────────────────────────────────────────────────
      // VALIDAÇÃO DE DUPLICIDADE - VERSÃO CORRIGIDA
      // ──────────────────────────────────────────────────────────────
      console.log('\n🔍 Verificando duplicidade para título e referência:', {
        title: dto.title,
        productRef: dto.productRef,
        companyId,
      });

      // 🔥 PASSO 1: Criar array para as condições
      const orConditions: Array<{ title?: string; productRef?: string }> = [];

      // 🔥 PASSO 2: Só adicionar título se tiver valor
      if (
        dto.title &&
        typeof dto.title === 'string' &&
        (dto.title as string).trim() !== ''
      ) {
        orConditions.push({ title: dto.title.trim() });
      }

      // 🔥 PASSO 3: Só adicionar referência se tiver valor
      if (
        dto.productRef &&
        typeof dto.productRef === 'string' &&
        dto.productRef.trim() !== ''
      ) {
        orConditions.push({ productRef: dto.productRef.trim() });
      }

      // 🔥 PASSO 4: Declarar existingItem SEM tipagem explícita (deixa o TS inferir)
      let existingItem: any = null;

      // 🔥 PASSO 5: Só buscar se houver condições
      if (orConditions.length > 0) {
        console.log(
          '🔎 Condições de busca:',
          JSON.stringify(orConditions, null, 2),
        );

        existingItem = await tx.flowItem.findFirst({
          where: {
            companyId,
            OR: orConditions,
          },
        });

        // 🔥 PASSO 6: Verificar duplicidade (TypeScript já sabe que existingItem pode ser objeto)
        if (existingItem) {
          console.log('⚠️ Item existente encontrado:', {
            id: existingItem.id,
            title: existingItem.title,
            productRef: existingItem.productRef,
          });

          // Título duplicado
          if (dto.title && existingItem.title === dto.title.trim()) {
            console.error('❌ Título duplicado:', {
              existente: existingItem.title,
              tentado: dto.title,
            });
            throw new BadRequestException(
              `Já existe um item cadastrado com o título "${dto.title}". Por favor, utilize um título diferente.`,
            );
          }

          // Referência duplicada
          if (
            dto.productRef &&
            existingItem.productRef === dto.productRef.trim()
          ) {
            console.error('❌ Referência duplicada:', {
              existente: existingItem.productRef,
              tentada: dto.productRef,
            });
            throw new BadRequestException(
              `Já existe um item cadastrado com a referência "${dto.productRef}". Por favor, utilize uma referência diferente.`,
            );
          }
        } else {
          console.log('✅ Nenhum item duplicado encontrado');
        }
      } else {
        console.log(
          'ℹ️ Nenhum critério de duplicidade informado - pulando verificação',
        );
      }

      // ──────────────────────────────────────────────────────────────
      // RESTO DO CÓDIGO (igual ao seu, mas usando tx)
      // ──────────────────────────────────────────────────────────────

      // Busca do fluxo
      const flow = await tx.productFlow.findFirst({
        where: { id: flowId, companyId },
      });

      if (!flow) {
        throw new BadRequestException('Fluxo não encontrado');
      }

      // Busca da stage
      const targetStage = dto.stageId
        ? await tx.flowStage.findFirst({
            where: {
              id: dto.stageId,
              flowId,
              companyId,
            },
          })
        : await tx.flowStage.findFirst({
            where: { flowId, companyId },
            orderBy: { order: 'asc' },
          });

      if (!targetStage) {
        throw new BadRequestException(
          'Etapa inválida ou não pertence ao fluxo informado',
        );
      }

      console.log('✅ Etapa selecionada:', {
        id: targetStage.id,
        nome: targetStage.name,
        order: targetStage.order,
      });

      this.validateStageAccess(user, targetStage);

      // Ordem dentro da etapa
      const lastItem = await tx.flowItem.findFirst({
        where: { stageId: targetStage.id },
        orderBy: { orderInStage: 'desc' },
        select: { orderInStage: true },
      });

      const orderInStage = (lastItem?.orderInStage ?? -1) + 1;

      // Preparar dados para criação
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

      // Criar item
      const item = await tx.flowItem.create({
        data: dataToCreate,
      });

      console.log('✅ Item criado com sucesso:', {
        id: item.id,
        title: item.title,
        stageId: item.stageId,
      });

      // Auditoria
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
          assignedToId: item.assignedToId,
          supplierId: item.supplierId,
        },
        metadata: {
          flowId: item.flowId,
          stageName: targetStage.name,
        },
      });

      await this.invalidateFlowCache(companyId, flowId);

      console.log('🎯 [createFlowItem] FINALIZADO COM SUCESSO');
      console.log('='.repeat(80));

      return item;
    });
  }

  // ===========================================================================
  // 🔥 ATUALIZAR ITEM DO FLUXO - COM DETECÇÃO CORRETA DE CAMPOS ALTERADOS
  // ===========================================================================
  async updateFlowItem(itemId: string, userId: string, data: any) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(`📝 Atualizando item ${itemId} pelo usuário ${userId}`);

    // Busca item e usuário em paralelo
    const [item, user] = await Promise.all([
      this.prisma.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: {
          stage: true,
          assignedTo: true,
          supplier: true,
        },
      }),
      this.prisma.user.findFirst({
        where: { id: userId, companyId },
      }),
    ]);

    if (!item) {
      this.logger.error(`❌ Item ${itemId} não encontrado`);
      throw new NotFoundException('Item não encontrado');
    }

    if (!user) {
      this.logger.error(`❌ Usuário ${userId} não encontrado`);
      throw new NotFoundException('Usuário não encontrado');
    }

    // ===========================================================================
    // 🔥 VALIDAÇÃO DE DUPLICIDADE AO ATUALIZAR - VERSÃO CORRIGIDA
    // ===========================================================================
    if (data.title || data.productRef) {
      this.logger.log(
        `🔍 Verificando duplicidade para atualização do item ${itemId}`,
      );

      const orConditions: any[] = [];

      if (data.title && data.title !== item.title) {
        orConditions.push({ title: data.title });
      }

      if (data.productRef && data.productRef !== item.productRef) {
        orConditions.push({ productRef: data.productRef });
      }

      if (orConditions.length > 0) {
        const existingItem = await this.prisma.flowItem.findFirst({
          where: {
            companyId,
            NOT: { id: itemId },
            OR: orConditions,
          },
        });

        if (existingItem) {
          if (existingItem.title === data.title) {
            throw new BadRequestException(
              `Já existe outro item com o título "${data.title}". Por favor, utilize um título diferente.`,
            );
          } else if (
            data.productRef &&
            existingItem.productRef === data.productRef
          ) {
            throw new BadRequestException(
              `Já existe outro item com a referência "${data.productRef}". Por favor, utilize uma referência diferente.`,
            );
          }
        }
      }
    }

    // 🔥 VERIFICAR SE É ADMIN
    const adminRoles = ['MASTER', 'ADMIN', 'MANAGER'];
    const isAdmin = adminRoles.includes(user.role);

    if (isAdmin) {
      this.logger.debug(
        `👑 ADMIN DETECTADO (${user.role}) - Pulando validação de acesso`,
      );
    } else {
      this.logger.debug(`👤 Usuário comum - Validando acesso à etapa`);
      this.validateStageAccess(user, item.stage!);
    }

    // Guardar dados antigos para auditoria
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

    // Se estiver mudando de stage, validar a nova stage
    if (data.stageId && data.stageId !== item.stageId) {
      this.logger.debug(
        `📍 Item mudando de stage: ${item.stageId} -> ${data.stageId}`,
      );

      const newStage = await this.prisma.flowStage.findFirst({
        where: { id: data.stageId, companyId },
      });

      if (!newStage) {
        this.logger.error(`❌ Stage destino ${data.stageId} não encontrada`);
        throw new BadRequestException('Etapa de destino inválida');
      }

      if (!isAdmin) {
        this.logger.debug(`👤 Usuário comum - Validando acesso à nova stage`);
        this.validateStageAccess(user, newStage);
      } else {
        this.logger.debug(`👑 ADMIN - Pulando validação da nova stage`);
      }
    }

    // 🔥 VALIDAÇÕES DE QUANTIDADE PARA NÃO-ADMIN
    if (!isAdmin && data.quantity !== undefined) {
      this.logger.debug(
        `🔍 Usuário comum alterando quantidade para: ${data.quantity}`,
      );

      const sortedStages = await this.prisma.flowStage.findMany({
        where: { flowId: item.flowId, companyId },
        orderBy: { order: 'asc' },
      });

      const corteIndex = sortedStages.findIndex((s) =>
        this.isCorteStage(s.name),
      );

      if (corteIndex !== -1) {
        const currentStageIndex = sortedStages.findIndex(
          (s) => s.id === item.stageId,
        );
        const hasPassedCorte = currentStageIndex > corteIndex;

        if (hasPassedCorte) {
          const quantityNum = Number(data.quantity);
          if (!quantityNum || quantityNum < 1) {
            throw new BadRequestException(
              'Item já passou pela coluna Corte. A quantidade é obrigatória e deve ser maior que zero.',
            );
          }
        }
      }
    } else if (isAdmin) {
      this.logger.debug(`👑 ADMIN - Pode alterar quantidade sem restrições`);
    }

    // Preparar dados para atualização
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

    // Remover campos undefined
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Tratar datas
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

    // =======================================================================
    // 🔥 NOVA LÓGICA: DETECTAR APENAS OS CAMPOS QUE REALMENTE MUDARAM
    // =======================================================================
    const changedFields = Object.keys(updateData).filter((key) => {
      // Ignora campos de sistema
      if (key === 'updatedAt' || key === 'id' || key === 'createdAt') {
        return false;
      }

      // Pega os valores antigo e novo
      const oldValue = oldData[key as keyof typeof oldData];
      const newValue = updateData[key];

      // Se o campo não existia no oldData, considera como mudança
      if (!(key in oldData)) return true;

      // Trata null/undefined como equivalentes
      if (oldValue === null && newValue === undefined) return false;
      if (oldValue === undefined && newValue === null) return false;
      if (oldValue === null && newValue === null) return false;
      if (oldValue === undefined && newValue === undefined) return false;

      // Para datas, compara como strings ISO
      if (
        oldValue instanceof Date ||
        (oldValue && typeof oldValue === 'string' && oldValue.includes('T'))
      ) {
        const oldStr =
          oldValue instanceof Date ? oldValue.toISOString() : oldValue;
        const newStr =
          newValue instanceof Date ? newValue.toISOString() : newValue;

        // Extrai apenas a parte da data (YYYY-MM-DD) se for campo de data
        if (key.includes('Date') || key.includes('At')) {
          return oldStr.split('T')[0] !== newStr.split('T')[0];
        }
        return oldStr !== newStr;
      }

      // Para IDs, considera mudança se o valor for diferente
      if (key === 'supplierId' || key === 'assignedToId' || key === 'stageId') {
        return oldValue !== newValue;
      }

      // Comparação normal
      return JSON.stringify(oldValue) !== JSON.stringify(newValue);
    });

    // Cria objetos apenas com os campos alterados
    const oldChangedData: Record<string, any> = {};
    const newChangedData: Record<string, any> = {};

    changedFields.forEach((field) => {
      oldChangedData[field] = oldData[field as keyof typeof oldData];
      newChangedData[field] = updateData[field];
    });

    this.logger.debug(`📝 Campos que realmente mudaram:`, changedFields);
    // =======================================================================

    // Executar update
    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    this.logger.debug(`✅ Item atualizado com sucesso`);

    // Log de auditoria com informações detalhadas
    await this.auditService.log({
      action: 'UPDATE_ITEM',
      entity: 'FLOW_ITEM',
      entityId: itemId,
      userId,
      companyId,
      oldData: oldChangedData, // Só os campos que mudaram
      newData: newChangedData, // Só os campos que mudaram
      metadata: {
        isAdmin,
        adminRole: isAdmin ? user.role : undefined,
        changedFields, // Lista dos campos que mudaram
        totalChanged: changedFields.length,
        timestamp: new Date().toISOString(),
      },
    });

    // Invalidar cache
    await this.invalidateFlowCache(companyId, item.flowId);

    return updated;
  }

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
    this.logger.log('🎯 [MOVE_ITEM] Início da movimentação', {
      itemId,
      newStageId,
      userId,
      newOrder,
      selectedResponsibleId,
      selectedSupplierId,
      newQuantity, // 🔥 LOG DA NOVA QUANTIDADE
    });

    return this.executeWithResilience('move_item', async () => {
      return this.prisma.$transaction(
        async (tx) => {
          const companyId = this.cls.get<string>('tenantId');

          if (!companyId) {
            this.logger.error('❌ [MOVE_ITEM] companyId não encontrado no CLS');
            throw new ForbiddenException('Empresa não identificada');
          }

          // ===========================================================================
          // 🔥 PASSO 1: ATUALIZAR QUANTIDADE SE FORNECIDA (ANTES DA VALIDAÇÃO)
          // ===========================================================================
          if (newQuantity !== undefined) {
            this.logger.log(
              `📝 [MOVE_ITEM] Atualizando quantidade para: ${newQuantity}`,
            );
            await tx.flowItem.update({
              where: { id: itemId },
              data: { quantity: newQuantity },
            });
          }

          // ===========================================================================
          // 🔥 PASSO 2: BUSCAR USUÁRIO
          // ===========================================================================
          const user = await tx.user.findFirst({
            where: {
              id: userId,
              companyId,
              status: 'ACTIVE',
            },
            select: {
              id: true,
              role: true,
              name: true,
              professionalRole: true,
            },
          });

          if (!user) {
            this.logger.error(
              `❌ [MOVE_ITEM] Usuário ${userId} não encontrado`,
            );
            throw new NotFoundException('Usuário não encontrado');
          }

          const adminRoles = ['MASTER', 'ADMIN', 'MANAGER'];
          const isAdmin = adminRoles.includes(user.role);

          this.logger.log(
            `👤 [MOVE_ITEM] Usuário: ${user.name} (${user.role}) - Admin: ${isAdmin}`,
          );

          // ===========================================================================
          // 🔥 PASSO 3: VALIDAR QUANTIDADE (AGORA COM O VALOR ATUALIZADO)
          // ===========================================================================
          this.logger.log(
            `🔍 [MOVE_ITEM] Validando quantidade para ${isAdmin ? 'ADMIN' : 'usuário comum'}`,
          );

          await this.validateQuantityBeforeMove(
            itemId,
            newStageId,
            companyId,
            userId,
          );

          // ===========================================================================
          // 🔥 PASSO 4: BUSCAR ITEM E STAGE DESTINO
          // ===========================================================================
          const [item, nextStage] = await Promise.all([
            tx.flowItem.findFirst({
              where: { id: itemId, companyId },
              include: {
                stage: true,
                assignedTo: true,
                supplier: true,
                flow: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            }),
            tx.flowStage.findFirst({
              where: { id: newStageId, companyId },
            }),
          ]);

          if (!item) {
            this.logger.error(`❌ [MOVE_ITEM] Item ${itemId} não encontrado`);
            throw new NotFoundException('Item não encontrado');
          }

          if (!nextStage) {
            this.logger.error(
              `❌ [MOVE_ITEM] Stage ${newStageId} não encontrado`,
            );
            throw new NotFoundException('Etapa destino não encontrada');
          }

          this.logger.log(
            `📦 [MOVE_ITEM] Item: "${item.title}" (Qtd: ${item.quantity})`,
          );
          this.logger.log(
            `📍 [MOVE_ITEM] De: "${item.stage?.name}" -> Para: "${nextStage.name}"`,
          );

          // ===========================================================================
          // 🔥 PASSO 5: VALIDAR ACESSO À STAGE
          // ===========================================================================
          if (!isAdmin) {
            this.logger.log(
              `👤 [MOVE_ITEM] Validando acesso do usuário à stage origem`,
            );
            this.validateStageAccess(user, item.stage!);
          } else {
            this.logger.log(
              `👑 [MOVE_ITEM] ADMIN - Pulando validação de acesso`,
            );
          }

          const oldStageId = item.stageId;
          const oldAssignedToId = item.assignedToId;
          const oldSupplierId = item.supplierId;

          // ===========================================================================
          // 🔥 PASSO 6: VERIFICAR SE É COLUNA OFICINA
          // ===========================================================================
          const isOficina = nextStage.name.trim().toLowerCase() === 'oficina';
          this.logger.log(`🏭 [MOVE_ITEM] É coluna OFICINA? ${isOficina}`);

          // ===========================================================================
          // 🔥 PASSO 7: VALIDAÇÕES ESPECÍFICAS POR TIPO DE COLUNA
          // ===========================================================================
          if (!isAdmin) {
            if (isOficina) {
              if (!selectedSupplierId) {
                this.logger.error(
                  `❌ [MOVE_ITEM] Oficina selecionada mas sem supplierId`,
                );
                throw new BadRequestException(
                  'É obrigatório selecionar uma oficina para a coluna "Oficina"',
                );
              }
              if (selectedResponsibleId) {
                this.logger.error(`❌ [MOVE_ITEM] Oficina com responsibleId`);
                throw new BadRequestException(
                  'Não é permitido atribuir funcionário para a coluna "Oficina"',
                );
              }
            } else {
              if (selectedSupplierId) {
                this.logger.error(
                  `❌ [MOVE_ITEM] Coluna não-oficina com supplierId`,
                );
                throw new BadRequestException(
                  'Não é permitido atribuir oficina para colunas que não sejam "Oficina"',
                );
              }
            }
          } else {
            this.logger.log(
              `👑 [MOVE_ITEM] ADMIN - Pulando validações de responsável/oficina`,
            );
          }

          // ===========================================================================
          // 🔥 PASSO 8: CALCULAR NOVA ORDEM
          // ===========================================================================
          let finalOrder: number;

          if (newOrder !== undefined && newOrder >= 0) {
            this.logger.log(
              `📊 [MOVE_ITEM] Usando ordem específica: ${newOrder}`,
            );

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
            this.logger.log(`📊 [MOVE_ITEM] Ordem automática: ${finalOrder}`);
          }

          // ===========================================================================
          // 🔥 PASSO 9: PREPARAR DADOS DE ATUALIZAÇÃO
          // ===========================================================================
          const updateData: any = {
            stageId: newStageId,
            orderInStage: finalOrder,
            updatedAt: new Date(),
          };

          // Admin pode escolher qualquer combinação
          if (isAdmin) {
            this.logger.log(
              `👑 [MOVE_ITEM] ADMIN - Processando responsáveis livremente`,
            );

            if (selectedResponsibleId) {
              updateData.assignedToId = selectedResponsibleId;
              updateData.supplierId = null;
              this.logger.log(
                `👑 [MOVE_ITEM] ADMIN atribuindo funcionário: ${selectedResponsibleId}`,
              );
            }

            if (selectedSupplierId) {
              updateData.supplierId = selectedSupplierId;
              updateData.assignedToId = null;
              this.logger.log(
                `👑 [MOVE_ITEM] ADMIN atribuindo oficina: ${selectedSupplierId}`,
              );
            }
          } else {
            // Lógica normal para não-admin
            if (isOficina) {
              updateData.assignedToId = null;
              updateData.supplierId = selectedSupplierId;
              this.logger.log(
                `🏭 [MOVE_ITEM] Atribuindo oficina: ${selectedSupplierId}`,
              );
            } else {
              updateData.supplierId = null;
              if (selectedResponsibleId) {
                updateData.assignedToId = selectedResponsibleId;
                this.logger.log(
                  `👤 [MOVE_ITEM] Atribuindo responsável: ${selectedResponsibleId}`,
                );
              }
            }
          }

          // ===========================================================================
          // 🔥 PASSO 10: EXECUTAR UPDATE
          // ===========================================================================
          const updated = await tx.flowItem.update({
            where: { id: itemId },
            data: updateData,
            include: {
              assignedTo: { select: { id: true, name: true } },
              supplier: { select: { id: true, name: true } },
            },
          });

          this.logger.log(`✅ [MOVE_ITEM] Item movido com sucesso!`);

          // ===========================================================================
          // 🔥 PASSO 11: PREPARAR METADATA PARA AUDITORIA
          // ===========================================================================
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

          // ===========================================================================
          // 🔥 PASSO 12: LOG DE AUDITORIA
          // ===========================================================================
          await this.auditService.log({
            action: 'MOVE_ITEM',
            entity: 'FLOW_ITEM',
            entityId: itemId,
            userId,
            companyId,
            metadata,
          });

          // ===========================================================================
          // 🔥 PASSO 13: INVALIDAR CACHE
          // ===========================================================================
          await this.invalidateFlowCache(companyId, item.flowId);

          // ===========================================================================
          // 🔥 PASSO 14: INCREMENTAR MÉTRICA
          // ===========================================================================
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

          this.logger.log(
            '🎯 [MOVE_ITEM] ========================================',
          );
          this.logger.log(
            `🎯 [MOVE_ITEM] Movimentação concluída em ${Date.now() - startTime}ms`,
            {
              newStage: nextStage.name,
              newResponsible: isOficina
                ? updated.supplier?.name
                : updated.assignedTo?.name,
            },
          );

          return updated;
        },
        {
          timeout: 30000,
          maxWait: 30000,
          isolationLevel: 'ReadCommitted',
        },
      );
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

    // Filtros básicos
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

    // 🔥 CORREÇÃO: Processar isUpcoming PRIMEIRO (tem prioridade)
    if (isUpcoming === 'true') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setUTCDate(sevenDaysFromNow.getUTCDate() + 7);
      sevenDaysFromNow.setUTCHours(23, 59, 59, 999);

      console.log('🔍 UPCOMING - Período:', {
        start: today.toISOString(),
        end: sevenDaysFromNow.toISOString(),
      });

      whereClause.dueDate = {
        gte: today,
        lte: sevenDaysFromNow,
      };

      whereClause.status = {
        not: 'CONCLUIDO',
      };
    }
    // 🔥 Processar isOverdue
    else if (isOverdue === 'true') {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      whereClause.dueDate = {
        lt: today,
      };

      whereClause.status = {
        not: 'CONCLUIDO',
      };
    }
    // 🔥 Processar filtro por data personalizado (só se não for upcoming/overdue)
    else if (startDate || endDate) {
      const dateField =
        dateType === DateFilterType.DUE_DATE
          ? 'dueDate'
          : 'productionStartedAt';
      const dateFilter: any = {};

      if (startDate) {
        dateFilter.gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.lte = new Date(endDate);
      }

      whereClause[dateField] = dateFilter;
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
          dueDate: 'asc',
        },
      });

      // 🔥 LOG DO RESULTADO
      console.log('\n' + '='.repeat(60));
      console.log('📊 RESULTADO DO FILTRO:');
      console.log('='.repeat(60));
      console.log(`Total de itens encontrados: ${items.length}`);

      items.forEach((item) => {
        console.log(`\n📦 Item: "${item.title}"`);
        console.log(`   ID: ${item.id}`);
        console.log(
          `   dueDate: ${item.dueDate ? new Date(item.dueDate).toISOString() : 'NULL'}`,
        );
        console.log(`   status: ${item.status}`);
        console.log(`   flow: ${item.flow?.name}`);
      });

      return items;
    } catch (error) {
      this.logger.error('❌ Erro ao filtrar itens:', error);
      throw new BadRequestException('Erro ao aplicar filtros');
    }
  }

  // ===========================================================================
  // 🔥 MÉTODO CORRIGIDO - Mantém stages vazias quando filtradas por nome
  // ===========================================================================
  async getFilteredKanbanBoard(flowId: string, filters: FlowFilterDto) {
    const companyId = this.getCompanyIdFromContext();

    console.log('\n');
    console.log('='.repeat(80));
    console.log('🔍 [getFilteredKanbanBoard] INICIANDO FILTRAGEM');
    console.log('='.repeat(80));
    console.log('📌 flowId:', flowId);
    console.log('📌 companyId:', companyId);
    console.log('📌 filters recebidos:', JSON.stringify(filters, null, 2));
    console.log('📌 stageName:', filters.stageName);
    console.log('📌 stageName.trim():', filters.stageName?.trim());
    console.log('📌 stageName existe?', !!filters.stageName);
    console.log('📌 stageName length:', filters.stageName?.length);

    // Busca o fluxo com as stages
    console.log('\n🔍 Buscando fluxo no banco...');
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
      console.error('❌ Fluxo não encontrado!');
      throw new BadRequestException('Fluxo não encontrado');
    }

    console.log('✅ Fluxo encontrado:', board.name);
    console.log('📊 Total de stages no fluxo:', board.stages.length);
    console.log(
      '📋 Nomes das stages:',
      board.stages.map((s) => `"${s.name}"`).join(', '),
    );

    // ====================================================
    // PASSO 1: SE TIVER FILTRO POR NOME DA COLUNA
    // ====================================================
    if (filters.stageName && filters.stageName.trim() !== '') {
      const stageNameLower = filters.stageName.trim().toLowerCase();

      console.log('\n' + '-'.repeat(40));
      console.log('🎯 FILTRO POR NOME DA COLUNA ATIVADO');
      console.log('-'.repeat(40));
      console.log('🔍 stageName original:', filters.stageName);
      console.log('🔍 stageName lowerCase:', stageNameLower);

      // 🔥 FILTRA APENAS A COLUNA QUE CORRESPONDE AO NOME BUSCADO
      console.log('\n🔍 Filtrando stages que contém:', stageNameLower);

      const matchingStages = board.stages.filter((stage) => {
        const stageName = stage.name.toLowerCase();
        const matches = stageName.includes(stageNameLower);
        console.log(
          `   Stage "${stage.name}" (${stageName}) -> ${matches ? '✅ MATCH' : '❌'}`,
        );
        return matches;
      });

      console.log(
        `\n✅ Encontradas ${matchingStages.length} stage(s) com o nome "${filters.stageName}"`,
      );

      if (matchingStages.length > 0) {
        console.log(
          '📋 Stages encontradas:',
          matchingStages.map((s) => `"${s.name}"`).join(', '),
        );
      }

      // Se não encontrar nenhuma stage, retorna board com stages vazio
      if (matchingStages.length === 0) {
        console.warn(
          `⚠️ Nenhuma stage encontrada com o nome: "${filters.stageName}"`,
        );
        console.log('📤 Retornando board com stages vazio');
        return {
          ...board,
          stages: [],
        };
      }

      // ====================================================
      // PASSO 2: APLICAR OUTROS FILTROS NOS ITENS DA COLUNA ENCONTRADA
      // ====================================================
      const hasOtherFilters = this.hasFilters(filters);
      console.log('\n🔍 Verificando outros filtros:', hasOtherFilters);
      console.log('📊 Outros filtros presentes:', {
        startDate: !!filters.startDate,
        endDate: !!filters.endDate,
        isOverdue: filters.isOverdue === 'true',
        isUpcoming: filters.isUpcoming === 'true',
        assignedToId: !!filters.assignedToId,
        supplierId: !!filters.supplierId,
        status: !!filters.status,
        productRef: !!filters.productRef,
        dateType: !!filters.dateType,
      });

      if (!hasOtherFilters) {
        console.log(
          '\n✅ Sem outros filtros, retornando APENAS as stages encontradas',
        );
        console.log(
          '📤 Stages sendo retornadas:',
          matchingStages.map((s) => `"${s.name}"`).join(', '),
        );
        console.log(
          '📊 Total de itens:',
          matchingStages.reduce((acc, s) => acc + s.items.length, 0),
        );

        return {
          ...board,
          stages: matchingStages, // 🔥 Retorna as stages encontradas, mesmo sem itens
        };
      }

      // Se tem outros filtros, busca itens filtrados
      console.log('\n🔍 Aplicando filtros adicionais nos itens...');
      console.log(
        '📡 Chamando getFilteredItems com filters:',
        JSON.stringify(filters, null, 2),
      );

      const filteredItems = await this.getFilteredItems(filters);
      console.log(`✅ getFilteredItems retornou ${filteredItems.length} itens`);

      if (filteredItems.length > 0) {
        console.log(
          '📋 IDs dos itens filtrados:',
          filteredItems.map((i) => i.id).join(', '),
        );
      } else {
        console.log('⚠️ Nenhum item encontrado nos filtros adicionais');
      }

      const filteredItemIds = new Set(filteredItems.map((item) => item.id));
      console.log(`📊 Set de IDs criado com ${filteredItemIds.size} itens`);

      // Aplica filtros nos itens das stages encontradas
      console.log('\n🔍 Aplicando filtros nos itens de cada stage:');
      const finalStages = matchingStages.map((stage) => {
        console.log(`\n📌 Processando stage: "${stage.name}"`);
        console.log(`   Total de itens na stage: ${stage.items.length}`);

        const stageFilteredItems = stage.items.filter((item) => {
          const has = filteredItemIds.has(item.id);
          console.log(
            `   Item "${item.title}" (${item.id}) -> ${has ? '✅ MANTIDO' : '❌ REMOVIDO'}`,
          );
          return has;
        });

        console.log(
          `   ✅ ${stageFilteredItems.length} itens mantidos após filtros`,
        );

        return {
          ...stage,
          items: stageFilteredItems,
        };
      });

      // 🔥 IMPORTANTE: NÃO REMOVER STAGES VAZIAS QUANDO TEM FILTRO POR NOME
      console.log(
        '\n🔍 Mantendo stages mesmo sem itens (filtro por nome ativo)',
      );
      console.log(
        `📤 Stages retornadas:`,
        finalStages.map((s) => `"${s.name}"`).join(', '),
      );
      console.log(
        '📊 Total de itens:',
        finalStages.reduce((acc, s) => acc + s.items.length, 0),
      );

      return {
        ...board,
        stages: finalStages, // 🔥 Retorna TODAS as stages encontradas, mesmo sem itens
      };
    }

    // ====================================================
    // SE NÃO TIVER FILTRO POR NOME DA COLUNA - COMPORTAMENTO NORMAL
    // ====================================================
    console.log('\n' + '-'.repeat(40));
    console.log('🌐 FILTRO GLOBAL (SEM COLUNA ESPECÍFICA)');
    console.log('-'.repeat(40));

    if (!this.hasFilters(filters)) {
      console.log('✅ Sem filtros, retornando board completo');
      console.log('📊 Total de stages:', board.stages.length);
      console.log(
        '📊 Total de itens:',
        board.stages.reduce((acc, s) => acc + s.items.length, 0),
      );
      return board;
    }

    console.log('\n🔍 Aplicando filtros adicionais nos itens...');
    console.log(
      '📡 Chamando getFilteredItems com filters:',
      JSON.stringify(filters, null, 2),
    );

    const filteredItems = await this.getFilteredItems(filters);
    console.log(`✅ getFilteredItems retornou ${filteredItems.length} itens`);

    const filteredItemIds = new Set(filteredItems.map((item) => item.id));
    console.log(`📊 Set de IDs criado com ${filteredItemIds.size} itens`);

    console.log('\n🔍 Filtrando itens em cada stage:');
    const filteredStages = board.stages.map((stage) => {
      console.log(`\n📌 Stage "${stage.name}":`);
      console.log(`   Total original: ${stage.items.length}`);

      const stageFilteredItems = stage.items.filter((item) => {
        const has = filteredItemIds.has(item.id);
        console.log(
          `   Item "${item.title}" -> ${has ? '✅ MANTIDO' : '❌ REMOVIDO'}`,
        );
        return has;
      });

      console.log(`   ✅ ${stageFilteredItems.length} itens mantidos`);

      return {
        ...stage,
        items: stageFilteredItems,
      };
    });

    // 🔥 Remove stages vazias APENAS no filtro global
    console.log('\n🔍 Removendo stages sem itens...');
    const stagesWithItems = filteredStages.filter((stage) => {
      const hasItems = stage.items.length > 0;
      console.log(
        `   Stage "${stage.name}": ${stage.items.length} itens -> ${hasItems ? '✅ MANTIDA' : '❌ REMOVIDA'}`,
      );
      return hasItems;
    });

    console.log(
      `\n✅ Board final com ${stagesWithItems.length} stage(s) contendo itens`,
    );
    console.log(
      '📊 Total de itens:',
      stagesWithItems.reduce((acc, s) => acc + s.items.length, 0),
    );
    console.log('='.repeat(80));
    console.log('\n');

    return {
      ...board,
      stages: stagesWithItems,
    };
  }

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
        professionalRole: {
          contains: allowedRole,
          mode: 'insensitive',
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 1,
    });

    return users.length > 0 ? users[0].id : null;
  }

  // 🔥 MÉTODO AUXILIAR - VERIFICA SE EXISTEM FILTROS
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
    // NOTA: stageName NÃO está incluído aqui porque já foi tratado separadamente
  }
  // TODO: REVISAR
  private validateStageAccess(
    user: { role: string; professionalRole: string | null },
    stage: { name: string; allowedRole: string | null },
  ) {
    console.log('🔍 [BACKEND] Comparação de cargo:', {
      userProfessionalRole: user.professionalRole,
      stageAllowedRole: stage.allowedRole,
      match:
        user.professionalRole?.trim().toLowerCase() ===
        stage.allowedRole?.trim().toLowerCase(),
    });

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

  // ===========================================================================
  // 🔥 NOVO MÉTODO: FILTRAR KANBAN POR NOME DA COLUNA
  // ===========================================================================
  async getKanbanBoardByStageName(flowId: string, stageName: string) {
    const companyId = this.getCompanyIdFromContext();

    this.logger.log(
      `🔍 Filtrando kanban por stage name: "${stageName}" para flow ${flowId}`,
    );

    // Busca o fluxo com as stages
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

    // Se não tiver stageName, retorna o board completo
    if (!stageName || stageName.trim() === '') {
      return flow;
    }

    // Filtra para trazer APENAS a stage com o nome especificado
    const stageNameLower = stageName.trim().toLowerCase();

    const filteredStages = flow.stages
      .filter((stage) => stage.name.toLowerCase().includes(stageNameLower))
      .map((stage) => ({
        ...stage,
        items: stage.items, // Mantém todos os itens da stage filtrada
      }));

    // Se não encontrar nenhuma stage com esse nome
    if (filteredStages.length === 0) {
      this.logger.warn(
        `⚠️ Nenhuma stage encontrada com o nome: "${stageName}"`,
      );
      // Retorna um board vazio (sem stages)
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

  // ===========================================================================
  // 🔥 MÉTODO PARA BUSCAR TODAS AS COLUNAS (para dropdown de filtro)
  // ===========================================================================
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
}

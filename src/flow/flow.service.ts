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
    private readonly cls: ClsService,
    private supabase: SupabaseService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectMetric('flow_item_moves_total')
    public moveCounter: Counter<string>,
    @InjectMetric('db_operation_duration_seconds')
    public dbHistogram: Histogram<string>,
  ) {}

  // ===========================================================================
  // 🛡️ LÓGICA DE SEGURANÇA (O CORAÇÃO DO REVIEW)
  // ===========================================================================

  private validateStageAccess(
    user: { role: string; professionalRole: string | null },
    stage: { name: string; allowedRole: string | null },
  ) {
    console.log(
      '[VALIDATE_ACCESS] Início → user.role:',
      user.role,
      'user.professionalRole:',
      user.professionalRole,
      'stage.allowedRole:',
      stage.allowedRole,
      'stage.name:',
      stage.name,
    );

    if (['MASTER', 'ADMIN'].includes(user.role)) {
      console.log('[VALIDATE_ACCESS] Liberado por role MASTER/ADMIN');
      return true;
    }

    // Se allowedRole for null, undefined, "null" ou string vazia, LIBERA
    if (
      !stage.allowedRole ||
      stage.allowedRole.trim() === '' ||
      stage.allowedRole === 'null' ||
      stage.allowedRole === 'all'
    ) {
      console.log('[VALIDATE_ACCESS] Liberado por allowedRole vazio/all/null');
      return true;
    }

    const userRole = user.professionalRole?.trim().toLowerCase() || '';
    const required = stage.allowedRole.trim().toLowerCase();

    const roles = userRole.split(',').map((r) => r.trim());
    const hasAccess = roles.some((r) => r === required); // Match exato

    console.log(
      '[VALIDATE_ACCESS] Cálculo → userRoles:',
      roles,
      'required:',
      required,
      'hasAccess:',
      hasAccess,
    );

    if (!hasAccess) {
      console.log('[VALIDATE_ACCESS] Bloqueado → Erro de permissão');
      throw new ForbiddenException(
        `Acesso restrito ao cargo: ${stage.allowedRole}`,
      );
    }

    console.log('[VALIDATE_ACCESS] Liberado por match de role');
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
  // 🟢 GERENCIAMENTO DE TEMPLATES
  // ===========================================================================

  async getTemplates(companyId: string) {
    return this.prisma.flowTemplate.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async saveTemplate(companyId: string, flowId: string, name: string) {
    const stages = await this.prisma.flowStage.findMany({
      where: { flowId, flow: { companyId } },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) throw new BadRequestException('Fluxo sem etapas.');

    const structure = stages.map((s) => ({ name: s.name, color: s.color }));
    return this.prisma.flowTemplate.create({
      data: { name, companyId, structure },
    });
  }

  async applyTemplate(companyId: string, flowId: string, templateId: string) {
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

    return this.prisma.$transaction(async (tx) => {
      for (const s of structure) {
        await tx.flowStage.create({
          data: {
            name: s.name,
            color: s.color || '#2C3E50',
            order: nextOrder++,
            flowId,
            companyId,
          },
        });
      }
      await this.invalidateFlowCache(companyId, flowId);
      return { success: true };
    });
  }

  async deleteTemplate(companyId: string, templateId: string) {
    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) throw new NotFoundException('Template não encontrado');
    return this.prisma.flowTemplate.delete({ where: { id: templateId } });
  }

  // ===========================================================================
  // 🔵 GERENCIAMENTO DE FLUXO (PRODUCT FLOW)
  // ===========================================================================

  async createFlow(companyId: string, userId: string, dto: CreateFlowDto) {
    const flow = await this.prisma.productFlow.create({
      data: {
        name: dto.name,
        companyId,
        color: (dto as any).color || '#D35400',
      },
    });
    await this.invalidateFlowCache(companyId);
    return flow;
  }

  async getFlows(companyId: string) {
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
    await this.cacheManager.set(cacheKey, flows, this.CACHE_TTL);
    return flows;
  }

  async deleteFlow(flowId: string, companyId: string) {
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
    await this.invalidateFlowCache(companyId, flowId);
    return { success: true };
  }

  // ===========================================================================
  // 🟠 GERENCIAMENTO DE ETAPAS (STAGES)
  // ===========================================================================

  async createStage(companyId: string, flowId: string, data: CreateStageDto) {
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
    await this.invalidateFlowCache(companyId, flowId);
    return stage;
  }

  async updateStage(companyId: string, stageId: string, data: any) {
    const stage = await this.prisma.flowStage.findFirst({
      where: { id: stageId, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    const updated = await this.prisma.flowStage.update({
      where: { id: stageId },
      data: {
        name: data.name,
        color: data.color,
        order: data.order,
        allowedRole: data.allowedRole,
      },
    });
    await this.invalidateFlowCache(companyId, stage.flowId);
    return updated;
  }

  async deleteStage(stageId: string, companyId: string) {
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
    await this.invalidateFlowCache(companyId, stage.flowId);
    return { success: true };
  }

  // ===========================================================================
  // 🟡 GERENCIAMENTO DE ITENS E KANBAN
  // ===========================================================================

  async getKanbanBoard(flowId: string, companyId: string) {
    const board = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              // GARANTE QUE O PRISMA TRAGA NA ORDEM CORRETA PARA O FRONTEND
              orderBy: { orderInStage: 'asc' },
              include: {
                images: { take: 1, select: { url: true, id: true } },
                assignedTo: { select: { name: true, id: true } }, // Inclui assignedTo
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

  async createFlowItem(
    companyId: string,
    flowId: string,
    userId: string,
    dto: CreateFlowItemDto,
  ) {
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

      // 🔥 CORREÇÃO: Criar objeto manualmente com conversão direta das datas
      const dataToCreate: any = {
        // Campos obrigatórios
        title: dto.title,
        flowId: flowId,
        companyId: companyId,
        stageId: targetStage.id,
        orderInStage: (lastItem?.orderInStage ?? -1) + 1,
        enteredAt: new Date(),

        // Campos opcionais com valores padrão
        orderNumber: dto.orderNumber || '',
        productRef: dto.productRef || '',
        quantity: dto.quantity || 1,
        priority: dto.priority || 3,
        status: dto.status || 'PENDENTE',
        description: dto.description || null,
        assignedToId: dto.assignedToId || null,
        supplierId: dto.supplierId || null,
      };

      // 🔥 Converter dueDate para Date se existir
      if (dto.dueDate) {
        dataToCreate.dueDate = new Date(dto.dueDate);
      }

      // 🔥 Converter productionStartedAt para Date se existir
      if (dto.productionStartedAt) {
        dataToCreate.productionStartedAt = new Date(dto.productionStartedAt);
      }

      // 🔥 Converter deliveryAt para Date se existir
      if (dto.deliveryAt) {
        dataToCreate.deliveryAt = new Date(dto.deliveryAt);
      }

      const item = await tx.flowItem.create({
        data: dataToCreate,
      });

      await this.invalidateFlowCache(companyId, flowId);
      return item;
    });
  }

  async updateFlowItem(
    companyId: string,
    itemId: string,
    userId: string,
    data: any,
  ) {
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

    // Proteção IDOR: Se mudar de etapa, valida se a nova etapa pertence à empresa
    if (data.stageId && data.stageId !== item.stageId) {
      const newStage = await this.prisma.flowStage.findFirst({
        where: { id: data.stageId, companyId },
      });
      if (!newStage) throw new BadRequestException('Etapa de destino inválida');
      this.validateStageAccess(user, newStage);
    }

    // 🔥 CORREÇÃO: Criar objeto de atualização manualmente
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

    // 🔥 Remover campos undefined
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // 🔥 Converter dueDate para Date se existir
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    // 🔥 Converter productionStartedAt para Date se existir
    if (data.productionStartedAt !== undefined) {
      updateData.productionStartedAt = data.productionStartedAt
        ? new Date(data.productionStartedAt)
        : null;
    }

    // 🔥 Converter deliveryAt para Date se existir
    if (data.deliveryAt !== undefined) {
      updateData.deliveryAt = data.deliveryAt
        ? new Date(data.deliveryAt)
        : null;
    }

    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: updateData,
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
            include: { stage: true },
          }),
          tx.flowStage.findFirst({ where: { id: newStageId, companyId } }),
          tx.user.findFirst({ where: { id: userId, companyId } }),
        ]);

        if (!item || !nextStage || !user) {
          throw new NotFoundException('Item, etapa ou usuário não encontrado');
        }

        // ──── VALIDAÇÃO APENAS NA ETAPA DE ORIGEM ────
        console.log(
          '[MOVE_ITEM] Validando permissão apenas na ORIGEM:',
          item.stage?.name,
        );
        this.validateStageAccess(user, item.stage!);

        // NÃO validamos a etapa destino
        // O usuário pode jogar para qualquer coluna, desde que consiga tirar da atual

        // ──── LÓGICA DE REORDENAÇÃO ────
        let finalOrder: number;

        if (newOrder !== undefined && newOrder >= 0) {
          // Reordenação explícita
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
          // Final da coluna
          const last = await tx.flowItem.findFirst({
            where: { stageId: newStageId },
            orderBy: { orderInStage: 'desc' },
            select: { orderInStage: true },
          });
          finalOrder = (last?.orderInStage ?? -1) + 1;
        }

        // Atualiza o item
        const updated = await tx.flowItem.update({
          where: { id: itemId },
          data: {
            stageId: newStageId,
            orderInStage: finalOrder,
            updatedAt: new Date(),
          },
        });

        await this.invalidateFlowCache(companyId, item.flowId);

        console.log('[MOVE_ITEM] Movimentação concluída com sucesso');
        return updated;
      });
    });
  }

  async advanceItemToNextStage(itemId: string, userId: string) {
    const companyId = this.cls.get<string>('tenantId');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: { stage: true },
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
      const nextStage =
        allStages[allStages.findIndex((s) => s.id === item.stageId) + 1];

      if (!nextStage) throw new BadRequestException('Fim da esteira.');
      const updated = await tx.flowItem.update({
        where: { id: itemId },
        data: { stageId: nextStage.id, updatedAt: new Date() },
      });
      await this.invalidateFlowCache(companyId!, item.flowId);
      return updated;
    });
  }

  async deleteItem(itemId: string, companyId: string) {
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { images: true, audios: true, videos: true },
    });
    if (!item) throw new NotFoundException();

    await this.cleanUpFlowFiles([item]);
    await this.prisma.flowItem.delete({ where: { id: itemId } });
    await this.invalidateFlowCache(companyId, item.flowId);
    return { success: true };
  }

  // ===========================================================================
  // 📁 MÍDIAS E SUPORTE
  // ===========================================================================

  async addMediaToItem(
    companyId: string,
    itemId: string,
    file: Express.Multer.File,
    type: 'image' | 'audio' | 'video',
    userId: string,
  ) {
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

    const media =
      type === 'image'
        ? await this.prisma.flowImage.create({ data })
        : type === 'audio'
          ? await this.prisma.flowAudio.create({
              data: { ...data, duration: 0 },
            })
          : await this.prisma.flowVideo.create({
              data: { ...data, duration: 0 },
            });

    await this.invalidateFlowCache(companyId, item.flowId);
    return media;
  }

  async deleteMedia(
    companyId: string,
    itemId: string,
    type: 'image' | 'audio' | 'video',
    mediaId: string,
  ) {
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

  /**
   * Filtra itens com base nos critérios fornecidos
   * @param companyId ID da empresa
   * @param filters Filtros aplicados
   * @returns Lista de itens filtrados
   */
  async getFilteredItems(companyId: string, filters: FlowFilterDto) {
    const {
      startDate,
      endDate,
      dateType,
      isOverdue,
      isUpcoming,
      assignedToId,
      supplierId,
      status,
      productRef, // 🔥 NOVO: Desestruturar o productRef
    } = filters;

    this.logger.log(`🔍 FILTRANDO ITENS para empresa ${companyId}`);
    this.logger.log(`📦 productRef recebido: "${productRef}"`);
    this.logger.log(`📦 filters completos:`, JSON.stringify(filters));

    const whereClause: any = {
      companyId,
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
      this.logger.log(`🔎 Aplicando filtro productRef: "${productRef}"`);
      whereClause.productRef = {
        contains: productRef.trim(),
        mode: 'insensitive',
      };
      this.logger.log(`📝 whereClause gerado:`, JSON.stringify(whereClause));
    }

    // Lógica para filtro por intervalo de datas
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

    // Lógica para itens PRÓXIMOS A VENCER (próximos 7 dias)
    if (isUpcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      whereClause.AND = [
        {
          productionStartedAt: {
            not: null,
          },
        },
        {
          productionStartedAt: {
            gte: today,
            lte: nextWeek,
          },
        },
        {
          status: {
            not: 'CONCLUIDO',
          },
        },
      ];
    }

    // Buscar itens com includes completos
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

      this.logger.log(`✅ Encontrados ${items.length} itens`);
      this.logger.log(
        `📋 IDs dos itens encontrados:`,
        items.map((i) => ({ id: i.id, productRef: i.productRef })),
      );
      return items;
    } catch (error) {
      this.logger.error('Erro ao filtrar itens:', error);
      throw new BadRequestException('Erro ao aplicar filtros');
    }
  }

  /**
   * Versão otimizada para o Kanban - retorna o board completo com itens filtrados
   */
  async getFilteredKanbanBoard(
    flowId: string,
    companyId: string,
    filters: FlowFilterDto,
  ) {
    // Primeiro busca o board completo
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

    // Se não há filtros, retorna o board completo
    if (!this.hasFilters(filters)) {
      return board;
    }

    // Aplica os filtros nos itens
    const filteredItems = await this.getFilteredItems(companyId, {
      ...filters,
      // Garante que só busca itens deste flow
    });

    // Filtra os itens em cada stage baseado nos resultados
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
}

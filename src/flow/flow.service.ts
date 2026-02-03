/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Counter, Histogram } from 'prom-client';
import { CreateFlowDto, CreateFlowItemDto } from './dto/create-flow.dto';

// --- MÉTRICAS DE OBSERVABILIDADE ---
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
  private readonly CACHE_TTL = 30000; // 30 segundos

  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Helper privado para limpar o cache quando a estrutura do Kanban muda.
   * Pilar: Performance & Consistency.
   */
  private async invalidateFlowCache(companyId: string, flowId?: string) {
    await this.cacheManager.del(`flows_list_${companyId}`);
    if (flowId) {
      await this.cacheManager.del(`flow_board_${flowId}`);
      await this.cacheManager.del(`flow_stats_${flowId}`);
    }
  }

  // ===========================================================================
  // 🟢 SISTEMA DE TEMPLATES DE ETAPAS
  // ===========================================================================

  /**
   * Busca todos os templates salvos da empresa.
   */
  async getTemplates(companyId: string) {
    this.logger.log(`Buscando templates para a empresa: ${companyId}`);
    return await this.prisma.flowTemplate.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Salva a estrutura de colunas atual de um fluxo como um template.
   */
  async saveTemplate(companyId: string, flowId: string, name: string) {
    this.logger.log(`Iniciando saveTemplate para FlowID: ${flowId} na Empresa: ${companyId}`);

    const stages = await this.prisma.flowStage.findMany({
      where: { flowId: flowId, flow: { companyId } },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) {
      this.logger.warn(`Falha ao salvar template: Fluxo ${flowId} não possui etapas.`);
      throw new BadRequestException('O fluxo não possui etapas para salvar.');
    }

    const structure = stages.map(s => ({ name: s.name, color: s.color }));

    const template = await this.prisma.flowTemplate.create({
      data: { name, companyId, structure },
    });

    this.logger.log(`Template "${name}" criado com sucesso! ID: ${template.id}`);
    flowOpsCounter.labels('save_template', 'success').inc();
    return template;
  }

  /**
   * Aplica um template clonando suas etapas para dentro de um fluxo.
   */
  async applyTemplate(companyId: string, flowId: string, templateId: string) {
    this.logger.log(`Aplicando Template ${templateId} ao Fluxo ${flowId}`);

    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });

    if (!template) throw new NotFoundException('Template não encontrado');

    const structure = template.structure as any[];

    // Busca a última posição para não encavalar ordens
    const lastStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'desc' },
    });

    let nextOrder = (lastStage?.order ?? -1) + 1;

    return this.prisma.$transaction(async (tx) => {
      const created: any[] = [];
      for (const s of structure) {
        const stage = await tx.flowStage.create({
          data: {
            name: s.name,
            color: s.color || '#2C3E50',
            order: nextOrder++,
            flowId,
            companyId,
          },
        });
        created.push(stage);
      }
      await this.invalidateFlowCache(companyId, flowId);
      this.logger.log(`Template aplicado: ${created.length} novas etapas no fluxo ${flowId}`);
      return created;
    });
  }

  // flow.service.ts

  /**
   * Exclui um template de etapas da empresa.
   */
  async deleteTemplate(companyId: string, templateId: string) {
    this.logger.log(`Iniciando exclusão de template: ${templateId} para empresa: ${companyId}`);

    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });

    if (!template) {
      this.logger.warn(`Template ${templateId} não encontrado ou acesso negado para empresa ${companyId}`);
      throw new NotFoundException('Template não encontrado');
    }

    await this.prisma.flowTemplate.delete({
      where: { id: templateId },
    });

    this.logger.log(`Template ${templateId} excluído com sucesso.`);
    return { success: true };
  }

  // ===========================================================================
  // 🔵 GESTÃO DE FLUXOS (ESTEIRAS)
  // ===========================================================================

  async createFlow(companyId: string, userId: string, dto: CreateFlowDto) {
    const end = dbLatency.labels('createFlow').startTimer();
    try {
      const flow = await this.prisma.productFlow.create({
        data: {
          name: dto.name,
          companyId,
          color: (dto as any).color || '#D35400',
        },
        include: { stages: true },
      });

      await this.invalidateFlowCache(companyId);
      flowOpsCounter.labels('createFlow', 'success').inc();
      end();
      return flow;
    } catch (error) {
      flowOpsCounter.labels('createFlow', 'error').inc();
      end();
      throw error;
    }
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

  async getKanbanBoard(flowId: string, companyId: string) {
    const cacheKey = `flow_board_${flowId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const board = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { orderInStage: 'asc' },
              include: {
                images: { select: { url: true, id: true }, take: 1 },
                videos: { select: { url: true, id: true, filename: true } },
                audios: { select: { url: true, id: true, filename: true } },
                assignedTo: { select: { name: true, email: true } },
                supplier: { select: { id: true, name: true } },
                _count: { select: { images: true, audios: true, videos: true } },
              },
            },
          },
        },
      },
    });

    if (!board) throw new NotFoundException('Fluxo não encontrado');
    await this.cacheManager.set(cacheKey, board, 10000);
    return board;
  }

  async deleteFlow(flowId: string, companyId: string) {
    const flow = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: { items: { include: { images: true, audios: true, videos: true } } },
    });

    if (!flow) throw new NotFoundException('Fluxo não encontrado');

    // Cleanup de arquivos no Supabase
    this.cleanUpFlowFiles(flow.items).catch(e => this.logger.error("Cleanup error", e));

    await this.prisma.$transaction([
      this.prisma.flowItem.deleteMany({ where: { flowId } }),
      this.prisma.flowStage.deleteMany({ where: { flowId } }),
      this.prisma.productFlow.delete({ where: { id: flowId } }),
    ]);

    await this.invalidateFlowCache(companyId, flowId);
    return { success: true };
  }

  // ===========================================================================
  // 🟠 GESTÃO DE ETAPAS (STAGES)
  // ===========================================================================

  async createStage(companyId: string, flowId: string, name: string, color?: string) {
    const lastStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const newOrder = (lastStage?.order ?? -1) + 1;

    const stage = await this.prisma.flowStage.create({
      data: { name, flowId, order: newOrder, color: color || '#2C3E50', companyId },
    });

    await this.invalidateFlowCache(companyId, flowId);
    return stage;
  }

  async updateStage(companyId: string, stageId: string, data: any) {
    const stage = await this.prisma.flowStage.findFirst({
      where: { id: stageId, flow: { companyId } }
    });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    const updated = await this.prisma.flowStage.update({
      where: { id: stageId },
      data: { name: data.name, color: data.color, order: data.order },
    });

    await this.invalidateFlowCache(companyId, stage.flowId);
    return updated;
  }

  async deleteStage(stageId: string, companyId: string) {
    const stage = await this.prisma.flowStage.findFirst({
      where: { id: stageId, flow: { companyId } },
      include: { items: { include: { images: true, audios: true, videos: true } } }
    });

    if (!stage) throw new NotFoundException('Etapa não encontrada');

    this.cleanUpFlowFiles(stage.items).catch(console.error);

    await this.prisma.$transaction([
      this.prisma.flowItem.deleteMany({ where: { stageId } }),
      this.prisma.flowStage.delete({ where: { id: stageId } }),
    ]);

    await this.invalidateFlowCache(companyId, stage.flowId);
    return { success: true };
  }

  // ===========================================================================
  // 🟡 GESTÃO DE ITENS (PRODUTOS NA ESTEIRA)
  // ===========================================================================

  async createFlowItem(companyId: string, flowId: string, userId: string, dto: CreateFlowItemDto) {
    return this.prisma.$transaction(async (tx) => {
      let targetStageId = dto.stageId;

      if (!targetStageId) {
        const firstStage = await tx.flowStage.findFirst({ where: { flowId }, orderBy: { order: 'asc' } });
        if (!firstStage) throw new BadRequestException('Este fluxo não possui etapas.');
        targetStageId = firstStage.id;
      }

      const lastItem = await tx.flowItem.findFirst({
        where: { stageId: targetStageId },
        orderBy: { orderInStage: 'desc' },
      });

      return tx.flowItem.create({
        data: {
          title: dto.title,
          description: dto.description,
          orderNumber: dto.orderNumber || `ORD-${Date.now()}`,
          productRef: dto.productRef || 'N/A',
          quantity: dto.quantity || 1,
          priority: dto.priority || 3,
          assignedToId: dto.assignedToId,
          flowId,
          companyId,
          stageId: targetStageId,
          orderInStage: (lastItem?.orderInStage ?? -1) + 1,
          enteredAt: new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          productionStartedAt: dto.productionStartedAt ? new Date(dto.productionStartedAt) : null,
          deliveryAt: dto.deliveryAt ? new Date(dto.deliveryAt) : null,
          supplierId: dto.supplierId || null,
        },
      });
    });
  }

  async updateFlowItem(companyId: string, itemId: string, userId: string, data: any) {
    const item = await this.prisma.flowItem.findFirst({ where: { id: itemId, companyId } });
    if (!item) throw new NotFoundException('Item não encontrado');

    // Processamento de exclusão de mídias via IDs enviados do front
    if (data.removeImageIds) for (const id of data.removeImageIds) await this.deleteMedia(companyId, itemId, 'image', id);
    if (data.removeVideoIds) for (const id of data.removeVideoIds) await this.deleteMedia(companyId, itemId, 'video', id);
    if (data.removeAudioIds) for (const id of data.removeAudioIds) await this.deleteMedia(companyId, itemId, 'audio', id);

    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: {
        title: data.title,
        productRef: data.productRef,
        quantity: data.quantity,
        priority: data.priority,
        description: data.description,
        supplierId: data.supplierId || null,
        assignedToId: data.assignedToId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        productionStartedAt: data.productionStartedAt ? new Date(data.productionStartedAt) : null,
        deliveryAt: data.deliveryAt ? new Date(data.deliveryAt) : null,
        stageId: data.stageId || item.stageId,
        updatedAt: new Date(),
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return updated;
  }

  async moveItem(itemId: string, newStageId: string, userId: string) {
    const item = await this.prisma.flowItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item não encontrado');

    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: { stageId: newStageId, updatedAt: new Date() },
    });

    await this.invalidateFlowCache(item.companyId, item.flowId);
    return updated;
  }

  async deleteItem(itemId: string, companyId: string) {
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { images: true, audios: true, videos: true }
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    this.cleanUpFlowFiles([item]).catch(e => this.logger.error(e));
    await this.prisma.flowItem.delete({ where: { id: itemId } });
    await this.invalidateFlowCache(companyId, item.flowId);
    return { success: true };
  }

  // ===========================================================================
  // 📷 SISTEMA DE MÍDIAS E STORAGE (SUPABASE)
  // ===========================================================================

  async addMediaToItem(companyId: string, itemId: string, file: Express.Multer.File, type: 'image' | 'audio' | 'video', userId: string) {
    const item = await this.prisma.flowItem.findFirst({ where: { id: itemId, companyId } });
    if (!item) throw new NotFoundException('Item não encontrado');

    const uploadResult = await this.supabase.uploadFlowFile(itemId, file, type);
    const commonData = { itemId, companyId, uploadedById: userId, url: uploadResult.url, filename: uploadResult.filename, size: uploadResult.size };

    let media;
    if (type === 'image') media = await this.prisma.flowImage.create({ data: commonData });
    else if (type === 'audio') media = await this.prisma.flowAudio.create({ data: { ...commonData, duration: 0 } });
    else media = await this.prisma.flowVideo.create({ data: { ...commonData, duration: 0 } });

    await this.invalidateFlowCache(companyId, item.flowId);
    return media;
  }

  async deleteMedia(companyId: string, itemId: string, type: 'image' | 'audio' | 'video', mediaId: string) {
    const model: any = type === 'image' ? this.prisma.flowImage : type === 'audio' ? this.prisma.flowAudio : this.prisma.flowVideo;
    const media = await model.findFirst({ where: { id: mediaId, itemId, companyId } });

    if (media) {
      if (media.url) await this.supabase.deleteFlowFile(media.url).catch(e => this.logger.error(e));
      await model.delete({ where: { id: mediaId } });
    }

    const item = await this.prisma.flowItem.findUnique({ where: { id: itemId }, select: { flowId: true } });
    if (item) await this.invalidateFlowCache(companyId, item.flowId);
    return { success: true };
  }

  private async cleanUpFlowFiles(items: any[]) {
    for (const item of items) {
      const allMedia = [...(item.images || []), ...(item.audios || []), ...(item.videos || [])];
      for (const m of allMedia) if (m.url) await this.supabase.deleteFlowFile(m.url);
    }
  }

  // ===========================================================================
  // 🔍 FILTROS E RELATÓRIOS
  // ===========================================================================

  async getFilteredItems(companyId: string, filters: any) {
    const { startDate, endDate, dateField, onlyOutsourced } = filters;
    const where: any = { companyId };

    if (onlyOutsourced === 'true') where.supplierId = { not: null };

    if (startDate && endDate && dateField) {
      where[dateField] = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    return this.prisma.flowItem.findMany({
      where,
      include: {
        supplier: { select: { name: true } },
        assignedTo: { select: { name: true } },
        images: { take: 1, select: { url: true } },
        stage: { select: { name: true, color: true } },
      },
      orderBy: { [dateField || 'createdAt']: 'asc' },
    });
  }
}
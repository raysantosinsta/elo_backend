/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Counter, Histogram } from 'prom-client';
import  { CreateFlowDto, CreateFlowItemDto } from './dto/create-flow.dto';

// Métricas
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
  private readonly CACHE_TTL = 30000; // 30s

  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private async invalidateFlowCache(companyId: string, flowId?: string) {
    await this.cacheManager.del(`flows_list_${companyId}`);
    if (flowId) {
      await this.cacheManager.del(`flow_board_${flowId}`);
      await this.cacheManager.del(`flow_stats_${flowId}`);
    }
  }

  // ============ FLUXOS ============

  async createFlow(companyId: string, userId: string, dto: CreateFlowDto) {
    const end = dbLatency.labels('createFlow').startTimer();
    try {
      const flow = await this.prisma.productFlow.create({
        data: {
          name: dto.name,
          companyId,
          
        },
        include: { stages: true }
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
        _count: { select: { items: true, stages: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    await this.cacheManager.set(cacheKey, flows, this.CACHE_TTL);
    return flows;
  }

  // Adicione isso dentro da classe FlowService

  async updateFlowItem(
    companyId: string,
    itemId: string,
    userId: string,
    data: any 
  ) {
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    const updateData: any = {
      title: data.title,
      orderNumber: data.orderNumber,
      productRef: data.productRef,
      quantity: data.quantity,
      priority: data.priority,
      description: data.description, // <--- ADICIONADO: Campo description
      assignedToId: data.assignedToId || null,
      updatedAt: new Date(),
    };

    if (data.dueDate) {
      updateData.dueDate = new Date(data.dueDate);
    } else if (data.dueDate === null || data.dueDate === '') {
       updateData.dueDate = null;
    }

    if (data.stageId && data.stageId !== item.stageId) {
       updateData.stageId = data.stageId;
    }

    const updated = await this.prisma.flowItem.update({
      where: { id: itemId },
      data: updateData,
    });

    await this.invalidateFlowCache(companyId, item.flowId);

    return updated;
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
                // --- ATENÇÃO AQUI: Adicione videos e audios ---
                images: { select: { url: true, id: true }, take: 1 }, 
                videos: { select: { url: true, id: true, filename: true } }, // Adicionar isso
                audios: { select: { url: true, id: true, filename: true } }, // Adicionar isso
                // ----------------------------------------------
                assignedTo: { select: { name: true, email: true } },
                _count: { select: { images: true, audios: true, videos: true } }
              }
            }
          }
        }
      }
    });

    if (!board) throw new NotFoundException('Fluxo não encontrado');

    await this.cacheManager.set(cacheKey, board, 10000); // Cache curto (10s) para board dinâmico
    return board;
  }

  async deleteFlow(flowId: string, companyId: string) {
    // 1. Verificar se o fluxo existe
    const flow = await this.prisma.productFlow.findFirst({
        where: { id: flowId, companyId },
        include: { 
            items: { include: { images: true, audios: true, videos: true } } 
        }
    });

    if (!flow) throw new NotFoundException('Fluxo não encontrado');

    // 2. Limpeza de Arquivos no Storage (Supabase/S3)
    // Fazemos isso antes ou de forma assíncrona ("fire and forget")
    this.cleanUpFlowFiles(flow.items).catch(err => 
        this.logger.error(`Erro ao limpar arquivos do fluxo ${flowId}`, err)
    );

    // 3. Deleção Sequencial no Banco de Dados (Ordem é Importante!)
    await this.prisma.$transaction(async (tx) => {
        // Passo A: Apagar todos os ITENS deste fluxo
        // Isso remove as FKs que apontam para Stages e para o Flow
        await tx.flowItem.deleteMany({
            where: { flowId: flowId }
        });

        // Passo B: Apagar todas as ETAPAS (Stages) deste fluxo
        // Agora que não tem itens, podemos apagar as etapas
        await tx.flowStage.deleteMany({
            where: { flowId: flowId }
        });

        // Passo C: Finalmente, apagar o FLUXO
        await tx.productFlow.delete({
            where: { id: flowId }
        });
    });

    // 4. Invalidar Cache
    await this.invalidateFlowCache(companyId, flowId);

    return { success: true };
  }

 // Adicione este método dentro da classe FlowService em flow.service.ts

  // ============ DELETE MEDIA ============
  async deleteMedia(
    companyId: string,
    itemId: string,
    type: 'image' | 'audio' | 'video',
    mediaId: string
  ) {
    // 1. Identificar o item e a mídia correta
    let mediaRecord;
    let modelDelegate;

    if (type === 'image') {
      modelDelegate = this.prisma.flowImage;
    } else if (type === 'audio') {
      modelDelegate = this.prisma.flowAudio;
    } else if (type === 'video') {
      modelDelegate = this.prisma.flowVideo;
    } else {
      throw new BadRequestException('Tipo de mídia inválido');
    }

    // Busca o registro garantindo que pertence à empresa e ao item
    mediaRecord = await modelDelegate.findFirst({
      where: { id: mediaId, itemId, companyId }
    });

    if (!mediaRecord) {
      throw new NotFoundException('Mídia não encontrada');
    }

    // 2. Deletar do Supabase (Storage)
    if (mediaRecord.url) {
      await this.supabase.deleteFlowFile(mediaRecord.url).catch(err => 
        this.logger.error(`Erro ao deletar arquivo do storage: ${mediaRecord.url}`, err)
      );
    }

    // 3. Deletar do Banco de Dados (Prisma)
    await modelDelegate.delete({
      where: { id: mediaId }
    });

    // 4. Invalidar Cache para atualizar o Frontend
    const item = await this.prisma.flowItem.findUnique({ 
        where: { id: itemId },
        select: { flowId: true }
    });
    
    if (item) {
        await this.invalidateFlowCache(companyId, item.flowId);
    }

    return { success: true };
  }

  async createFlowItem(companyId: string, flowId: string, userId: string, dto: CreateFlowItemDto) {
    return this.prisma.$transaction(async (tx) => {
      let targetStageId = dto.stageId;

      if (targetStageId) {
        const stageExists = await tx.flowStage.findFirst({
          where: { id: targetStageId, flowId }
        });
        if (!stageExists) targetStageId = undefined; 
      }

      if (!targetStageId) {
        const firstStage = await tx.flowStage.findFirst({
          where: { flowId },
          orderBy: { order: 'asc' }
        });
        if (!firstStage) throw new BadRequestException('Este fluxo não possui etapas.');
        targetStageId = firstStage.id;
      }

      const lastItem = await tx.flowItem.findFirst({
        where: { stageId: targetStageId },
        orderBy: { orderInStage: 'desc' },
        select: { orderInStage: true }
      });

      const newItem = await tx.flowItem.create({
        data: {
          title: dto.title,
          description: dto.description, // <--- ADICIONADO: Campo description
          orderNumber: dto.orderNumber || `ORD-${Date.now()}`,
          productRef: dto.productRef || 'N/A',
          quantity: dto.quantity || 1,
          priority: dto.priority || 3,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          assignedToId: dto.assignedToId,
          flowId,
          companyId,
          stageId: targetStageId!,
          orderInStage: (lastItem?.orderInStage ?? -1) + 1,
          enteredAt: new Date()
        }
      });

      await this.invalidateFlowCache(companyId, flowId);
      return newItem;
    });
  }

  async moveItem(itemId: string, newStageId: string, userId: string) {
    const item = await this.prisma.flowItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item não encontrado');
    if (item.stageId === newStageId) return item;

    // Transação para garantir consistência da ordem
    const updated = await this.prisma.$transaction(async (tx) => {
        // 1. Pega a última posição da nova coluna
        const lastItem = await tx.flowItem.findFirst({
            where: { stageId: newStageId },
            orderBy: { orderInStage: 'desc' },
            select: { orderInStage: true }
        });

        // 2. Atualiza o item
        return tx.flowItem.update({
            where: { id: itemId },
            data: {
                stageId: newStageId,
                orderInStage: (lastItem?.orderInStage ?? -1) + 1,
                updatedAt: new Date()
            }
        });
    });

    await this.invalidateFlowCache(item.companyId, item.flowId);
    return updated;
  }

  // ============ HELPERS ============

  private async cleanUpFlowFiles(items: any[]) {
    for (const item of items) {
        const allMedia = [...item.images, ...item.audios, ...item.videos];
        for (const media of allMedia) {
            if (media.url) {
                await this.supabase.deleteFlowFile(media.url);
            }
        }
    }
  }

  // ============ STAGES ============

  // ============ STAGES ============

  // Atualizado para aceitar o parâmetro opcional 'color'
  async createStage(companyId: string, flowId: string, name: string, color?: string) {
    const end = dbLatency.labels('createStage').startTimer();
    
    try {
      // 1. Verificar se o fluxo existe e pertence à empresa
      const flow = await this.prisma.productFlow.findFirst({
        where: { id: flowId, companyId }
      });

      if (!flow) throw new NotFoundException('Fluxo não encontrado');

      // 2. Encontrar a última ordem para adicionar no final
      const lastStage = await this.prisma.flowStage.findFirst({
        where: { flowId },
        orderBy: { order: 'desc' },
        select: { order: true }
      });

      const newOrder = (lastStage?.order ?? -1) + 1;

      // 3. Criar a etapa
      const stage = await this.prisma.flowStage.create({
        data: {
          name,
          flowId,
          order: newOrder,
          // ALTERAÇÃO: Usa a cor enviada ou o Azul Escuro (#2C3E50) como padrão
          color: color || '#2C3E50' 
        }
      });

      // 4. Invalidar cache e registrar métrica
      await this.invalidateFlowCache(companyId, flowId);
      flowOpsCounter.labels('createStage', 'success').inc();
      end();
      
      return stage;

    } catch (error) {
      flowOpsCounter.labels('createStage', 'error').inc();
      end();
      throw error;
    }
  }

 // ... outros métodos ...

  // ============ STAGE OPERATIONS ============

  async updateStage(companyId: string, stageId: string, data: { name?: string; color?: string; order?: number }) {
    // Verifica propriedade
    const stage = await this.prisma.flowStage.findFirst({
        where: { id: stageId, flow: { companyId } }
    });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    const updated = await this.prisma.flowStage.update({
        where: { id: stageId },
        data: {
            name: data.name,
            color: data.color,
            order: data.order
        }
    });

    await this.invalidateFlowCache(companyId, stage.flowId);
    return updated;
  }

  async deleteStage(stageId: string, companyId: string) {
    // 1. Verificar se a etapa existe e pertence à empresa
    const stage = await this.prisma.flowStage.findFirst({
        where: { id: stageId, flow: { companyId } },
        include: { items: { include: { images: true, audios: true, videos: true } } }
    });

    if (!stage) throw new NotFoundException('Etapa não encontrada');

    // 2. Limpar arquivos do Storage (opcional, mas recomendado)
    this.cleanUpFlowFiles(stage.items).catch(console.error);

    // 3. Transação para apagar Itens -> Depois a Etapa
    await this.prisma.$transaction(async (tx) => {
        // A. Apaga os itens da etapa (para não dar erro de Foreign Key)
        await tx.flowItem.deleteMany({
            where: { stageId: stageId }
        });

        // B. Apaga a etapa
        await tx.flowStage.delete({
            where: { id: stageId }
        });
    });

    // 4. Cache
    await this.invalidateFlowCache(companyId, stage.flowId);

    return { success: true };
  }

 // ... imports existentes

  // ============ MEDIA UPLOAD ============

  async addMediaToItem(
    companyId: string,
    itemId: string,
    file: Express.Multer.File,
    type: 'image' | 'audio' | 'video',
    userId: string
  ) {
    // 1. Verificar se o item existe e pertence à empresa
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId }
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    // 2. Upload no Supabase (Usando seu método já existente)
    // O SupabaseService detecta o bucket baseado no 'type'
    const uploadResult = await this.supabase.uploadFlowFile(itemId, file, type);

    // 3. Salvar referência no Banco de Dados (Prisma)
    let mediaRecord;

    if (type === 'image') {
      mediaRecord = await this.prisma.flowImage.create({
        data: {
          itemId,
          companyId,
          uploadedById: userId,
          url: uploadResult.url,
          filename: uploadResult.filename,
          size: uploadResult.size
        }
      });
    } else if (type === 'audio') {
      mediaRecord = await this.prisma.flowAudio.create({
        data: {
          itemId,
          companyId,
          uploadedById: userId,
          url: uploadResult.url,
          filename: uploadResult.filename,
          size: uploadResult.size,
          duration: 0 // Se quiser extrair duração, precisa de lib externa ou enviar do front
        }
      });
    } else if (type === 'video') {
      mediaRecord = await this.prisma.flowVideo.create({
        data: {
          itemId,
          companyId,
          uploadedById: userId,
          url: uploadResult.url,
          filename: uploadResult.filename,
          size: uploadResult.size,
          duration: 0
        }
      });
    }

    // 4. Invalidar cache para atualizar o board
    await this.invalidateFlowCache(companyId, item.flowId);

    return mediaRecord;
  }
  
  // ... (Mantenha o método deleteItem que corrigimos antes)

  // ============ ITEM OPERATIONS ============

  async deleteItem(itemId: string, companyId: string) {
    // 1. Buscar o item para garantir que existe e pertence à empresa
    const item = await this.prisma.flowItem.findFirst({
        where: { id: itemId, companyId },
        include: { images: true, audios: true, videos: true }
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    // 2. Limpar arquivos do Storage (Imagens, Áudios, Vídeos)
    // Usamos o helper que você já tem ou criamos um array com tudo
    this.cleanUpFlowFiles([item]).catch(err => 
        this.logger.error(`Erro ao limpar arquivos do item ${itemId}`, err)
    );

    // 3. Deletar do Banco de Dados
    // Como seu Schema tem "onDelete: Cascade" nas mídias, o Prisma apaga as tabelas filhas automaticamente.
    await this.prisma.flowItem.delete({
        where: { id: itemId }
    });

    // 4. Atualizar o Cache para o Frontend ver a mudança
    await this.invalidateFlowCache(companyId, item.flowId);

    return { success: true };
  }
}
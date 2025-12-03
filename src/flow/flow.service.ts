/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);

  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService
  ) { }

  // ============ FLUXOS ============
  async createFlow(companyId: string, userId: string, data: { name: string; description?: string }) {
    this.logger.log(`Criando fluxo para empresa ${companyId} por usuário ${userId}`);

    // Valida se a empresa existe
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      throw new BadRequestException('Empresa não encontrada');
    }

    return this.prisma.productFlow.create({
      data: {
        name: data.name,
        companyId: companyId,
        stages: {
          create: []
        }
      },
      include: {
        stages: true
      }
    });
  }

  async getFlows(companyId: string) {
    this.logger.log(`Buscando fluxos da empresa ${companyId}`);

    return this.prisma.productFlow.findMany({
      where: { companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' }
        },
        _count: {
          select: {
            items: true,
            stages: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async getFlowById(flowId: string, companyId: string) {
    this.logger.log(`Buscando fluxo ${flowId} da empresa ${companyId}`);

    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      },
      include: {
        stages: {
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    return flow;
  }

  async updateFlow(flowId: string, companyId: string, data: { name?: string; description?: string }) {
    this.logger.log(`Atualizando fluxo ${flowId}`);

    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    return this.prisma.productFlow.update({
      where: { id: flowId },
      data: {
        name: data.name,
        updatedAt: new Date()
      }
    });
  }

  async deleteFlow(flowId: string, companyId: string) {
    this.logger.log(`Deletando fluxo ${flowId}`);

    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    // Deleta todas as mídias associadas aos itens do fluxo
    const items = await this.prisma.flowItem.findMany({
      where: { flowId },
      include: {
        images: true,
        audios: true,
        videos: true
      }
    });

    // Deleta arquivos do Supabase
    for (const item of items) {
      for (const image of item.images) {
        await this.supabase.deleteFlowFile(image.url);
      }
      for (const audio of item.audios) {
        await this.supabase.deleteFlowFile(audio.url);
      }
      for (const video of item.videos) {
        await this.supabase.deleteFlowFile(video.url);
      }
    }

    // Deleta do banco de dados
    return this.prisma.productFlow.delete({
      where: { id: flowId }
    });
  }

  // ============ ETAPAS ============
  async createStage(flowId: string, data: { name: string; color?: string; order?: number }) {
    this.logger.log(`Criando etapa para fluxo ${flowId}`);

    // Verifica se o fluxo existe
    const flow = await this.prisma.productFlow.findUnique({
      where: { id: flowId }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    // Se não informar ordem, coloca no final
    let order = data.order;
    if (!order && order !== 0) {
      const lastStage = await this.prisma.flowStage.findFirst({
        where: { flowId },
        orderBy: { order: 'desc' }
      });
      order = lastStage ? lastStage.order + 1 : 0;
    }

    return this.prisma.flowStage.create({
      data: {
        name: data.name,
        color: data.color || '#3B82F6',
        order: order,
        flowId
      }
    });
  }

  async updateStage(stageId: string, data: { name?: string; color?: string; order?: number }) {
    this.logger.log(`Atualizando etapa ${stageId}`);

    const stage = await this.prisma.flowStage.findUnique({
      where: { id: stageId }
    });

    if (!stage) {
      throw new NotFoundException('Etapa não encontrada');
    }

    // Se for atualizar a ordem, ajusta as outras etapas
    if (data.order !== undefined && data.order !== stage.order) {
      await this.adjustStageOrder(stage.flowId, stage.order, data.order);
    }

    return this.prisma.flowStage.update({
      where: { id: stageId },
      data: {
        name: data.name,
        color: data.color,
        order: data.order
      }
    });
  }

  private async adjustStageOrder(flowId: string, oldOrder: number, newOrder: number) {
    if (newOrder > oldOrder) {
      // Move para baixo
      await this.prisma.flowStage.updateMany({
        where: {
          flowId,
          order: { gt: oldOrder, lte: newOrder }
        },
        data: {
          order: { decrement: 1 }
        }
      });
    } else {
      // Move para cima
      await this.prisma.flowStage.updateMany({
        where: {
          flowId,
          order: { gte: newOrder, lt: oldOrder }
        },
        data: {
          order: { increment: 1 }
        }
      });
    }
  }

  async deleteStage(stageId: string, companyId: string) {
    this.logger.log(`Deletando etapa ${stageId}`);

    const stage = await this.prisma.flowStage.findFirst({
      where: {
        id: stageId,
        flow: {
          companyId: companyId
        }
      },
      include: {
        items: true
      }
    });

    if (!stage) {
      throw new NotFoundException('Etapa não encontrada');
    }

    // Move todos os itens para a primeira etapa disponível
    const otherStages = await this.prisma.flowStage.findMany({
      where: {
        flowId: stage.flowId,
        id: { not: stageId }
      },
      orderBy: { order: 'asc' }
    });

    if (otherStages.length > 0 && stage.items.length > 0) {
      const firstStage = otherStages[0];
      await this.prisma.flowItem.updateMany({
        where: { stageId: stageId },
        data: { stageId: firstStage.id }
      });
    }

    return this.prisma.flowStage.delete({
      where: { id: stageId }
    });
  }

  // ============ ITENS ============
  async createFlowItem(
    companyId: string,
    flowId: string,
    userId: string,
    data: {
      title: string;
      orderNumber?: string;
      productRef?: string;
      quantity?: number;
      priority?: number;
      description?: string;
      dueDate?: any;
      assignedToId?: string;
    }
  ) {
    this.logger.log(`Criando item para fluxo ${flowId} por usuário ${userId}`);

    // Verifica se o fluxo existe e pertence à empresa
    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      }
    });

    if (!flow) {
      throw new BadRequestException('Fluxo não encontrado');
    }

    // Pega a primeira etapa do fluxo
    const firstStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'asc' }
    });

    if (!firstStage) {
      throw new BadRequestException('Fluxo não possui etapas configuradas');
    }

    // Gera número de pedido se não fornecido
    const orderNumber = data.orderNumber || `PED-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Determina ordem na etapa
    const lastOrder = await this.prisma.flowItem.findFirst({
      where: { stageId: firstStage.id },
      orderBy: { orderInStage: 'desc' },
      select: { orderInStage: true }
    });

    const orderInStage = lastOrder ? lastOrder.orderInStage + 1 : 0;

    // Converte dueDate para Date ou null
    let dueDateValue: Date | null = null;

    if (data.dueDate) {
      try {
        if (typeof data.dueDate === 'string') {
          // Se for string, tenta converter para Date
          // Adiciona segundos se a string estiver incompleta
          let dateString = data.dueDate;
          if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
            dateString += ':00';
          }

          dueDateValue = new Date(dateString);

          // Se a conversão falhar, seta como null
          if (isNaN(dueDateValue.getTime())) {
            this.logger.warn(`Data inválida recebida: ${data.dueDate}`);
            dueDateValue = null;
          }
        } else if (data.dueDate instanceof Date) {
          dueDateValue = data.dueDate;
        }
      } catch (error) {
        dueDateValue = null;
        this.logger.warn(`Erro ao converter data: ${data.dueDate}`, error);
      }
    }

    // Cria o item
    const flowItem = await this.prisma.flowItem.create({
      data: {
        title: data.title,
        orderNumber: orderNumber,
        productRef: data.productRef || 'SEM-REF',
        quantity: data.quantity || 1,
        priority: data.priority || 3,
        dueDate: dueDateValue,
        assignedToId: data.assignedToId || null,
        flowId: flowId,
        stageId: firstStage.id,
        companyId: companyId,
        orderInStage: orderInStage,
        enteredAt: new Date()
      },
      include: {
        stage: true,
        assignedTo: {
          select: { name: true, email: true }
        }
      }
    });

    this.logger.log(`Item criado com ID: ${flowItem.id}`);

    return flowItem;
  }

  async updateFlowItem(
    itemId: string,
    companyId: string,
    data: {
      title?: string;
      orderNumber?: string;
      productRef?: string;
      quantity?: number;
      priority?: number;
      description?: string;
      dueDate?: any;
      assignedToId?: string;
      stageId?: string;
    }
  ) {
    this.logger.log(`Atualizando item ${itemId}`);

    const item = await this.prisma.flowItem.findFirst({
      where: {
        id: itemId,
        companyId
      }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Converte dueDate para Date ou null
    let dueDateValue: Date | null | undefined = undefined;

    if (data.dueDate !== undefined) {
      if (data.dueDate === null || data.dueDate === '') {
        dueDateValue = null;
      } else {
        try {
          if (typeof data.dueDate === 'string') {
            // Adiciona segundos se a string estiver incompleta
            let dateString = data.dueDate;
            if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
              dateString += ':00';
            }

            dueDateValue = new Date(dateString);

            // Se a conversão falhar, mantém o valor atual
            if (isNaN(dueDateValue.getTime())) {
              this.logger.warn(`Data inválida recebida: ${data.dueDate}`);
              dueDateValue = undefined; // Não atualiza
            }
          } else if (data.dueDate instanceof Date) {
            dueDateValue = data.dueDate;
          }
        } catch (error) {
          this.logger.warn(`Erro ao converter data: ${data.dueDate}`, error);
          dueDateValue = undefined; // Não atualiza
        }
      }
    }

    // Se estiver mudando de etapa, ajusta a ordem
    let orderInStage: number | undefined = undefined;
    if (data.stageId && data.stageId !== item.stageId) {
      const lastOrder = await this.prisma.flowItem.findFirst({
        where: { stageId: data.stageId },
        orderBy: { orderInStage: 'desc' },
        select: { orderInStage: true }
      });

      orderInStage = lastOrder ? lastOrder.orderInStage + 1 : 0;
    }

    // Prepara dados para atualização
    const updateData: any = {
      title: data.title,
      orderNumber: data.orderNumber,
      productRef: data.productRef,
      quantity: data.quantity,
      priority: data.priority,
      assignedToId: data.assignedToId,
      stageId: data.stageId,
      updatedAt: new Date()
    };

    // Só adiciona dueDate se foi convertido corretamente
    if (dueDateValue !== undefined) {
      updateData.dueDate = dueDateValue;
    }

    // Só adiciona orderInStage se estiver mudando de etapa
    if (orderInStage !== undefined) {
      updateData.orderInStage = orderInStage;
    }

    return this.prisma.flowItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        stage: true,
        assignedTo: {
          select: { name: true, email: true }
        },
        images: true,
        audios: true,
        videos: true
      }
    });
  }

  async moveItem(itemId: string, newStageId: string, userId: string) {
    this.logger.log(`Movendo item ${itemId} para etapa ${newStageId}`);

    const item = await this.prisma.flowItem.findUnique({
      where: { id: itemId },
      include: { stage: true }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Verifica se a nova etapa existe
    const newStage = await this.prisma.flowStage.findUnique({
      where: { id: newStageId }
    });

    if (!newStage) {
      throw new BadRequestException('Etapa não encontrada');
    }

    // Se já está na mesma etapa, não faz nada
    if (item.stageId === newStageId) {
      return item;
    }

    // Pega a última ordem na nova etapa
    const lastOrder = await this.prisma.flowItem.findFirst({
      where: { stageId: newStageId },
      orderBy: { orderInStage: 'desc' },
      select: { orderInStage: true }
    });

    const newOrder = lastOrder ? lastOrder.orderInStage + 1 : 0;

    // Atualiza o item
    return this.prisma.flowItem.update({
      where: { id: itemId },
      data: {
        stageId: newStageId,
        orderInStage: newOrder,
        updatedAt: new Date()
      },
      include: {
        stage: true,
        assignedTo: {
          select: { name: true, email: true }
        }
      }
    });
  }

  async deleteFlowItem(itemId: string, companyId: string) {
    this.logger.log(`Deletando item ${itemId}`);

    const item = await this.prisma.flowItem.findFirst({
      where: {
        id: itemId,
        companyId
      },
      include: {
        images: true,
        audios: true,
        videos: true
      }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // Deleta arquivos do Supabase
    for (const image of item.images) {
      await this.supabase.deleteFlowFile(image.url);
    }
    for (const audio of item.audios) {
      await this.supabase.deleteFlowFile(audio.url);
    }
    for (const video of item.videos) {
      await this.supabase.deleteFlowFile(video.url);
    }

    // Deleta do banco de dados
    return this.prisma.flowItem.delete({
      where: { id: itemId }
    });
  }

  async addMultipleMediaToItem(
    itemId: string,
    companyId: string,
    userId: string,
    files: any[],
    type: 'image' | 'audio' | 'video'
  ): Promise<any[]> {
    this.logger.log(`Adicionando ${files.length} mídias do tipo ${type} ao item ${itemId}`);

    const item = await this.prisma.flowItem.findFirst({
      where: {
        id: itemId,
        companyId
      }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    const uploadPromises = files.map(file =>
      // CORREÇÃO: Use this.supabase.uploadFlowFile() em vez de this.uploadFlowFile()
      this.supabase.uploadFlowFile(itemId, file, type, {
        companyId,
        uploadedBy: userId,
        flowId: item.flowId,
        itemId: itemId
      })
    );

    const uploadResults = await Promise.all(uploadPromises);

    const createdMedia = [] as any;
    for (const uploadResult of uploadResults) {
      const mediaData = {
        url: uploadResult.url,
        filename: uploadResult.filename,
        size: uploadResult.size,
        itemId,
        companyId,
        uploadedById: userId
      };

      if (type === 'image') {
        const image = await this.prisma.flowImage.create({
          data: mediaData
        });
        createdMedia.push(image);
      } else if (type === 'audio') {
        const audio = await this.prisma.flowAudio.create({
          data: {
            ...mediaData,
            duration: 0
          }
        });
        createdMedia.push(audio);
      } else {
        const video = await this.prisma.flowVideo.create({
          data: {
            ...mediaData,
            duration: 0
          }
        });
        createdMedia.push(video);
      }
    }

    return createdMedia;
  }

  async addMediaToItem(
    itemId: string,
    companyId: string,
    userId: string,
    file: any,
    type: 'image' | 'audio' | 'video'
  ) {
    this.logger.log(`Adicionando mídia do tipo ${type} ao item ${itemId}`);

    const item = await this.prisma.flowItem.findFirst({
      where: {
        id: itemId,
        companyId
      }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    // CORREÇÃO: Use this.supabase.uploadFlowFile() aqui também
    const uploadResult = await this.supabase.uploadFlowFile(itemId, file, type, {
      companyId,
      uploadedBy: userId,
      flowId: item.flowId,
      itemId: itemId
    });

    // Salva no banco
    const mediaData = {
      url: uploadResult.url,
      filename: uploadResult.filename,
      size: uploadResult.size,
      itemId,
      companyId,
      uploadedById: userId
    };

    if (type === 'image') {
      return this.prisma.flowImage.create({
        data: mediaData
      });
    } else if (type === 'audio') {
      return this.prisma.flowAudio.create({
        data: {
          ...mediaData,
          duration: 0
        }
      });
    } else {
      return this.prisma.flowVideo.create({
        data: {
          ...mediaData,
          duration: 0
        }
      });
    }
  }

  async removeMedia(
    itemId: string,
    companyId: string,
    mediaId: string,
    type: 'image' | 'audio' | 'video'
  ) {
    this.logger.log(`Removendo mídia ${mediaId} do item ${itemId}`);

    let media;

    if (type === 'image') {
      media = await this.prisma.flowImage.findFirst({
        where: {
          id: mediaId,
          itemId,
          companyId
        }
      });
    } else if (type === 'audio') {
      media = await this.prisma.flowAudio.findFirst({
        where: {
          id: mediaId,
          itemId,
          companyId
        }
      });
    } else {
      media = await this.prisma.flowVideo.findFirst({
        where: {
          id: mediaId,
          itemId,
          companyId
        }
      });
    }

    if (!media) {
      throw new NotFoundException('Mídia não encontrada');
    }

    // Deleta do Supabase
    await this.supabase.deleteFlowFile(media.url);

    // Deleta do banco
    if (type === 'image') {
      await this.prisma.flowImage.delete({
        where: { id: mediaId }
      });
    } else if (type === 'audio') {
      await this.prisma.flowAudio.delete({
        where: { id: mediaId }
      });
    } else {
      await this.prisma.flowVideo.delete({
        where: { id: mediaId }
      });
    }

    return { success: true };
  }

  async getItemWithMedia(itemId: string, companyId: string) {
    this.logger.log(`Buscando item ${itemId} com mídias`);

    const item = await this.prisma.flowItem.findFirst({
      where: {
        id: itemId,
        companyId
      },
      include: {
        images: {
          orderBy: { createdAt: 'desc' }
        },
        audios: {
          orderBy: { createdAt: 'desc' }
        },
        videos: {
          orderBy: { createdAt: 'desc' }
        },
        stage: true,
        assignedTo: {
          select: { name: true, email: true }
        },
        flow: {
          select: { name: true, id: true }
        }
      }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    return item;
  }

  // TODO: 
  // ============ KANBAN COMPLETO ============
  async getKanbanBoard(flowId: string, companyId: string) {
    this.logger.log(`Buscando board do fluxo ${flowId}`);

    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    return this.prisma.productFlow.findUnique({
      where: { id: flowId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            items: {
              orderBy: { orderInStage: 'asc' },
              include: {
                images: {
                  select: { url: true, id: true }
                },
                audios: {

                  select: { url: true, id: true }
                },
                videos: {

                  select: { url: true, id: true }
                },
                _count: {
                  select: {
                    images: true,
                    audios: true,
                    videos: true
                  }
                },
                assignedTo: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  // ============ DASHBOARD ============
  async getFlowStats(flowId: string, companyId: string) {
    this.logger.log(`Buscando estatísticas do fluxo ${flowId}`);

    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado');
    }

    const [
      totalItems,
      itemsByStage,
      overdueItems
    ] = await Promise.all([
      this.prisma.flowItem.count({
        where: { flowId, companyId }
      }),
      this.prisma.flowItem.groupBy({
        by: ['stageId'],
        where: { flowId, companyId },
        _count: true
      }),
      this.prisma.flowItem.count({
        where: {
          flowId,
          companyId,
          dueDate: { lt: new Date() }
        }
      })
    ]);

    // Calcula porcentagem por etapa
    const stages = await this.prisma.flowStage.findMany({
      where: { flowId },
      include: {
        _count: {
          select: { items: true }
        }
      },
      orderBy: { order: 'asc' }
    });

    return {
      totalItems,
      itemsByStage,
      overdueItems,
      stages: stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        itemCount: stage._count.items,
        percentage: totalItems > 0 ? (stage._count.items / totalItems) * 100 : 0
      }))
    };
  }

  // ============ BUSCAS ============
  async searchItems(
    companyId: string,
    flowId?: string,
    stageId?: string,
    assignedToId?: string,
    search?: string
  ) {
    this.logger.log(`Buscando itens com filtros`);

    const where: any = { companyId };

    if (flowId) where.flowId = flowId;
    if (stageId) where.stageId = stageId;
    if (assignedToId) where.assignedToId = assignedToId;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { productRef: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    return this.prisma.flowItem.findMany({
      where,
      include: {
        stage: {
          select: { name: true, color: true }
        },
        assignedTo: {
          select: { name: true }
        },
        images: {
          take: 1,
          select: { url: true }
        }
      },
      orderBy: [
        { priority: 'asc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: 50
    });
  }

  // ============ REORDENAÇÃO ============
  async reorderItem(itemId: string, newPosition: number, stageId?: string) {
    this.logger.log(`Reordenando item ${itemId} para posição ${newPosition}`);

    const item = await this.prisma.flowItem.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    const targetStageId = stageId || item.stageId;

    // Pega todos os itens da etapa
    const items = await this.prisma.flowItem.findMany({
      where: { stageId: targetStageId },
      orderBy: { orderInStage: 'asc' }
    });

    // Remove o item da lista
    const filteredItems = items.filter(i => i.id !== itemId);

    // Insere na nova posição
    filteredItems.splice(newPosition, 0, item);

    // Atualiza ordens
    const updates = filteredItems.map((item, index) =>
      this.prisma.flowItem.update({
        where: { id: item.id },
        data: { orderInStage: index }
      })
    );

    await Promise.all(updates);

    return this.prisma.flowItem.findUnique({
      where: { id: itemId },
      include: {
        stage: true
      }
    });
  }

  // ============ ATUALIZAÇÃO EM MASSA ============
  async bulkUpdateItems(companyId: string, itemIds: string[], data: {
    assignedToId?: string;
    priority?: number;
    stageId?: string;
  }) {
    this.logger.log(`Atualizando ${itemIds.length} itens em massa`);

    // Verifica se todos os itens pertencem à empresa
    const items = await this.prisma.flowItem.findMany({
      where: {
        id: { in: itemIds },
        companyId
      }
    });

    if (items.length !== itemIds.length) {
      throw new BadRequestException('Alguns itens não foram encontrados ou não pertencem à empresa');
    }

    return this.prisma.flowItem.updateMany({
      where: {
        id: { in: itemIds },
        companyId
      },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  // ============ MÉTODOS AUXILIARES ============
  async validateFlowAccess(flowId: string, companyId: string) {
    const flow = await this.prisma.productFlow.findFirst({
      where: {
        id: flowId,
        companyId
      }
    });

    if (!flow) {
      throw new NotFoundException('Fluxo não encontrado ou acesso negado');
    }

    return flow;
  }

  async getUsersByCompany(companyId: string) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        status: 'ACTIVE'
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      },
      orderBy: { name: 'asc' }
    });
  }

  
}
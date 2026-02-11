/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
  CreateStageDto, // 🔥 IMPORTADO
} from './dto/create-flow.dto';

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
    private readonly cls: ClsService,
    private supabase: SupabaseService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectMetric('flow_item_moves_total')
    public moveCounter: Counter<string>,
    @InjectMetric('db_operation_duration_seconds')
    public dbHistogram: Histogram<string>,
  ) {}

  // --- RESILIENCE PATTERN ---
  private async executeWithResilience<T>(
    operation: string,
    fn: () => Promise<T>,
    retries = 3,
    timeoutMs = 5000,
  ): Promise<T> {
    const endTimer = this.dbHistogram.labels(operation).startTimer();
    let attempt = 0;

    while (attempt < retries) {
      try {
        const result = await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs),
          ),
        ]);
        endTimer();
        return result as T;
      } catch (error: any) {
        attempt++;
        this.logger.warn(
          `Tentativa ${attempt} falhou para ${operation}: ${error.message}`,
        );

        if (attempt >= retries) {
          endTimer();
          this.logger.error(
            `Falha crítica em ${operation} após ${retries} tentativas.`,
          );
          throw error instanceof Error
            ? error
            : new InternalServerErrorException('Database unavailable');
        }
        await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
      }
    }
    throw new InternalServerErrorException('Unexpected flow');
  }

  // --- LÓGICA DE NEGÓCIO: AVANÇAR ETAPA ---

  async advanceItemToNextStage(itemId: string, userId: string) {
    const companyId = this.cls.get<string>('tenantId');

    if (!companyId)
      throw new InternalServerErrorException('Tenant Context missing');

    return this.executeWithResilience('advance_item_stage', async () => {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: { id: userId, companyId },
          select: { id: true, role: true, professionalRole: true },
        });

        if (!user)
          throw new ForbiddenException('Usuário não encontrado ou inativo.');

        const item = await tx.flowItem.findFirst({
          where: { id: itemId, companyId },
          include: {
            stage: true,
          },
        });

        if (!item || !item.stage)
          throw new NotFoundException(
            'Item não encontrado ou etapa inconsistente.',
          );

        this.validateStageAccess(user, item.stage);

        const allStages = await tx.flowStage.findMany({
          where: { flowId: item.flowId },
          select: { id: true, order: true, name: true },
          orderBy: { order: 'asc' },
        });

        const currentIndex = allStages.findIndex((s) => s.id === item.stageId);

        if (currentIndex === -1)
          throw new BadRequestException(
            'A etapa atual do item não existe mais na sequência do fluxo.',
          );

        const nextStage = allStages[currentIndex + 1];

        if (!nextStage) {
          throw new BadRequestException(
            `O item "${item.title}" já está na última etapa (${allStages[currentIndex].name}).`,
          );
        }

        const updatedItem = await tx.flowItem.update({
          where: { id: itemId },
          data: {
            stageId: nextStage.id,
            updatedAt: new Date(),
          },
        });

        this.logger.log(
          `[Automação] Item ${item.orderNumber} movido por ${user.professionalRole || 'Admin'}: ${item.stage.name} -> ${nextStage.name}`,
        );

        await this.cacheManager.del(`flow_board_${item.flowId}`);
        this.moveCounter.labels('success', 'auto_advance').inc();

        return updatedItem;
      });
    });
  }

  // ===========================================================================
  // 🛡️ LÓGICA DE VALIDAÇÃO (Atualizada com Match Parcial)
  // ===========================================================================

  private validateStageAccess(
    user: { role: string; professionalRole: string | null },
    stage: { name: string; allowedRole: string | null },
  ) {
    this.logger.debug(
      `👮 [AUTH_CHECK] Validando acesso para etapa: "${stage.name}"`,
    );
    this.logger.debug(`   - Cargo Exigido (Banco): "${stage.allowedRole}"`);
    this.logger.debug(
      `   - Cargo do Usuário (Banco): "${user.professionalRole}"`,
    );

    // 1. Superusuários (Admin/Master/Manager) sempre podem mover
    if (['MASTER', 'ADMIN'].includes(user.role)) {
      this.logger.debug(
        `   - [AUTH_CHECK] Liberado: Usuário é Superusuário (${user.role})`,
      );
      return true;
    }

    // 2. Etapa Livre: Se a etapa não tem restrição (null ou string vazia), libera geral
    if (!stage.allowedRole || stage.allowedRole.trim() === '') {
      this.logger.debug(
        `   - [AUTH_CHECK] Liberado: Etapa não tem restrição de cargo.`,
      );
      return true;
    }

    // 3. Normalização (Converte para minúsculo e remove espaços extras)
    const userRole = user.professionalRole?.trim().toLowerCase() || '';
    const stageRequiredRole = stage.allowedRole.trim().toLowerCase();

    this.logger.debug(
      `   - [AUTH_CHECK] Comparando: Usuário="${userRole}" vs Exigido="${stageRequiredRole}"`,
    );

    // 4. Comparação Inteligente

    // A. Match Exato (Cenário Ideal)
    if (userRole === stageRequiredRole) {
      return true;
    }

    // B. Match Parcial (🔥 A CORREÇÃO PARA O SEU PROBLEMA)
    // Verifica se o cargo do usuário CONTÉM a palavra exigida.
    // Ex: Se usuário é "gerente de produção" e a exigência é "gerente" -> Retorna TRUE.
    if (userRole.includes(stageRequiredRole)) {
      this.logger.debug(
        `   - [AUTH_CHECK] Liberado por similaridade (Partial Match).`,
      );
      return true;
    }

    // 5. Bloqueio Final
    this.logger.warn(`   - ⛔ BLOQUEADO: Cargos não batem.`);

    throw new ForbiddenException();
  }

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

  async getTemplates(companyId: string) {
    this.logger.log(`Buscando templates para a empresa: ${companyId}`);
    return await this.prisma.flowTemplate.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async saveTemplate(companyId: string, flowId: string, name: string) {
    this.logger.log(
      `Iniciando saveTemplate para FlowID: ${flowId} na Empresa: ${companyId}`,
    );

    const stages = await this.prisma.flowStage.findMany({
      where: { flowId: flowId, flow: { companyId } },
      orderBy: { order: 'asc' },
    });

    if (stages.length === 0) {
      this.logger.warn(
        `Falha ao salvar template: Fluxo ${flowId} não possui etapas.`,
      );
      throw new BadRequestException('O fluxo não possui etapas para salvar.');
    }

    const structure = stages.map((s) => ({ name: s.name, color: s.color }));

    const template = await this.prisma.flowTemplate.create({
      data: { name, companyId, structure },
    });

    this.logger.log(
      `Template "${name}" criado com sucesso! ID: ${template.id}`,
    );
    flowOpsCounter.labels('save_template', 'success').inc();
    return template;
  }

  async applyTemplate(companyId: string, flowId: string, templateId: string) {
    this.logger.log(`Aplicando Template ${templateId} ao Fluxo ${flowId}`);

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
      this.logger.log(
        `Template aplicado: ${created.length} novas etapas no fluxo ${flowId}`,
      );
      return created;
    });
  }

  async deleteTemplate(companyId: string, templateId: string) {
    this.logger.log(
      `Iniciando exclusão de template: ${templateId} para empresa: ${companyId}`,
    );

    const template = await this.prisma.flowTemplate.findFirst({
      where: { id: templateId, companyId },
    });

    if (!template) {
      this.logger.warn(
        `Template ${templateId} não encontrado ou acesso negado para empresa ${companyId}`,
      );
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
    await this.cacheManager.set(cacheKey, board, 10000);
    return board;
  }

  async deleteFlow(flowId: string, companyId: string) {
    const flow = await this.prisma.productFlow.findFirst({
      where: { id: flowId, companyId },
      include: {
        items: { include: { images: true, audios: true, videos: true } },
      },
    });

    if (!flow) throw new NotFoundException('Fluxo não encontrado');

    this.cleanUpFlowFiles(flow.items).catch((e) =>
      this.logger.error('Cleanup error', e),
    );

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

  async createStage(
    companyId: string,
    flowId: string,
    // 🔥 CORREÇÃO: Agora recebe o DTO inteiro como 3º argumento
    data: CreateStageDto,
  ) {
    const lastStage = await this.prisma.flowStage.findFirst({
      where: { flowId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const newOrder = (lastStage?.order ?? -1) + 1;

    const stage = await this.prisma.flowStage.create({
      data: {
        name: data.name,
        flowId,
        order: newOrder,
        color: data.color || '#2C3E50',
        allowedRole: data.allowedRole || null, // Salva o cargo permitido
        companyId,
      },
    });

    await this.invalidateFlowCache(companyId, flowId);
    return stage;
  }

  async updateStage(companyId: string, stageId: string, data: any) {
    const stage = await this.prisma.flowStage.findFirst({
      where: { id: stageId, flow: { companyId } },
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
      where: { id: stageId, flow: { companyId } },
      include: {
        items: { include: { images: true, audios: true, videos: true } },
      },
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
  // 🟡 GESTÃO DE ITENS (ATUALIZADO COM VALIDAÇÃO DE CARGO)
  // ===========================================================================

  async createFlowItem(
    companyId: string,
    flowId: string,
    userId: string,
    dto: CreateFlowItemDto,
  ) {
    // 1. Buscar dados do usuário para validação de permissão
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, role: true, professionalRole: true },
    });

    if (!user) throw new ForbiddenException('Usuário não identificado.');

    return this.prisma.$transaction(async (tx) => {
      let targetStage;

      // 2. Determinar a Etapa de Destino
      if (dto.stageId) {
        // Se o ID foi passado, busca especificamente essa etapa
        targetStage = await tx.flowStage.findFirst({
          where: { id: dto.stageId, flowId },
        });

        if (!targetStage) {
          throw new BadRequestException(
            'A etapa informada não pertence a este fluxo.',
          );
        }
      } else {
        // Se não foi passado, busca a primeira etapa do fluxo (padrão)
        targetStage = await tx.flowStage.findFirst({
          where: { flowId },
          orderBy: { order: 'asc' },
        });

        if (!targetStage) {
          throw new BadRequestException(
            'Este fluxo não possui etapas configuradas.',
          );
        }
      }

      // 3. 🛡️ VALIDAÇÃO DE ACESSO
      // Reutiliza a mesma lógica que você já criou para a movimentação
      try {
        this.validateStageAccess(user, targetStage);
      } catch (error) {
        throw new ForbiddenException(
          `Você não tem permissão para criar itens na etapa "${targetStage.name}". Cargo exigido: ${targetStage.allowedRole}`,
        );
      }

      // 4. Calcular ordem na etapa
      const lastItem = await tx.flowItem.findFirst({
        where: { stageId: targetStage.id },
        orderBy: { orderInStage: 'desc' },
      });

      // 5. Criar o Item
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
          stageId: targetStage.id, // Usa o ID da etapa validada
          orderInStage: (lastItem?.orderInStage ?? -1) + 1,
          enteredAt: new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          productionStartedAt: dto.productionStartedAt
            ? new Date(dto.productionStartedAt)
            : null,
          deliveryAt: dto.deliveryAt ? new Date(dto.deliveryAt) : null,
          supplierId: dto.supplierId || null,
        },
      });
    });
  }

  async updateFlowItem(
    companyId: string,
    itemId: string,
    userId: string,
    data: any,
  ) {
    // 1. Buscar usuário para validar permissões
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, role: true, professionalRole: true },
    });

    if (!user) throw new ForbiddenException('Usuário não identificado.');
    //
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { stage: true }, // Incluímos o stage para ver o allowedRole
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    // 3. 🛡️ VALIDAÇÃO DE ACESSO À COLUNA
    // Se o usuário não tiver permissão na coluna atual, ele não pode editar NADA.
    try {
      // Reutiliza a lógica central de validação (Admin, Match Exato, Match Parcial)
      if (item.stage) {
        this.validateStageAccess(user, item.stage);
      }
    } catch (error) {
      throw new ForbiddenException();
    }

    if (data.removeImageIds)
      for (const id of data.removeImageIds)
        await this.deleteMedia(companyId, itemId, 'image', id);
    if (data.removeVideoIds)
      for (const id of data.removeVideoIds)
        await this.deleteMedia(companyId, itemId, 'video', id);
    if (data.removeAudioIds)
      for (const id of data.removeAudioIds)
        await this.deleteMedia(companyId, itemId, 'audio', id);

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
        productionStartedAt: data.productionStartedAt
          ? new Date(data.productionStartedAt)
          : null,
        deliveryAt: data.deliveryAt ? new Date(data.deliveryAt) : null,
        stageId: data.stageId || item.stageId,
        updatedAt: new Date(),
      },
    });

    await this.invalidateFlowCache(companyId, item.flowId);
    return updated;
  }

  async moveItem(itemId: string, newStageId: string, userId: string) {
    this.logger.log(
      `🚀 [MOVE_ITEM] Iniciando movimentação. Item: ${itemId} -> Stage: ${newStageId}`,
    );

    // 1. Validar Contexto
    const companyId = this.cls.get<string>('tenantId');
    this.logger.log(`🔍 [MOVE_ITEM] Contexto CompanyID: ${companyId}`);

    if (!companyId) {
      this.logger.error(
        `❌ [MOVE_ITEM] Erro: CompanyID não encontrado no CLS.`,
      );
      throw new InternalServerErrorException('Tenant Context missing');
    }

    // 2. Buscar Item
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { stage: true },
    });

    if (!item) {
      this.logger.error(`❌ [MOVE_ITEM] Item não encontrado no banco.`);
      throw new NotFoundException('Item não encontrado.');
    }

    this.logger.log(
      `✅ [MOVE_ITEM] Item encontrado: ${item.title} (Atual Stage: ${item.stage?.name})`,
    );

    // 3. Buscar Usuário
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, role: true, professionalRole: true, name: true },
    });

    if (!user) {
      this.logger.error(`❌ [MOVE_ITEM] Usuário não encontrado: ${userId}`);
      throw new ForbiddenException('Usuário inválido.');
    }

    this.logger.log(
      `👤 [MOVE_ITEM] Usuário: ${user.name} | Role: ${user.role} | ProfRole: ${user.professionalRole}`,
    );

    // 4. Validar Acesso (Aqui é onde suspeitamos que está o erro)
    try {
      this.validateStageAccess(user, item.stage!);
      this.logger.log(`🔓 [MOVE_ITEM] Acesso PERMITIDO.`);
    } catch (error) {
      this.logger.error(`⛔ [MOVE_ITEM] Acesso NEGADO: ${error.message}`);
      throw error; // Re-lança o erro para o controller
    }

    // 5. Mover
    try {
      const updated = await this.prisma.flowItem.update({
        where: { id: itemId },
        data: {
          stageId: newStageId,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`💾 [MOVE_ITEM] Sucesso! Item salvo no banco.`);
      await this.invalidateFlowCache(item.companyId, item.flowId);

      return updated;
    } catch (dbError) {
      this.logger.error(
        `🔥 [MOVE_ITEM] Erro de Banco de Dados: ${dbError.message}`,
        dbError.stack,
      );
      throw new InternalServerErrorException('Erro ao salvar movimentação.');
    }
  }

  async deleteItem(itemId: string, companyId: string) {
    const item = await this.prisma.flowItem.findFirst({
      where: { id: itemId, companyId },
      include: { images: true, audios: true, videos: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    this.cleanUpFlowFiles([item]).catch((e) => this.logger.error(e));
    await this.prisma.flowItem.delete({ where: { id: itemId } });
    await this.invalidateFlowCache(companyId, item.flowId);
    return { success: true };
  }

  // --- MÍDIAS ---
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
    if (!item) throw new NotFoundException('Item não encontrado');

    const uploadResult = await this.supabase.uploadFlowFile(itemId, file, type);
    const commonData = {
      itemId,
      companyId,
      uploadedById: userId,
      url: uploadResult.url,
      filename: uploadResult.filename,
      size: uploadResult.size,
    };

    let media;
    if (type === 'image')
      media = await this.prisma.flowImage.create({ data: commonData });
    else if (type === 'audio')
      media = await this.prisma.flowAudio.create({
        data: { ...commonData, duration: 0 },
      });
    else
      media = await this.prisma.flowVideo.create({
        data: { ...commonData, duration: 0 },
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

    const item = await this.prisma.flowItem.findUnique({
      where: { id: itemId },
      select: { flowId: true },
    });
    if (item) await this.invalidateFlowCache(companyId, item.flowId);
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

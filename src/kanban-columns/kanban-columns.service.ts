/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import {
  Injectable,
  BadRequestException,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from 'src/prisma/prisma.service';
import { Counter, Histogram } from 'prom-client';
import { Prisma } from '@prisma/client';

// --- Métricas de Monitoramento ---
const columnOpsCounter = new Counter({
  name: 'kanban_column_ops_total',
  help: 'Total de operações em colunas kanban',
  labelNames: ['operation', 'status'],
});

const dbLatencyHistogram = new Histogram({
  name: 'db_latency_kanban_seconds',
  help: 'Latência do banco em operações kanban',
  labelNames: ['method'],
});

@Injectable()
export class KanbanColumnService {
  private readonly logger = new Logger(KanbanColumnService.name);
  private readonly CACHE_TTL = 30000; // 30 segundos
  private readonly DONE_COLUMN_TITLE = 'Concluído'; // Nome reservado para o sistema

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { }

  /**
   * Invalida o cache de colunas de uma empresa específica.
   * Deve ser chamado sempre que houver uma alteração (Create, Update, Delete, Reorder).
   */
  private async invalidateCache(companyId: string) {
    await this.cacheManager.del(`kanban_columns_${companyId}`);
  }

  // ===========================================================================
  // LEITURA (FIND ALL)
  // ===========================================================================

  async findAll(companyId: string) {
    const end = dbLatencyHistogram.labels('findAll').startTimer();

    // 1. Tentar buscar do Cache
    const cacheKey = `kanban_columns_${companyId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      end();
      return cached;
    }

    try {
      // 2. Buscar no Banco
      let columns = await this.fetchColumns(companyId);

      // 🔥 REGRA DE NEGÓCIO: Garantir que a coluna "Concluído" exista
      const hasDoneColumn = columns.some(c => c.title === this.DONE_COLUMN_TITLE);
      
      if (!hasDoneColumn) {
         this.logger.log(`Coluna '${this.DONE_COLUMN_TITLE}' não encontrada para empresa ${companyId}. Criando automaticamente...`);
         await this.ensureDoneColumnExists(companyId);
         // Busca novamente para incluir a nova coluna
         columns = await this.fetchColumns(companyId); 
      }

      // 3. Salvar no Cache
      await this.cacheManager.set(cacheKey, columns, this.CACHE_TTL);
      columnOpsCounter.labels('findAll', 'success').inc();
      end();
      
      return columns;

    } catch (error: any) {
      columnOpsCounter.labels('findAll', 'error').inc();
      end();
      this.logger.error(`Erro no findAll: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Helper para buscar colunas com as relações necessárias
  private async fetchColumns(companyId: string) {
    return this.prisma.kanbanColumn.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
      include: {
        tasks: {
          orderBy: { columnOrder: 'asc' },
          include: {
            userAssigned: { select: { id: true, name: true, email: true } },
            taskAddress: true, // Necessário para mostrar o ícone de localização no card minimalista
            taskImages: { select: { id: true, url: true }, take: 1 }, // Capa (opcional, caso queira usar no futuro)
            taskVideos: { select: { id: true }, take: 1 }, // Contagem
            taskAudios: { select: { id: true }, take: 1 }, // Contagem
          },
        },
      },
    });
  }

  // Helper para criar a coluna "Concluído"
  private async ensureDoneColumnExists(companyId: string) {
      // Pega o maior order atual para colocar a coluna no final
      const maxOrder = await this.prisma.kanbanColumn.aggregate({
        where: { companyId },
        _max: { order: true }
      });
      const order = (maxOrder._max.order ?? -1) + 1;

      // Pega um usuário qualquer da empresa para ser o "criador" (sistema) ou deixa nulo se o schema permitir
      // Aqui vamos pegar o primeiro usuário master ou admin encontrado, ou o primeiro user da empresa
      const systemUser = await this.prisma.user.findFirst({ where: { companyId } });
      
      if (!systemUser) return; // Se não tem usuário na empresa, aborta (edge case raro)

      await this.prisma.kanbanColumn.create({
          data: {
              title: this.DONE_COLUMN_TITLE,
              description: 'Tarefas finalizadas',
              order,
              companyId,
              userCreateId: systemUser.id,
              status: 'ACTIVE'
          }
      });
  }

  async findOne(id: string, companyId: string) {
    const column = await this.prisma.kanbanColumn.findFirst({
      where: { id, companyId },
      include: { tasks: { include: { userAssigned: true } } }
    });
    if (!column) throw new NotFoundException('Coluna não encontrada');
    return column;
  }

  // ===========================================================================
  // ESCRITA (CREATE, UPDATE, DELETE)
  // ===========================================================================

  async create(title: string, companyId: string, createdById: string) {
    // 🔥 REGRA: Não permitir criar manualmente uma coluna com o nome reservado
    if (title.trim().toLowerCase() === this.DONE_COLUMN_TITLE.toLowerCase()) {
        throw new BadRequestException(`A coluna "${this.DONE_COLUMN_TITLE}" é gerenciada automaticamente pelo sistema.`);
    }

    const existing = await this.prisma.kanbanColumn.findFirst({
      where: { title: { equals: title.trim(), mode: 'insensitive' }, companyId }
    });

    if (existing) throw new BadRequestException('Já existe uma coluna com este título.');
    
    // Define a ordem como a última
    const maxOrder = await this.prisma.kanbanColumn.aggregate({
      where: { companyId },
      _max: { order: true }
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    const column = await this.prisma.kanbanColumn.create({
      data: {
        title: title.trim(),
        description: `Coluna ${title.trim()}`,
        order,
        companyId,
        userCreateId: createdById,
      }
    });

    await this.invalidateCache(companyId);
    return column;
  }

  async update(id: string, title: string | undefined, companyId: string, description?: string) {
    const currentColumn = await this.prisma.kanbanColumn.findUnique({ where: { id } });

    if (!currentColumn || currentColumn.companyId !== companyId) {
        throw new NotFoundException('Coluna não encontrada.');
    }

    // 🔥 REGRA: Se a coluna for "Concluído", não pode mudar o nome
    if (currentColumn.title === this.DONE_COLUMN_TITLE && title && title !== this.DONE_COLUMN_TITLE) {
        throw new ForbiddenException(`Não é permitido renomear a coluna padrão "${this.DONE_COLUMN_TITLE}".`);
    }

    const data: Prisma.KanbanColumnUpdateInput = {};

    if (title) {
      // Verifica duplicidade apenas se o nome mudou
      if (title.trim().toLowerCase() !== currentColumn.title.toLowerCase()) {
          const existing = await this.prisma.kanbanColumn.findFirst({
            where: {
              title: { equals: title.trim(), mode: 'insensitive' },
              companyId,
              id: { not: id }
            }
          });
          if (existing) throw new BadRequestException('Já existe outra coluna com este título.');
      }
      data.title = title.trim();
    }

    if (description !== undefined) data.description = description;

    const updated = await this.prisma.kanbanColumn.update({
      where: { id },
      data
    });

    await this.invalidateCache(companyId);
    return updated;
  }

  async delete(id: string, companyId: string) {
    const columnToDelete = await this.prisma.kanbanColumn.findUnique({ where: { id } });

    if (!columnToDelete || columnToDelete.companyId !== companyId) {
      throw new NotFoundException('Coluna não encontrada.');
    }

    // 🔥 REGRA: A coluna "Concluído" é indestrutível
    if (columnToDelete.title === this.DONE_COLUMN_TITLE) {
        throw new ForbiddenException(`A coluna "${this.DONE_COLUMN_TITLE}" é essencial e não pode ser excluída.`);
    }

    // Estratégia de Fallback: Achar outra coluna para mover as tasks pendentes antes de deletar
    const fallbackColumn = await this.prisma.kanbanColumn.findFirst({
      where: {
        companyId,
        id: { not: id },
        // Tenta achar "Sem etapa" ou a primeira coluna disponível (order 0)
        OR: [
          { title: { contains: 'Sem etapa', mode: 'insensitive' } },
          { order: 0 }
        ]
      },
      orderBy: { order: 'asc' }
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. Mover tarefas órfãs para a coluna de fallback
      if (fallbackColumn) {
        await tx.task.updateMany({
          where: { columnId: id },
          data: { columnId: fallbackColumn.id }
        });
      }
      // Se não houver fallback (só existe 1 coluna), as tarefas serão deletadas pelo CASCADE do banco 
      // ou lançará erro se o banco estiver como RESTRICT.

      // 2. Deletar a Coluna
      await tx.kanbanColumn.delete({ where: { id } });
    });

    await this.invalidateCache(companyId);
    return {
      message: 'Coluna deletada.',
      tasksMovedTo: fallbackColumn?.title || 'Nenhuma (ou excluídas)'
    };
  }

  async reorder(columns: { id: string; order: number }[], companyId: string) {
    // Validação de Segurança: Garante que todas as colunas pertencem à empresa
    const ids = columns.map(c => c.id);
    const count = await this.prisma.kanbanColumn.count({
      where: { id: { in: ids }, companyId }
    });

    if (count !== columns.length) {
      throw new BadRequestException('Tentativa de reordenar colunas inválidas ou de outra empresa.');
    }

    // Transaction para garantir consistência visual
    await this.prisma.$transaction(
      columns.map(col =>
        this.prisma.kanbanColumn.update({
          where: { id: col.id },
          data: { order: col.order }
        })
      )
    );

    await this.invalidateCache(companyId);
    return { success: true };
  }
}
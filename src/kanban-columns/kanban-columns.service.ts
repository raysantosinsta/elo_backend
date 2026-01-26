/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
  private readonly CACHE_TTL = 30000;
  
  // Normaliza string para comparação (remove acentos e caixa baixa)
  private normalize(str: string) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // Lista de nomes considerados como "Concluído"
  private readonly DONE_VARIANTS = ['concluido', 'concluído', 'done', 'finalizado'];
  private readonly DONE_COLUMN_TITLE = 'Concluído';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { }

  private async invalidateCache(companyId: string) {
    await this.cacheManager.del(`kanban_columns_${companyId}`);
  }

  // ===========================================================================
  // LEITURA (COM ORDENAÇÃO FORÇADA)
  // ===========================================================================

  async findAll(companyId: string) {
    const end = dbLatencyHistogram.labels('findAll').startTimer();
    const cacheKey = `kanban_columns_${companyId}`;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      end();
      return cached;
    }

    try {
      let columns = await this.fetchColumns(companyId);

      // Verificação de segurança: A coluna Concluído existe?
      const hasDoneColumn = columns.some(c => this.DONE_VARIANTS.includes(this.normalize(c.title)));

      if (!hasDoneColumn) {
        await this.ensureDoneColumnExists(companyId);
        columns = await this.fetchColumns(companyId);
      }

      // 🔥 CORREÇÃO CRÍTICA: Ordenação via Código (JavaScript) antes de retornar
      // Isso garante que visualmente fique correto mesmo se o campo 'order' no banco estiver bagunçado
      const sortedColumns = columns.sort((a, b) => {
        const isADone = this.DONE_VARIANTS.includes(this.normalize(a.title));
        const isBDone = this.DONE_VARIANTS.includes(this.normalize(b.title));

        if (isADone && !isBDone) return 1; // A vai para o final
        if (!isADone && isBDone) return -1; // B vai para o final
        return a.order - b.order; // Ordenação normal numérica
      });

      await this.cacheManager.set(cacheKey, sortedColumns, this.CACHE_TTL);
      columnOpsCounter.labels('findAll', 'success').inc();
      end();
      return sortedColumns;

    } catch (error: any) {
      columnOpsCounter.labels('findAll', 'error').inc();
      end();
      throw error;
    }
  }

  private async fetchColumns(companyId: string) {
    return this.prisma.kanbanColumn.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
      include: {
        tasks: {
          orderBy: { columnOrder: 'asc' },
          include: {
            userAssigned: { select: { id: true, name: true, email: true } },
            taskAddress: true,
            taskImages: { select: { id: true, url: true }, take: 1 },
            taskVideos: { select: { id: true }, take: 1 },
            taskAudios: { select: { id: true }, take: 1 },
          },
        },
      },
    });
  }

  private async ensureDoneColumnExists(companyId: string) {
    // Garante uma ordem absurdamente alta (Nuclear Option)
    const order = 9999;

    const systemUser = await this.prisma.user.findFirst({ where: { companyId } });
    if (!systemUser) return;

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
  // ESCRITA (CREATE BLINDADO)
  // ===========================================================================

  async create(title: string, companyId: string, createdById: string) {
    // 1. Bloqueia criação manual com nomes reservados
    if (this.DONE_VARIANTS.includes(this.normalize(title))) {
      throw new BadRequestException(`A coluna "${title}" é reservada e gerenciada pelo sistema.`);
    }

    const existing = await this.prisma.kanbanColumn.findFirst({
      where: { title: { equals: title.trim(), mode: 'insensitive' }, companyId }
    });
    if (existing) throw new BadRequestException('Já existe uma coluna com este título.');

    // Transação para consistência
    const result = await this.prisma.$transaction(async (tx) => {
      // 2. Acha a coluna Done atual (por várias variações de nome)
      const allCols = await tx.kanbanColumn.findMany({
        where: { companyId },
        select: { id: true, title: true, order: true }
      });

      const doneColumn = allCols.find(c => this.DONE_VARIANTS.includes(this.normalize(c.title)));

      // 3. Descobre qual é a maior ordem de colunas NORMAIS (excluindo a Done)
      const regularCols = allCols.filter(c => !this.DONE_VARIANTS.includes(this.normalize(c.title)));
      const currentMaxRegularOrder = regularCols.reduce((max, col) => col.order > max ? col.order : max, -1);

      // 4. Lógica de inserção:
      // A nova coluna entra logo após a última coluna normal
      const newColOrder = currentMaxRegularOrder + 1;

      // Cria a nova
      const newColumn = await tx.kanbanColumn.create({
        data: {
          title: title.trim(),
          description: `Coluna ${title.trim()}`,
          order: newColOrder,
          companyId,
          userCreateId: createdById,
        }
      });

      // Se existe a coluna Done, garante que ela continue no final (Nuclear Option)
      if (doneColumn) {
        await tx.kanbanColumn.update({
          where: { id: doneColumn.id },
          data: { order: 9999 } // Força Bruta
        });
      }

      return newColumn;
    });

    await this.invalidateCache(companyId);
    return result;
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================
  async update(id: string, title: string | undefined, companyId: string, description?: string) {
    const currentColumn = await this.prisma.kanbanColumn.findUnique({ where: { id } });
    if (!currentColumn || currentColumn.companyId !== companyId) throw new NotFoundException('Coluna não encontrada.');

    const isDoneCol = this.DONE_VARIANTS.includes(this.normalize(currentColumn.title));

    if (isDoneCol && title && !this.DONE_VARIANTS.includes(this.normalize(title))) {
      throw new ForbiddenException(`Não é permitido renomear a coluna de Conclusão.`);
    }

    const data: Prisma.KanbanColumnUpdateInput = {};
    if (title) {
      if (this.normalize(title) !== this.normalize(currentColumn.title)) {
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

    const updated = await this.prisma.kanbanColumn.update({ where: { id }, data });
    await this.invalidateCache(companyId);
    return updated;
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================
  async delete(id: string, companyId: string) {
    const columnToDelete = await this.prisma.kanbanColumn.findUnique({ where: { id } });
    if (!columnToDelete || columnToDelete.companyId !== companyId) throw new NotFoundException('Coluna não encontrada.');

    if (this.DONE_VARIANTS.includes(this.normalize(columnToDelete.title))) {
      throw new ForbiddenException(`A coluna "${columnToDelete.title}" é essencial e não pode ser excluída.`);
    }

    const fallbackColumn = await this.prisma.kanbanColumn.findFirst({
      where: {
        companyId,
        id: { not: id },
        order: 0 // Tenta pegar a primeira
      },
      orderBy: { order: 'asc' }
    });

    await this.prisma.$transaction(async (tx) => {
      if (fallbackColumn) {
        await tx.task.updateMany({
          where: { columnId: id },
          data: { columnId: fallbackColumn.id }
        });
      }
      await tx.kanbanColumn.delete({ where: { id } });
    });

    await this.invalidateCache(companyId);
    return { message: 'Coluna deletada.' };
  }

  // ===========================================================================
  // REORDER (LÓGICA BLINDADA COM OPÇÃO NUCLEAR)
  // ===========================================================================

  async reorder(columnsInput: { id: string; order: number }[], companyId: string) {
    const ids = columnsInput.map(c => c.id);
    const dbColumns = await this.prisma.kanbanColumn.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, title: true }
    });

    if (dbColumns.length !== columnsInput.length) {
      throw new BadRequestException('Colunas inválidas detectadas.');
    }

    // Acha a coluna done no banco (independente do input do usuário)
    const doneColumn = dbColumns.find(c => this.DONE_VARIANTS.includes(this.normalize(c.title)));

    // Separa colunas normais
    const regularColumns = columnsInput.filter(c => c.id !== doneColumn?.id);
    // Ordena pelo input do front
    regularColumns.sort((a, b) => a.order - b.order);

    const updatePromises: Prisma.PrismaPromise<any>[] = [];

    // Reindexa as normais sequencialmente: 0, 1, 2, 3...
    regularColumns.forEach((col, index) => {
      updatePromises.push(
        this.prisma.kanbanColumn.update({
          where: { id: col.id },
          data: { order: index }
        })
      );
    });

    // 🔥 FORÇA BRUTA NUCLEAR:
    // Garante que a coluna Concluído tenha um valor inalcançável pelas colunas normais
    if (doneColumn) {
      updatePromises.push(
        this.prisma.kanbanColumn.update({
          where: { id: doneColumn.id },
          data: { order: 9999 } // Número absurdamente alto
        })
      );
    }

    await this.prisma.$transaction(updatePromises);
    await this.invalidateCache(companyId);

    return { success: true };
  }
}
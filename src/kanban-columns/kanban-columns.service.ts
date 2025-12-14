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
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from 'src/prisma/prisma.service';
import { Counter, Histogram } from 'prom-client';
import { Prisma } from '@prisma/client';

// Métricas
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
  private readonly CACHE_TTL = 30000; // 30s

  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { }

  private async invalidateCache(companyId: string) {
    await this.cacheManager.del(`kanban_columns_${companyId}`);
  }

  // --- FIND ALL (Com Cache e Auto-Setup) ---
  async findAll(companyId: string) {
    const end = dbLatencyHistogram.labels('findAll').startTimer();

    // 1. Tentar Cache
    const cacheKey = `kanban_columns_${companyId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      end();
      return cached;
    }

    try {
      // 2. Buscar no Banco
      const columns = await this.fetchColumns(companyId);

      // --- REMOVIDO: AUTO-SETUP ---
      // A lógica que criava colunas padrão (if columns.length === 0) foi removida 
      // para permitir que o frontend mostre a tela de "criar primeira coluna".

      // 3. Salvar Cache
      await this.cacheManager.set(cacheKey, columns, this.CACHE_TTL);
      columnOpsCounter.labels('findAll', 'success').inc();
      end();
      return columns;

    } catch (error) {
      columnOpsCounter.labels('findAll', 'error').inc();
      end();
      this.logger.error(`Erro no findAll: ${error.message}`, error.stack);
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
            // Otimização: Não trazer histórico ou anexos pesados na listagem
          },
        },
      },
    });
  }

  private async createDefaultColumns(companyId: string) {
    const defaultColumns = [
      { title: 'Sem etapa', description: 'Tarefas sem etapa definida' },
      { title: 'Preenchimento Estilo', description: 'Etapa inicial' },
      { title: 'Desenvolvimento', description: 'Em produção' },
      { title: 'Cad', description: 'Modelagem' },
      { title: 'Ficha para Engenharia', description: 'Técnica' },
      { title: 'Lacre', description: 'Finalização' },
    ];

    const companyUser = await this.prisma.user.findFirst({
      where: { companyId },
      select: { id: true },
    });

    if (!companyUser) return;

    // Transaction para garantir atomicidade
    await this.prisma.$transaction(
      defaultColumns.map((col, index) =>
        this.prisma.kanbanColumn.create({
          data: {
            title: col.title,
            description: col.description,
            order: index,
            companyId,
            userCreateId: companyUser.id,
          },
        }),
      ),
    );
  }

  // --- CREATE ---
  async create(title: string, companyId: string, createdById: string) {
    const existing = await this.prisma.kanbanColumn.findFirst({
      where: { title: { equals: title.trim(), mode: 'insensitive' }, companyId }
    });

    if (existing) throw new BadRequestException('Já existe uma coluna com este título.');
    
    // Entre todas as colunas dessa empresa, qual é o número mais alto no campo order
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
        userCreateId: createdById,}
    });

    await this.invalidateCache(companyId);
    return column;
  }

  // --- UPDATE ---
  async update(id: string, title: string | undefined, companyId: string, description?: string) {
    const data: Prisma.KanbanColumnUpdateInput = {};

    if (title) {
      const existing = await this.prisma.kanbanColumn.findFirst({
        where: {
          title: { equals: title.trim(), mode: 'insensitive' },
          companyId,
          id: { not: id }
        }
      });
      if (existing) throw new BadRequestException('Já existe outra coluna com este título.');
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

  // --- DELETE (Com Migração de Tarefas) ---
  async delete(id: string, companyId: string) {
    const columnToDelete = await this.prisma.kanbanColumn.findUnique({ where: { id } });

    if (!columnToDelete || columnToDelete.companyId !== companyId) {
      throw new NotFoundException('Coluna não encontrada.');
    }

    // Estratégia de Fallback: Achar outra coluna para mover as tasks
    const fallbackColumn = await this.prisma.kanbanColumn.findFirst({
      where: {
        companyId,
        id: { not: id },
        // Prioriza colunas "padrão" ou a primeira disponível
        OR: [
          { title: { contains: 'Sem etapa', mode: 'insensitive' } },
          { order: 0 }
        ]
      },
      orderBy: { order: 'asc' }
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. Mover tarefas
      if (fallbackColumn) {
        await tx.task.updateMany({
          where: { columnId: id },
          data: { columnId: fallbackColumn.id }
        });
      }
      // Se não houver fallback, o CASCADE do banco deletaria as tarefas.
      // Se quiser evitar isso, precisaria setar columnId = null (se o schema permitir) 
      // ou impedir a deleção da última coluna.

      // 2. Deletar Coluna
      await tx.kanbanColumn.delete({ where: { id } });
    });

    await this.invalidateCache(companyId);
    return {
      message: 'Coluna deletada.',
      tasksMovedTo: fallbackColumn?.title || 'Nenhuma (ou excluídas)'
    };
  }

  // --- REORDER ---
  async reorder(columns: { id: string; order: number }[], companyId: string) {
    // Validação de Segurança
    const ids = columns.map(c => c.id);
    const count = await this.prisma.kanbanColumn.count({
      where: { id: { in: ids }, companyId }
    });

    if (count !== columns.length) {
      throw new BadRequestException('Tentativa de reordenar colunas inválidas.');
    }

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

  async findOne(id: string, companyId: string) {
    const column = await this.prisma.kanbanColumn.findFirst({
      where: { id, companyId },
      include: { tasks: { include: { userAssigned: true } } }
    });
    if (!column) throw new NotFoundException('Coluna não encontrada');
    return column;
  }
}
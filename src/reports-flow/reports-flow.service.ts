/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ReportsFlowService {
  constructor(private prisma: PrismaService) { }

  // Busca lista de fluxos para o dropdown de filtro
  async getFlowsList(companyId: string) {
    return this.prisma.productFlow.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });
  }

  async getFlowReport(companyId: string, filters: any) {
    const where: Prisma.FlowItemWhereInput = { companyId };

    // --- Filtros ---
    // Filtro por Fluxo Específico (Ex: Coleção Verão 2025)
    if (filters.flowId && filters.flowId !== 'all') {
      where.flowId = filters.flowId;
    }

    // Filtro por Data de Entrega (Prazo)
    if (filters.startDate || filters.endDate) {
      where.dueDate = {};
      if (filters.startDate) where.dueDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.dueDate.lte = new Date(filters.endDate);
    }

    // Filtro por Referência de Produto (Busca textual)
    if (filters.search) {
      where.OR = [
        { productRef: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
        { orderNumber: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    // --- Buscar Itens ---
    const items = await this.prisma.flowItem.findMany({
      where,
      include: {
        stage: { select: { name: true, color: true, order: true } },
        assignedTo: { select: { name: true } },
        flow: { select: { name: true } }
      },
      orderBy: [
        { stage: { order: 'asc' } }, // Ordenar pela sequência produtiva
        { priority: 'desc' }
      ]
    });

    // --- Calcular Métricas ---
    const totalCards = items.length;

    // Soma total de peças (quantidade cortada/produzida)
    const totalPieces = items.reduce((acc, item) => acc + (item.quantity || 0), 0);

    const today = new Date();
    // Itens atrasados (Prazo menor que hoje e não estão em etapa final - lógica simplificada)
    const overdueItems = items.filter(i =>
      i.dueDate &&
      new Date(i.dueDate) < today
    ).length;

    // --- Agrupamento por Etapa (Gráfico de Barras/Funil) ---
    const stageMap = new Map<string, { name: string; count: number; pieces: number; color: string; order: number }>();

    items.forEach(item => {
      const stageName = item.stage?.name || 'Sem Etapa';
      const stageColor = item.stage?.color || '#cbd5e1';
      const order = item.stage?.order ?? 999;

      if (!stageMap.has(stageName)) {
        stageMap.set(stageName, { name: stageName, count: 0, pieces: 0, color: stageColor, order });
      }

      const entry = stageMap.get(stageName); // entry is guaranteed to be defined here due to the if condition above
      if (entry) {
        entry.count += 1;
        entry.pieces += (item.quantity || 0);
      }
    });

    // Converter Map para Array ordenado pela ordem da etapa
    const byStage = Array.from(stageMap.values()).sort((a, b) => a.order - b.order);

    // --- Agrupamento por Prioridade ---
    const byPriority = [1, 2, 3, 4, 5].map(p => ({
      name: `Prio ${p}`,
      value: items.filter(t => t.priority === p).length
    }));

    return {
      items: items.map(i => ({
        id: i.id,
        title: i.title,
        orderNumber: i.orderNumber,
        productRef: i.productRef,
        quantity: i.quantity,
        priority: i.priority,
        dueDate: i.dueDate,
        stageName: i.stage?.name || 'N/A',
        stageColor: i.stage?.color,
        flowName: i.flow?.name,
        assignedTo: i.assignedTo?.name
      })),
      summary: {
        totalCards,
        totalPieces,
        overdueItems,
        byStage, // Contém count e pieces para gráficos duplos
        byPriority
      }
    };
  }
}

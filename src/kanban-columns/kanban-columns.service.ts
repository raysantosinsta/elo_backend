/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class KanbanColumnService {
  constructor(private prisma: PrismaService) {}

 async findAll(companyId: string) {
  const columns = await this.prisma.kanbanColumn.findMany({
    where: { 
      companyId,
      isActive: true 
    },
    orderBy: { order: 'asc' },
    include: {
      tasks: {
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (columns.length === 0) {
    const defaults = [
      'Sem etapa',
      'Preenchimento Estilo',
      'Desenvolvimento',
      'Cad',
      'Ficha para Engenharia',
      'Lacre',
    ];

    // Buscar um usuário da empresa para ser o criador
    const companyUser = await this.prisma.user.findFirst({
      where: { companyId },
      select: { id: true }
    });

    if (!companyUser) {
      throw new Error('Nenhum usuário encontrado para criar as colunas padrão');
    }

    // Correção: remover variável não utilizada
    await this.prisma.kanbanColumn.createMany({
      data: defaults.map((title, i) => ({ 
        title, 
        order: i,
        companyId,
        createdById: companyUser.id
      })),
    });

    return this.prisma.kanbanColumn.findMany({ 
      where: { companyId },
      orderBy: { order: 'asc' },
      include: {
        tasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  return columns;
}

  async updateStatus(id: string, columnId: string | null, companyId: string) {
  // Verificar se a tarefa pertence à empresa
  const task = await this.prisma.task.findFirst({
    where: { 
      id, 
      companyId 
    }
  });

  if (!task) {
    throw new Error('Tarefa não encontrada');
  }

  // Se columnId for fornecido, verificar se a coluna pertence à empresa
  if (columnId) {
    const column = await this.prisma.kanbanColumn.findFirst({
      where: { 
        id: columnId, 
        companyId 
      }
    });

    if (!column) {
      throw new Error('Coluna não encontrada');
    }
  }

  // Usar connect/disconnect para relações
  const updateData = columnId 
    ? { column: { connect: { id: columnId } } }
    : { column: { disconnect: true } };

  return this.prisma.task.update({
    where: { id },
    data: updateData,
  });
}

  async create(title: string, companyId: string, createdById: string) {
    const maxOrder = await this.prisma.kanbanColumn.aggregate({
      where: { companyId },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    // Verificar se já existe uma coluna com o mesmo título na empresa
    const existingColumn = await this.prisma.kanbanColumn.findFirst({
      where: { 
        title, 
        companyId 
      }
    });

    if (existingColumn) {
      throw new Error('Já existe uma coluna com este título');
    }

    return this.prisma.kanbanColumn.create({
      data: { 
        title, 
        order, 
        companyId,
        createdById 
      },
      include: {
        tasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
  }

  async update(id: string, title: string, companyId: string) {
    // Verificar se a coluna pertence à empresa
    const column = await this.prisma.kanbanColumn.findFirst({
      where: { 
        id, 
        companyId 
      }
    });

    if (!column) {
      throw new Error('Coluna não encontrada');
    }

    // Verificar se já existe outra coluna com o mesmo título na empresa
    const existingColumn = await this.prisma.kanbanColumn.findFirst({
      where: { 
        title, 
        companyId,
        id: { not: id }
      }
    });

    if (existingColumn) {
      throw new Error('Já existe outra coluna com este título');
    }

    return this.prisma.kanbanColumn.update({
      where: { id },
      data: { title },
      include: {
        tasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
  }

  async delete(id: string, companyId: string) {
  // Verificar se a coluna pertence à empresa
  const column = await this.prisma.kanbanColumn.findFirst({
    where: { 
      id, 
      companyId 
    }
  });

  if (!column) {
    throw new Error('Coluna não encontrada');
  }

  // 🔥 CORREÇÃO: Buscar a coluna padrão de forma mais flexível
  const defaultColumn = await this.prisma.kanbanColumn.findFirst({
    where: { 
      OR: [
        { 
          title: { 
            contains: 'sem etapa', 
            mode: 'insensitive' 
          }
        },
        { 
          title: { 
            contains: 'sem coluna', 
            mode: 'insensitive' 
          }
        },
        { 
          title: { 
            contains: 'pendente', 
            mode: 'insensitive' 
          }
        }
      ],
      companyId,
      id: { not: id } // Não pode ser a própria coluna que está sendo deletada
    },
    orderBy: { order: 'asc' } // Pegar a primeira coluna padrão encontrada
  });

  // 🔥 SE não encontrar coluna padrão, criar uma automaticamente
  let targetColumnId: string | null = null;
  
  if (!defaultColumn) {
    console.log('🔧 Coluna padrão não encontrada, criando automaticamente...');
    
    // Buscar um usuário da empresa para ser o criador
    const companyUser = await this.prisma.user.findFirst({
      where: { companyId },
      select: { id: true }
    });

    if (!companyUser) {
      throw new Error('Nenhum usuário encontrado para criar a coluna padrão');
    }

    // Criar coluna "Sem etapa" automaticamente
    const newDefaultColumn = await this.prisma.kanbanColumn.create({
      data: {
        title: 'Sem etapa',
        order: 0, // Colocar no início
        companyId,
        createdById: companyUser.id
      }
    });
    
    targetColumnId = newDefaultColumn.id;
    console.log('✅ Coluna padrão criada automaticamente:', newDefaultColumn.title);
  } else {
    targetColumnId = defaultColumn.id;
    console.log('✅ Coluna padrão encontrada:', defaultColumn.title);
  }

  // 🔥 CORREÇÃO: Se ainda não tem targetColumnId, usar undefined (sem coluna)
  if (!targetColumnId) {
    console.log('⚠️ Nenhuma coluna padrão disponível, definindo tasks como sem coluna');
    
    // Atualizar tarefas para ficarem sem coluna (columnId = undefined)
    await this.prisma.task.updateMany({
      where: { 
        columnId: id,
        companyId 
      },
      data: { columnId: undefined },
    });
  } else {
    // Atualizar todas as tarefas da coluna sendo deletada para a coluna padrão
    await this.prisma.task.updateMany({
      where: { 
        columnId: id,
        companyId 
      },
      data: { columnId: targetColumnId },
    });
  }

  // Deletar a coluna
  const result = await this.prisma.kanbanColumn.delete({ 
    where: { id } 
  });

  console.log(`✅ Coluna "${column.title}" deletada com sucesso`);
  console.log(`📊 Tarefas realocadas para: ${targetColumnId ? 'coluna padrão' : 'sem coluna'}`);
  
  return result;
}

  async reorder(columns: Array<{ id: string; order: number }>, companyId: string) {
    // Verificar se todas as colunas pertencem à empresa
    const columnIds = columns.map(col => col.id);
    const companyColumns = await this.prisma.kanbanColumn.findMany({
      where: { 
        id: { in: columnIds },
        companyId 
      },
      select: { id: true }
    });

    if (companyColumns.length !== columns.length) {
      throw new Error('Algumas colunas não pertencem à empresa');
    }

    // Atualizar a ordem de todas as colunas em uma transação
    const transactions = columns.map(column =>
      this.prisma.kanbanColumn.update({
        where: { id: column.id },
        data: { order: column.order },
      })
    );

    return this.prisma.$transaction(transactions);
  }

  async findOne(id: string, companyId: string) {
    return this.prisma.kanbanColumn.findFirst({
      where: { 
        id, 
        companyId,
        isActive: true 
      },
      include: {
        tasks: {
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }
}
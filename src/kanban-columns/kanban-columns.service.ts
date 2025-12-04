/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class KanbanColumnService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
  if (!companyId) {
    throw new BadRequestException('CompanyId é obrigatório');
  }

  console.log('🔍 Buscando colunas para company:', companyId);

  try {
    // Primeiro, buscar colunas existentes
    const columns = await this.prisma.kanbanColumn.findMany({
      where: { 
        companyId,
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

    console.log(`✅ Colunas encontradas: ${columns.length}`);

    // Se não há colunas, criar as padrões
    if (columns.length === 0) {
      console.log('📝 Criando colunas padrão...');
      
      const defaultColumns = [
        { title: 'Sem etapa', description: 'Tarefas sem etapa definida' },
        { title: 'Preenchimento Estilo', description: 'Etapa de preenchimento de estilo' },
        { title: 'Desenvolvimento', description: 'Etapa de desenvolvimento' },
        { title: 'Cad', description: 'Etapa de CAD' },
        { title: 'Ficha para Engenharia', description: 'Ficha técnica para engenharia' },
        { title: 'Lacre', description: 'Etapa final - Lacre' },
      ];

      // Buscar um usuário da empresa para ser o criador
      const companyUser = await this.prisma.user.findFirst({
        where: { companyId },
        select: { id: true }
      });

      if (!companyUser) {
        console.warn('⚠️ Nenhum usuário encontrado para criar colunas padrão');
        // Retornar array vazio se não tem usuário
        return [];
      }

      // Criar colunas padrão
      const createPromises = defaultColumns.map((col, index) => 
        this.prisma.kanbanColumn.create({
          data: { 
            title: col.title, 
            description: col.description,
            order: index,
            companyId,
            createdById: companyUser.id
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
        })
      );

      const newColumns = await Promise.all(createPromises);
      console.log(`✅ ${newColumns.length} colunas padrão criadas`);
      return newColumns;
    }

    return columns;
    
  } catch (error) {
    console.error('❌ Erro ao buscar colunas:', error);
    // Em caso de erro, retornar array vazio
    return [];
  }
}

  async updateStatus(id: string, columnId: string | null, companyId: string) {
    if (!companyId) {
      throw new BadRequestException('CompanyId é obrigatório');
    }

    // Verificar se a tarefa pertence à empresa
    const task = await this.prisma.task.findFirst({
      where: { 
        id, 
        companyId 
      }
    });

    if (!task) {
      throw new BadRequestException('Tarefa não encontrada');
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
        throw new BadRequestException('Coluna não encontrada');
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
  try {
    if (!title?.trim()) {
      throw new BadRequestException('Título da coluna é obrigatório');
    }
    if (!companyId) {
      throw new BadRequestException('CompanyId é obrigatório');
    }
    if (!createdById) {
      throw new BadRequestException('CreatedById é obrigatório');
    }

    console.log('🔧 Criando coluna:', { title, companyId, createdById });

    const maxOrder = await this.prisma.kanbanColumn.aggregate({
      where: { companyId },
      _max: { order: true },
    });
    const order = (maxOrder._max.order ?? -1) + 1;

    // Verificar se já existe uma coluna com o mesmo título na empresa
    const existingColumn = await this.prisma.kanbanColumn.findFirst({
      where: { 
        title: title.trim(), 
        companyId 
      }
    });

    if (existingColumn) {
      throw new BadRequestException('Já existe uma coluna com este título');
    }

    const newColumn = await this.prisma.kanbanColumn.create({
      data: { 
        title: title.trim(), 
        description: `Coluna ${title.trim()}`,
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

    console.log('✅ Coluna criada com sucesso:', newColumn.title);
    return newColumn;
    
  } catch (error) {
    console.error('❌ Erro ao criar coluna:', error);
    throw error;
  }
}

  async update(id: string, title: string, companyId: string, description?: string) {
    if (!title?.trim()) {
      throw new BadRequestException('Título da coluna é obrigatório');
    }
    if (!companyId) {
      throw new BadRequestException('CompanyId é obrigatório');
    }

    console.log('🔧 update: id=', id, 'title=', title, 'companyId=', companyId); // DEBUG

    // Verificar se a coluna pertence à empresa
    const column = await this.prisma.kanbanColumn.findFirst({
      where: { 
        id, 
        companyId 
      }
    });

    if (!column) {
      throw new BadRequestException('Coluna não encontrada');
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
      throw new BadRequestException('Já existe outra coluna com este título');
    }

    // 🔥 CORREÇÃO: Atualizar description também
    const updateData: { title: string; description?: string } = { title: title.trim() };
    if (description !== undefined) {
      updateData.description = description;
    }

    return this.prisma.kanbanColumn.update({
      where: { id },
      data: updateData,
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
  if (!companyId) {
    throw new BadRequestException('CompanyId é obrigatório');
  }

  console.log('🗑️ delete: id=', id, 'companyId=', companyId);

  // Verificar se a coluna pertence à empresa
  const column = await this.prisma.kanbanColumn.findFirst({
    where: { 
      id, 
      companyId 
    }
  });

  if (!column) {
    throw new BadRequestException('Coluna não encontrada');
  }

  // 🔥 CORREÇÃO: Primeiro, verificar se já existe uma coluna "Sem etapa"
  const existingDefaultColumn = await this.prisma.kanbanColumn.findFirst({
    where: { 
      title: {
        equals: 'Sem etapa',
        mode: 'insensitive'
      },
      companyId,
      id: { not: id } // Não contar a própria coluna que está sendo deletada
    }
  });

  let targetColumnId: string | null = null;
  
  // Se já existe uma coluna "Sem etapa", usá-la
  if (existingDefaultColumn) {
    targetColumnId = existingDefaultColumn.id;
    console.log('✅ Coluna "Sem etapa" já existe:', existingDefaultColumn.title);
  } else {
    // Se não existe, buscar outras colunas padrão alternativas
    const alternativeDefaultColumn = await this.prisma.kanbanColumn.findFirst({
      where: { 
        OR: [
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
          },
          { 
            title: { 
              contains: 'geral', 
              mode: 'insensitive' 
            }
          }
        ],
        companyId,
        id: { not: id }
      },
      orderBy: { order: 'asc' }
    });

    if (alternativeDefaultColumn) {
      targetColumnId = alternativeDefaultColumn.id;
      console.log('✅ Coluna padrão alternativa encontrada:', alternativeDefaultColumn.title);
    } else {
      console.log('⚠️ Nenhuma coluna padrão disponível, definindo tasks como sem coluna');
    }
  }

  // 🔥 CORREÇÃO IMPORTANTE: Mover as tarefas ANTES de deletar a coluna
  if (targetColumnId) {
    // Atualizar todas as tarefas da coluna sendo deletada para a coluna padrão
    await this.prisma.task.updateMany({
      where: { 
        columnId: id,
        companyId 
      },
      data: { columnId: targetColumnId },
    });
  } else {
    // Atualizar tarefas para ficarem sem coluna (columnId = undefined)
    await this.prisma.task.updateMany({
      where: { 
        columnId: id,
        companyId 
      },
      data: { columnId: undefined },
    });
  }

  // Agora deletar a coluna
  const result = await this.prisma.kanbanColumn.delete({ 
    where: { id } 
  });

  console.log(`✅ Coluna "${column.title}" deletada com sucesso`);
  console.log(`📊 Tarefas realocadas para: ${targetColumnId ? 'coluna padrão' : 'sem coluna'}`);
  
  return result;
}

  async reorder(columns: Array<{ id: string; order: number }>, companyId: string) {
    if (!companyId) {
      throw new BadRequestException('CompanyId é obrigatório');
    }
    if (!columns || columns.length === 0) {
      throw new BadRequestException('Lista de colunas para reordenação é obrigatória');
    }

    console.log('🔄 reorder: columns=', columns.length, 'companyId=', companyId); // DEBUG

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
      throw new BadRequestException('Algumas colunas não pertencem à empresa');
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
    if (!companyId) {
      throw new BadRequestException('CompanyId é obrigatório');
    }

    console.log('🔍 findOne: id=', id, 'companyId=', companyId); // DEBUG

    return this.prisma.kanbanColumn.findFirst({
      where: { 
        id, 
        companyId,
        // REMOVIDO: isActive não existe mais
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
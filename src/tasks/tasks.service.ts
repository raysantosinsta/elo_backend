/* eslint-disable prettier/prettier */
/* eslint-disable no-useless-escape */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async create(
    body: {
      title: string;
      description?: string;
      columnId?: string;
      dueDate?: string | Date;
      assignedToId?: string;
      companyId: string;
      createdById: string;
      priority?: number;
      scheduledAt?: string | Date;
      routeId?: string;
    },
    files?: { 
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    console.log('=== INICIANDO CRIAÇÃO DE TASK ===');
    console.log('Body recebido:', body);

    const { 
      title, 
      description, 
      columnId, 
      dueDate, 
      assignedToId, 
      companyId, 
      createdById, 
      priority,
      scheduledAt,
      routeId
    } = body;
    
    if (!title?.trim()) throw new BadRequestException('Título é obrigatório');
    if (!companyId) throw new BadRequestException('CompanyId é obrigatório');
    if (!createdById) throw new BadRequestException('CreatedById é obrigatório');

    // 🔹 Verificar se a company existe
    const companyExists = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!companyExists) throw new NotFoundException('Empresa não encontrada');

    // 🔹 Verificar se o usuário criador existe
    const creatorExists = await this.prisma.user.findUnique({
      where: { id: createdById },
    });
    if (!creatorExists) throw new NotFoundException('Usuário criador não encontrado');

    // 🔹 Verificar coluna (se enviada)
    if (columnId) {
      const columnExists = await this.prisma.kanbanColumn.findFirst({
        where: { 
          id: columnId,
          companyId
        }
      });
      if (!columnExists) throw new NotFoundException('Coluna não encontrada');
    }

    // 🔹 Verificar usuário atribuído (se enviado)
    if (assignedToId) {
      const userExists = await this.prisma.user.findFirst({
        where: { 
          id: assignedToId,
          companyId
        }
      });
      if (!userExists) throw new NotFoundException('Usuário atribuído não encontrado');
    }

    // 🔹 Verificar rota (se enviada)
    if (routeId) {
      const routeExists = await this.prisma.route.findUnique({
        where: { id: routeId }
      });
      if (!routeExists) throw new NotFoundException('Rota não encontrada');
    }

    // 🔹 Criação da task
    const data: any = {
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      priority: priority || 1,
      company: { connect: { id: companyId } },
      createdBy: { connect: { id: createdById } },
    };

    // Adicionar coluna apenas se for fornecida
    if (columnId) {
      data.column = { connect: { id: columnId } };
    }

    // Adicionar usuário atribuído apenas se for fornecido
    if (assignedToId) {
      data.assignedTo = { connect: { id: assignedToId } };
    }

    // Adicionar rota apenas se for fornecida
    if (routeId) {
      data.route = { connect: { id: routeId } };
    }

    const task = await this.prisma.task.create({
      data,
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true,
        company: {
          select: {
            id: true,
            name: true
          }
        }
      },
    });

    // 🔹 Uploads de arquivos (após criar a task)
    if (files) {
      await this.handleFileUploads(task.id, companyId, files);
    }

    console.log('✅ Task criada com sucesso:', task);
    return this.findOne(task.id);
  }

  private async handleFileUploads(
    taskId: string, 
    companyId: string, 
    files: { 
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    }
  ) {
    const uploadPromises: Promise<any>[] = [];

    // Upload de imagens
    if (files.images) {
      for (const imageFile of files.images) {
        const ext = imageFile.originalname.split('.').pop();
        const path = `tasks/${taskId}/images/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        
        uploadPromises.push(
          this.supabaseService.uploadFile('task-images', path, imageFile.buffer, {
            contentType: imageFile.mimetype,
            metadata: {
              originalName: imageFile.originalname,
              size: imageFile.size
            }
          }).then(async (result) => {
            return this.prisma.taskImage.create({
              data: {
                url: result.fullPath,
                filename: imageFile.originalname,
                size: imageFile.size,
                taskId,
                companyId,
              },
            });
          })
        );
      }
    }

    // Upload de audios
    if (files.audios) {
      for (const audioFile of files.audios) {
        const ext = audioFile.originalname.split('.').pop();
        const path = `tasks/${taskId}/audios/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        
        uploadPromises.push(
          this.supabaseService.uploadFile('task-audios', path, audioFile.buffer, {
            contentType: audioFile.mimetype,
            metadata: {
              originalName: audioFile.originalname,
              size: audioFile.size
            }
          }).then(async (result) => {
            return this.prisma.taskAudio.create({
              data: {
                url: result.fullPath,
                filename: audioFile.originalname,
                size: audioFile.size,
                duration: null, // Pode ser calculado posteriormente
                taskId,
                companyId,
              },
            });
          })
        );
      }
    }

    // Upload de vídeos
    if (files.videos) {
      for (const videoFile of files.videos) {
        const ext = videoFile.originalname.split('.').pop();
        const path = `tasks/${taskId}/videos/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        
        uploadPromises.push(
          this.supabaseService.uploadFile('task-videos', path, videoFile.buffer, {
            contentType: videoFile.mimetype,
            metadata: {
              originalName: videoFile.originalname,
              size: videoFile.size
            }
          }).then(async (result) => {
            return this.prisma.taskVideo.create({
              data: {
                url: result.fullPath,
                filename: videoFile.originalname,
                size: videoFile.size,
                duration: null, // Pode ser calculado posteriormente
                taskId,
                companyId,
              },
            });
          })
        );
      }
    }

    await Promise.all(uploadPromises);
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        completedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true,
        taskImages: true,
        taskAudios: true,
        taskVideos: true,
        taskAddress: true,
        company: {
          select: {
            id: true,
            name: true
          }
        }
      },
    });
    if (!task) throw new NotFoundException('Task não encontrada');
    return task;
  }

  async update(
    id: string,
    body: {
      title?: string;
      description?: string;
      columnId?: string;
      dueDate?: string | Date | null;
      assignedToId?: string | null;
      priority?: number;
      completedById?: string | null;
      scheduledAt?: string | Date;
      routeId?: string | null;
      status?: string;
    },
    companyId: string
  ) {
    console.log('=== ATUALIZANDO TASK ===', id, body);

    // Verificar se a task pertence à company
    const existing = await this.prisma.task.findFirst({
      where: { id, companyId }
    });
    if (!existing) throw new NotFoundException('Task não encontrada');

    const data: any = {};

    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.status !== undefined) data.status = body.status;

    // Gerenciar coluna
    if (body.columnId !== undefined) {
      if (body.columnId === null) {
        data.column = { disconnect: true };
      } else {
        // Verificar se a coluna pertence à mesma empresa
        const columnExists = await this.prisma.kanbanColumn.findFirst({
          where: { id: body.columnId, companyId }
        });
        if (!columnExists) throw new NotFoundException('Coluna não encontrada');
        data.column = { connect: { id: body.columnId } };
      }
    }

    // Gerenciar usuário atribuído
    if (body.assignedToId !== undefined) {
      if (body.assignedToId === null) {
        data.assignedTo = { disconnect: true };
      } else {
        // Verificar se o usuário pertence à mesma empresa
        const userExists = await this.prisma.user.findFirst({
          where: { id: body.assignedToId, companyId }
        });
        if (!userExists) throw new NotFoundException('Usuário não encontrado');
        data.assignedTo = { connect: { id: body.assignedToId } };
      }
    }

    // Gerenciar rota
    if (body.routeId !== undefined) {
      if (body.routeId === null) {
        data.route = { disconnect: true };
      } else {
        const routeExists = await this.prisma.route.findUnique({
          where: { id: body.routeId }
        });
        if (!routeExists) throw new NotFoundException('Rota não encontrada');
        data.route = { connect: { id: body.routeId } };
      }
    }

    // Marcar como concluída
    if (body.completedById !== undefined) {
      if (body.completedById) {
        // Verificar se o usuário pertence à mesma empresa
        const userExists = await this.prisma.user.findFirst({
          where: { id: body.completedById, companyId }
        });
        if (!userExists) throw new NotFoundException('Usuário não encontrado');
        
        data.completedAt = new Date();
        data.completedBy = { connect: { id: body.completedById } };
        data.status = 'COMPLETED';
      } else {
        data.completedAt = null;
        data.completedBy = { disconnect: true };
        data.status = 'PENDING';
      }
    }

    // Marcar como falhada
    if (body.status === 'FAILED') {
      data.failedAt = new Date();
    } else if (body.status !== 'FAILED' && existing.status === 'FAILED') {
      data.failedAt = null;
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        completedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true,
        taskImages: true,
        taskAudios: true,
        taskVideos: true,
        taskAddress: true,
      },
    });

    console.log('✅ Task atualizada:', updated);
    return updated;
  }

  async remove(id: string, companyId: string) {
    console.log('=== EXCLUINDO TASK ===', id);

    // Verificar se a task pertence à company
    const task = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: { taskImages: true, taskAudios: true, taskVideos: true }
    });

    if (!task) throw new NotFoundException('Task não encontrada');

    // 🔹 Deletar arquivos do Supabase
    const deletePromises: Promise<any>[] = [];

    // Deletar imagens
    for (const image of task.taskImages) {
      const path = image.url.replace(/^.*\/\/[^\/]+\//, '');
      deletePromises.push(this.supabaseService.deleteFile('task-images', path));
    }

    // Deletar áudios
    for (const audio of task.taskAudios) {
      const path = audio.url.replace(/^.*\/\/[^\/]+\//, '');
      deletePromises.push(this.supabaseService.deleteFile('task-audios', path));
    }

    // Deletar vídeos
    for (const video of task.taskVideos) {
      const path = video.url.replace(/^.*\/\/[^\/]+\//, '');
      deletePromises.push(this.supabaseService.deleteFile('task-videos', path));
    }

    await Promise.all(deletePromises);

    // 🔹 Deletar a task (cascade vai deletar os registros relacionados)
    await this.prisma.task.delete({ where: { id } });
    
    console.log('✅ Task deletada com sucesso');
  }

  async updateStatus(id: string, columnId: string | null, companyId: string) {
    // Verificar se a task pertence à company
    const task = await this.prisma.task.findFirst({
      where: { id, companyId }
    });
    if (!task) throw new NotFoundException('Task não encontrada');

    // Se columnId for fornecido, verificar se a coluna pertence à mesma company
    if (columnId) {
      const column = await this.prisma.kanbanColumn.findFirst({
        where: { id: columnId, companyId }
      });
      if (!column) throw new NotFoundException('Coluna não encontrada');
    }

    const updateData: any = {};
    
    if (columnId === null) {
      updateData.column = { disconnect: true };
    } else if (columnId) {
      updateData.column = { connect: { id: columnId } };
    }

    return this.prisma.task.update({
      where: { id },
      data: updateData,
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.task.findMany({
      where: { companyId },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllPaginated(params: {
    companyId: string;
    page?: number;
    limit?: number;
    columnId?: string;
    assignedToId?: string;
    routeId?: string;
    status?: string;
    search?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      companyId: params.companyId,
    };

    // Filtro por coluna
    if (params.columnId) {
      where.columnId = params.columnId;
    }

    // Filtro por usuário atribuído
    if (params.assignedToId) {
      where.assignedToId = params.assignedToId;
    }

    // Filtro por rota
    if (params.routeId) {
      where.routeId = params.routeId;
    }

    // Filtro por status
    if (params.status) {
      where.status = params.status;
    }

    // Busca por título ou descrição
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: { 
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          column: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          route: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async findOverdue(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.task.findMany({
      where: {
        companyId,
        dueDate: {
          lt: today,
        },
        status: {
          in: ['PENDING', 'IN_PROGRESS']
        }
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findByColumnId(columnId: string, companyId: string, limit?: number) {
    // Verificar se a coluna pertence à empresa
    const column = await this.prisma.kanbanColumn.findFirst({
      where: { id: columnId, companyId }
    });
    if (!column) throw new NotFoundException('Coluna não encontrada');

    return this.prisma.task.findMany({
      where: { 
        columnId,
        companyId 
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByColumnTitle(columnTitle: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: {
        companyId,
        column: {
          title: {
            contains: columnTitle,
            mode: 'insensitive'
          }
        }
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Método para adicionar endereço à task
  async addAddress(
    taskId: string, 
    companyId: string,
    addressData: {
      rua: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      estado: string;
      cep: string;
    }
  ) {
    // Verificar se a task pertence à company
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId }
    });
    if (!task) throw new NotFoundException('Task não encontrada');

    return this.prisma.taskAddress.upsert({
      where: { taskId },
      update: addressData,
      create: {
        ...addressData,
        taskId,
        companyId,
      },
    });
  }

  // Método para buscar tasks por usuário atribuído
  async findByAssignedUser(userId: string, companyId: string, limit?: number) {
    // Verificar se o usuário pertence à empresa
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId }
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.task.findMany({
      where: {
        assignedToId: userId,
        companyId,
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Método para buscar tasks criadas por um usuário
  async findByCreator(userId: string, companyId: string, limit?: number) {
    // Verificar se o usuário pertence à empresa
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId }
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.task.findMany({
      where: {
        createdById: userId,
        companyId,
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Método para buscar tasks por rota
  async findByRoute(routeId: string, companyId: string, limit?: number) {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId }
    });
    if (!route) throw new NotFoundException('Rota não encontrada');

    return this.prisma.task.findMany({
      where: {
        routeId,
        companyId,
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Método para buscar tasks por status
  async findByStatus(status: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: {
        status: status as any,
        companyId,
      },
      include: { 
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }, 
        column: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        route: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
/* eslint-disable prettier/prettier */
/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { TaskStatus, Prisma } from '@prisma/client';

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
    private readonly websocketGateway: NotificationUserGateway,
  ) { }

  private getTaskInclude() {
    return {
      taskImages: {
        select: { id: true, url: true, filename: true, size: true, createdAt: true },
        orderBy: { createdAt: 'asc' } as const,
      },
      taskAudios: {
        select: { id: true, url: true, filename: true, size: true, duration: true, createdAt: true },
        orderBy: { createdAt: 'asc' } as const,
      },
      taskVideos: {
        select: { id: true, url: true, filename: true, size: true, duration: true, createdAt: true },
        orderBy: { createdAt: 'asc' } as const,
      },
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
      completedBy: { select: { id: true, name: true } },
      column: true,
      route: true,
      taskAddress: true,
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    };
  }

  private async sendTaskAssignedNotification(task: any, assignedUserId: string, creatorName: string) {
    const payload = {
      title: 'Nova tarefa atribuída',
      message: `"${task.title}" foi atribuída a você por ${creatorName}`,
      type: 'TASK_ASSIGNED',
      taskId: task.id,
      createdAt: new Date().toISOString(),
    };

    this.websocketGateway.sendNotificationToUser(assignedUserId, payload);

    const notification = await this.prisma.notification.create({
      data: {
        title: payload.title,
        message: payload.message,
        type: 'TASK_ASSIGNED',
        companyId: task.companyId,
        taskId: task.id,
      },
    });

    await this.prisma.userNotification.create({
      data: { userId: assignedUserId, notificationId: notification.id },
    });
  }

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
      columnOrder?: number;
    },
    files?: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] },
  ) {
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
      routeId,
      columnOrder,
    } = body;

    // Validações básicas
    if (!title?.trim()) throw new BadRequestException('Título é obrigatório');
    if (!companyId) throw new BadRequestException('CompanyId é obrigatório');
    if (!createdById) throw new BadRequestException('CreatedById é obrigatório');

    // Validar empresa
    const companyExists = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!companyExists) throw new NotFoundException('Empresa não encontrada');

    // Validar criador
    const creatorExists = await this.prisma.user.findUnique({ where: { id: createdById } });
    if (!creatorExists) throw new NotFoundException('Usuário criador não encontrado');

    // Validar coluna se fornecida
    if (columnId) {
      const column = await this.prisma.kanbanColumn.findFirst({
        where: { id: columnId, companyId }
      });
      if (!column) throw new NotFoundException('Coluna não encontrada');
    }

    // Validar usuário atribuído se fornecido
    if (assignedToId) {
      const user = await this.prisma.user.findFirst({
        where: { id: assignedToId, companyId }
      });
      if (!user) throw new NotFoundException('Usuário atribuído não encontrado');
    }

    // Validar rota se fornecida
    if (routeId) {
      const route = await this.prisma.route.findUnique({
        where: { id: routeId }
      });
      if (!route) throw new NotFoundException('Rota não encontrada');
    }

    // Preparar dados para criação
    const data: any = {
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      priority: priority || 1,
      columnOrder: columnOrder || 0,
      status: TaskStatus.PENDING,
      companyId: companyId,
      createdById: createdById,
    };

    // Adicionar IDs de relacionamentos
    if (columnId) data.columnId = columnId;
    if (assignedToId) data.assignedToId = assignedToId;
    if (routeId) data.routeId = routeId;

    // Criar a task
    const task = await this.prisma.task.create({
      data,
      include: this.getTaskInclude(),
    });

    // Upload de arquivos se fornecidos
    if (files) {
      await this.handleFileUploads(task.id, companyId, createdById, files);

      // Recarregar a task com os arquivos
      const taskWithFiles = await this.prisma.task.findUnique({
        where: { id: task.id },
        include: this.getTaskInclude(),
      });

      // Notificar usuário atribuído
      if (taskWithFiles?.assignedToId && creatorExists) {
        await this.sendTaskAssignedNotification(taskWithFiles, taskWithFiles.assignedToId, creatorExists.name);
      }

      return taskWithFiles;
    }

    // Notificar usuário atribuído (sem arquivos)
    if (task.assignedToId && creatorExists) {
      await this.sendTaskAssignedNotification(task, task.assignedToId, creatorExists.name);
    }

    return task;
  }

  async update(
    id: string,
    body: any,
    companyId: string,
    updaterId: string,
    files?: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] },
  ) {
    // Verificar se a task existe e pertence à empresa
    const existing = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: {
        assignedTo: true,
        createdBy: true,
        taskImages: true,
        taskAudios: true,
        taskVideos: true
      },
    });

    if (!existing) {
      throw new NotFoundException('Task não encontrada');
    }

    const oldAssignedToId = existing.assignedToId;
    const newAssignedToId = body.assignedToId ?? existing.assignedToId;

    // Preparar dados para atualização
    const data: any = {
      updatedById: updaterId,
      updatedAt: new Date(),
    };

    // Campos básicos
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.columnOrder !== undefined) data.columnOrder = body.columnOrder;
    if (body.finalComment !== undefined) data.finalComment = body.finalComment?.trim() || null;

    // Status
    if (body.status !== undefined) {
      data.status = body.status;

      // Definir timestamps baseados no status
      if (body.status === TaskStatus.COMPLETED && !existing.completedAt) {
        data.completedAt = new Date();
        data.completedById = updaterId;
      } else if (body.status === TaskStatus.FAILED && !existing.failedAt) {
        data.failedAt = new Date();
      } else if (body.status !== TaskStatus.FAILED && existing.failedAt) {
        data.failedAt = null;
      }

      // Limpar completedAt se não estiver completada
      if (body.status !== TaskStatus.COMPLETED && existing.completedAt) {
        data.completedAt = null;
        data.completedById = null;
      }
    }

    // Campos de relacionamento
    if (body.columnId !== undefined) {
      data.columnId = body.columnId;
    }

    if (body.assignedToId !== undefined) {
      data.assignedToId = body.assignedToId;
    }

    if (body.routeId !== undefined) {
      data.routeId = body.routeId;
    }

    // Se completedById foi especificado separadamente
    if (body.completedById !== undefined) {
      data.completedById = body.completedById;
      if (body.completedById) {
        data.completedAt = new Date();
        data.status = TaskStatus.COMPLETED;
      } else {
        data.completedAt = null;
        data.status = TaskStatus.PENDING;
      }
    }

    // Remover arquivos se especificado
    if (body.removeImageIds?.length > 0 ||
      body.removeAudioIds?.length > 0 ||
      body.removeVideoIds?.length > 0) {
      await this.handleFileRemovals(
        id,
        companyId,
        body.removeImageIds || [],
        body.removeAudioIds || [],
        body.removeVideoIds || []
      );
    }

    // Atualizar a task
    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: this.getTaskInclude(),
    });

    // Upload de novos arquivos
    if (files) {
      await this.handleFileUploads(id, companyId, updaterId, files);

      // Recarregar a task com os novos arquivos
      const updatedWithFiles = await this.prisma.task.findUnique({
        where: { id },
        include: this.getTaskInclude(),
      });

      // Notificar se mudou o usuário atribuído
      if (newAssignedToId && newAssignedToId !== oldAssignedToId) {
        const updater = await this.prisma.user.findUnique({ where: { id: updaterId } });
        await this.sendTaskAssignedNotification(
          updatedWithFiles || updated,
          newAssignedToId,
          updater?.name || 'Alguém'
        );
      }

      return updatedWithFiles || updated;
    }

    // Notificar se mudou o usuário atribuído (sem novos arquivos)
    if (newAssignedToId && newAssignedToId !== oldAssignedToId) {
      const updater = await this.prisma.user.findUnique({ where: { id: updaterId } });
      await this.sendTaskAssignedNotification(updated, newAssignedToId, updater?.name || 'Alguém');
    }

    return updated;
  }

  private async handleFileUploads(
    taskId: string,
    companyId: string,
    uploadedById: string,
    files: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] }
  ) {
    const promises: Promise<any>[] = [];

    // Upload de imagens
    if (files.images && files.images.length > 0) {
      for (const f of files.images) {
        const ext = f.originalname.split('.').pop();
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const path = `tasks/${taskId}/images/${filename}`;

        promises.push(
          this.supabaseService.uploadFile('task-images', path, f.buffer, { contentType: f.mimetype })
            .then((r) => {
              return this.prisma.taskImage.create({
                data: {
                  url: r.fullPath,
                  filename: f.originalname,
                  size: f.size,
                  taskId,
                  companyId,
                  uploadedById: uploadedById
                },
              });
            })
            .catch(error => {
              console.error('Erro ao fazer upload de imagem:', error);
              throw new BadRequestException('Erro ao fazer upload de imagem');
            })
        );
      }
    }

    // Upload de áudios
    if (files.audios && files.audios.length > 0) {
      for (const f of files.audios) {
        const ext = f.originalname.split('.').pop();
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const path = `tasks/${taskId}/audios/${filename}`;

        promises.push(
          this.supabaseService.uploadFile('task-audios', path, f.buffer, { contentType: f.mimetype })
            .then((r) => {
              return this.prisma.taskAudio.create({
                data: {
                  url: r.fullPath,
                  filename: f.originalname,
                  size: f.size,
                  taskId,
                  companyId,
                  uploadedById: uploadedById
                },
              });
            })
            .catch(error => {
              console.error('Erro ao fazer upload de áudio:', error);
              throw new BadRequestException('Erro ao fazer upload de áudio');
            })
        );
      }
    }

    // Upload de vídeos
    if (files.videos && files.videos.length > 0) {
      for (const f of files.videos) {
        const ext = f.originalname.split('.').pop();
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const path = `tasks/${taskId}/videos/${filename}`;

        promises.push(
          this.supabaseService.uploadFile('task-videos', path, f.buffer, { contentType: f.mimetype })
            .then((r) => {
              return this.prisma.taskVideo.create({
                data: {
                  url: r.fullPath,
                  filename: f.originalname,
                  size: f.size,
                  taskId,
                  companyId,
                  uploadedById: uploadedById
                },
              });
            })
            .catch(error => {
              console.error('Erro ao fazer upload de vídeo:', error);
              throw new BadRequestException('Erro ao fazer upload de vídeo');
            })
        );
      }
    }

    // Executar todos os uploads em paralelo
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private async handleFileRemovals(
    taskId: string,
    companyId: string,
    imgIds: string[],
    audioIds: string[],
    videoIds: string[]
  ) {
    const promises: Promise<any>[] = [];

    // Remover imagens
    for (const id of imgIds) {
      const img = await this.prisma.taskImage.findUnique({ where: { id } });
      if (img && img.taskId === taskId && img.companyId === companyId) {
        const path = img.url.replace(/^.*\/\/[^\/]+\//, '');
        promises.push(
          Promise.all([
            this.supabaseService.deleteFile('task-images', path).catch(error => {
              console.error('Erro ao deletar imagem do storage:', error);
            }),
            this.prisma.taskImage.delete({ where: { id } })
          ])
        );
      }
    }

    // Remover áudios
    for (const id of audioIds) {
      const audio = await this.prisma.taskAudio.findUnique({ where: { id } });
      if (audio && audio.taskId === taskId && audio.companyId === companyId) {
        const path = audio.url.replace(/^.*\/\/[^\/]+\//, '');
        promises.push(
          Promise.all([
            this.supabaseService.deleteFile('task-audios', path).catch(error => {
              console.error('Erro ao deletar áudio do storage:', error);
            }),
            this.prisma.taskAudio.delete({ where: { id } })
          ])
        );
      }
    }

    // Remover vídeos
    for (const id of videoIds) {
      const video = await this.prisma.taskVideo.findUnique({ where: { id } });
      if (video && video.taskId === taskId && video.companyId === companyId) {
        const path = video.url.replace(/^.*\/\/[^\/]+\//, '');
        promises.push(
          Promise.all([
            this.supabaseService.deleteFile('task-videos', path).catch(error => {
              console.error('Erro ao deletar vídeo do storage:', error);
            }),
            this.prisma.taskVideo.delete({ where: { id } })
          ])
        );
      }
    }

    // Executar todas as remoções em paralelo
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: this.getTaskInclude()
    });
    if (!task) throw new NotFoundException('Task não encontrada');
    return task;
  }

  async remove(id: string, companyId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: { taskImages: true, taskAudios: true, taskVideos: true },
    });
    if (!task) throw new NotFoundException('Task não encontrada');

    const promises: Promise<any>[] = [];

    // Remover arquivos do storage
    for (const i of task.taskImages) {
      const path = i.url.replace(/^.*\/\/[^\/]+\//, '');
      promises.push(this.supabaseService.deleteFile('task-images', path));
    }

    for (const a of task.taskAudios) {
      const path = a.url.replace(/^.*\/\/[^\/]+\//, '');
      promises.push(this.supabaseService.deleteFile('task-audios', path));
    }

    for (const v of task.taskVideos) {
      const path = v.url.replace(/^.*\/\/[^\/]+\//, '');
      promises.push(this.supabaseService.deleteFile('task-videos', path));
    }

    await Promise.all(promises);
    await this.prisma.task.delete({ where: { id } });

    return { message: 'Task deletada com sucesso' };
  }

  async updateStatus(id: string, columnId: string | null, companyId: string) {
    const task = await this.prisma.task.findFirst({ where: { id, companyId } });
    if (!task) throw new NotFoundException('Task não encontrada');

    const data: any = columnId === null
      ? { column: { disconnect: true } }
      : { column: { connect: { id: columnId } } };

    return this.prisma.task.update({
      where: { id },
      data,
      include: this.getTaskInclude(),
    });
  }

  async findAll(companyId: string) {
    return this.prisma.task.findMany({
      where: { companyId },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findAllPaginated(params: {
    companyId: string;
    page?: number;
    limit?: number;
    columnId?: string;
    assignedToId?: string;
    routeId?: string;
    status?: TaskStatus;
    search?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = { companyId: params.companyId };

    if (params.columnId) where.columnId = params.columnId;
    if (params.assignedToId) where.assignedToId = params.assignedToId;
    if (params.routeId) where.routeId = params.routeId;
    if (params.status) where.status = params.status;

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: this.getTaskInclude(),
        orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
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
        dueDate: { lt: today },
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] }
      },
      include: this.getTaskInclude(),
      orderBy: { dueDate: 'asc' },
    });
  }

  async findByColumnId(columnId: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: { columnId, companyId },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async findByColumnTitle(columnTitle: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: {
        companyId,
        column: { title: { contains: columnTitle, mode: 'insensitive' } }
      },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async findByAssignedUser(userId: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: { assignedToId: userId, companyId },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async findByCreator(userId: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: { createdById: userId, companyId },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async findByRoute(routeId: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: { routeId, companyId },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async findByStatus(status: TaskStatus, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: { status, companyId },
      include: this.getTaskInclude(),
      orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });
  }

  async addAddress(taskId: string, companyId: string, addressData: any) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, companyId } });
    if (!task) throw new NotFoundException('Task não encontrada');

    // Mapear nomes dos campos (se necessário)
    const mappedData = {
      cep: addressData.cep,
      endereco: addressData.rua,
      numero: addressData.numero,
      complemento: addressData.complemento,
      bairro: addressData.bairro,
      cidade: addressData.cidade,
      estado: addressData.estado,
    };

    return this.prisma.taskAddress.upsert({
      where: { taskId },
      update: { ...mappedData, companyId },
      create: { ...mappedData, taskId, companyId },
    });
  }
}
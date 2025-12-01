/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
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
    private readonly websocketGateway: NotificationUserGateway,
  ) {}

  private async sendTaskAssignedNotification(task: any, assignedUserId: string, creatorName: string) {
    const notificationPayload = {
      title: 'Nova tarefa atribuída',
      message: `"${task.title}" foi atribuída a você por ${creatorName}`,
      type: 'TASK_ASSIGNED',
      taskId: task.id,
      createdAt: new Date().toISOString(),
    };

    this.websocketGateway.sendNotificationToUser(assignedUserId, notificationPayload);

    const notification = await this.prisma.notification.create({
      data: {
        title: notificationPayload.title,
        message: notificationPayload.message,
        type: 'TASK_ASSIGNED',
        companyId: task.companyId,
        taskId: task.id,
      },
    });

    await this.prisma.userNotification.create({
      data: {
        userId: assignedUserId,
        notificationId: notification.id,
      },
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
    },
    files?: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
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
    } = body;

    if (!title?.trim()) throw new BadRequestException('Título é obrigatório');
    if (!companyId) throw new BadRequestException('CompanyId é obrigatório');
    if (!createdById) throw new BadRequestException('CreatedById é obrigatório');

    const companyExists = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!companyExists) throw new NotFoundException('Empresa não encontrada');

    const creatorExists = await this.prisma.user.findUnique({ where: { id: createdById } });
    if (!creatorExists) throw new NotFoundException('Usuário criador não encontrado');

    if (columnId) {
      const columnExists = await this.prisma.kanbanColumn.findFirst({ where: { id: columnId, companyId } });
      if (!columnExists) throw new NotFoundException('Coluna não encontrada');
    }

    if (assignedToId) {
      const userExists = await this.prisma.user.findFirst({ where: { id: assignedToId, companyId } });
      if (!userExists) throw new NotFoundException('Usuário atribuído não encontrado');
    }

    if (routeId) {
      const routeExists = await this.prisma.route.findUnique({ where: { id: routeId } });
      if (!routeExists) throw new NotFoundException('Rota não encontrada');
    }

    const data: any = {
      title: title.trim(),
      description: description?.trim() || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      priority: priority || 1,
      company: { connect: { id: companyId } },
      createdBy: { connect: { id: createdById } },
    };

    if (columnId) data.column = { connect: { id: columnId } };
    if (assignedToId) data.assignedTo = { connect: { id: assignedToId } };
    if (routeId) data.route = { connect: { id: routeId } };

    const task = await this.prisma.task.create({
      data,
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        company: { select: { id: true } },
      },
    });

    if (files) {
      await this.handleFileUploads(task.id, companyId, files);
    }

    if (task.assignedToId && creatorExists) {
      await this.sendTaskAssignedNotification(task, task.assignedToId, creatorExists.name);
    }

    return this.findOne(task.id);
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
      removeImageIds?: string[];
      removeAudioIds?: string[];
      removeVideoIds?: string[];
    },
    companyId: string,
    updaterId: string, // ← quem está atualizando
    files?: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    const existing = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: { assignedTo: true, createdBy: true },
    });
    if (!existing) throw new NotFoundException('Task não encontrada');

    const oldAssignedToId = existing.assignedToId;
    const newAssignedToId = body.assignedToId ?? existing.assignedToId;

    const data: any = {};

    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.status !== undefined) data.status = body.status;

    if (body.columnId !== undefined) {
      body.columnId === null
        ? (data.column = { disconnect: true })
        : (data.column = { connect: { id: body.columnId } });
    }

    if (body.assignedToId !== undefined) {
      body.assignedToId === null
        ? (data.assignedTo = { disconnect: true })
        : (data.assignedTo = { connect: { id: body.assignedToId } });
    }

    if (body.routeId !== undefined) {
      body.routeId === null
        ? (data.route = { disconnect: true })
        : (data.route = { connect: { id: body.routeId } });
    }

    if (body.completedById !== undefined) {
      if (body.completedById) {
        data.completedAt = new Date();
        data.completedBy = { connect: { id: body.completedById } };
        data.status = 'COMPLETED';
      } else {
        data.completedAt = null;
        data.completedBy = { disconnect: true };
        data.status = 'PENDING';
      }
    }

    if (body.status === 'FAILED') data.failedAt = new Date();
    else if (body.status !== 'FAILED' && existing.status === 'FAILED') data.failedAt = null;

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        company: { select: { id: true } },
      },
    });

    await this.handleFileRemovals(id, companyId, body.removeImageIds || [], body.removeAudioIds || [], body.removeVideoIds || []);
    if (files) await this.handleFileUploads(id, companyId, files);

    // Notificação quando muda o responsável
    if (newAssignedToId && newAssignedToId !== oldAssignedToId) {
      const updater = await this.prisma.user.findUnique({ where: { id: updaterId } });
      const updaterName = updater?.name || 'Alguém';
      await this.sendTaskAssignedNotification(updated, newAssignedToId, updaterName);
    }

    return updated;
  }

  private async handleFileUploads(
    taskId: string,
    companyId: string,
    files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    const uploadPromises: Promise<any>[] = [];

    if (files.images) {
      for (const imageFile of files.images) {
        const ext = imageFile.originalname.split('.').pop();
        const path = `tasks/${taskId}/images/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        uploadPromises.push(
          this.supabaseService.uploadFile('task-images', path, imageFile.buffer, {
            contentType: imageFile.mimetype,
            metadata: { originalName: imageFile.originalname, size: imageFile.size },
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
          }),
        );
      }
    }

    if (files.audios) {
      for (const audioFile of files.audios) {
        const ext = audioFile.originalname.split('.').pop();
        const path = `tasks/${taskId}/audios/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        uploadPromises.push(
          this.supabaseService.uploadFile('task-audios', path, audioFile.buffer, {
            contentType: audioFile.mimetype,
            metadata: { originalName: audioFile.originalname, size: audioFile.size },
          }).then(async (result) => {
            return this.prisma.taskAudio.create({
              data: {
                url: result.fullPath,
                filename: audioFile.originalname,
                size: audioFile.size,
                duration: null,
                taskId,
                companyId,
              },
            });
          }),
        );
      }
    }

    if (files.videos) {
      for (const videoFile of files.videos) {
        const ext = videoFile.originalname.split('.').pop();
        const path = `tasks/${taskId}/videos/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        uploadPromises.push(
          this.supabaseService.uploadFile('task-videos', path, videoFile.buffer, {
            contentType: videoFile.mimetype,
            metadata: { originalName: videoFile.originalname, size: videoFile.size },
          }).then(async (result) => {
            return this.prisma.taskVideo.create({
              data: {
                url: result.fullPath,
                filename: videoFile.originalname,
                size: videoFile.size,
                duration: null,
                taskId,
                companyId,
              },
            });
          }),
        );
      }
    }

    await Promise.all(uploadPromises);
  }

  private async handleFileRemovals(
    taskId: string,
    companyId: string,
    removeImageIds: string[],
    removeAudioIds: string[],
    removeVideoIds: string[],
  ) {
    const deletePromises: Promise<any>[] = [];

    for (const imageId of removeImageIds) {
      const image = await this.prisma.taskImage.findUnique({ where: { id: imageId } });
      if (image && image.taskId === taskId && image.companyId === companyId) {
        const path = image.url.replace(/^.*\/\/[^\/]+\//, '');
        deletePromises.push(
          Promise.all([
            this.supabaseService.deleteFile('task-images', path),
            this.prisma.taskImage.delete({ where: { id: imageId } }),
          ]),
        );
      }
    }

    for (const audioId of removeAudioIds) {
      const audio = await this.prisma.taskAudio.findUnique({ where: { id: audioId } });
      if (audio && audio.taskId === taskId && audio.companyId === companyId) {
        const path = audio.url.replace(/^.*\/\/[^\/]+\//, '');
        deletePromises.push(
          Promise.all([
            this.supabaseService.deleteFile('task-audios', path),
            this.prisma.taskAudio.delete({ where: { id: audioId } }),
          ]),
        );
      }
    }

    for (const videoId of removeVideoIds) {
      const video = await this.prisma.taskVideo.findUnique({ where: { id: videoId } });
      if (video && video.taskId === taskId && video.companyId === companyId) {
        const path = video.url.replace(/^.*\/\/[^\/]+\//, '');
        deletePromises.push(
          Promise.all([
            this.supabaseService.deleteFile('task-videos', path),
            this.prisma.taskVideo.delete({ where: { id: videoId } }),
          ]),
        );
      }
    }

    await Promise.all(deletePromises);
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        completedBy: { select: { id: true, name: true, email: true } },
        route: true,
        taskImages: true,
        taskAudios: true,
        taskVideos: true,
        taskAddress: true,
        company: { select: { id: true, name: true } },
      },
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

    const deletePromises: Promise<any>[] = [];

    for (const image of task.taskImages) {
      const path = image.url.replace(/^.*\/\/[^\/]+\//, '');
      deletePromises.push(this.supabaseService.deleteFile('task-images', path));
    }

    for (const audio of task.taskAudios) {
      const path = audio.url.replace(/^.*\/\/[^\/]+\//, '');
      deletePromises.push(this.supabaseService.deleteFile('task-audios', path));
    }

    for (const video of task.taskVideos) {
      const path = video.url.replace(/^.*\/\/[^\/]+\//, '');
      deletePromises.push(this.supabaseService.deleteFile('task-videos', path));
    }

    await Promise.all(deletePromises);
    await this.prisma.task.delete({ where: { id } });
  }

  async updateStatus(id: string, columnId: string | null, companyId: string) {
    const task = await this.prisma.task.findFirst({ where: { id, companyId } });
    if (!task) throw new NotFoundException('Task não encontrada');

    if (columnId) {
      const column = await this.prisma.kanbanColumn.findFirst({ where: { id: columnId, companyId } });
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
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findAll(companyId: string) {
    try {
      return await this.prisma.task.findMany({
        where: { companyId },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          column: true,
          createdBy: { select: { id: true, name: true, email: true } },
          route: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      return [];
    }
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
    try {
      const page = params.page || 1;
      const limit = params.limit || 10;
      const skip = (page - 1) * limit;

      const where: any = { companyId: params.companyId };

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
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            column: true,
            createdBy: { select: { id: true, name: true, email: true } },
            route: true,
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
    } catch (error) {
      return {
        tasks: [],
        pagination: { page: params.page || 1, limit: params.limit || 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      };
    }
  }

  async findOverdue(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.task.findMany({
      where: {
        companyId,
        dueDate: { lt: today },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findByColumnId(columnId: string, companyId: string, limit?: number) {
    const column = await this.prisma.kanbanColumn.findFirst({ where: { id: columnId, companyId } });
    if (!column) throw new NotFoundException('Coluna não encontrada');

    return this.prisma.task.findMany({
      where: { columnId, companyId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByColumnTitle(columnTitle: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: {
        companyId,
        column: { title: { contains: columnTitle, mode: 'insensitive' } },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

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
    },
  ) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, companyId } });
    if (!task) throw new NotFoundException('Task não encontrada');

    return this.prisma.taskAddress.upsert({
      where: { taskId },
      update: addressData,
      create: { ...addressData, taskId, companyId },
    });
  }

  async findByAssignedUser(userId: string, companyId: string, limit?: number) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.task.findMany({
      where: { assignedToId: userId, companyId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByCreator(userId: string, companyId: string, limit?: number) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    return this.prisma.task.findMany({
      where: { createdById: userId, companyId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByRoute(routeId: string, companyId: string, limit?: number) {
    const route = await this.prisma.route.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundException('Rota não encontrada');

    return this.prisma.task.findMany({
      where: { routeId, companyId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByStatus(status: string, companyId: string, limit?: number) {
    return this.prisma.task.findMany({
      where: { status: status as any, companyId },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        column: true,
        createdBy: { select: { id: true, name: true, email: true } },
        route: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
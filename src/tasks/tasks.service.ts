/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { NotificationType, Prisma, TaskStatus } from '@prisma/client';
import { Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
import { Counter } from 'prom-client';
import type { Cache } from 'cache-manager';



export class CreateTaskAddressDto {
  @IsString() @IsNotEmpty() cep: string;
  @IsString() @IsNotEmpty() endereco: string;
  @IsString() @IsNotEmpty() numero: string;
  @IsString() @IsNotEmpty() bairro: string;
  @IsString() @IsNotEmpty() cidade: string;
  @IsString() @IsNotEmpty() estado: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() companyId?: string;
}

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID() @IsNotEmpty() columnId: string;
  @IsOptional() @IsDateString() dueDate?: string | Date;
  @IsOptional() @IsUUID() assignedToId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (e) { return null; }
    }
    return value;
  })
  @ValidateNested()
  @Type(() => CreateTaskAddressDto)
  address?: CreateTaskAddressDto;

  @IsOptional() @IsString() finalComment?: string;
  @IsOptional() @IsDateString() scheduledAt?: string | Date;
  @IsOptional() @IsInt() @Type(() => Number) priority?: number;
  @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() createdById?: string;
  @IsOptional() status?: any;

  // 🔥 CRÍTICO: Estes campos permitem o upload passar pelo ValidationPipe
  @IsOptional() images?: any;
  @IsOptional() audios?: any;
  @IsOptional() videos?: any;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() columnId?: string;
  @IsOptional() @IsDateString() dueDate?: string | Date;
  @IsOptional() @IsDateString() scheduledAt?: string | Date;
  @IsOptional() @IsInt() @Type(() => Number) priority?: number;
  @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
  @IsOptional() @IsUUID() assignedToId?: string | null;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() finalComment?: string;
  @IsOptional() @IsUUID() completedById?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  removeImageIds?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  removeAudioIds?: string[];

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? JSON.parse(value) : value))
  removeVideoIds?: string[];

  // 🔥 CRÍTICO TAMBÉM NO UPDATE
  @IsOptional() images?: any;
  @IsOptional() audios?: any;
  @IsOptional() videos?: any;
}

// Interface para tipar o arquivo vindo do Interceptor/Multer
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const taskCreationCounter = new Counter({
  name: 'business_task_creation_total',
  help: 'Total number of tasks created',
  labelNames: ['companyId'],
});

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly websocketGateway: NotificationUserGateway,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private getTaskIncludeDetails() {
    return {
      taskImages: {
        select: { id: true, url: true, filename: true, size: true },
        orderBy: { createdAt: 'asc' } as const,
      },
      taskAudios: {
        select: { id: true, url: true, duration: true },
        orderBy: { createdAt: 'asc' } as const,
      },
      taskVideos: {
        select: { id: true, url: true, duration: true },
        orderBy: { createdAt: 'asc' } as const,
      },
      userAssigned: {
        select: { id: true, name: true, email: true, contact: true },
      },
      userCreate: { select: { id: true, name: true } },
      userUpdate: { select: { id: true, name: true } },
      userCompleted: { select: { id: true, name: true } },
      column: true,
      route: true,
      taskAddress: true,
      company: { select: { id: true, name: true } },
    };
  }

  async create(
    dto: CreateTaskDto,
    files?: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    this.logger.debug(`[Create] Iniciando. Título: ${dto.title}`);
    
    if (files) {
      this.logger.debug(`[Create] Arquivos: Imagens: ${files.images?.length || 0}, Áudios: ${files.audios?.length || 0}`);
    }

    const { title, companyId, createdById, assignedToId, columnId, address } = dto;

    const [company, creator] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.user.findUnique({ where: { id: createdById } }),
    ]);

    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!creator) throw new NotFoundException('Criador não encontrado');

    const safeCompanyId = companyId!;
    let task;

    try {
      task = await this.prisma.task.create({
        data: {
          title: title.trim(),
          description: dto.description?.trim(),
          companyId: safeCompanyId,
          userCreateId: createdById!,
          userAssignedId: assignedToId,
          columnId: columnId,
          routeId: dto.routeId,
          priority: dto.priority ?? 1,
          columnOrder: dto.columnOrder ?? 0,
          status: TaskStatus.PENDING,
          finalComment: dto.finalComment,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          scheduledDate: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
          taskAddress: address
            ? {
                create: {
                  cep: address.cep.replace(/\D/g, '').slice(0, 8),
                  endereco: address.endereco.slice(0, 200),
                  numero: address.numero.slice(0, 10),
                  bairro: address.bairro.slice(0, 100),
                  cidade: address.cidade.slice(0, 100),
                  estado: address.estado.slice(0, 2).toUpperCase(),
                  complemento: address.complemento
                    ? address.complemento.slice(0, 100)
                    : null,
                  latitude: address.latitude,
                  longitude: address.longitude,
                  companyId: safeCompanyId,
                },
              }
            : undefined,
        },
        include: this.getTaskIncludeDetails(),
      });
      this.logger.debug(`[Create] Tarefa criada no banco ID: ${task.id}`);
    } catch (e: any) {
      this.logger.error('Erro ao salvar tarefa no banco', e);
      throw new InternalServerErrorException(
        `Erro ao salvar dados no banco: ${e.message}`,
      );
    }

    if (
      files &&
      (files.images?.length || files.audios?.length || files.videos?.length)
    ) {
      try {
        this.logger.debug(`[Create] Iniciando uploads para tarefa ${task.id}`);
        await this.handleFileUploads(task.id, safeCompanyId, createdById!, files);
        
        task = await this.prisma.task.findUniqueOrThrow({
          where: { id: task.id },
          include: this.getTaskIncludeDetails(),
        });

        this.logger.debug(`[Create] Uploads finalizados. Imagens salvas: ${task.taskImages.length}`);
      } catch (uploadError) {
        this.logger.error(`[Create] Falha no upload. ROLLBACK.`, uploadError);
        await this.prisma.task.delete({ where: { id: task.id } });
        throw new InternalServerErrorException(
          'Erro ao processar arquivos. Tarefa cancelada.',
        );
      }
    }

    taskCreationCounter.labels(safeCompanyId).inc();
    await this.cacheManager.del(`tasks_list_${safeCompanyId}`);

    if (assignedToId) this.notifyAssignment(task, assignedToId, creator.name);

    return task;
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    companyId: string,
    updaterId: string,
    files?: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    const existing = await this.prisma.task.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('Task não encontrada.');

    const data: Prisma.TaskUpdateInput = {
      updatedAt: new Date(),
      userUpdate: { connect: { id: updaterId } },
    };

    if (dto.title) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.columnId) data.column = { connect: { id: dto.columnId } };
    if (dto.routeId) data.route = { connect: { id: dto.routeId } };
    if (dto.priority !== undefined) data.priority = Number(dto.priority);
    if (dto.columnOrder !== undefined) data.columnOrder = Number(dto.columnOrder);
    if (dto.finalComment !== undefined) data.finalComment = dto.finalComment;

    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.scheduledAt) data.scheduledDate = new Date(dto.scheduledAt);

    if (dto.assignedToId !== undefined) {
      data.userAssigned = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    if (dto.status) {
      data.status = dto.status;
      if (dto.status === TaskStatus.COMPLETED) {
        data.completionDate = new Date();
        data.userCompleted = { connect: { id: updaterId } };
      } else {
        data.completionDate = null;
        data.userCompleted = { disconnect: true };
      }
    }

    if (dto.completedById)
      data.userCompleted = { connect: { id: dto.completedById } };

    if (
      dto.removeImageIds?.length ||
      dto.removeAudioIds?.length ||
      dto.removeVideoIds?.length
    ) {
      await this.handleFileRemovals(
        id,
        companyId,
        dto.removeImageIds,
        dto.removeAudioIds,
        dto.removeVideoIds,
      );
    }

    if (files) {
      await this.handleFileUploads(id, companyId, updaterId, files);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: this.getTaskIncludeDetails(),
    });

    await this.cacheManager.del(`tasks_list_${companyId}`);
    await this.cacheManager.del(`task_${id}`);

    return updated;
  }

  private async handleFileUploads(
    taskId: string,
    companyId: string,
    uploadedById: string,
    files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    const promises: Promise<any>[] = [];

    const processUpload = async (
      file: UploadedFile,
      bucket: 'task-images' | 'task-audios' | 'task-videos',
    ) => {
      const ext = file.originalname.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const path = `tasks/${taskId}/${bucket.split('-')[1]}/${filename}`;

      this.logger.debug(`[Upload] Enviando ${file.originalname} para ${bucket}`);

      const result = await this.supabaseService.uploadFile(
        bucket,
        path,
        file.buffer,
        {
          contentType: file.mimetype,
          overwrite: true,
        },
      );

      this.logger.debug(`[Upload] Sucesso. URL: ${result.fullPath}`);

      return {
        url: result.fullPath,
        filename: file.originalname,
        size: file.size,
      };
    };

    if (files.images?.length) {
      files.images.forEach((f) => {
        promises.push(
          processUpload(f, 'task-images').then((data) =>
            this.prisma.taskImage.create({
              data: {
                taskId,
                companyId,
                userUploadedId: uploadedById,
                url: data.url,
                filename: data.filename,
                size: data.size,
              },
            }),
          ),
        );
      });
    }

    if (files.audios?.length) {
      files.audios.forEach((f) => {
        promises.push(
          processUpload(f, 'task-audios').then((data) =>
            this.prisma.taskAudio.create({
              data: {
                taskId,
                companyId,
                userUploadedId: uploadedById,
                url: data.url,
                filename: data.filename,
                size: data.size,
                duration: 0,
              },
            }),
          ),
        );
      });
    }

    if (files.videos?.length) {
      files.videos.forEach((f) => {
        promises.push(
          processUpload(f, 'task-videos').then((data) =>
            this.prisma.taskVideo.create({
              data: {
                taskId,
                companyId,
                userUploadedId: uploadedById,
                url: data.url,
                filename: data.filename,
                size: data.size,
                duration: 0,
              },
            }),
          ),
        );
      });
    }

    await Promise.all(promises);
  }

  private async handleFileRemovals(
    taskId: string,
    companyId: string,
    imgIds: string[] = [],
    audioIds: string[] = [],
    videoIds: string[] = [],
  ) {
    const deleteOps: Promise<any>[] = [];

    const deleteFromStorage = (url: string, bucket: string) => {
      const path = url.split(`${bucket}/`).pop();
      if (path)
        deleteOps.push(
          this.supabaseService
            .deleteFile(bucket as any, path)
            .catch((e) => this.logger.error(`Erro deletar ${path}`, e)),
        );
    };

    if (imgIds.length) {
      const images = await this.prisma.taskImage.findMany({
        where: { id: { in: imgIds }, taskId, companyId },
      });
      images.forEach((i) => deleteFromStorage(i.url, 'task-images'));
      deleteOps.push(
        this.prisma.taskImage.deleteMany({ where: { id: { in: imgIds } } }),
      );
    }
    if (audioIds.length) {
      const audios = await this.prisma.taskAudio.findMany({
        where: { id: { in: audioIds }, taskId, companyId },
      });
      audios.forEach((a) => deleteFromStorage(a.url, 'task-audios'));
      deleteOps.push(
        this.prisma.taskAudio.deleteMany({ where: { id: { in: audioIds } } }),
      );
    }
    if (videoIds.length) {
      const videos = await this.prisma.taskVideo.findMany({
        where: { id: { in: videoIds }, taskId, companyId },
      });
      videos.forEach((v) => deleteFromStorage(v.url, 'task-videos'));
      deleteOps.push(
        this.prisma.taskVideo.deleteMany({ where: { id: { in: videoIds } } }),
      );
    }
    await Promise.all(deleteOps);
  }

  async findAllPaginated(params: any) {
    const {
      companyId,
      page = 1,
      limit = 10,
      search,
      columnId,
      startDate,
      endDate,
      assignedToId,
      hasLocation,
    } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      companyId,
      ...(columnId && { columnId }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...((startDate || endDate) && {
        scheduledDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
      ...(assignedToId && { userAssignedId: assignedToId }),
      ...(hasLocation === true && {
        taskAddress: {
          is: {
            latitude: { not: null },
            longitude: { not: null },
          },
        },
      }),
      ...(hasLocation === false && {
        OR: [
          { taskAddress: null },
          { taskAddress: { is: { latitude: null } } },
          { taskAddress: { is: { longitude: null } } },
        ],
      }),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: Number(limit),
        include: this.getTaskIncludeDetails(),
        orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      meta: { total, page, limit, lastPage: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, companyId: string) {
    const t = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: this.getTaskIncludeDetails(),
    });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  async remove(id: string, companyId: string) {
    const t = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: { taskImages: true, taskAudios: true, taskVideos: true },
    });
    if (!t) throw new NotFoundException('Not found');

    await this.handleFileRemovals(
      id,
      companyId,
      t.taskImages.map((i) => i.id),
      t.taskAudios.map((a) => a.id),
      t.taskVideos.map((v) => v.id),
    );

    await this.prisma.task.delete({ where: { id } });
    await this.cacheManager.del(`tasks_list_${companyId}`);
    await this.cacheManager.del(`task_${id}`);
  }

  async addAddress(taskId: string, companyId: string, addressData: any) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) throw new NotFoundException('Task não encontrada');

    const cleanData = {
      ...addressData,
      cep: addressData.cep?.replace(/\D/g, '').slice(0, 8),
      endereco: addressData.endereco?.slice(0, 200),
      numero: addressData.numero?.slice(0, 10),
      bairro: addressData.bairro?.slice(0, 100),
      cidade: addressData.cidade?.slice(0, 100),
      estado: addressData.estado?.slice(0, 2).toUpperCase(),
      complemento: addressData.complemento?.slice(0, 100),
    };

    return this.prisma.taskAddress.upsert({
      where: { taskId },
      update: { ...cleanData, companyId },
      create: { ...cleanData, taskId, companyId },
    });
  }

  private notifyAssignment(
    task: any,
    assignedUserId: string,
    creatorName: string,
  ) {
    const payload = {
      title: 'Nova tarefa',
      message: `"${task.title}" atribuída por ${creatorName}`,
      type: NotificationType.TASK_ASSIGNED,
      taskId: task.id,
    };
    this.websocketGateway.sendNotificationToUser(assignedUserId, payload);
    this.prisma.notification
      .create({
        data: {
          title: payload.title,
          message: payload.message,
          company: { connect: { id: task.companyId } },
          task: { connect: { id: task.id } },
          userNotifications: {
            create: { userId: assignedUserId, isRead: false },
          },
        },
      })
      .catch((e) => this.logger.error('Erro notificação', e));
  }
}

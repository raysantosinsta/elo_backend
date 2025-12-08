/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, TaskStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Counter } from 'prom-client';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// --- DTOs Corrigidos ---
export class CreateTaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() description?: string;

  // CORREÇÃO: columnId é obrigatório no seu Schema Prisma
  @IsUUID() @IsNotEmpty() columnId: string;

  @IsOptional() @IsDateString() dueDate?: string | Date;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsUUID() @IsNotEmpty() companyId: string;
  @IsUUID() @IsNotEmpty() createdById: string;
  @IsOptional() @IsInt() @Type(() => Number) priority?: number;
  @IsOptional() @IsDateString() scheduledAt?: string | Date;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() columnId?: string;
  @IsOptional() @IsDateString() dueDate?: string | Date;
  @IsOptional() @IsDateString() scheduledAt?: string | Date;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsInt() columnOrder?: number;
  @IsOptional() @IsUUID() assignedToId?: string;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() finalComment?: string;
  @IsOptional() @IsUUID() completedById?: string;
  @IsOptional() @IsArray() removeImageIds?: string[];
  @IsOptional() @IsArray() removeAudioIds?: string[];
  @IsOptional() @IsArray() removeVideoIds?: string[];
}

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Métricas
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

  // Select Otimizado
  private getTaskIncludeDetails() {
    return {
      taskImages: {
        select: { id: true, url: true, filename: true },
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
      assignedTo: {
        select: { id: true, name: true, email: true, phone: true },
      },
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
      column: true,
      route: true,
      taskAddress: true,
      company: { select: { id: true, name: true } },
    };
  }

  // --- CREATE ---
  async create(
    dto: CreateTaskDto,
    files?: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    const { title, companyId, createdById, assignedToId, columnId } = dto;

    // 1. Validações
    const [company, creator] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.user.findUnique({ where: { id: createdById } }),
    ]);

    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!creator) throw new NotFoundException('Criador não encontrado');

    // 2. Criação da Task
    let task = await this.prisma.task.create({
      data: {
        title: title.trim(),
        description: dto.description?.trim(),
        companyId,
        createdById,
        assignedToId,
        // CORREÇÃO: columnId é passado diretamente pois é obrigatório e string
        columnId: columnId,
        routeId: dto.routeId,
        priority: dto.priority ? Number(dto.priority) : 1,
        columnOrder: dto.columnOrder || 0,
        status: TaskStatus.PENDING,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
      },
      include: this.getTaskIncludeDetails(),
    });

    // 3. Uploads
    if (
      files &&
      (files.images?.length || files.audios?.length || files.videos?.length)
    ) {
      try {
        await this.handleFileUploads(task.id, companyId, createdById, files);
        // Recarregar dados
        task = await this.prisma.task.findUniqueOrThrow({
          where: { id: task.id },
          include: this.getTaskIncludeDetails(),
        });
      } catch (uploadError) {
        this.logger.error(
          `Falha no upload task ${task.id}. Rollback iniciado.`,
        );
        await this.prisma.task.delete({ where: { id: task.id } });
        throw new InternalServerErrorException(
          'Erro ao processar arquivos. A tarefa não foi criada.',
        );
      }
    }

    taskCreationCounter.labels(companyId).inc();
    await this.cacheManager.del(`tasks_list_${companyId}`);

    if (assignedToId) {
      this.notifyAssignment(task, assignedToId, creator.name);
    }

    return task;
  }

  // --- UPDATE ---
  async update(
    id: string,
    dto: Partial<UpdateTaskDto>,
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
      select: { id: true, status: true, assignedToId: true },
    });

    if (!existing) throw new NotFoundException('Task não encontrada.');

    const data: Prisma.TaskUpdateInput = {
      updatedAt: new Date(),
      updatedBy: { connect: { id: updaterId } },
    };

    if (dto.title) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.columnId) data.column = { connect: { id: dto.columnId } };
    if (dto.routeId) data.route = { connect: { id: dto.routeId } };
    if (dto.assignedToId)
      data.assignedTo = { connect: { id: dto.assignedToId } };
    if (dto.priority !== undefined) data.priority = Number(dto.priority);
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    // if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    // if (dto.columnOrder !== undefined) data.columnOrder = dto.columnOrder;
    // if (dto.finalComment) data.finalComment = dto.finalComment;
    // if (dto.completedById)
    //   data.completedBy = { connect: { id: dto.completedById } };

    // Status Logic
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === TaskStatus.COMPLETED) {
        data.completedAt = new Date();
        data.completedBy = { connect: { id: updaterId } };
      }
    }

    // Remoção de Arquivos
    if (dto.removeImageIds || dto.removeAudioIds || dto.removeVideoIds) {
      await this.handleFileRemovals(
        id,
        companyId,
        dto.removeImageIds,
        dto.removeAudioIds,
        dto.removeVideoIds,
      );
    }

    // Upload de Arquivos
    if (files) {
      await this.handleFileUploads(id, companyId, updaterId, files);
    }

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data,
      include: this.getTaskIncludeDetails(),
    });

    await this.cacheManager.del(`tasks_list_${companyId}`);
    await this.cacheManager.del(`task_${id}`);

    return updatedTask;
  }

  // --- UPLOAD HANDLER CORRIGIDO (Fim do erro de expressão não chamável) ---
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

    // Helper function para evitar repetição
    const uploadToSupabase = async (file: UploadedFile, bucket: string) => {
      const ext = file.originalname.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const path = `tasks/${taskId}/${bucket.split('-')[1]}/${filename}`;

      // CORREÇÃO: Type assertion para BucketType
      return this.supabaseService
        .uploadFile(bucket as any, path, file.buffer, {
          contentType: file.mimetype,
        })
        .then((res) => ({
          url: res.fullPath,
          filename: file.originalname,
          size: file.size,
          // duration: 0 // TODO: Extrair duração se necessário
        }));
    };

    // 1. Imagens
    if (files.images?.length) {
      for (const f of files.images) {
        promises.push(
          uploadToSupabase(f, 'task-images').then((data) =>
            this.prisma.taskImage.create({
              data: { ...data, taskId, companyId, uploadedById },
            }),
          ),
        );
      }
    }

    // 2. Áudios
    if (files.audios?.length) {
      for (const f of files.audios) {
        promises.push(
          uploadToSupabase(f, 'task-audios').then((data) =>
            this.prisma.taskAudio.create({
              data: { ...data, duration: 0, taskId, companyId, uploadedById },
            }),
          ),
        );
      }
    }

    // 3. Vídeos
    if (files.videos?.length) {
      for (const f of files.videos) {
        promises.push(
          uploadToSupabase(f, 'task-videos').then((data) =>
            this.prisma.taskVideo.create({
              data: { ...data, duration: 0, taskId, companyId, uploadedById },
            }),
          ),
        );
      }
    }

    await Promise.all(promises);
  }

  // --- REMOVAL HANDLER CORRIGIDO (Fim do erro deleteMany) ---
  private async handleFileRemovals(
    taskId: string,
    companyId: string,
    imgIds: string[] = [],
    audioIds: string[] = [],
    videoIds: string[] = [],
  ) {
    const deleteOps: Promise<any>[] = [];

    // Função auxiliar para deletar do Supabase
    const deleteFromStorage = (url: string, bucket: string) => {
      const path = url.split(`${bucket}/`).pop();
      if (path) {
        deleteOps.push(
          this.supabaseService
            .deleteFile(bucket as any, path)
            .catch((e) =>
              this.logger.error(`Falha ao deletar arquivo ${path}`, e),
            ),
        );
      }
    };

    // 1. Imagens
    if (imgIds.length) {
      const images = await this.prisma.taskImage.findMany({
        where: { id: { in: imgIds }, taskId, companyId },
      });
      images.forEach((i) => deleteFromStorage(i.url, 'task-images'));
      deleteOps.push(
        this.prisma.taskImage.deleteMany({ where: { id: { in: imgIds } } }),
      );
    }

    // 2. Áudios
    if (audioIds.length) {
      const audios = await this.prisma.taskAudio.findMany({
        where: { id: { in: audioIds }, taskId, companyId },
      });
      audios.forEach((a) => deleteFromStorage(a.url, 'task-audios'));
      deleteOps.push(
        this.prisma.taskAudio.deleteMany({ where: { id: { in: audioIds } } }),
      );
    }

    // 3. Vídeos
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

  // --- READS ---
  async findAllPaginated(params: {
    companyId: string;
    page?: number;
    limit?: number;
    search?: string;
    columnId?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      companyId: params.companyId,
      ...(params.columnId && { columnId: params.columnId }),
      ...(params.search && {
        OR: [
          { title: { contains: params.search, mode: 'insensitive' } },
          { description: { contains: params.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          columnOrder: true,
          columnId: true, // <--- ADICIONE ESTA LINHA
          taskImages: { select: { id: true, url: true } },
          taskVideos: { select: { id: true, url: true } },
          taskAudios: { select: { id: true, url: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          column: { select: { id: true, title: true } },
        },
        skip,
        take: limit,
        orderBy: [{ columnOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      meta: { total, page, lastPage: Math.ceil(total / limit), limit },
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: this.getTaskIncludeDetails(),
    });
    if (!task) throw new NotFoundException('Task não encontrada');
    return task;
  }

  private notifyAssignment(
    task: any,
    assignedUserId: string,
    creatorName: string,
  ) {
    // 1. Preparar Payload (Usando Enum correto)
    const payload = {
      title: 'Nova tarefa atribuída',
      message: `"${task.title}" foi atribuída a você por ${creatorName}`,
      type: NotificationType.TASK_ASSIGNED, // CORREÇÃO: Uso do Enum
      taskId: task.id,
    };

    // 2. Enviar WebSocket (Fire & Forget)
    this.websocketGateway.sendNotificationToUser(assignedUserId, payload);

    // 3. Persistir no Banco (Correção de Tipagem Prisma)
    this.prisma.notification
      .create({
        data: {
          title: payload.title,
          message: payload.message,
          type: payload.type,

          // CORREÇÃO: Usar 'connect' para relacionamentos quando há nested writes (users)
          company: {
            connect: { id: task.companyId },
          },

          // Opcional: Conectar a task explicitamente também é boa prática
          task: {
            connect: { id: task.id },
          },

          // Criação aninhada da notificação do usuário
          users: {
            create: { userId: assignedUserId },
          },
        },
      })
      .catch((e) => this.logger.error('Erro ao salvar notificação', e));
  }

  // CORREÇÃO 3: Implementação do método remove público
  async remove(id: string, companyId: string): Promise<void> {
    // 1. Busca a task para pegar os arquivos
    const task = await this.prisma.task.findFirst({
      where: { id, companyId },
      include: { taskImages: true, taskAudios: true, taskVideos: true },
    });

    if (!task)
      throw new NotFoundException('Task não encontrada ou acesso negado');

    // 2. Remove arquivos do Supabase (reutiliza lógica de remoção)
    const imgIds = task.taskImages.map((i) => i.id);
    const audioIds = task.taskAudios.map((a) => a.id);
    const videoIds = task.taskVideos.map((v) => v.id);

    // O handleFileRemovals já deleta do banco e do storage
    await this.handleFileRemovals(id, companyId, imgIds, audioIds, videoIds);

    // 3. Deleta a Task (Cascade deve cuidar do resto no banco, mas a limpeza do storage é manual)
    await this.prisma.task.delete({
      where: { id },
    });

    // Invalida cache
    await this.cacheManager.del(`tasks_list_${companyId}`);
    await this.cacheManager.del(`task_${id}`);
  }

  // Método auxiliar para endereço
  async addAddress(taskId: string, companyId: string, addressData: any) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) throw new NotFoundException('Task não encontrada');

    return this.prisma.taskAddress.upsert({
      where: { taskId },
      update: { ...addressData, companyId },
      create: { ...addressData, taskId, companyId },
    });
  }
}

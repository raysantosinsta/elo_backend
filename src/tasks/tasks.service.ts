/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { Counter } from 'prom-client';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// =================================================================================================
// 1. DTOs (Data Transfer Objects)
// =================================================================================================

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

  // Transforma a string JSON do FormData em Objeto para validação
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
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

  // IDs injetados pelo Controller (Opcionais na entrada)
  @IsOptional() @IsUUID() companyId: string;
  @IsOptional() @IsUUID() createdById: string;

  // Status (Opcional para evitar erro se o front enviar)
  @IsOptional() status?: any;
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
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  removeImageIds?: string[];
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  removeAudioIds?: string[];
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    typeof value === 'string' ? JSON.parse(value) : value,
  )
  removeVideoIds?: string[];
}

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// =================================================================================================
// SERVICE
// =================================================================================================

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

  // --- CREATE ---
  async create(
    dto: CreateTaskDto,
    files?: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    const { title, companyId, createdById, assignedToId, columnId, address } =
      dto;

    // 1. Validação de Existência
    const [company, creator] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.user.findUnique({ where: { id: createdById } }),
    ]);

    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!creator) throw new NotFoundException('Criador não encontrado');

    let task;
    try {
      // 2. Criação da Task com SANITIZAÇÃO (Previne erro P2000 - Value too long)
      task = await this.prisma.task.create({
        data: {
          title: title.trim(),
          description: dto.description?.trim(),
          companyId,
          userCreateId: createdById,
          userAssignedId: assignedToId,
          columnId: columnId,
          routeId: dto.routeId,
          priority: dto.priority ?? 1,
          columnOrder: dto.columnOrder ?? 0,
          status: TaskStatus.PENDING,
          finalComment: dto.finalComment,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          scheduledDate: dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : new Date(),

          // Nested Write do Endereço com TRATAMENTO DE STRINGS
          taskAddress: address
            ? {
                create: {
                  // Remove caracteres não numéricos e limita tamanho
                  cep: address.cep.replace(/\D/g, '').slice(0, 8),

                  // Corta strings para caber nas colunas do banco
                  endereco: address.endereco.slice(0, 200),
                  numero: address.numero.slice(0, 10),
                  bairro: address.bairro.slice(0, 100),
                  cidade: address.cidade.slice(0, 100),
                  estado: address.estado.slice(0, 2).toUpperCase(), // Garante UF de 2 letras
                  complemento: address.complemento
                    ? address.complemento.slice(0, 100)
                    : null,

                  latitude: address.latitude,
                  longitude: address.longitude,

                  companyId: companyId,
                },
              }
            : undefined,
        },
        include: this.getTaskIncludeDetails(),
      });
    } catch (e) {
      this.logger.error('Erro ao salvar tarefa no banco', e);
      // Lança erro legível
      throw new InternalServerErrorException(
        `Erro ao salvar dados no banco: ${e.message}`,
      );
    }

    // 3. Uploads
    if (
      files &&
      (files.images?.length || files.audios?.length || files.videos?.length)
    ) {
      try {
        await this.handleFileUploads(task.id, companyId, createdById, files);
        // Recarregar task com arquivos
        task = await this.prisma.task.findUniqueOrThrow({
          where: { id: task.id },
          include: this.getTaskIncludeDetails(),
        });
      } catch (uploadError) {
        this.logger.error(`Falha no upload. Rollback iniciado.`, uploadError);
        // Se falhar upload, apaga a task para não deixar lixo
        await this.prisma.task.delete({ where: { id: task.id } });
        throw new InternalServerErrorException(
          'Erro ao processar arquivos. Tarefa cancelada.',
        );
      }
    }

    taskCreationCounter.labels(companyId).inc();
    await this.cacheManager.del(`tasks_list_${companyId}`);

    if (assignedToId) this.notifyAssignment(task, assignedToId, creator.name);

    return task;
  }

  // --- ADD ADDRESS (Endpoint separado) ---
  async addAddress(taskId: string, companyId: string, addressData: any) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) throw new NotFoundException('Task não encontrada');

    // Sanitização também no update isolado
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

  // --- UPDATE ---
  async update(
    id: string,
    dto: Partial<UpdateTaskDto>,
    companyId: string,
    updaterId: string,
    files?: any,
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
    if (dto.columnOrder !== undefined)
      data.columnOrder = Number(dto.columnOrder);
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

    // Remoções
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

    // Uploads
    if (files) await this.handleFileUploads(id, companyId, updaterId, files);

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: this.getTaskIncludeDetails(),
    });

    await this.cacheManager.del(`tasks_list_${companyId}`);
    await this.cacheManager.del(`task_${id}`);

    return updated;
  }

  // --- Métodos Auxiliares ---

  private async handleFileUploads(
    taskId: string,
    companyId: string,
    uploadedById: string,
    files: any,
  ) {
    const promises: Promise<any>[] = [];
    const uploadToSupabase = async (file: UploadedFile, bucket: string) => {
      const ext = file.originalname.split('.').pop();
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const path = `tasks/${taskId}/${bucket.split('-')[1]}/${filename}`;
      return this.supabaseService
        .uploadFile(bucket as any, path, file.buffer, {
          contentType: file.mimetype,
        })
        .then((res) => ({
          url: res.fullPath,
          filename: file.originalname,
          size: file.size,
        }));
    };

    if (files.images?.length)
      files.images.forEach((f) =>
        promises.push(
          uploadToSupabase(f, 'task-images').then((d) =>
            this.prisma.taskImage.create({
              data: { ...d, taskId, companyId, userUploadedId: uploadedById },
            }),
          ),
        ),
      );
    if (files.audios?.length)
      files.audios.forEach((f) =>
        promises.push(
          uploadToSupabase(f, 'task-audios').then((d) =>
            this.prisma.taskAudio.create({
              data: {
                ...d,
                duration: 0,
                taskId,
                companyId,
                userUploadedId: uploadedById,
              },
            }),
          ),
        ),
      );
    if (files.videos?.length)
      files.videos.forEach((f) =>
        promises.push(
          uploadToSupabase(f, 'task-videos').then((d) =>
            this.prisma.taskVideo.create({
              data: {
                ...d,
                duration: 0,
                taskId,
                companyId,
                userUploadedId: uploadedById,
              },
            }),
          ),
        ),
      );

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
      hasLocation, // Agora é boolean | undefined
    } = params;

    const skip = (page - 1) * limit;

    // 1. Construção dinâmica do objeto WHERE
    const where: Prisma.TaskWhereInput = {
      companyId,
      ...(columnId && { columnId }),

      // Busca textual
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),

      // Filtro de Data
      ...((startDate || endDate) && {
        scheduledDate: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),

      // Filtro de Responsável
      ...(assignedToId && { userAssignedId: assignedToId }),

      // --- CORREÇÃO E LÓGICA DE LOCALIZAÇÃO ---
      
      // Caso 1: Quero APENAS tarefas COM localização (hasLocation = true)
      ...(hasLocation === true && {
        taskAddress: {
          is: { // <--- AQUI ESTAVA O ERRO. O 'is' é obrigatório.
            latitude: { not: null },
            longitude: { not: null },
          },
        },
      }),

      // Caso 2: Quero APENAS tarefas SEM localização (hasLocation = false)
      ...(hasLocation === false && {
        OR: [
          { taskAddress: null }, // Não tem endereço cadastrado
          { taskAddress: { is: { latitude: null } } }, // Tem endereço, mas lat é null
          { taskAddress: { is: { longitude: null } } }, // Tem endereço, mas long é null
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
    // Limpa arquivos
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

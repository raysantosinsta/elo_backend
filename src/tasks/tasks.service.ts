/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ForbiddenException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, TaskStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { ClsService } from 'nestjs-cls';
import { Counter } from 'prom-client';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task-dto';

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
    private readonly cls: ClsService,
  ) {}

  // --- VALIDAÇÃO DE TENANT ---
  private validateOwnership(targetCompanyId: string): void {
    const isMaster = this.cls.get<boolean>('isMaster');
    const userTenantId = this.cls.get<string>('tenantId');

    if (isMaster) return;

    if (!targetCompanyId || targetCompanyId !== userTenantId) {
      this.logger.warn(`⛔ Tentativa de Acesso Ilegal: Tenant ${userTenantId} -> ${targetCompanyId}`);
      throw new ForbiddenException('Acesso negado.');
    }
  }

  // --- VALIDAÇÃO DE RELACIONAMENTOS (Corrigida) ---
  private async validateTaskRelations(dto: CreateTaskDto | UpdateTaskDto) {
    const tenantId = this.cls.get<string>('tenantId');
    const isMaster = this.cls.get<boolean>('isMaster');

    if (isMaster || !tenantId) return;

    // 🔥 CORREÇÃO DO ERRO DE TIPO AQUI:
    const validations: Promise<void>[] = []; 

    // 1. Valida Usuário
    if (dto.assignedToId) {
      validations.push(
        this.prisma.user.findFirst({
          where: { id: dto.assignedToId, companyId: tenantId },
          select: { id: true },
        }).then((res) => {
          if (!res) throw new BadRequestException(`O usuário atribuído não pertence a esta empresa.`);
        })
      );
    }

    // 2. Valida Coluna
    if (dto.columnId) {
      validations.push(
        this.prisma.kanbanColumn.findFirst({
          where: { id: dto.columnId, companyId: tenantId },
          select: { id: true },
        }).then((res) => {
          if (!res) throw new BadRequestException(`A coluna Kanban selecionada não pertence a esta empresa.`);
        })
      );
    }

    // 3. Valida Rota
    if (dto.routeId) {
      validations.push(
        this.prisma.route.findFirst({
          where: { id: dto.routeId, companyId: tenantId },
          select: { id: true },
        }).then((res) => {
          if (!res) throw new BadRequestException(`A rota selecionada não pertence a esta empresa.`);
        })
      );
    }

    await Promise.all(validations);
  }

  private getTaskIncludeDetails() {
    return {
      taskImages: { select: { id: true, url: true, filename: true, size: true }, orderBy: { createdAt: 'asc' } as const },
      taskAudios: { select: { id: true, url: true, duration: true }, orderBy: { createdAt: 'asc' } as const },
      taskVideos: { select: { id: true, url: true, duration: true }, orderBy: { createdAt: 'asc' } as const },
      userAssigned: { select: { id: true, name: true, email: true, contact: true } },
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
  async create(dto: CreateTaskDto, files?: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] }) {
    this.logger.debug(`[Create] Iniciando task: ${dto.title}`);

    // Pega do contexto se não vier no DTO
    if (!dto.companyId) dto.companyId = this.cls.get<string>('tenantId');
    const userId = this.cls.get<string>('userId');

    // Validações
    this.validateOwnership(dto.companyId!);
    await this.validateTaskRelations(dto);

    const { title, companyId, columnId, address } = dto;
    let task;

    try {
      task = await this.prisma.task.create({
        data: {
          title: title.trim(),
          description: dto.description?.trim(),
          companyId: companyId!,
          userCreateId: userId, // Pega do CLS
          
          userAssignedId: dto.assignedToId,
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
                  complemento: address.complemento ? address.complemento.slice(0, 100) : null,
                  latitude: address.latitude,
                  longitude: address.longitude,
                  companyId: companyId!,
                },
              }
            : undefined,
        },
        include: this.getTaskIncludeDetails(),
      });
    } catch (e: any) {
      this.logger.error('Erro ao salvar tarefa no banco', e);
      throw new InternalServerErrorException(`Erro ao salvar dados no banco: ${e.message}`);
    }

    if (files && (files.images?.length || files.audios?.length || files.videos?.length)) {
      try {
        await this.handleFileUploads(task.id, companyId!, userId, files);
        task = await this.prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: this.getTaskIncludeDetails() });
      } catch (uploadError) {
        await this.prisma.task.delete({ where: { id: task.id } });
        throw new InternalServerErrorException('Erro no upload. Tarefa cancelada.');
      }
    }

    if (companyId) {
      taskCreationCounter.labels(companyId).inc();
      await this.cacheManager.del(`tasks_list_${companyId}`);
    }

    if (dto.assignedToId) {
      const creatorName = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).then(u => u?.name);
      this.notifyAssignment(task, dto.assignedToId, creatorName || 'Sistema');
    }

    return task;
  }

  // --- UPDATE ---
  async update(id: string, dto: UpdateTaskDto, files?: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] }) {
    const tenantId = this.cls.get<string>('tenantId');
    const userId = this.cls.get<string>('userId');

    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task não encontrada.');
    
    // Se não for master, valida se a task pertence ao tenant atual
    const isMaster = this.cls.get<boolean>('isMaster');
    if (!isMaster && existing.companyId !== tenantId) {
        throw new ForbiddenException('Acesso negado.');
    }

    await this.validateTaskRelations(dto);

    const data: Prisma.TaskUpdateInput = {
      updatedAt: new Date(),
      userUpdate: { connect: { id: userId } },
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
      data.userAssigned = dto.assignedToId ? { connect: { id: dto.assignedToId } } : { disconnect: true };
    }

    if (dto.status) {
      data.status = dto.status;
      if (dto.status === TaskStatus.COMPLETED) {
        data.completionDate = new Date();
        data.userCompleted = { connect: { id: userId } };
      } else {
        data.completionDate = null;
        data.userCompleted = { disconnect: true };
      }
    }

    if (dto.completedById) data.userCompleted = { connect: { id: dto.completedById } };

    if (dto.removeImageIds?.length || dto.removeAudioIds?.length || dto.removeVideoIds?.length) {
      await this.handleFileRemovals(id, existing.companyId, dto.removeImageIds, dto.removeAudioIds, dto.removeVideoIds);
    }

    if (files) {
      await this.handleFileUploads(id, existing.companyId, userId, files);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: this.getTaskIncludeDetails(),
    });

    await this.cacheManager.del(`tasks_list_${existing.companyId}`);
    await this.cacheManager.del(`task_${id}`);

    return updated;
  }

  // --- HELPERS (Upload, Notify) ---
  
  private async handleFileUploads(taskId: string, companyId: string, uploadedById: string, files: any) {
    const promises: Promise<any>[] = [];
    
    const process = async (file: UploadedFile, bucket: 'task-images' | 'task-audios' | 'task-videos') => {
        const ext = file.originalname.split('.').pop();
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const path = `tasks/${taskId}/${bucket.split('-')[1]}/${filename}`;
        const res = await this.supabaseService.uploadFile(bucket, path, file.buffer, { contentType: file.mimetype, overwrite: true });
        return { url: res.fullPath, filename: file.originalname, size: file.size };
    }

    if (files.images) files.images.forEach((f: any) => promises.push(process(f, 'task-images').then(d => this.prisma.taskImage.create({ data: { ...d, taskId, companyId, userUploadedId: uploadedById } }))));
    if (files.audios) files.audios.forEach((f: any) => promises.push(process(f, 'task-audios').then(d => this.prisma.taskAudio.create({ data: { ...d, taskId, companyId, userUploadedId: uploadedById, duration: 0 } }))));
    if (files.videos) files.videos.forEach((f: any) => promises.push(process(f, 'task-videos').then(d => this.prisma.taskVideo.create({ data: { ...d, taskId, companyId, userUploadedId: uploadedById, duration: 0 } }))));

    await Promise.all(promises);
  }

  private async handleFileRemovals(taskId: string, companyId: string, imgIds: string[] = [], audioIds: string[] = [], videoIds: string[] = []) {
     const del = (url: string, bucket: string) => {
         const path = url.split(`${bucket}/`).pop();
         if(path) this.supabaseService.deleteFile(bucket as any, path).catch(e => this.logger.error(e));
     }
     if(imgIds.length) {
         const items = await this.prisma.taskImage.findMany({ where: { id: { in: imgIds }, taskId, companyId } });
         items.forEach(i => del(i.url, 'task-images'));
         await this.prisma.taskImage.deleteMany({ where: { id: { in: imgIds } } });
     }
     if(audioIds.length) {
        const items = await this.prisma.taskAudio.findMany({ where: { id: { in: audioIds }, taskId, companyId } });
        items.forEach(i => del(i.url, 'task-audios'));
        await this.prisma.taskAudio.deleteMany({ where: { id: { in: audioIds } } });
    }
    if(videoIds.length) {
        const items = await this.prisma.taskVideo.findMany({ where: { id: { in: videoIds }, taskId, companyId } });
        items.forEach(i => del(i.url, 'task-videos'));
        await this.prisma.taskVideo.deleteMany({ where: { id: { in: videoIds } } });
    }
  }

  // --- READS ---

  async findAllPaginated(params: any) {
    const tenantId = this.cls.get<string>('tenantId');
    const { page = 1, limit = 10, search, columnId, startDate, endDate, assignedToId, hasLocation } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      companyId: tenantId, 
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
      ...(hasLocation === true && { taskAddress: { is: { latitude: { not: null }, longitude: { not: null } } } }),
      ...(hasLocation === false && { OR: [{ taskAddress: null }, { taskAddress: { is: { latitude: null } } }] }),
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

  async findOne(id: string) {
    const t = await this.prisma.task.findUnique({
      where: { id },
      include: this.getTaskIncludeDetails(),
    });
    // O Prisma Extended já filtra por tenantId, então se retornar null, ou não existe ou não é da empresa.
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  // --- DELETE ---

  async remove(id: string) {
    const tenantId = this.cls.get<string>('tenantId');
    const t = await this.prisma.task.findUnique({
      where: { id },
      include: { taskImages: true, taskAudios: true, taskVideos: true },
    });

    if (!t) return null;

    if (tenantId) {
        await this.handleFileRemovals(
        id,
        tenantId,
        t.taskImages.map((i) => i.id),
        t.taskAudios.map((a) => a.id),
        t.taskVideos.map((v) => v.id),
        );
    }

    try {
      await this.prisma.task.delete({ where: { id } });
    } catch (error: any) {
      if (error.code === 'P2025') return null;
      throw error;
    }

    if (tenantId) {
      await this.cacheManager.del(`tasks_list_${tenantId}`);
      await this.cacheManager.del(`task_${id}`);
    }
  }

  // --- ADDRESS ---

  async addAddress(taskId: string, addressData: any) {
    const tenantId = this.cls.get<string>('tenantId');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
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
      update: { ...cleanData, companyId: tenantId },
      create: { ...cleanData, taskId, companyId: tenantId! },
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
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-return */
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
    NotFoundException
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
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';
import { Counter } from 'prom-client';
import { NotificationUserGateway } from 'src/notification-user/notification-user.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { SupabaseService } from 'src/supabase/supabase.service';

// --- DTOs Corrigidos e Consolidados (MANTIDOS COM NOMES CLEAN) ---
// Eles devem ficar no arquivo tasks.dto.ts na prática, mas mantidos aqui para contexto.

export class CreateTaskDto {
    @IsString() @IsNotEmpty() title: string;
    @IsOptional() @IsString() description?: string;
    @IsUUID() @IsNotEmpty() columnId: string;
    @IsOptional() @IsDateString() dueDate?: string | Date;
    @IsOptional() @IsUUID() assignedToId?: string; // Corresponde a userAssignedId no model

    // CAMPOS DE SEGURANÇA (Preenchidos pelo Controller)
    @IsUUID() @IsNotEmpty() companyId: string;
    @IsUUID() @IsNotEmpty() createdById: string;

    @IsOptional() @IsInt() @Type(() => Number) priority?: number;
    @IsOptional() @IsDateString() scheduledAt?: string | Date; // Corresponde a scheduledDate no model
    @IsOptional() @IsUUID() routeId?: string;
    @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
}

export class UpdateTaskDto {
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsUUID() columnId?: string;
    @IsOptional() @IsDateString() dueDate?: string | Date;
    @IsOptional() @IsDateString() scheduledAt?: string | Date; // Corresponde a scheduledDate no model
    @IsOptional() @IsInt() @Type(() => Number) priority?: number;
    @IsOptional() @IsInt() @Type(() => Number) columnOrder?: number;
    @IsOptional() @IsUUID() assignedToId?: string | null; // Corresponde a userAssignedId no model
    @IsOptional() @IsUUID() routeId?: string;
    @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
    @IsOptional() @IsString() finalComment?: string;
    @IsOptional() @IsUUID() completedById?: string; // Corresponde a userCompletedId no model

    // --- Transformadores para arrays de IDs ---
    @IsOptional() @IsArray() @Transform(({ value }) => typeof value === 'string' ? JSON.parse(value) : value)
    removeImageIds?: string[];
    @IsOptional() @IsArray() @Transform(({ value }) => typeof value === 'string' ? JSON.parse(value) : value)
    removeAudioIds?: string[];
    @IsOptional() @IsArray() @Transform(({ value }) => typeof value === 'string' ? JSON.parse(value) : value)
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
    ) { }

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
            // AJUSTE: Mudar 'assignedTo' para o nome da relação no schema: 'userAssigned'
            userAssigned: { // userAssigned
                select: { id: true, name: true, email: true, contact: true },
            },
            // AJUSTE: Mudar 'createdBy' para o nome da relação no schema: 'userCreate'
            userCreate: { select: { id: true, name: true } },
            // AJUSTE: Mudar 'updatedBy' para o nome da relação no schema: 'userUpdate'
            userUpdate: { select: { id: true, name: true } },
            // AJUSTE: Mudar 'completedBy' para o nome da relação no schema: 'userCompleted'
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
        const { title, companyId, createdById, assignedToId, columnId } = dto;

        // 1. Validações
        const [company, creator] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId } }),
            this.prisma.user.findUnique({ where: { id: createdById } }),
        ]);

        if (!company) throw new NotFoundException('Empresa não encontrada');
        if (!creator) throw new NotFoundException('Criador não encontrado');

        // 2. Criação da Task (AJUSTE nos nomes dos campos do model)
        let task = await this.prisma.task.create({
            data: {
                title: title.trim(),
                description: dto.description?.trim(),
                companyId,
                userCreateId: createdById, // AJUSTE: 'createdById' -> 'userCreateId'
                userAssignedId: assignedToId, // AJUSTE: 'assignedToId' -> 'userAssignedId'
                columnId: columnId,
                routeId: dto.routeId,
                priority: dto.priority ?? 1,
                columnOrder: dto.columnOrder ?? 0,
                status: TaskStatus.PENDING,
                dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                scheduledDate: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(), // AJUSTE: 'scheduledAt' -> 'scheduledDate'
            },
            include: this.getTaskIncludeDetails(),
        });

        // 3. Uploads e Rollback
        if (
            files &&
            (files.images?.length || files.audios?.length || files.videos?.length)
        ) {
            try {
                // A função handleFileUploads usa os IDs da Task, Company e do User, então está ok.
                await this.handleFileUploads(task.id, companyId, createdById, files);
                // Recarregar dados com os anexos
                task = await this.prisma.task.findUniqueOrThrow({
                    where: { id: task.id },
                    include: this.getTaskIncludeDetails(),
                });
            } catch (uploadError) {
                this.logger.error(
                    `Falha no upload da task ${task.id}. Rollback iniciado.`,
                    uploadError,
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
            select: { id: true, status: true, userAssignedId: true }, // AJUSTE: 'assignedToId' -> 'userAssignedId'
        });

        if (!existing) throw new NotFoundException('Task não encontrada.');

        const data: Prisma.TaskUpdateInput = {
            updatedAt: new Date(),
            userUpdate: { connect: { id: updaterId } }, // AJUSTE: 'updatedBy' -> 'userUpdate'
        };

        // Mapeamento de DTO para Prisma.TaskUpdateInput
        if (dto.title) data.title = dto.title.trim();
        if (dto.description !== undefined) data.description = dto.description;
        if (dto.columnId) data.column = { connect: { id: dto.columnId } };
        if (dto.routeId) data.route = { connect: { id: dto.routeId } };

        // AJUSTE: Atribuição ('assignedToId' -> 'userAssigned')
        if (dto.assignedToId !== undefined) {
            data.userAssigned = dto.assignedToId // userAssigned
                ? { connect: { id: dto.assignedToId } }
                : { disconnect: true };
        }

        if (dto.priority !== undefined) data.priority = Number(dto.priority);
        if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
        if (dto.scheduledAt) data.scheduledDate = new Date(dto.scheduledAt); // AJUSTE: 'scheduledAt' -> 'scheduledDate'
        if (dto.columnOrder !== undefined) data.columnOrder = Number(dto.columnOrder);
        if (dto.finalComment !== undefined) data.finalComment = dto.finalComment;

        // Lógica de Status (COMPLETED)
        if (dto.status) {
            data.status = dto.status;
            if (dto.status === TaskStatus.COMPLETED) {
                data.completionDate = new Date(); // AJUSTE: 'completedAt' -> 'completionDate'
                data.userCompleted = { connect: { id: updaterId } }; // AJUSTE: 'completedBy' -> 'userCompleted'
            } else {
                // Se o status for alterado de COMPLETED para outro, limpa a data/quem completou
                data.completionDate = null; // AJUSTE: 'completedAt' -> 'completionDate'
                data.userCompleted = { disconnect: true }; // AJUSTE: 'completedBy' -> 'userCompleted'
            }
        }
        // Se o completedById for passado sozinho, ele será usado (mesmo que a lógica acima já defina)
        if (dto.completedById) {
            data.userCompleted = { connect: { id: dto.completedById } }; // AJUSTE: 'completedBy' -> 'userCompleted'
        }


        // Remoção de Arquivos (Mantido, OK)
        if (dto.removeImageIds?.length || dto.removeAudioIds?.length || dto.removeVideoIds?.length) {
            await this.handleFileRemovals(
                id,
                companyId,
                dto.removeImageIds,
                dto.removeAudioIds,
                dto.removeVideoIds,
            );
        }

        // Upload de Arquivos (Mantido, OK)
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

        // TODO: Notificar reatribuição ou mudança de status

        return updatedTask;
    }

    // --- UPLOAD HANDLER (Mantido, OK) ---
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

        // 1. Imagens
        if (files.images?.length) {
            for (const f of files.images) {
                promises.push(
                    uploadToSupabase(f, 'task-images').then((data) =>
                        this.prisma.taskImage.create({
                            data: { ...data, taskId, companyId, userUploadedId: uploadedById },
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
                            data: { ...data, duration: 0, taskId, companyId, userUploadedId: uploadedById },
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
                            data: { ...data, duration: 0, taskId, companyId, userUploadedId: uploadedById },
                        }),
                    ),
                );
            }
        }

        await Promise.all(promises);
    }

    // --- REMOVAL HANDLER (Mantido, OK) ---
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


    // --- READS (AJUSTE NO SELECT de assignedTo) ---
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
                    columnId: true,
                    taskImages: { select: { id: true, url: true } },
                    taskVideos: { select: { id: true, url: true } },
                    taskAudios: { select: { id: true, url: true } },
                    userAssigned: { select: { id: true, name: true, email: true } }, // AJUSTE: 'assignedTo' -> 'userAssigned'
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

    // --- NOTIFICATION (Mantido, OK) ---
    private notifyAssignment(
        task: any,
        assignedUserId: string,
        creatorName: string,
    ) {
        const payload = {
            title: 'Nova tarefa atribuída',
            message: `"${task.title}" foi atribuída a você por ${creatorName}`,
            type: NotificationType.TASK_ASSIGNED,
            taskId: task.id,
        };

        this.websocketGateway.sendNotificationToUser(assignedUserId, payload);

        this.prisma.notification
            .create({
                data: {
                    title: payload.title,
                    message: payload.message,
                    // notificationType: payload.type,
                    company: {
                        connect: { id: task.companyId },
                    },
                    task: {
                        connect: { id: task.id },
                    },
                    // notificationUsers: { // Changed 'users' to 'notificationUsers'
                    //     create: { userId: assignedUserId },
                    // },
                },
            })
            .catch((e) => this.logger.error('Erro ao salvar notificação', e));
    }

    // --- REMOVE (Mantido, OK) ---
    async remove(id: string, companyId: string): Promise<void> {
        const task = await this.prisma.task.findFirst({
            where: { id, companyId },
            include: { taskImages: true, taskAudios: true, taskVideos: true },
        });

        if (!task)
            throw new NotFoundException('Task não encontrada ou acesso negado');

        const imgIds = task.taskImages.map((i) => i.id);
        const audioIds = task.taskAudios.map((a) => a.id);
        const videoIds = task.taskVideos.map((v) => v.id);

        // Remove arquivos do storage e os registros no DB
        await this.handleFileRemovals(id, companyId, imgIds, audioIds, videoIds);

        // Deleta a Task
        await this.prisma.task.delete({
            where: { id },
        });

        await this.cacheManager.del(`tasks_list_${companyId}`);
        await this.cacheManager.del(`task_${id}`);
    }

    // --- ADD ADDRESS (Mantido, OK) ---
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
// src/notifications/notifications.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';

// --- Tipagem para criação de notificação ---
interface CreateNotificationData {
    title: string;
    message: string;
    type: NotificationType; // Usando o Enum tipado
    companyId: string;
    userIds: string[];
    taskId?: string;
    routeId?: string; 
}

@Injectable()
export class NotificationsService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Busca notificações para um usuário, restritas à sua empresa.
     * O status de leitura (isRead/readAt) vem da tabela pivô UserNotification.
     */
    async getNotificationsForUser(userId: string, companyId: string, limit?: number) {
        const userNotifications = await this.prisma.userNotification.findMany({
            where: {
                userId,
                notification: {
                    companyId,
                },
            },
            include: {
                notification: {
                    include: {
                        task: true,
                        company: true,
                    },
                },
            },
            orderBy: {
                // Ordena pela data de criação da notificação
                notification: {
                    createdAt: 'desc',
                },
            },
            take: limit || 20,
        });

        // Transformar para um formato mais fácil de usar no frontend
        return userNotifications.map(un => ({
            id: un.notificationId,
            userId: un.userId,
            title: un.notification.title,
            message: un.notification.message,
            
            // Agora 'type' é garantido pelo 'select' acima:
            // type: un.notification.type, 
            
            isRead: un.isRead, 
            readAt: un.readAt,
            
            createdAt: un.notification.createdAt,
            task: un.notification.task,
            company: un.notification.company,
        }));
    }

    /**
     * Conta as notificações não lidas para um usuário específico em uma empresa.
     */
    async getUnreadCount(userId: string, companyId: string) {
        const count = await this.prisma.userNotification.count({
            where: {
                userId,
                isRead: false,
                notification: {
                    companyId,
                },
            },
        });

        return count;
    }

    /**
     * Marca uma notificação específica como lida para um usuário.
     */
    async markAsRead(notificationId: string, userId: string) {
        const userNotification = await this.prisma.userNotification.findUnique({
            where: {
                userId_notificationId: {
                    notificationId,
                    userId,
                },
            },
        });

        if (!userNotification) {
            throw new NotFoundException('Notificação não encontrada para este usuário.');
        }
        
        if (userNotification.isRead) {
            return { success: true, message: 'Já estava lida.' };
        }

        await this.prisma.userNotification.update({
            where: {
                userId_notificationId: {
                    notificationId,
                    userId,
                },
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });

        return { success: true };
    }

    /**
     * Marca todas as notificações não lidas de um usuário em uma empresa como lidas.
     */
    async markAllAsRead(userId: string, companyId: string) {
        const updateResult = await this.prisma.userNotification.updateMany({
            where: {
                userId,
                isRead: false,
                notification: {
                    companyId,
                },
            },
            data: {
                isRead: true,
                readAt: new Date(),
            },
        });

        return { success: true, markedCount: updateResult.count };
    }

    /**
     * Cria uma nova notificação e associa ela a múltiplos usuários.
     */
    async createNotification(data: CreateNotificationData) {
        // 1. Criar a notificação principal
        const notification = await this.prisma.notification.create({
            data: {
                title: data.title,
                message: data.message,
                // type: data.type, 
                companyId: data.companyId,
                taskId: data.taskId,
                // routeId: data.routeId, 
            },
        });

        // 2. Criar relações UserNotification (automaticamente isRead=false)
        const userNotificationsData = data.userIds.map(userId => ({
            userId,
            notificationId: notification.id,
        }));

        await this.prisma.userNotification.createMany({
            data: userNotificationsData,
            skipDuplicates: true,
        });

        return {
            ...notification,
            userCount: data.userIds.length,
        };
    }
}
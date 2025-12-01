/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/notifications/notifications.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
            task: {
              select: {
                id: true,
                title: true,
              },
            },
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit || 20,
    });

    // Transformar para um formato mais fácil de usar no frontend
    return userNotifications.map(un => ({
      id: un.notificationId,
      userId: un.userId,
      title: un.notification.title,
      message: un.notification.message,
      type: un.notification.type,
      isRead: un.notification.isRead,
      createdAt: un.notification.createdAt,
      readAt: un.notification.readAt,
      task: un.notification.task,
      company: un.notification.company,
    }));
  }

  async getUnreadCount(userId: string, companyId: string) {
    const count = await this.prisma.userNotification.count({
      where: {
        userId,
        notification: {
          companyId,
          isRead: false,
        },
      },
    });

    return count;
  }

  async markAsRead(notificationId: string, userId: string) {
    const userNotification = await this.prisma.userNotification.findFirst({
      where: {
        notificationId,
        userId,
      },
      include: {
        notification: true,
      },
    });

    if (!userNotification) {
      throw new NotFoundException('Notificação não encontrada');
    }

    // Marcar como lida
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { success: true };
  }

  async markAllAsRead(userId: string, companyId: string) {
    const userNotifications = await this.prisma.userNotification.findMany({
      where: {
        userId,
        notification: {
          companyId,
          isRead: false,
        },
      },
      include: {
        notification: true,
      },
    });

    const notificationIds = userNotifications.map(un => un.notificationId);

    if (notificationIds.length > 0) {
      await this.prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });
    }

    return { success: true, markedCount: notificationIds.length };
  }

  async createNotification(data: {
    title: string;
    message: string;
    type: string;
    companyId: string;
    userIds: string[]; // IDs dos usuários que devem receber a notificação
    taskId?: string;
  }) {
    // Criar a notificação
    const notification = await this.prisma.notification.create({
      data: {
        title: data.title,
        message: data.message,
        type: data.type as any,
        companyId: data.companyId,
        taskId: data.taskId,
      },
    });

    // Criar relações com os usuários
    const userNotificationsData = data.userIds.map(userId => ({
      userId,
      notificationId: notification.id,
    }));

    await this.prisma.userNotification.createMany({
      data: userNotificationsData,
    });

    return {
      ...notification,
      userCount: data.userIds.length,
    };
  }
}
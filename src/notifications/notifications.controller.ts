/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @Request() req,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    return this.notificationsService.getNotificationsForUser(
      userId,
      companyId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@Request() req) {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    const count = await this.notificationsService.getUnreadCount(
      userId,
      companyId,
    );

    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req) {
    const userId = req.user.id;
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post('mark-all-read')
  async markAllAsRead(@Request() req) {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    return this.notificationsService.markAllAsRead(userId, companyId);
  }
}
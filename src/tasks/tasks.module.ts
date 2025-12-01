/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationUserModule } from 'src/notification-user/notification-user.module';

@Module({
  imports: [NotificationUserModule],
  controllers: [TasksController],
  providers: [TasksService, SupabaseService, PrismaService],
})
export class TasksModule {}

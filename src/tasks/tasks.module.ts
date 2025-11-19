import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { SupabaseService } from 'src/supabase/supabase.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, SupabaseService, PrismaService],
})
export class TasksModule {}

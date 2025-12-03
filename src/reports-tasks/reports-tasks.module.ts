/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ReportsTasksService } from './reports-tasks.service';
import { ReportsTasksController } from './reports-tasks.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [ReportsTasksController],
  providers: [ReportsTasksService, PrismaService],
  exports: [ReportsTasksService], // opcional, caso use em outros módulos
})
export class ReportsTasksModule {}

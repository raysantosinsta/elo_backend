import { Module } from '@nestjs/common';
import { KanbanColumnService } from './kanban-columns.service';
import { KanbanColumnController } from './kanban-columns.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [KanbanColumnController],
  providers: [
    KanbanColumnService,
    PrismaService,
    JwtAuthGuard, // Adicione o guard como provider
    JwtService,
  ], // Adicione o JwtService],
  exports: [KanbanColumnService],
})
export class KanbanColumnsModule {}

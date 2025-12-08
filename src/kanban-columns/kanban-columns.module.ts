import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { KanbanColumnService } from './kanban-columns.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { KanbanColumnController } from './kanban-columns.controller';

@Module({
  imports: [
    PrismaModule,
    // Registra cache em memória para este módulo.
    // Em produção real, você usaria Redis aqui: CacheModule.register({ store: redisStore, ... })
    CacheModule.register(), 
  ],
  controllers: [KanbanColumnController],
  providers: [KanbanColumnService],
  exports: [KanbanColumnService],
})
export class KanbanColumnsModule {}
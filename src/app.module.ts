/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { KanbanColumnsModule } from './kanban-columns/kanban-columns.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { ChatMessageModule } from './chat-message/chat-message.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // carrega .env
    PrismaModule,
    SupabaseModule,
    AuthModule,
    KanbanColumnsModule,
    TasksModule,
    UsersModule,
    ChatModule,
    ChatMessageModule,
    WhatsappModule,
    // outros módulos
  ],
})
export class AppModule {}

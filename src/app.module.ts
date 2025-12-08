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
import { NotificationUserModule } from './notification-user/notification-user.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { FlowModule } from './flow/flow.module';
import { ReportsTasksModule } from './reports-tasks/reports-tasks.module';
import { ReportsFlowModule } from './reports-flow/reports-flow.module';
import { CompaniesModule } from './companies/companies.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // carrega .env
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // Configuração padrão
      max: 100, // Máximo de itens no cache
    }),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    KanbanColumnsModule,
    TasksModule,
    UsersModule,
    ChatModule,
    ChatMessageModule,
    WhatsappModule,
    NotificationUserModule,
    NotificationsModule,
    ReportsModule,
    FlowModule,
    ReportsTasksModule,
    ReportsFlowModule,
    CompaniesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Agora protege tudo por padrão!
    },
  ],
})
export class AppModule {}

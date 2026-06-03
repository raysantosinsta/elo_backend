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
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'; // Importe o Guard
import { RoutesModule } from './routes/routes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ClsModule } from 'nestjs-cls';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { ResetPasswordModule } from './reset-password/reset-password.module';
import { MailModule } from './mail/mail.module';
import { ProductsModule } from './products/products.module';
import { MaterialsModule } from './materials/materials.module';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsModule } from './metrics/metrics.module';
import { AuditModule } from './audit/audit.module';
import { CompanyRolesModule } from './company-roles/company-roles.module';
import { LocationGateway } from './location/location.gateway';
import { WhatsAppSimpleService } from './whatsapp-notification/whatsapp-notification.service';
import { WhatsappNotificationModule } from './whatsapp-notification/whatsapp-notification.module';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsappConnectionModule } from './whatsapp-connection/whatsapp-connection.module';
import { AtendeproAuthModule } from './atendepro-auth/atendepro-auth.module';
import { BillingModule } from './billing/billing.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // carrega .env
    ScheduleModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true }, // Monta o middleware para toda requisição
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // Configuração padrão
      max: 1000, // Máximo de itens no cache
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100, 
    }]), // Configuração padrão
    PrometheusModule.register({
      path: '/metrics',
      controller: MetricsController,
      defaultMetrics: {
        enabled: true, // Já traz métricas de CPU/Memória por padrão
      },
    }),
    PrismaModule,
    AuthModule,
    SupabaseModule,
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
    RoutesModule,
    SuppliersModule,
    ResetPasswordModule,
    MailModule,
    ProductsModule,
    MaterialsModule,
    MetricsModule,
    AuditModule,
    CompanyRolesModule,
    WhatsappNotificationModule,
    WhatsappConnectionModule,
    AtendeproAuthModule,
    BillingModule,
  ],
  // ADICIONE O CONTROLLER AQUI
  controllers: [AppController, MetricsController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Agora protege tudo por padrão!
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, 
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
    LocationGateway,
    WhatsAppSimpleService,
  ],
})
export class AppModule { }

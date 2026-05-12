/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';

import { CacheModule } from '@nestjs/cache-manager';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';
import { AuditModule } from 'src/audit/audit.module';
import { WhatsappNotificationModule } from 'src/whatsapp-notification/whatsapp-notification.module';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule, 
    AuditModule,
    WhatsappNotificationModule,
    WhatsappModule,
    CacheModule.register(),
  ],
  controllers: [FlowController],
  providers: [
    FlowService,
    
    // 1. Contador com Labels (Resolve o erro "Invalid number of arguments (2)")
    makeCounterProvider({
      name: 'flow_item_moves_total',
      help: 'Total de vezes que itens foram movidos no fluxo',
      labelNames: ['status', 'source'], // 🔥 Permite: .labels('success', 'auto_advance')
    }),

    // 2. Histograma com Label (Resolve o erro no executeWithResilience)
    makeHistogramProvider({
      name: 'db_operation_duration_seconds',
      help: 'Histograma de duração das operações de banco de dados',
      labelNames: ['operation'], // 🔥 Permite: .labels('advance_item_stage')
    }),
  ],
  exports: [FlowService],
})
export class FlowModule {}
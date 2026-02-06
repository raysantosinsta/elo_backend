// flow.module.ts
import { Module } from '@nestjs/common';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';

import { CacheModule } from '@nestjs/cache-manager';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SupabaseModule } from 'src/supabase/supabase.module';

@Module({
  imports: [
    PrismaModule,
    SupabaseModule, // Certifique-se de importar o módulo do Supabase
    CacheModule.register(),
  ],
  controllers: [FlowController],
  providers: [FlowService],
  exports: [FlowService],
})
export class FlowModule {}

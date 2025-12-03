// flow.module.ts
import { Module } from '@nestjs/common';
import { FlowService } from './flow.service';
import { FlowController } from './flow.controller';

import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

@Module({
  controllers: [FlowController],
  providers: [
    FlowService,
    PrismaService,
    SupabaseService
  ],
  exports: [FlowService]
})
export class FlowModule {}

/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ReportsFlowService } from './reports-flow.service';
import { ReportsFlowController } from './reports-flow.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [ReportsFlowController],
  providers: [ReportsFlowService, PrismaService],
})
export class ReportsFlowModule {}

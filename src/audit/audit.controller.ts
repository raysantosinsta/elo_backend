/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AuthGuard('jwt'))
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  async getAuditLogs(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // 🔥 NÃO PRECISA MAIS PASSAR companyId!
    // O AuditService pega do CLS automaticamente
    const logs = await this.auditService.getLogs(
      {
        entity,
        entityId,
        action,
        userId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 100),
      },
    );

    return logs;
  }

  @Get('entity/:entity/:id')
  async getEntityHistory(
    @Req() req,
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    // 🔥 NÃO PRECISA MAIS PASSAR companyId!
    return this.auditService.getEntityHistory(
      entity.toUpperCase(),
      id,
    );
  }
}
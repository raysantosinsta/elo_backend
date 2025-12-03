/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ReportsFlowService } from './reports-flow.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('reports-flow')
@UseGuards(JwtAuthGuard)
export class ReportsFlowController {
  constructor(private readonly reportsFlowService: ReportsFlowService) { }

  @Get('flows-list')
  async getFlowsList(@Request() req) {
    const user = req.user;
    return this.reportsFlowService.getFlowsList(user.companyId);
  }

  @Get('analytics')
  async getFlowAnalytics(
    @Request() req,
    @Query('companyId') companyIdQuery?: string,
    @Query('flowId') flowId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    // Permite MASTER ver outras empresas, senão usa a do usuário
    const targetCompanyId = (user.role === 'MASTER' && companyIdQuery) ? companyIdQuery : user.companyId;

    return await this.reportsFlowService.getFlowReport(targetCompanyId, {
      flowId,
      search,
      startDate,
      endDate
    });
  }
}

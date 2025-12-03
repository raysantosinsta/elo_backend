/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ReportsTasksService } from './reports-tasks.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('reports-tasks')
@UseGuards(JwtAuthGuard)
export class ReportsTasksController {
  constructor(private readonly reportsTasksService: ReportsTasksService) { }

  @Get('tasks')
  async getTasksReport(
    @Request() req,
    @Query('companyId') companyIdQuery?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Se for MASTER e passar companyId na query, usa ele. Senão usa o do usuário logado.
    const user = req.user;
    const targetCompanyId = (user.role === 'MASTER' && companyIdQuery) ? companyIdQuery : user.companyId;

    return await this.reportsTasksService.getTasksReport(targetCompanyId, {
      status,
      priority,
      startDate,
      endDate
    });
  }

  // Rota placeholder para evitar erro 404 no botão de exportar
  @Get('tasks/export')
  async exportTasks(@Request() req) {
    return { message: "Funcionalidade de exportação em desenvolvimento" };
  }
}

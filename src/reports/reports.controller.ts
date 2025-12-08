import { 
  Controller, 
  Get, 
  Query, 
  UseGuards, 
  Request, 
  ParseUUIDPipe, 
  Param, 
  ForbiddenException, 
  Post,
  Body
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  /**
   * Rota: GET /reports/professionals
   * Exemplo: /reports/professionals/?status=ACTIVE&companyId=...
   */
  @Get('professionals')
  async getProfessionalReport(
    @Request() req,
    @Query('companyId') companyId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string, // Recebe "ACTIVE" ou "INACTIVE"
  ) {
    // Verificar permissões (Apenas Admin/Master)
    if (!['MASTER', 'ADMIN'].includes(req.user.role)) {
      throw new ForbiddenException('Apenas administradores podem acessar relatórios');
    }

    return this.reportsService.getProfessionalReport({
      companyId: companyId || req.user.companyId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status, 
      requesterRole: req.user.role,
    });
  }

  @Get('professionals/:userId/details')
  async getProfessionalDetails(
    @Request() req,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!['MASTER', 'ADMIN'].includes(req.user.role)) {
      throw new ForbiddenException('Apenas administradores podem acessar detalhes');
    }

    return this.reportsService.getProfessionalDetails({
      userId,
      companyId: req.user.companyId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

 
}
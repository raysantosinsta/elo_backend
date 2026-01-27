/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Get, Logger, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { FinalizeTaskDto, OptimizeRouteDto } from './dto/optimize-route.dto';
import { RouteService } from './routes.service';

// Descomente a linha abaixo se você tiver um Guard de Autenticação (ex: JwtAuthGuard)
// @UseGuards(JwtAuthGuard)
@Controller('routes')
export class RouteController {
  private readonly logger = new Logger(RouteController.name); // Instancia o Logger
  constructor(private readonly routeService: RouteService) {}

  /**
   * 1. GET /routes/available-tasks
   * Busca todas as tarefas pendentes da empresa que possuem endereço (Lat/Lng) válido.
   */
  @Get('available-tasks')
  async getAvailableTasks(
    @Req() req: any,
    // Adicionar recebimento dos filtros da URL
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET available-tasks] Company: ${companyId}, Filters: startDate=${startDate}, endDate=${endDate}, assignedTo=${assignedToId}`); // Log

    // Repassa os filtros para o Service
    return this.routeService.getTasksWithLocation(companyId, {
      startDate,
      endDate,
      assignedToId,
    });
  }

  /**
   * 2. POST /routes/calculate-best-path
   * Recebe a lista de IDs de tarefas e a localização do motorista.
   * Retorna a lista de tarefas reordenada pela rota mais econômica.
   */
  @Post('calculate-best-path')
  async calculateBestPath(@Body() dto: OptimizeRouteDto) {
    this.logger.log(`[POST calculate-best-path] Tasks Count: ${dto.taskIds.length}, Driver Loc: [${dto.driverLatitude}, ${dto.driverLongitude}]`); // Log
    return this.routeService.optimizeRoute(dto);
  }

  /**
   * 3. PATCH /routes/tasks/:id/finalize
   * Finaliza a visita (Sucesso/Falha), salva o comentário e reagenda se necessário.
   */
  @Patch('tasks/:id/finalize')
  async finalizeTask(
    @Param('id') taskId: string,
    @Body() dto: FinalizeTaskDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id; // ID do usuário que está finalizando (motorista)
    this.logger.log(`[PATCH finalize] Task: ${taskId}, User: ${userId}, Status: ${dto.status}`); // Log

    return this.routeService.concludeVisit(taskId, userId, dto);
  }
}

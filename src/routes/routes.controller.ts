/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { FinalizeTaskDto } from './dto/optimize-route.dto';
import { RouteService } from './routes.service';
import {
  ConvertRouteToTasksDto,
  CreateRouteDto,
  OptimizeRouteDto,
  UpdateRouteDto,
  RouteStats,
} from './dto/create-route.dto';
import { CompleteRouteDto } from './dto/optimize-route.dto'; // 🔥 NOVO IMPORT
import { RouteStatus } from '@prisma/client';

// Descomente a linha abaixo se você tiver um Guard de Autenticação (ex: JwtAuthGuard)
// @UseGuards(JwtAuthGuard)
@Controller('routes')
export class RouteController {
  private readonly logger = new Logger(RouteController.name);
  constructor(private readonly routeService: RouteService) {}

  // =============================================
  // ENDPOINTS EXISTENTES (PARA TAREFAS)
  // =============================================

  /**
   * 1. GET /routes/available-tasks
   * Busca todas as tarefas pendentes da empresa que possuem endereço (Lat/Lng) válido.
   */
  @Get('available-tasks')
  async getAvailableTasks(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    const companyId = req.user?.companyId;
    this.logger.log(
      `[GET available-tasks] Company: ${companyId}, Filters: startDate=${startDate}, endDate=${endDate}, assignedTo=${assignedToId}`,
    );

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
  async calculateBestPath(@Body() dto: OptimizeRouteDto): Promise<{
    route: any[];
    stats: RouteStats;
  }> {
    this.logger.log(
      `[POST calculate-best-path] Tasks Count: ${dto.taskIds.length}, Driver Loc: [${dto.driverLatitude}, ${dto.driverLongitude}]`,
    );
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
    const userId = req.user?.id;
    this.logger.log(
      `[PATCH finalize] Task: ${taskId}, User: ${userId}, Status: ${dto.status}`,
    );

    return this.routeService.concludeVisit(taskId, userId, dto);
  }

  // =============================================
  // NOVOS ENDPOINTS PARA ROTAS SEM TAREFAS
  // =============================================

  /**
   * 4. POST /routes
   * Cria uma nova rota sem criar tarefas
   */
  @Post()
  async createRoute(@Body() dto: CreateRouteDto, @Req() req: any) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    this.logger.log(`[POST /routes] Criando rota: ${dto.title}`);
    this.logger.log(`   Paradas: ${dto.stops.length}`);

    return this.routeService.createRoute(dto, companyId, userId);
  }

  /**
   * 5. GET /routes
   * Lista todas as rotas salvas da empresa com suporte a múltiplos filtros
   */
  @Get()
  async findAllRoutes(
    @Req() req: any,
    // Filtros de Data
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('createdStartDate') createdStartDate?: string,
    @Query('createdEndDate') createdEndDate?: string,

    // Filtros de Status e Ordenação
    @Query('status') status?: RouteStatus,
    @Query('orderBy') orderBy?: string,
    @Query('userAssignedId') userAssignedId?: string,
    @Query('search') search?: string,

    // Filtros de Métricas
    @Query('minStops') minStops?: string,
    @Query('maxStops') maxStops?: string,
    @Query('minDistance') minDistance?: string,
    @Query('maxDistance') maxDistance?: string,
    @Query('minDuration') minDuration?: string,
    @Query('maxDuration') maxDuration?: string,

    // Filtros Especiais
    @Query('isOverdue') isOverdue?: string,
    @Query('isUpcoming') isUpcoming?: string,
  ) {
    const companyId = req.user?.companyId;

    this.logger.log(`[GET /routes] Buscando rotas da empresa`);

    return this.routeService.findAllRoutes(companyId, {
      startDate,
      endDate,
      createdStartDate,
      createdEndDate,
      status,
      orderBy: orderBy === 'all' ? undefined : orderBy,
      userAssignedId: userAssignedId === 'none' ? 'none' : userAssignedId,
      search,
      minStops: minStops ? parseInt(minStops) : undefined,
      maxStops: maxStops ? parseInt(maxStops) : undefined,
      minDistance: minDistance ? parseFloat(minDistance) : undefined,
      maxDistance: maxDistance ? parseFloat(maxDistance) : undefined,
      minDuration: minDuration ? parseInt(minDuration) : undefined,
      maxDuration: maxDuration ? parseInt(maxDuration) : undefined,
      isOverdue: isOverdue === 'true',
      isUpcoming: isUpcoming === 'true',
    });
  }

  /**
   * 6. GET /routes/:id
   * Busca uma rota específica com todos os detalhes
   */
  @Get(':id')
  async findRouteById(@Param('id') id: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/${id}] Buscando rota`);
    return this.routeService.findRouteById(id, companyId);
  }

  /**
   * 7. PATCH /routes/:id
   * Atualiza uma rota existente
   */
  @Patch(':id')
  async updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[PATCH /routes/${id}] Atualizando rota`);
    return this.routeService.updateRoute(id, dto, companyId, userId);
  }

  /**
   * 8. DELETE /routes/:id
   * Remove uma rota (delete físico)
   */
  @Delete(':id')
  async deleteRoute(@Param('id') id: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[DELETE /routes/${id}] Removendo rota`);
    return this.routeService.deleteRoute(id, companyId);
  }

  /**
   * 9. PATCH /routes/:routeId/stops/:stopId/visit
   * Marca uma parada como visitada
   */
  @Patch(':routeId/stops/:stopId/visit')
  async markStopAsVisited(
    @Param('routeId') routeId: string,
    @Param('stopId') stopId: string,
    @Body() body: { notes?: string },
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    this.logger.log(`[PATCH] Marcando parada ${stopId} como visitada`);
    return this.routeService.markStopAsVisited(
      routeId,
      stopId,
      companyId,
      body.notes,
    );
  }

  /**
   * 10. POST /routes/:id/convert-to-tasks
   * Converte uma rota salva em tarefas reais no kanban
   */
  @Post(':id/convert-to-tasks')
  async convertRouteToTasks(
    @Param('id') routeId: string,
    @Body() dto: ConvertRouteToTasksDto,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[POST] Convertendo rota ${routeId} em tarefas`);
    return this.routeService.convertRouteToTasks(
      routeId,
      companyId,
      userId,
      dto,
    );
  }

  /**
   * 11. GET /routes/stats/summary
   * Retorna estatísticas resumidas de todas as rotas
   */
  @Get('stats/summary')
  async getRoutesSummary(@Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/stats/summary] Gerando resumo de rotas`);

    const routes = await this.routeService.findAllRoutes(companyId);

    const summary = {
      total: routes.length,
      byStatus: {
        scheduled: routes.filter((r) => r.status === 'SCHEDULED').length,
        inProgress: routes.filter((r) => r.status === 'IN_PROGRESS').length,
        finished: routes.filter((r) => r.status === 'FINISHED').length,
        canceled: routes.filter((r) => r.status === 'CANCELED').length,
      },
      totalStops: routes.reduce(
        (acc, route) => acc + (route._count?.stops || 0),
        0,
      ),
      totalDistance: routes.reduce(
        (acc, route) => acc + (route.totalDistanceMeters || 0),
        0,
      ),
      averageDistancePerRoute:
        routes.length > 0
          ? routes.reduce(
              (acc, route) => acc + (route.totalDistanceMeters || 0),
              0,
            ) /
            routes.length /
            1000
          : 0,
      lastRoutes: routes.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        stopsCount: r._count?.stops || 0,
        createdAt: r.createdAt,
      })),
    };

    return summary;
  }

  /**
   * 12. POST /routes/:id/duplicate
   * Duplica uma rota existente e cria NOVAS tarefas (tasks) clonadas
   */
  @Post(':id/duplicate')
  async duplicateRoute(
    @Param('id') routeId: string,
    @Body() body: { title?: string; routeDate?: string; description?: string },
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[POST] Duplicando rota ${routeId}`);
    return this.routeService.duplicateRouteWithTasks(
      routeId,
      companyId,
      userId,
      body,
    );
  }

  // =============================================
  // 🔥 NOVOS ENDPOINTS PARA ROTA REALIZADA
  // =============================================

  /**
   * 13. POST /routes/:id/start
   * Motorista inicia a execução da rota
   *
   * @example
   * POST /routes/abc-123-def/start
   */
  @Post(':id/start')
  async startRoute(@Param('id') routeId: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    this.logger.log(`[POST /routes/${routeId}/start] Iniciando rota`);

    return this.routeService.startRoute(routeId, companyId, userId);
  }

  /**
   * 14. POST /routes/:id/complete
   * Motorista finaliza a rota e informa os dados reais
   *
   * @example
   * POST /routes/abc-123-def/complete
   * {
   *   "distanciaReal": 52.3,
   *   "combustivelReal": 12.5,
   *   "observacoes": "Trânsito intenso na volta"
   * }
   */
  @Post(':id/complete')
  async completeRoute(
    @Param('id') routeId: string,
    @Body() dto: CompleteRouteDto,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    this.logger.log(`[POST /routes/${routeId}/complete] Finalizando rota`);
    this.logger.log(`   Distância real: ${dto.distanciaReal ?? 'N/A'} km`);
    this.logger.log(`   Combustível real: ${dto.combustivelReal ?? 'N/A'} L`);

    return this.routeService.completeRoute(routeId, companyId, userId, dto);
  }

  /**
   * 15. GET /routes/performance
   * Lista rotas com dados de performance (previsto x realizado)
   *
   * @example
   * GET /routes/performance?onlyFinished=true
   * GET /routes/performance?startDate=2026-01-01&endDate=2026-01-31
   */
  @Get('performance/reports')
  async getRoutesPerformance(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('onlyFinished') onlyFinished?: string,
  ) {
    const companyId = req.user?.companyId;

    this.logger.log(`[GET /routes/performance] Buscando performance das rotas`);

    return this.routeService.findAllRoutesWithPerformance(companyId, {
      startDate,
      endDate,
      onlyFinished: onlyFinished === 'true',
    });
  }

  /**
   * 16. PATCH /routes/:id/fuel-estimate
   * Atualiza apenas o combustível previsto de uma rota
   *
   * @example
   * PATCH /routes/abc-123-def/fuel-estimate
   * {
   *   "combustivelPrevisto": 10.5
   * }
   */
  @Patch(':id/fuel-estimate')
  async updateFuelEstimate(
    @Param('id') routeId: string,
    @Body() body: { combustivelPrevisto: number },
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;

    this.logger.log(
      `[PATCH /routes/${routeId}/fuel-estimate] Atualizando combustível previsto para ${body.combustivelPrevisto} L`,
    );

    return this.routeService.updateFuelEstimate(
      routeId,
      companyId,
      body.combustivelPrevisto,
    );
  }

  /**
   * 17. GET /routes/:id/comparison
   * Retorna a comparação detalhada entre previsto e realizado
   *
   * @example
   * GET /routes/abc-123-def/comparison
   */
  @Get(':id/comparison')
  async getRouteComparison(@Param('id') routeId: string, @Req() req: any) {
    const companyId = req.user?.companyId;

    this.logger.log(`[GET /routes/${routeId}/comparison] Buscando comparação`);

    const route = await this.routeService.findRouteById(routeId, companyId);

    const comparacao = {
      distancia: {
        prevista: route.totalDistanceMeters
          ? `${(route.totalDistanceMeters / 1000).toFixed(1)} km`
          : 'Não calculada',
        realizada: route.actualDistance
          ? `${route.actualDistance.toFixed(1)} km`
          : 'Não realizada',
        diferenca: route.totalDistanceMeters && route.actualDistance
          ? `${(route.actualDistance - route.totalDistanceMeters / 1000).toFixed(1)} km`
          : null,
      },
      tempo: {
        previsto: route.totalDurationSeconds
          ? this.formatDuration(route.totalDurationSeconds)
          : 'Não calculado',
        realizado: route.actualTime
          ? this.formatDuration(route.actualTime)
          : 'Não realizado',
        diferenca: route.totalDurationSeconds && route.actualTime
          ? `${((route.actualTime - route.totalDurationSeconds) / 60).toFixed(0)} min`
          : null,
      },
      combustivel: {
        previsto: route.estimatedFuel ? `${route.estimatedFuel.toFixed(1)} L` : 'Não previsto',
        realizado: route.actualFuel ? `${route.actualFuel.toFixed(1)} L` : 'Não realizado',
        diferenca: route.estimatedFuel && route.actualFuel
          ? `${(route.actualFuel - route.estimatedFuel).toFixed(1)} L`
          : null,
      },
      eficiencia: route.actualDistance && route.actualFuel
        ? `${(route.actualDistance / route.actualFuel).toFixed(1)} km/L`
        : null,
    };

    return comparacao;
  }

  // =============================================
  // MÉTODO AUXILIAR
  // =============================================

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  }
}
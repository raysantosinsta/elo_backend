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
import { FinalizeTaskDto, CompleteRouteDto } from './dto/optimize-route.dto';
import { RouteService } from './routes.service';
import {
  ConvertRouteToTasksDto,
  CreateRouteDto,
  OptimizeRouteDto,
  RouteStats,
  UpdateRouteDto,
} from './dto/create-route.dto';
import { RouteStatus } from '@prisma/client';

@Controller('routes')
export class RouteController {
  private readonly logger = new Logger(RouteController.name);
  constructor(private readonly routeService: RouteService) { }

  // =============================================
  // ENDPOINTS EXISTENTES (PARA TAREFAS)
  // =============================================

  @Get('available-tasks')
  async getAvailableTasks(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET available-tasks] Company: ${companyId}`);
    return this.routeService.getTasksWithLocation(companyId, {
      startDate,
      endDate,
      assignedToId,
    });
  }

  @Post('calculate-best-path')
  async calculateBestPath(@Body() dto: OptimizeRouteDto): Promise<{
    route: any[];
    stats: RouteStats;
  }> {
    this.logger.log(`[POST calculate-best-path] Tasks Count: ${dto.taskIds.length}`);
    return this.routeService.optimizeRoute(dto);
  }

  @Patch('tasks/:id/finalize')
  async finalizeTask(
    @Param('id') taskId: string,
    @Body() dto: FinalizeTaskDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    this.logger.log(`[PATCH finalize] Task: ${taskId}, Status: ${dto.status}`);
    return this.routeService.concludeVisit(taskId, userId, dto);
  }

  // =============================================
  // ENDPOINTS PARA ROTAS
  // =============================================

  @Post()
  async createRoute(@Body() dto: CreateRouteDto, @Req() req: any) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[POST /routes] Criando rota: ${dto.title}`);
    return this.routeService.createRoute(dto, companyId, userId);
  }

  @Get()
  async findAllRoutes(@Req() req: any, @Query() query: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes] Buscando rotas`);
    return this.routeService.findAllRoutes(companyId, query);
  }

  @Get(':id')
  async findRouteById(@Param('id') id: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/${id}] Buscando rota`);
    return this.routeService.findRouteById(id, companyId);
  }

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

  @Delete(':id')
  async deleteRoute(@Param('id') id: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[DELETE /routes/${id}] Removendo rota`);
    return this.routeService.deleteRoute(id, companyId);
  }

  @Patch(':routeId/stops/:stopId/visit')
  async markStopAsVisited(
    @Param('routeId') routeId: string,
    @Param('stopId') stopId: string,
    @Body() body: { notes?: string },
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    this.logger.log(`[PATCH] Marcando parada ${stopId} como visitada`);
    return this.routeService.markStopAsVisited(routeId, stopId, companyId, body.notes);
  }

  @Post(':id/convert-to-tasks')
  async convertRouteToTasks(
    @Param('id') routeId: string,
    @Body() dto: ConvertRouteToTasksDto,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[POST] Convertendo rota ${routeId} em tarefas`);
    return this.routeService.convertRouteToTasks(routeId, companyId, userId, dto);
  }

  @Get('stats/summary')
  async getRoutesSummary(@Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/stats/summary] Gerando resumo`);
    return this.routeService.getRoutesSummary(companyId);
  }

  @Post(':id/duplicate')
  async duplicateRoute(
    @Param('id') routeId: string,
    @Body() body: { title?: string; routeDate?: string; description?: string },
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[POST] Duplicando rota ${routeId}`);
    return this.routeService.duplicateRouteWithTasks(routeId, companyId, userId, body);
  }

  @Get(':id/tasks')
  async getTasksByRoute(@Param('id') routeId: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/${routeId}/tasks] Buscando tarefas`);
    return this.routeService.getTasksByRoute(routeId, companyId);
  }

  // =============================================
  // 🔥 NOVOS ENDPOINTS PARA ROTA REALIZADA
  // =============================================

  @Post(':id/start')
  async startRoute(@Param('id') routeId: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    this.logger.log(`[POST /routes/${routeId}/start] Iniciando rota`);
    return this.routeService.startRoute(routeId, companyId, userId);
  }

  @Post(':id/complete')
  async completeRoute(
    @Param('id') routeId: string,
    @Body() dto: CompleteRouteDto,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    this.logger.log(`[POST /routes/${routeId}/complete] Finalizando rota`);
    this.logger.log(`   actualDistance: ${dto.actualDistance ?? 'N/A'} km`);
    this.logger.log(`   actualFuel: ${dto.actualFuel ?? 'N/A'} L`);
    this.logger.log(`   actualTime: ${dto.actualTime ?? 'N/A'} minutos`);

    return this.routeService.completeRoute(routeId, companyId, userId, dto);
  }

  @Get('performance/reports')
  async getRoutesPerformance(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('onlyFinished') onlyFinished?: string,
  ) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/performance/reports] Buscando performance`);
    return this.routeService.findAllRoutesWithPerformance(companyId, {
      startDate,
      endDate,
      onlyFinished: onlyFinished === 'true',
    });
  }

  @Get(':id/comparison')
  async getRouteComparison(@Param('id') routeId: string, @Req() req: any) {
    const companyId = req.user?.companyId;
    this.logger.log(`[GET /routes/${routeId}/comparison] Buscando comparação`);
    const route = await this.routeService.findRouteById(routeId, companyId);

    return {
      distancia: {
        prevista: route.totalDistanceMeters ? `${(route.totalDistanceMeters / 1000).toFixed(1)} km` : 'Não calculada',
        realizada: route.actualDistance ? `${route.actualDistance.toFixed(1)} km` : 'Não realizada',
        diferenca: route.totalDistanceMeters && route.actualDistance
          ? `${(route.actualDistance - route.totalDistanceMeters / 1000).toFixed(1)} km`
          : null,
      },
      tempo: {
        previsto: route.totalDurationSeconds ? this.formatDuration(route.totalDurationSeconds) : 'Não calculado',
        realizada: route.actualTime ? this.formatDuration(route.actualTime * 60) : 'Não realizada',
        diferenca: route.totalDurationSeconds && route.actualTime
          ? `${((route.actualTime * 60 - route.totalDurationSeconds) / 60).toFixed(0)} min`
          : null,
      },
      combustivel: {
        previsto: route.estimatedFuel ? `${route.estimatedFuel.toFixed(1)} L` : 'Não previsto',
        realizada: route.actualFuel ? `${route.actualFuel.toFixed(1)} L` : 'Não realizada',
        diferenca: route.estimatedFuel && route.actualFuel
          ? `${(route.actualFuel - route.estimatedFuel).toFixed(1)} L`
          : null,
      },
    };
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  }
}
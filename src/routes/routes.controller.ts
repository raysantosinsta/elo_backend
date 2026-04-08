/* eslint-disable prettier/prettier */
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
   *
   * @example
   * POST /routes
   * {
   *   "title": "Visitas Zona Sul",
   *   "description": "Rota de visitas a clientes",
   *   "routeDate": "2026-04-15T08:00:00Z",
   *   "driverLatitude": -23.5505,
   *   "driverLongitude": -46.6333,
   *   "userAssignedId": "uuid-do-motorista",
   *   "orderBy": "DISTANCE",
   *   "stops": [
   *     {
   *       "name": "Cliente João",
   *       "address": "Av. Paulista, 1000",
   *       "city": "São Paulo",
   *       "state": "SP",
   *       "zipCode": "01310-100",
   *       "latitude": -23.5615,
   *       "longitude": -46.6558,
   *       "notes": "Entregar amostras"
   *     }
   *   ]
   * }
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
   * Lista todas as rotas salvas da empresa
   *
   * @example
   * GET /routes?status=SCHEDULED&startDate=2026-04-01&endDate=2026-04-30
   */
  @Get()
  async findAllRoutes(
    @Req() req: any,
    @Query('status') status?: RouteStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const companyId = req.user?.companyId;

    this.logger.log(`[GET /routes] Buscando rotas da empresa`);
    this.logger.log(
      `   Filtros: status=${status}, startDate=${startDate}, endDate=${endDate}`,
    );

    return this.routeService.findAllRoutes(companyId, {
      status,
      startDate,
      endDate,
    });
  }

  /**
   * 6. GET /routes/:id
   * Busca uma rota específica com todos os detalhes
   *
   * @example
   * GET /routes/abc-123-def
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
   *
   * @example
   * PATCH /routes/abc-123-def
   * {
   *   "title": "Visitas Zona Sul - ATUALIZADO",
   *   "status": "IN_PROGRESS",
   *   "userAssignedId": "novo-uuid-do-motorista"
   * }
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
    this.logger.log(`   Dados: ${JSON.stringify(dto)}`);

    return this.routeService.updateRoute(id, dto, companyId, userId);
  }

  /**
   * 8. DELETE /routes/:id
   * Remove uma rota (delete físico)
   *
   * @example
   * DELETE /routes/abc-123-def
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
   *
   * @example
   * PATCH /routes/abc-123-def/stops/stop-456/visit
   * {
   *   "notes": "Cliente atendido com sucesso"
   * }
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
    this.logger.log(`   Rota: ${routeId}`);
    this.logger.log(`   Observações: ${body.notes || 'N/A'}`);

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
   *
   * @example
   * POST /routes/abc-123-def/convert-to-tasks
   * {
   *   "columnId": "uuid-da-coluna-destino",
   *   "userAssignedId": "uuid-do-motorista"
   * }
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
    this.logger.log(`   ColumnId: ${dto.columnId || 'usando coluna padrão'}`);
    this.logger.log(`   AssignedTo: ${dto.userAssignedId || 'não atribuído'}`);

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
   *
   * @example
   * GET /routes/stats/summary
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
 * Duplica uma rota existente (útil para rotas recorrentes)
 * 
 * IMPORTANTE: As observações (notes) das paradas NÃO são copiadas para a nova rota.
 * A nova rota começa com histórico limpo, preservando o histórico apenas na rota original.
 *
 * @example
 * POST /routes/abc-123-def/duplicate
 * {
 *   "title": "Reagendamento - Visitas Zona Sul",
 *   "routeDate": "2026-05-01T08:00:00Z",
 *   "description": "Observações gerais do reagendamento"
 * }
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

  // Busca a rota original com todas as paradas
  const originalRoute = await this.routeService.findRouteById(
    routeId,
    companyId,
  );

  // Prepara a descrição mesclando com as observações do motorista (se houver)
  let finalDescription = originalRoute.description || '';
  if (body.description) {
    finalDescription = finalDescription 
      ? `${finalDescription}\n\n📝 Observações do reagendamento: ${body.description}`
      : `📝 Observações do reagendamento: ${body.description}`;
  }

  // Prepara os dados para a nova rota
  // IMPORTANTE: notes: undefined - NÃO copia as observações das paradas
  const createDto: CreateRouteDto = {
    title: body.title || `${originalRoute.title} (Reagendada)`,
    description: finalDescription,
    routeDate: body.routeDate || originalRoute.routeDate?.toISOString(),
    userAssignedId: originalRoute.userAssignedId,
    stops: originalRoute.stops.map((stop) => ({
      name: stop.name,
      address: stop.address,
      complement: stop.complement || undefined,
      neighborhood: stop.neighborhood || undefined,
      city: stop.city,
      state: stop.state,
      zipCode: stop.zipCode,
      latitude: stop.latitude,
      longitude: stop.longitude,
      notes: undefined, // ← NÃO copia as observações da parada original
    })),
  };

  const newRoute = await this.routeService.createRoute(
    createDto,
    companyId,
    userId,
  );

  return {
    message: 'Rota reagendada com sucesso',
    originalRouteId: routeId,
    newRoute: newRoute,
  };
}
}

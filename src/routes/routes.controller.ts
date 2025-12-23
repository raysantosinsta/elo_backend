/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req
} from '@nestjs/common';
import { FinalizeTaskDto, OptimizeRouteDto } from './dto/optimize-route.dto';
import { RouteService } from './routes.service';

// Descomente a linha abaixo se você tiver um Guard de Autenticação (ex: JwtAuthGuard)
// @UseGuards(JwtAuthGuard) 
@Controller('routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  /**
   * 1. GET /routes/available-tasks
   * Busca todas as tarefas pendentes da empresa que possuem endereço (Lat/Lng) válido.
   */
  @Get('available-tasks')
  async getAvailableTasks(@Req() req: any) {
    // Estamos assumindo que o seu AuthGuard popula o req.user
    // Se não tiver auth ainda, você pode passar o companyId manualmente para testar
    const companyId = req.user?.companyId; 
    
    return this.routeService.getTasksWithLocation(companyId);
  }

  /**
   * 2. POST /routes/calculate-best-path
   * Recebe a lista de IDs de tarefas e a localização do motorista.
   * Retorna a lista de tarefas reordenada pela rota mais econômica.
   */
  @Post('calculate-best-path')
  async calculateBestPath(@Body() dto: OptimizeRouteDto) {
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
    @Req() req: any
  ) {
    const userId = req.user?.id; // ID do usuário que está finalizando (motorista)
    
    return this.routeService.concludeVisit(taskId, userId, dto);
  }
}
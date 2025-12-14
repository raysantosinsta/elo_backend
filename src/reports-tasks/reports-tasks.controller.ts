import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

import type { User, UserRole } from '@prisma/client';
import { TaskStatus } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator'; // Assumindo este decorator
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ReportsTasksService } from './reports-tasks.service';

// --- DTO para Query Parameters ---
class TaskReportQueryDto {
    @IsOptional()
    @IsUUID('4', { message: 'companyId deve ser um UUID válido.' })
    companyId?: string;

    @IsOptional()
    @IsEnum(TaskStatus, { message: `Status deve ser um dos seguintes: ${Object.values(TaskStatus).join(', ')} ou 'all'.` })
    status?: TaskStatus | 'all'; // Recebe TaskStatus ou 'all'

    @IsOptional()
    // Prioridade é um número de 1 a 5 no seu schema, mas a query pode receber como string.
    @IsEnum(['1', '2', '3', '4', '5', 'all'], { message: 'Prioridade deve ser um número entre 1 e 5, ou "all".' })
    priority?: string | 'all';

    @IsOptional()
    @IsDateString({}, { message: 'startDate deve ser uma data válida.' })
    startDate?: string;

    @IsOptional()
    @IsDateString({}, { message: 'endDate deve ser uma data válida.' })
    endDate?: string;
}

@ApiTags('Reports - Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports-tasks')
export class ReportsTasksController {
    constructor(private readonly reportsTasksService: ReportsTasksService) { }

    @Get('tasks')
    @ApiOperation({ summary: 'Gera relatório de tarefas com filtros por status, prioridade e data.' })
    async getTasksReport(
        @CurrentUser() user: User,
        @Query() query: TaskReportQueryDto,
    ) {
        // 1. Verificação de Permissões (Apenas MASTER e ADMIN podem acessar)
        const allowedRoles: UserRole[] = ['MASTER', 'ADMIN'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Apenas usuários com as roles MASTER ou ADMIN podem acessar relatórios de tarefas.');
        }

        // 2. Determinação do ID da Empresa
        let targetCompanyId: string;

        if (user.role === 'MASTER' && query.companyId) {
            // MASTER pode consultar qualquer empresa
            targetCompanyId = query.companyId;
        } else if (user.companyId) {
            // ADMIN consulta apenas sua própria empresa
            targetCompanyId = user.companyId;
        } else {
            // Caso de segurança: ADMIN sem companyId ou MASTER sem companyId na query.
            throw new BadRequestException('ID da empresa não fornecido ou inválido para a sua role.');
        }
        
        // 3. Chamada ao Serviço
        // O ReportsTasksService espera { status, priority, startDate, endDate } no segundo argumento.
        return this.reportsTasksService.getTasksReport(targetCompanyId, {
            status: query.status,
            priority: query.priority,
            startDate: query.startDate,
            endDate: query.endDate
        });
    }

    // Rota placeholder para evitar erro 404 no botão de exportar
    @Get('tasks/export')
    @ApiOperation({ summary: 'Rota placeholder para exportação de tarefas.' })
    async exportTasks() {
        return { message: "Funcionalidade de exportação em desenvolvimento" };
    }
}
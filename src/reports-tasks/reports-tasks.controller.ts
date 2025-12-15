/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import {
    BadRequestException,
    Controller,
    ForbiddenException,
    Get,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator'; // Removido IsUUID

import type { User, UserRole } from '@prisma/client';
import { TaskStatus } from '@prisma/client';
import { CurrentUser } from 'src/auth/current-user.decorator'; 
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ReportsTasksService } from './reports-tasks.service';

// --- DTO para Query Parameters ---
class TaskReportQueryDto {
    // REMOVIDO: companyId para impedir que o usuário filtre por outra empresa na API

    @IsOptional()
    @IsEnum(TaskStatus, { message: `Status deve ser um dos seguintes: ${Object.values(TaskStatus).join(', ')} ou 'all'.` })
    status?: TaskStatus | 'all';

    @IsOptional()
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
    @ApiOperation({ summary: 'Gera relatório de tarefas da empresa do usuário logado.' })
    async getTasksReport(
        @CurrentUser() user: User,
        @Query() query: TaskReportQueryDto,
    ) {
        // 1. Verificação de Permissões
        const allowedRoles: UserRole[] = ['MASTER', 'ADMIN'];
        if (!allowedRoles.includes(user.role)) {
            throw new ForbiddenException('Apenas usuários com as roles MASTER ou ADMIN podem acessar relatórios de tarefas.');
        }

        // 2. SEGURANÇA: Força o ID da empresa do usuário logado.
        // Independentemente da Role (mesmo MASTER), ele só vê os dados da sua própria empresa (contexto do token).
        const targetCompanyId = user.companyId;

        if (!targetCompanyId) {
            throw new BadRequestException('Usuário não está vinculado a nenhuma empresa.');
        }
        
        // 3. Chamada ao Serviço
        return this.reportsTasksService.getTasksReport(targetCompanyId, {
            status: query.status,
            priority: query.priority,
            startDate: query.startDate,
            endDate: query.endDate
        });
    }

    @Get('tasks/export')
    @ApiOperation({ summary: 'Exportação de tarefas da empresa do usuário logado.' })
    async exportTasks(
        @CurrentUser() user: User,
        // @Query() query: TaskReportQueryDto // Se precisar passar filtros para o export
    ) {
        // Lógica de segurança deve ser a mesma aqui: usar user.companyId
        return { message: "Funcionalidade de exportação em desenvolvimento" };
    }
}
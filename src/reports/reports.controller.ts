import {
    Controller,
    Get,
    Query,
    UseGuards,
    Param,
    ForbiddenException,
    ParseUUIDPipe,
    UseInterceptors,
    ClassSerializerInterceptor,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { CurrentUser } from 'src/auth/current-user.decorator'; // Assumindo este decorator
import type { User, UserRole } from '@prisma/client';

// --- DTO para Query Parameters ---
class ReportQueryDto {
    @IsOptional()
    @IsUUID('4', { message: 'companyId deve ser um UUID válido.' })
    companyId?: string;

    @IsOptional()
    @IsDateString({}, { message: 'startDate deve ser uma data válida no formato ISO 8601.' })
    startDate?: string;

    @IsOptional()
    @IsDateString({}, { message: 'endDate deve ser uma data válida no formato ISO 8601.' })
    endDate?: string;

    @IsOptional()
    @IsEnum(['ACTIVE', 'INACTIVE'], { message: 'status deve ser ACTIVE ou INACTIVE.' })
    status?: string; 
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('reports')
export class ReportsController {
    constructor(private readonly reportsService: ReportsService) { }

    /**
     * Rota: GET /reports/professionals
     * Gera um relatório resumido de profissionais com métricas.
     */
    @Get('professionals')
    @ApiOperation({ summary: 'Gera relatório de desempenho de profissionais' })
    @ApiQuery({ name: 'companyId', required: false, description: 'ID da empresa (apenas para MASTER)' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Filtro inicial de data (YYYY-MM-DD)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'Filtro final de data (YYYY-MM-DD)' })
    @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'], description: 'Filtro de status do usuário' })
    async getProfessionalReport(
        @CurrentUser() user: User,
        @Query() query: ReportQueryDto,
    ) {
        // 1. Verificação de Permissões
        const requiredRoles: UserRole[] = ['MASTER', 'ADMIN'];
        if (!requiredRoles.includes(user.role)) {
            throw new ForbiddenException('Apenas administradores e o usuário MASTER podem acessar relatórios de profissionais.');
        }

        // 2. Determinação do Company ID para Consulta (Segurança)
        let effectiveCompanyId: string | undefined;
        
        if (user.role === 'MASTER' && query.companyId) {
            // MASTER pode solicitar um companyId específico
            effectiveCompanyId = query.companyId;
        } else if (user.companyId) {
            // ADMIN ou outros usuários restritos usam o próprio companyId
            effectiveCompanyId = user.companyId;
        } else {
             // Caso ADMIN/Outros sem companyId
            throw new ForbiddenException('Usuário sem vínculo corporativo para acessar relatórios.');
        }

        return this.reportsService.getProfessionalReport({
            companyId: effectiveCompanyId,
            startDate: query.startDate ? new Date(query.startDate) : undefined,
            endDate: query.endDate ? new Date(query.endDate) : undefined,
            status: query.status,
            requesterRole: user.role,
        });
    }

    /**
     * Rota: GET /reports/professionals/:userId/details
     * Retorna detalhes aprofundados e métricas de um profissional específico.
     */
    @Get('professionals/:userId/details')
    @ApiOperation({ summary: 'Busca detalhes e métricas de um profissional específico' })
    @ApiQuery({ name: 'startDate', required: false, description: 'Filtro inicial de data (YYYY-MM-DD)' })
    @ApiQuery({ name: 'endDate', required: false, description: 'Filtro final de data (YYYY-MM-DD)' })
    async getProfessionalDetails(
        @CurrentUser() user: User,
        @Param('userId', ParseUUIDPipe) userId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        // 1. Verificação de Permissões e Segurança de ID
        const allowedRoles: UserRole[] = ['MASTER', 'ADMIN'];
        
        if (!allowedRoles.includes(user.role)) {
            // Se o usuário não for MASTER ou ADMIN, ele SÓ pode ver seus próprios detalhes.
            if (user.id !== userId) {
                throw new ForbiddenException('Acesso negado. Usuários com sua permissão só podem visualizar seus próprios detalhes.');
            }
        }
        
        // 2. Determinação do Company ID para Segurança na Consulta
        let companyIdForSecurity: string | undefined;
        
        // CORREÇÃO: Tratar o 'null' do user.companyId do Prisma. 
        // Se for MASTER, companyId é undefined (consulta irrestrita no Service).
        // Se for ADMIN/EMPLOYER, usamos o companyId (que pode ser null se o token estiver errado).
        if (user.role !== 'MASTER' && user.companyId) {
            companyIdForSecurity = user.companyId;
        }
        // Se user.companyId for null, ele continuará undefined, o que é o tipo esperado pelo Service.
        

        return this.reportsService.getProfessionalDetails({
            userId,
            companyId: companyIdForSecurity, // Tipagem corrigida
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
        });
    }
}
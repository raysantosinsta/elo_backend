/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';

// --- Segurança ---
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { PermissionsGuard } from 'src/auth/permissions.guard';
import { AppPermission, RequirePermissions } from 'src/auth/permissions.decorator';

// --- DTOs e Service ---
import { CreateKanbanColumnDto, ReorderColumnsDto, UpdateKanbanColumnDto } from './dto/create-kanban-column.dto';
import { KanbanColumnService } from './kanban-columns.service';

@ApiTags('Kanban Columns')
@ApiBearerAuth()
// 🔥 Adicionado PermissionsGuard para habilitar o @RequirePermissions
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) 
@Controller('kanban-columns')
export class KanbanColumnController {
  constructor(private readonly kanbanColumnService: KanbanColumnService) {}

  // ===========================================================================
  // 🔓 LEITURA (Aberto para todos da empresa)
  // ===========================================================================

  @Get()
  @ApiOperation({ summary: 'Lista todas as colunas do Kanban da empresa' })
  async findAll(@CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    
    const columns = await this.kanbanColumnService.findAll(user.companyId);
    return { success: true, columns }; 
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca detalhes de uma coluna' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.findOne(id, user.companyId);
  }

  // ===========================================================================
  // 🔒 ESCRITA (Restrito: Admin, Master ou Employer "Gestor de Processos")
  // ===========================================================================

  @Post()
  @RequirePermissions(AppPermission.MANAGE_KANBAN_COLUMNS) // <--- Regra de Permissão
  @ApiOperation({ summary: 'Cria uma nova coluna (Restrito)' })
  async create(@Body() dto: CreateKanbanColumnDto, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.create(dto.title, user.companyId, user.id);
  }

  @Put(':id')
  @RequirePermissions(AppPermission.MANAGE_KANBAN_COLUMNS) // <--- Regra de Permissão
  @ApiOperation({ summary: 'Atualiza título/descrição da coluna (Restrito)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKanbanColumnDto,
    @CurrentUser() user: User,
  ) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.update(id, dto.title, user.companyId, dto.description);
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.MANAGE_KANBAN_COLUMNS) // <--- Regra de Permissão
  @ApiOperation({ summary: 'Deleta coluna e move tarefas (Restrito)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.delete(id, user.companyId);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(AppPermission.MANAGE_KANBAN_COLUMNS) // <--- Regra de Permissão
  @ApiOperation({ summary: 'Reordena múltiplas colunas (Restrito)' })
  async reorder(@Body() dto: ReorderColumnsDto, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.reorder(dto.columns, user.companyId);
  }
}
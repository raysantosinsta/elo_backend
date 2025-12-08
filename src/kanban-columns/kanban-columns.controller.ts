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
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CreateKanbanColumnDto, ReorderColumnsDto, UpdateKanbanColumnDto } from './dto/create-kanban-column.dto';
import { KanbanColumnService } from './kanban-columns.service';

@ApiTags('Kanban Columns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kanban-columns')
export class KanbanColumnController {
  constructor(private readonly kanbanColumnService: KanbanColumnService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todas as colunas do Kanban da empresa' })
  async findAll(@CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    
    // O service agora retorna o array direto (ou cacheado)
    const columns = await this.kanbanColumnService.findAll(user.companyId);
    
    // Mantendo formato { success: true, columns: [] } se o frontend espera isso
    return { success: true, columns }; 
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca detalhes de uma coluna' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.findOne(id, user.companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma nova coluna' })
  async create(@Body() dto: CreateKanbanColumnDto, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.create(dto.title, user.companyId, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza título/descrição da coluna' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKanbanColumnDto,
    @CurrentUser() user: User,
  ) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    // dto.title é opcional no update, passamos undefined se não vier
    return this.kanbanColumnService.update(id, dto.title, user.companyId, dto.description);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deleta coluna e move tarefas' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.delete(id, user.companyId);
  }

  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reordena múltiplas colunas' })
  async reorder(@Body() dto: ReorderColumnsDto, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Usuário sem empresa vinculada');
    return this.kanbanColumnService.reorder(dto.columns, user.companyId);
  }
}
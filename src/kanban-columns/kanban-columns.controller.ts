/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { KanbanColumnService } from './kanban-columns.service';

@Controller('kanban-columns')
@UseGuards(JwtAuthGuard)
export class KanbanColumnController {
  constructor(private readonly kanbanColumnService: KanbanColumnService) {}

  @Get()
  async findAll(@Request() req) {
    try {
      const companyId = req.user.companyId;
      console.log('📥 Requisição para /kanban-columns - companyId:', companyId);
      
      if (!companyId) {
        return {
          success: false,
          message: 'CompanyId não encontrado no token',
          columns: []
        };
      }

      const columns = await this.kanbanColumnService.findAll(companyId);
      
      return {
        success: true,
        message: `Encontradas ${columns.length} colunas`,
        columns
      };
      
    } catch (error) {
      console.error('❌ Erro no controller de colunas:', error);
      return {
        success: false,
        message: error.message || 'Erro ao buscar colunas',
        columns: []
      };
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const companyId = req.user.companyId;
    return this.kanbanColumnService.findOne(id, companyId);
  }

  @Post()
  async create(@Body() createDto: { title: string }, @Request() req) {
    const companyId = req.user.companyId;
    const createdById = req.user.id;
    return this.kanbanColumnService.create(
      createDto.title,
      companyId,
      createdById,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDto: { title: string },
    @Request() req,
  ) {
    const companyId = req.user.companyId;
    return this.kanbanColumnService.update(id, updateDto.title, companyId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req) {
    try {
      const companyId = req.user.companyId;
      console.log(`🗑️ Tentando deletar coluna ${id} da empresa ${companyId}`);
      console.log('Usuário:', req.user.email);

      const result = await this.kanbanColumnService.delete(id, companyId);

      console.log('✅ Coluna deletada com sucesso');
      return result;
    } catch (error) {
      console.error('❌ Erro ao deletar coluna:', error);
      throw error; // O NestJS vai lidar com a exception
    }
  }

  @Patch('reorder')
  async reorder(
    @Body() reorderDto: { columns: Array<{ id: string; order: number }> },
    @Request() req,
  ) {
    const companyId = req.user.companyId;
    return this.kanbanColumnService.reorder(reorderDto.columns, companyId);
  }
}

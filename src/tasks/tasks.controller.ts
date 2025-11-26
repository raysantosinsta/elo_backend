/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Interface para arquivos
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
  ) { }

  // 🔄 Atualizar status da task (mover entre colunas)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { columnId: string | null },
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.updateStatus(id, body.columnId, companyId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao atualizar status da tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ➕ Criar task
  @Post()
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 10 },
    { name: 'audios', maxCount: 10 },
    { name: 'videos', maxCount: 10 },
  ]))
  async create(
    @UploadedFiles() files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
    @Body() body: any,
    @Request() req
  ) {
    try {
      console.log('=== 📥 REQUISIÇÃO RECEBIDA NO BACKEND ===');
      console.log('Body recebido:', body);
      console.log('req.user.companyId:', req.user.companyId); // DEBUG: Para rastrear o valor do JWT

      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload

      if (!companyId) {
        throw new HttpException('CompanyId é obrigatório (verifique o token JWT)', HttpStatus.BAD_REQUEST);
      }

      const createdById = req.user.id;

      // Adicionar companyId e createdById ao body (sem sobrescrever se já existir)
      const taskData = {
        ...body,
        companyId,
        createdById,
        priority: body.priority ? parseInt(body.priority) : 1,
        dueDate: body.dueDate || null,
        scheduledAt: body.scheduledAt || new Date(),
        assignedToId: body.assignedToId || null,
        columnId: body.columnId || null,
        routeId: body.routeId || null,
      };

      console.log('📤 Dados da task para criação:', taskData);

      return await this.tasksService.create(taskData, files);
    } catch (error) {
      console.error('❌ Erro ao criar task:', error);
      throw new HttpException(
        error.message || 'Erro ao criar tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 📋 Buscar tasks com paginação e filtros
  @Get()
  async findAllPaginated(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('columnId') columnId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('routeId') routeId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    try {
      const companyId = req.user.companyId;

      console.log('🔍 Buscando tasks para company:', companyId);
      console.log('📋 Filtros:', { page, limit, columnId, assignedToId, routeId, status, search });

      // Se tem parâmetros de paginação/filtro, usa findAllPaginated
      if (page || limit || columnId || assignedToId || routeId || status || search) {
        const result = await this.tasksService.findAllPaginated({
          companyId,
          page: Number(page),
          limit: Number(limit),
          columnId,
          assignedToId,
          routeId,
          status,
          search,
        });

        console.log(`✅ Tasks encontradas (com filtros): ${result.tasks.length}`);
        return result;
      }

      // Se não tem parâmetros, retorna todas da empresa
      const tasks = await this.tasksService.findAll(companyId);
      console.log(`✅ Tasks encontradas (todas): ${tasks.length}`);

      // Retornar array vazio se não há tasks, em vez de lançar erro
      return tasks || [];

    } catch (error) {
      console.error('❌ Erro ao buscar tarefas:', error);

      // Se for erro de "não encontrado", retornar array vazio
      if (error.message?.includes('não encontrada') || error.message?.includes('not found')) {
        console.log('ℹ️ Nenhuma task encontrada, retornando array vazio');
        return [];
      }

      // Para outros erros, lançar exceção
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ⏰ Tarefas atrasadas
  @Get('overdue')
  async findOverdue(@Request() req) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findOverdue(companyId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas atrasadas',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 📊 Tarefas por coluna (ID)
  @Get('column/:columnId')
  async findByColumnId(
    @Request() req,
    @Param('columnId') columnId: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findByColumnId(
        columnId,
        companyId,
        limit ? Number(limit) : undefined,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas por coluna',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 📊 Tarefas por título da coluna
  @Get('column-title/:title')
  async findByColumnTitle(
    @Request() req,
    @Param('title') title: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findByColumnTitle(
        title,
        companyId,
        limit ? Number(limit) : undefined,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas por título da coluna',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 👤 Tarefas por usuário atribuído
  @Get('assigned-to/:userId')
  async findByAssignedUser(
    @Request() req,
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findByAssignedUser(
        userId,
        companyId,
        limit ? Number(limit) : undefined,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas por usuário atribuído',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 👤 Tarefas criadas por um usuário
  @Get('created-by/:userId')
  async findByCreator(
    @Request() req,
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findByCreator(
        userId,
        companyId,
        limit ? Number(limit) : undefined,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas por criador',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 🛣️ Tarefas por rota
  @Get('route/:routeId')
  async findByRoute(
    @Request() req,
    @Param('routeId') routeId: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findByRoute(
        routeId,
        companyId,
        limit ? Number(limit) : undefined,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas por rota',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 📋 Tarefas por status
  @Get('status/:status')
  async findByStatus(
    @Request() req,
    @Param('status') status: string,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.findByStatus(
        status,
        companyId,
        limit ? Number(limit) : undefined,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao buscar tarefas por status',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 🔍 Buscar task específica
  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.tasksService.findOne(id);
    } catch (error) {
      throw new HttpException(
        error.message || 'Tarefa não encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // ✏️ Atualizar task
  @Put(':id')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 10 },
    { name: 'audios', maxCount: 10 },
    { name: 'videos', maxCount: 10 },
  ]))
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
    @Request() req
  ) {
    try {
      console.log('=== 📥 REQUISIÇÃO DE ATUALIZAÇÃO RECEBIDA ===');
      console.log('Body recebido:', body);

      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload

      if (!companyId) {
        throw new HttpException('CompanyId é obrigatório (verifique o token JWT)', HttpStatus.BAD_REQUEST);
      }

      // Parse dos arrays de IDs removidos (vêm como string JSON no FormData)
      const removeImageIds = body.removeImageIds ? JSON.parse(body.removeImageIds) : [];
      const removeAudioIds = body.removeAudioIds ? JSON.parse(body.removeAudioIds) : [];
      const removeVideoIds = body.removeVideoIds ? JSON.parse(body.removeVideoIds) : [];

      // Remover os campos de remoção do body para não poluir (mas adicionar como arrays)
      delete body.removeImageIds;
      delete body.removeAudioIds;
      delete body.removeVideoIds;

      // Converter dados se necessário e adicionar campos de remoção
      const updateData = {
        ...body,
        removeImageIds,
        removeAudioIds,
        removeVideoIds,
        priority: body.priority ? parseInt(body.priority) : undefined,
        dueDate: body.dueDate || null,
        scheduledAt: body.scheduledAt || new Date(),
        assignedToId: body.assignedToId || null,
        columnId: body.columnId || null,
        routeId: body.routeId || null,
        completedById: body.completedById || null,
      };

      console.log('📤 Dados da task para atualização:', updateData);

      return await this.tasksService.update(id, updateData, companyId, files);
    } catch (error) {
      console.error('❌ Erro ao atualizar task:', error);
      throw new HttpException(
        error.message || 'Erro ao atualizar tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 🗑️ Deletar task
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.remove(id, companyId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao deletar tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 🏠 Adicionar endereço à task
  @Post(':id/address')
  async addAddress(
    @Param('id') id: string,
    @Body() addressData: {
      rua: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      estado: string;
      cep: string;
    },
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      return await this.tasksService.addAddress(id, companyId, addressData);
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao adicionar endereço',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ✅ Marcar task como concluída
  @Patch(':id/complete')
  async completeTask(
    @Param('id') id: string,
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload
      const completedById = req.user.id;

      return await this.tasksService.update(
        id,
        {
          completedById,
          status: 'COMPLETED'
        },
        companyId
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao marcar tarefa como concluída',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 🔄 Reabrir task (remover conclusão)
  @Patch(':id/reopen')
  async reopenTask(
    @Param('id') id: string,
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload

      return await this.tasksService.update(
        id,
        {
          completedById: null,
          status: 'PENDING'
        },
        companyId
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao reabrir tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ⚠️ Marcar task como falhada
  @Patch(':id/fail')
  async failTask(
    @Param('id') id: string,
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload

      return await this.tasksService.update(
        id,
        {
          status: 'FAILED'
        },
        companyId
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao marcar tarefa como falhada',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ▶️ Marcar task como em progresso
  @Patch(':id/start')
  async startTask(
    @Param('id') id: string,
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId; // FIX: Use flat companyId from JWT payload

      return await this.tasksService.update(
        id,
        {
          status: 'IN_PROGRESS'
        },
        companyId
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao iniciar tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
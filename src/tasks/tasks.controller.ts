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
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaskStatus } from '@prisma/client';

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
      const companyId = req.user.companyId;
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

      const companyId = req.user.companyId;
      const createdById = req.user.id;

      if (!companyId) {
        throw new HttpException('CompanyId é obrigatório (verifique o token JWT)', HttpStatus.BAD_REQUEST);
      }

      // Converter valores para tipos corretos
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
        // Adicionar coluna de ordem se fornecida
        columnOrder: body.columnOrder ? parseInt(body.columnOrder) : 0,
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10,
    @Query('columnId') columnId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('routeId') routeId?: string,
    @Query('status') status?: TaskStatus,
    @Query('search') search?: string,
  ) {
    try {
      const companyId = req.user.companyId;

      console.log('🔍 Buscando tasks para company:', companyId);
      console.log('📋 Filtros:', { page, limit, columnId, assignedToId, routeId, status, search });

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

      console.log(`✅ Tasks encontradas: ${result.tasks.length} de ${result.pagination.total}`);
      return result;

    } catch (error) {
      console.error('❌ Erro ao buscar tarefas:', error);

      // Retornar resultado vazio em caso de erro
      return {
        tasks: [],
        pagination: {
          page: page,
          limit: limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }
  }

  // 📊 Buscar todas as tasks (sem paginação)
  @Get('all')
  async findAll(@Request() req) {
    try {
      const companyId = req.user.companyId;
      console.log('🔍 Buscando todas tasks para company:', companyId);
      
      const tasks = await this.tasksService.findAll(companyId);
      console.log(`✅ Tasks encontradas: ${tasks.length}`);
      
      return tasks || [];
      
    } catch (error) {
      console.error('❌ Erro ao buscar tarefas:', error);
      return [];
    }
  }

  // ⏰ Tarefas atrasadas
  @Get('overdue')
  async findOverdue(@Request() req) {
    try {
      const companyId = req.user.companyId;
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
      const companyId = req.user.companyId;
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
      const companyId = req.user.companyId;
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
      const companyId = req.user.companyId;
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
      const companyId = req.user.companyId;
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
      const companyId = req.user.companyId;
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
    @Param('status') status: TaskStatus,
    @Query('limit') limit?: number,
  ) {
    try {
      const companyId = req.user.companyId;
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
    @Request() req,
  ) {
    const companyId = req.user.companyId;
    const updaterId = req.user.id;

    const removeImageIds = body.removeImageIds ? JSON.parse(body.removeImageIds) : [];
    const removeAudioIds = body.removeAudioIds ? JSON.parse(body.removeAudioIds) : [];
    const removeVideoIds = body.removeVideoIds ? JSON.parse(body.removeVideoIds) : [];

    delete body.removeImageIds;
    delete body.removeAudioIds;
    delete body.removeVideoIds;

    const updateData = {
      ...body,
      removeImageIds,
      removeAudioIds,
      removeVideoIds,
      priority: body.priority ? parseInt(body.priority) : undefined,
      columnOrder: body.columnOrder ? parseInt(body.columnOrder) : undefined,
    };

    return this.tasksService.update(id, updateData, companyId, updaterId, files);
  }

  // 🗑️ Deletar task
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    try {
      const companyId = req.user.companyId;
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
      const companyId = req.user.companyId;
      return await this.tasksService.addAddress(id, companyId, addressData);
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao adicionar endereço',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ✅ Completar tarefa
  @Patch(':id/complete')
  async completeTask(@Param('id') id: string, @Request() req) {
    const companyId = req.user.companyId;
    const updaterId = req.user.id;

    return this.tasksService.update(
      id,
      { 
        completedById: updaterId, 
        completedAt: new Date(),
        status: TaskStatus.COMPLETED 
      },
      companyId,
      updaterId,
      undefined,
    );
  }

  // 🔄 Reabrir tarefa (desmarcar conclusão)
  @Patch(':id/reopen')
  async reopenTask(@Param('id') id: string, @Request() req) {
    const companyId = req.user.companyId;
    const updaterId = req.user.id;

    return this.tasksService.update(
      id,
      {
        completedById: null,
        completedAt: null,
        status: TaskStatus.PENDING,
      },
      companyId,
      updaterId,
      undefined,
    );
  }

  // ❌ Marcar como falhada
  @Patch(':id/fail')
  async failTask(@Param('id') id: string, @Request() req) {
    const companyId = req.user.companyId;
    const updaterId = req.user.id;

    return this.tasksService.update(
      id,
      {
        failedAt: new Date(),
        status: TaskStatus.FAILED,
      },
      companyId,
      updaterId,
      undefined,
    );
  }

  // 🚀 Iniciar tarefa (colocar em progresso)
  @Patch(':id/start')
  async startTask(@Param('id') id: string, @Request() req) {
    const companyId = req.user.companyId;
    const updaterId = req.user.id;

    return this.tasksService.update(
      id,
      {
        status: TaskStatus.IN_PROGRESS,
      },
      companyId,
      updaterId,
      undefined,
    );
  }
}
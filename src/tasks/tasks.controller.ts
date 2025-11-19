/* eslint-disable prettier/prettier */
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
import { FilesInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Interface para arquivos Multer
interface MulterFile {
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
  @UseInterceptors(FilesInterceptor('files'))
  async create(
    @UploadedFiles() files: MulterFile[], 
    @Body() body: any,
    @Request() req
  ) {
    try {
      console.log('=== 📥 REQUISIÇÃO RECEBIDA NO BACKEND ===');
      console.log('Body recebido:', body);

      const companyId = req.user.companyId;
      const createdById = req.user.id;

      // Organizar os arquivos
      const fileMap: {
        images?: MulterFile[];
        audios?: MulterFile[];
        videos?: MulterFile[];
      } = {};

      if (files && files.length > 0) {
        files.forEach((file) => {
          if (file.mimetype.startsWith('image/')) {
            if (!fileMap.images) fileMap.images = [];
            fileMap.images.push(file);
          } else if (file.mimetype.startsWith('audio/')) {
            if (!fileMap.audios) fileMap.audios = [];
            fileMap.audios.push(file);
          } else if (file.mimetype.startsWith('video/')) {
            if (!fileMap.videos) fileMap.videos = [];
            fileMap.videos.push(file);
          }
        });
      }

      // Adicionar companyId e createdById ao body
      const taskData = {
        ...body,
        companyId,
        createdById,
        priority: body.priority ? parseInt(body.priority) : 1,
        dueDate: body.dueDate || null,
      };

      return await this.tasksService.create(taskData, fileMap);
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
    @Query('search') search?: string,
  ) {
    try {
      const companyId = req.user.companyId;

      // Se tem parâmetros de paginação/filtro, usa findAllPaginated
      if (page || limit || columnId || assignedToId || search) {
        return await this.tasksService.findAllPaginated({
          companyId,
          page: Number(page),
          limit: Number(limit),
          columnId,
          assignedToId,
          search,
        });
      }

      // Se não tem parâmetros, retorna todas da empresa
      return await this.tasksService.findAll(companyId);
    } catch (error) {
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
  async update(
    @Param('id') id: string, 
    @Body() body: any,
    @Request() req
  ) {
    try {
      console.log('=== 📥 REQUISIÇÃO DE ATUALIZAÇÃO RECEBIDA ===');
      console.log('Body recebido:', body);

      const companyId = req.user.companyId;

      // Converter dados se necessário
      const updateData = {
        ...body,
        priority: body.priority ? parseInt(body.priority) : undefined,
        dueDate: body.dueDate || null,
      };

      return await this.tasksService.update(id, updateData, companyId);
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

  // ✅ Marcar task como concluída
  @Patch(':id/complete')
  async completeTask(
    @Param('id') id: string,
    @Request() req
  ) {
    try {
      const companyId = req.user.companyId;
      const completedById = req.user.id;

      return await this.tasksService.update(
        id, 
        { completedById }, 
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
      const companyId = req.user.companyId;

      return await this.tasksService.update(
        id, 
        { completedById: null }, 
        companyId
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Erro ao reabrir tarefa',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
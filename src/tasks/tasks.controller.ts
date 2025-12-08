import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  Logger,
  BadRequestException,
  DefaultValuePipe, // Importar Exception
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TasksService, CreateTaskDto, UpdateTaskDto, UploadedFile } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaskStatus } from '@prisma/client';
import type { User } from '@prisma/client'; // CORREÇÃO 1: 'import type'
import { CurrentUser } from 'src/auth/current-user.decorator';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {}

  // --- WRITE OPERATIONS ---

  @Post()
  @ApiOperation({ summary: 'Cria uma nova tarefa com uploads opcionais' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Tarefa criada com sucesso.' })
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 5 },
    { name: 'audios', maxCount: 5 },
    { name: 'videos', maxCount: 2 },
  ]))
  async create(
    @CurrentUser() user: User,
    @Body() createTaskDto: CreateTaskDto,
    @UploadedFiles() files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    // CORREÇÃO 2: Verificação de Segurança (Type Guard)
    // Garante que o usuário tem empresa antes de prosseguir
    if (!user.companyId) {
        throw new BadRequestException('Usuário não está vinculado a uma empresa.');
    }

    this.logger.log(`Usuário ${user.id} criando tarefa: ${createTaskDto.title}`);
    
    // Sobrescreve com dados do token para segurança
    createTaskDto.companyId = user.companyId; 
    createTaskDto.createdById = user.id;

    return this.tasksService.create(createTaskDto, files);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza uma tarefa existente' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 5 },
    { name: 'audios', maxCount: 5 },
    { name: 'videos', maxCount: 2 },
  ]))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() updateTaskDto: UpdateTaskDto,
    @UploadedFiles() files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    if (!user.companyId) {
        throw new BadRequestException('Usuário não está vinculado a uma empresa.');
    }

    return this.tasksService.update(
        id, 
        updateTaskDto, 
        user.companyId, 
        user.id, 
        files
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a tarefa entre colunas ou altera status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { columnId?: string, status?: TaskStatus },
    @CurrentUser() user: User
  ) {
    if (!user.companyId) throw new BadRequestException('Empresa não identificada.');

    return this.tasksService.update(
        id, 
        { columnId: body.columnId, status: body.status }, 
        user.companyId, 
        user.id
    );
  }

  // --- SHORTCUTS ---

  @Patch(':id/complete')
  async completeTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
    return this.tasksService.update(
        id, 
        { status: TaskStatus.COMPLETED, completedById: user.id }, 
        user.companyId, 
        user.id
    );
  }

  @Patch(':id/start')
  async startTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
    return this.tasksService.update(
        id, 
        { status: TaskStatus.IN_PROGRESS }, 
        user.companyId, 
        user.id
    );
  }

  @Patch(':id/fail')
  async failTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
    return this.tasksService.update(
        id, 
        { status: TaskStatus.FAILED }, 
        user.companyId, 
        user.id
    );
  }

  // --- READ OPERATIONS ---

  @Get()
  async findAllPaginated(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('columnId') columnId?: string,
    @Query('search') search?: string,
    @Query('status') status?: TaskStatus,
  ) {
    if (!user.companyId) throw new BadRequestException('Empresa não identificada.');

    return this.tasksService.findAllPaginated({
        companyId: user.companyId, // TypeScript agora sabe que isso é string
        page,
        limit,
        columnId,
        search
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(id);
  }

  // --- DELETE (CORREÇÃO 3: Chama método remove) ---

  @Delete(':id')
  @ApiOperation({ summary: 'Remove uma tarefa e seus arquivos' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
    
    // O Service precisa ter este método implementado (veja abaixo)
    await this.tasksService.remove(id, user.companyId);
  }
  
  // Endpoint para Endereço
  @Post(':id/address')
  async addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addressData: any, // Idealmente criar CreateAddressDto
    @CurrentUser() user: User
  ) {
     if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
     return this.tasksService.addAddress(id, user.companyId, addressData);
  }
}
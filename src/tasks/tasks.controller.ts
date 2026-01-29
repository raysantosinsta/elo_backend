/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor'; // 🔥 Injetar Contexto
import { CreateTaskAddressDto, CreateTaskDto, FinalizeTaskDto, UpdateTaskDto, validateFiles } from './dto/create-task-dto';
import { TasksService, UploadedFile } from './tasks.service';
import { TaskStatus, User } from '@prisma/client';
import { FileLoggerInterceptor } from 'src/common/interceptors/file-logger.interceptor';
import { CurrentUser } from 'src/auth/current-user.decorator';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor) // 🔥 Contexto Automático
@Controller('tasks')
export class TasksController {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma nova tarefa' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Tarefa criada.' })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'images', maxCount: 10 }, { name: 'audios', maxCount: 10 }, { name: 'videos', maxCount: 5 }]), FileLoggerInterceptor)
  async create(
    @CurrentUser() user: any,
    @Body() createTaskDto: CreateTaskDto,
    @UploadedFiles() // 🔥 Validação de Arquivo
    files: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] },
  ) {

    if (!user.companyId) {
      throw new BadRequestException('Usuário não está vinculado a uma empresa.');
    }

    // ✅ CHAME A VALIDAÇÃO MANUAL AQUI
    // Se falhar, ela joga um BadRequestException e para a execução
    if (files) {
        validateFiles(files);
    }

    createTaskDto.companyId = user.companyId;
    createTaskDto.createdById = user.id;

    // Não precisa injetar user, o service pega do CLS
    return this.tasksService.create(createTaskDto, files);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza uma tarefa existente' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'images', maxCount: 10 }, { name: 'audios', maxCount: 10 }, { name: 'videos', maxCount: 5 }]))
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @UploadedFiles()
    files: { images?: UploadedFile[]; audios?: UploadedFile[]; videos?: UploadedFile[] },
  ) {
    return this.tasksService.update(id, updateTaskDto, files);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a tarefa entre colunas e/ou altera status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { columnId?: string; status?: TaskStatus; columnOrder?: number },
  ) {
    const dto = new UpdateTaskDto();
    dto.columnId = body.columnId;
    dto.status = body.status;
    dto.columnOrder = body.columnOrder;
    
    return this.tasksService.update(id, dto);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Atalho: Completar tarefa' })
  async completeTask(@Param('id', ParseUUIDPipe) id: string) {
    const dto = new UpdateTaskDto();
    dto.status = TaskStatus.COMPLETED;
    // O service pega o user ID do contexto para marcar o "completedById"
    return this.tasksService.update(id, dto);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Atalho: Iniciar tarefa' })
  async startTask(@Param('id', ParseUUIDPipe) id: string) {
    const dto = new UpdateTaskDto();
    dto.status = TaskStatus.IN_PROGRESS;
    return this.tasksService.update(id, dto);
  }

  @Patch(':id/fail')
  @ApiOperation({ summary: 'Atalho: Falhar tarefa' })
  async failTask(@Param('id', ParseUUIDPipe) id: string) {
    const dto = new UpdateTaskDto();
    dto.status = TaskStatus.FAILED;
    return this.tasksService.update(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista tarefas' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  async findAllPaginated(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('columnId') columnId?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('hasLocation') hasLocation?: string,
    @Query('dateType') dateType?: string, 
    @Query('isOverdue') isOverdue?: string,
  ) {
    let hasLocationBool: boolean | undefined = undefined;
    if (hasLocation === 'true') hasLocationBool = true;
    if (hasLocation === 'false') hasLocationBool = false;
    let isOverdueBool: boolean | undefined = undefined;
    if (isOverdue === 'true') isOverdueBool = true;

    return this.tasksService.findAllPaginated({
      page,
      limit,
      columnId,
      search,
      startDate,
      endDate,
      assignedToId,
      hasLocation: hasLocationBool,
      dateType, 
      isOverdue: isOverdueBool, // <--- PASSADO
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca tarefa por ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasksService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove tarefa' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.tasksService.remove(id);
  }

  @Post(':id/address')
  @ApiOperation({ summary: 'Adiciona endereço' })
  async addAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addressDto: CreateTaskAddressDto,
  ) {
    return this.tasksService.addAddress(id, addressDto);
  }

  @Patch(':id/finalize')
  @ApiOperation({ summary: 'Finaliza e reagenda' })
  async finalizeTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FinalizeTaskDto,
  ) {
    const dto = new UpdateTaskDto();
    dto.status = body.status;
    dto.finalComment = body.finalComment;
    if (body.scheduledAt) dto.scheduledAt = body.scheduledAt;

    return this.tasksService.update(id, dto);
  }
}
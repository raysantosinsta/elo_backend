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
import {
  CreateTaskAddressDto,
  CreateTaskDto,
  FinalizeTaskDto,
  UpdateTaskDto,
  validateFiles,
} from './dto/create-task-dto';
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

  // src/tasks/tasks.controller.ts

  @Post()
  @ApiOperation({ summary: 'Cria uma nova tarefa' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Tarefa criada.' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'audios', maxCount: 10 },
      { name: 'videos', maxCount: 5 },
    ]),
    FileLoggerInterceptor,
  )
  async create(
    @CurrentUser() user: any,
    @Body() createTaskDto: CreateTaskDto,
    @UploadedFiles()
    files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    if (!user.companyId) {
      throw new BadRequestException(
        'Usuário não está vinculado a uma empresa.',
      );
    }

    console.log('📦 [CONTROLLER] Address cru recebido:', createTaskDto.address);
    console.log(
      '📦 [CONTROLLER] Type of address:',
      typeof createTaskDto.address,
    );

    // 🔥 FAZER O PARSE MANUALMENTE
    let parsedAddress: CreateTaskAddressDto | undefined = undefined;

    if (
      typeof createTaskDto.address === 'string' &&
      createTaskDto.address.trim() !== ''
    ) {
      try {
        const parsed = JSON.parse(createTaskDto.address);
        console.log('✅ [CONTROLLER] Address parseado:', parsed);

        if (parsed && typeof parsed === 'object' && parsed.cep) {
          parsedAddress = parsed as CreateTaskAddressDto;
        }
      } catch (e) {
        console.error('❌ [CONTROLLER] Erro ao parsear address:', e);
      }
    }

    // 🔥 CRIAR UM OBJETO COM O ADDRESS PARSEADO
    const finalDto = {
      ...createTaskDto,
      address: parsedAddress,
    };

    console.log('📦 [CONTROLLER] Address final:', finalDto.address);

    if (files) {
      validateFiles(files);
    }

    finalDto.companyId = user.companyId;
    finalDto.createdById = user.id;

    return this.tasksService.create(finalDto as CreateTaskDto, files);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza uma tarefa existente' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'audios', maxCount: 10 },
      { name: 'videos', maxCount: 5 },
    ]),
  )
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @UploadedFiles()
    files: {
      images?: UploadedFile[];
      audios?: UploadedFile[];
      videos?: UploadedFile[];
    },
  ) {
    this.logger.log(`📝 Atualizando task ${id}`);

    // 🔥 PROCESSAR MANUALMENTE O ADDRESS
    // O body vem como string do FormData, precisamos fazer o parse
    const rawBody = updateTaskDto as any;

    if (rawBody.address) {
      try {
        // Se for string, parseia
        if (typeof rawBody.address === 'string') {
          updateTaskDto.address = JSON.parse(rawBody.address);
          this.logger.log(
            `✅ Address parseado da string: ${JSON.stringify(updateTaskDto.address)}`,
          );
        }
        // Se já for objeto, mantém
        else if (typeof rawBody.address === 'object') {
          this.logger.log(
            `✅ Address já é objeto: ${JSON.stringify(updateTaskDto.address)}`,
          );
        }
      } catch (e) {
        this.logger.error(`❌ Erro ao parsear address: ${e.message}`);
        updateTaskDto.address = undefined;
      }
    }

    // 🔥 VERIFICAR SE OS CAMPOS DE LATITUDE/LONGITUDE VIERAM SEPARADOS
    if (rawBody.latitude || rawBody.longitude) {
      this.logger.log(
        `📍 Latitude/Longitude separados encontrados: lat=${rawBody.latitude}, lng=${rawBody.longitude}`,
      );

      if (!updateTaskDto.address) {
        updateTaskDto.address = {};
      }

      if (rawBody.latitude) {
        updateTaskDto.address.latitude = parseFloat(rawBody.latitude);
      }
      if (rawBody.longitude) {
        updateTaskDto.address.longitude = parseFloat(rawBody.longitude);
      }
    }

    this.logger.log(
      `📦 Address final para service: ${JSON.stringify(updateTaskDto.address)}`,
    );

    if (
      files &&
      (files.images?.length || files.audios?.length || files.videos?.length)
    ) {
      validateFiles(files);
    }

    return this.tasksService.update(id, updateTaskDto, files);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a tarefa entre colunas e/ou altera status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: { columnId?: string; status?: TaskStatus; columnOrder?: number },
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
  @ApiOperation({ summary: 'Lista tarefas com paginação e filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'columnId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'assignedToId', required: false, type: String })
  @ApiQuery({
    name: 'hasLocation',
    required: false,
    type: String,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'dateType',
    required: false,
    type: String,
    enum: ['created', 'scheduled', 'due'],
  })
  @ApiQuery({
    name: 'isOverdue',
    required: false,
    type: String,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'excludeCompleted',
    required: false,
    type: String,
    enum: ['true', 'false'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description:
      'Filtrar por status específico(s). Ex: "PENDING,IN_PROGRESS,RESCHEDULED"',
  })
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
    @Query('excludeCompleted') excludeCompleted?: string,
    @Query('status') status?: string,
  ) {
    // Converter hasLocation para boolean
    let hasLocationBool: boolean | undefined = undefined;
    if (hasLocation === 'true') hasLocationBool = true;
    if (hasLocation === 'false') hasLocationBool = false;

    // Converter isOverdue para boolean
    let isOverdueBool: boolean | undefined = undefined;
    if (isOverdue === 'true') isOverdueBool = true;

    // Converter excludeCompleted para boolean
    let excludeCompletedBool: boolean | undefined = undefined;
    if (excludeCompleted === 'true') excludeCompletedBool = true;

    // 🔥 Processar múltiplos status separados por vírgula
    let statusArray: string[] | undefined = undefined;
    if (status) {
      statusArray = status.split(',').map((s) => s.trim().toUpperCase());
      console.log(`📊 Filtro de status recebido: ${statusArray.join(', ')}`);
    }

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
      isOverdue: isOverdueBool,
      excludeCompleted: excludeCompletedBool,
      status: statusArray, // 🔥 PASSANDO O ARRAY DE STATUS
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
    // 🔥 PRIORIZAR dueDate (prazo final) em vez de scheduledAt
    if (body.dueDate) {
      dto.dueDate = body.dueDate;
    } else if (body.scheduledAt) {
      // Fallback: se veio scheduledAt, usar como dueDate
      dto.dueDate = body.scheduledAt;
    }

    return this.tasksService.update(id, dto);
  }
}

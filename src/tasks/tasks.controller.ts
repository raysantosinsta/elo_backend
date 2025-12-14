/* eslint-disable prettier/prettier */
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
    DefaultValuePipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TasksService, CreateTaskDto, UpdateTaskDto, UploadedFile } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TaskStatus } from '@prisma/client';
import type { User } from '@prisma/client';
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
        { name: 'images', maxCount: 10 },
        { name: 'audios', maxCount: 10 },
        { name: 'videos', maxCount: 5 },
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
        if (!user.companyId) {
            throw new BadRequestException('Usuário não está vinculado a uma empresa.');
        }

        this.logger.log(`Usuário ${user.id} criando tarefa: ${createTaskDto.title}`);

        // Sobrescreve com dados do token para segurança
        // Embora o DTO exija esses campos, eles são preenchidos pelo Controller
        createTaskDto.companyId = user.companyId;
        createTaskDto.createdById = user.id;

        return this.tasksService.create(createTaskDto, files);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Atualiza uma tarefa existente (dados e uploads/remoções)' })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileFieldsInterceptor([
        { name: 'images', maxCount: 10 },
        { name: 'audios', maxCount: 10 },
        { name: 'videos', maxCount: 5 },
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

        // updateTaskDto já lida com remoção de arquivos via array de IDs
        return this.tasksService.update(
            id,
            updateTaskDto,
            user.companyId,
            user.id, // updaterId
            files
        );
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Move a tarefa entre colunas e/ou altera status' })
    @ApiResponse({ status: 200, description: 'Status e/ou coluna atualizados com sucesso.' })
    async updateStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: { columnId?: string, status?: TaskStatus, columnOrder?: number }, // Adicionado columnOrder
        @CurrentUser() user: User
    ) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
        
        // CUIDADO: columnOrder precisa ser passado como number no DTO. O Nestjs fará a validação.
        const updateData: Partial<UpdateTaskDto> = {
            columnId: body.columnId,
            status: body.status,
            columnOrder: body.columnOrder,
        };

        return this.tasksService.update(
            id,
            updateData,
            user.companyId,
            user.id // updaterId
        );
    }

    // --- SHORTCUTS (Simplificam a mudança de status) ---

    @Patch(':id/complete')
    @ApiOperation({ summary: 'Define o status da tarefa como COMPLETED' })
    async completeTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
        
        // Passa o ID do usuário logado como quem completou
        return this.tasksService.update(
            id,
            { status: TaskStatus.COMPLETED, completedById: user.id },
            user.companyId,
            user.id // updaterId
        );
    }

    @Patch(':id/start')
    @ApiOperation({ summary: 'Define o status da tarefa como IN_PROGRESS' })
    async startTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
        return this.tasksService.update(
            id,
            { status: TaskStatus.IN_PROGRESS },
            user.companyId,
            user.id // updaterId
        );
    }

    @Patch(':id/fail')
    @ApiOperation({ summary: 'Define o status da tarefa como FAILED' })
    async failTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
        return this.tasksService.update(
            id,
            { status: TaskStatus.FAILED },
            user.companyId,
            user.id // updaterId
        );
    }

    // --- READ OPERATIONS ---

    @Get()
    @ApiOperation({ summary: 'Lista tarefas paginadas, filtradas por empresa, coluna e busca' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'columnId', required: false, type: String })
    @ApiQuery({ name: 'search', required: false, type: String })
    async findAllPaginated(
        @CurrentUser() user: User,
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
        @Query('columnId') columnId?: string,
        @Query('search') search?: string,
        // @Query('status') status?: TaskStatus, // Removido do Service, então removido daqui
    ) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');

        return this.tasksService.findAllPaginated({
            companyId: user.companyId,
            page,
            limit,
            columnId,
            search
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Busca uma tarefa pelo ID com todos os detalhes' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        // A segurança de pertencimento à empresa pode ser adicionada aqui,
        // mas por enquanto confiamos no Service para lançar NotFound se não existir
        // (ou ajuste o findOne do service para receber companyId)
        return this.tasksService.findOne(id);
    }

    // --- DELETE ---

    @Delete(':id')
    @ApiOperation({ summary: 'Remove uma tarefa e seus arquivos (Requer confirmação de pertencimento à empresa)' })
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');

        await this.tasksService.remove(id, user.companyId);
    }

    // --- ADDRESS ---
    
    @Post(':id/address')
    @ApiOperation({ summary: 'Adiciona ou atualiza o endereço de uma tarefa' })
    async addAddress(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() addressData: any, // Idealmente usar um DTO de endereço (e.g., TaskAddressDto)
        @CurrentUser() user: User
    ) {
        if (!user.companyId) throw new BadRequestException('Empresa não identificada.');
        return this.tasksService.addAddress(id, user.companyId, addressData);
    }
}
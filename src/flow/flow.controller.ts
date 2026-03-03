/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

// --- Guards e Segurança ---
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AppPermission,
  RequirePermissions,
} from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';

// --- Services e DTOs ---
import {
  CreateFlowDto,
  CreateFlowItemDto,
  CreateStageDto,
  DateFilterType,
  FlowFilterDto,
  UpdateFlowItemDto,
} from './dto/create-flow.dto';
import { FlowService } from './flow.service';

@ApiTags('Product Flow (Kanban)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('flow')
export class FlowController {
  private readonly logger = new Logger(FlowController.name);

  constructor(private readonly flowService: FlowService) {}

  // ===========================================================================
  // 🔥 IMPORTANTE: NENHUM MÉTODO RECEBE companyId DO FRONTEND!
  // O service pega do CLS: this.cls.get('tenantId')
  // ===========================================================================

  @Get(':flowId/filter/items')
  @ApiOperation({ summary: 'Filtra itens de um fluxo específico' })
  async filterItemsByFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Query() query: FlowFilterDto,
  ) {
    this.logger.log(`Filtrando itens do fluxo ${flowId}`);
    // 🔥 REMOVIDO: req.user.companyId - O service pega do CLS
    return await this.flowService.getFilteredItemsByFlow(flowId, query);
  }

  // ===========================================================================
  // 🟢 GERENCIAMENTO DE TEMPLATES
  // ===========================================================================

  @Get('templates')
  @ApiOperation({ summary: 'Lista todos os templates de etapas da empresa' })
  async getTemplates(@Req() req: any) {
    this.logger.log(`Chamada GET /flow/templates`);
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.getTemplates();
  }

  @Post(':flowId/save-template')
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Salva as etapas atuais de um fluxo como template' })
  async saveTemplate(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body('name') name: string,
  ) {
    this.logger.log(
      `Chamada POST /flow/${flowId}/save-template - User: ${req.user.id}`,
    );

    if (!name) {
      this.logger.warn(
        `Tentativa de salvar template sem nome - FlowID: ${flowId}`,
      );
      throw new BadRequestException('O nome do template é obrigatório');
    }

    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.saveTemplate(flowId, name, req.user.id);
  }

  @Post(':flowId/apply-template/:templateId')
  @ApiOperation({ summary: 'Aplica um template de etapas a um fluxo' })
  async applyTemplate(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    this.logger.log(
      `Chamada POST /flow/${flowId}/apply-template/${templateId}`,
    );
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.applyTemplate(flowId, templateId, req.user.id);
  }

  @Delete('templates/:templateId')
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Exclui um template de etapas' })
  async deleteTemplate(
    @Req() req: any,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    this.logger.log(
      `Chamada DELETE /flow/templates/${templateId} - User: ${req.user.id}`,
    );
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.deleteTemplate(templateId, req.user.id);
  }

  // ===========================================================================
  // 1️⃣ GERENCIAMENTO DE FLUXO
  // ===========================================================================

  @Post()
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Cria um novo fluxo de produção' })
  async createFlow(@Req() req: any, @Body() body: CreateFlowDto) {
    this.logger.log(`Criando fluxo pelo usuário ${req.user.id}`);
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.createFlow(req.user.id, body);
  }

  @Put(':flowId')
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Atualiza um fluxo existente' })
  async updateFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: { name?: string; color?: string; deadline?: string | null },
  ) {
    this.logger.log(`Atualizando fluxo ${flowId} pelo usuário ${req.user.id}`);

    // Converter deadline para Date se existir
    let deadline: Date | null = null;
    if (body.deadline) {
      deadline = new Date(body.deadline);
    }

    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.updateFlow(
      flowId,
      {
        name: body.name,
        color: body.color,
        deadline,
      },
      req.user.id,
    );
  }

  @Delete(':flowId')
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Deleta um fluxo inteiro' })
  async deleteFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.deleteFlow(flowId, req.user.id);
  }

  // ===========================================================================
  // 2️⃣ GERENCIAMENTO DE ETAPAS / STAGES
  // ===========================================================================

  @Post(':flowId/stages')
  @ApiOperation({ summary: 'Adiciona uma nova etapa ao fluxo' })
  async createStage(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: CreateStageDto,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.createStage(flowId, body, req.user.id);
  }

  @Put('stages/:stageId')
  @ApiOperation({ summary: 'Atualiza uma etapa existente' })
  async updateStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() body: Partial<CreateStageDto>,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.updateStage(stageId, body, req.user.id);
  }

  @Delete('stages/:stageId')
  async deleteStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.deleteStage(stageId, req.user.id);
  }

  // ===========================================================================
  // 3️⃣ GERENCIAMENTO DE ITENS E LEITURA
  // ===========================================================================

  @Get()
  async getFlows(@Req() req: any) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.getFlows();
  }

  @Get(':flowId/board')
  async getKanbanBoard(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.getKanbanBoard(flowId);
  }

  @Get('filter/items')
  @ApiOperation({ summary: 'Filtra itens com base nos critérios fornecidos' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({
    name: 'dateType',
    required: false,
    enum: ['productionStartedAt', 'dueDate'],
  })
  @ApiQuery({ name: 'isOverdue', required: false, type: Boolean })
  @ApiQuery({ name: 'isUpcoming', required: false, type: Boolean })
  @ApiQuery({ name: 'assignedToId', required: false, type: String })
  @ApiQuery({ name: 'supplierId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'productRef', required: false, type: String })
  async filterItems(@Req() req: any, @Query() query: FlowFilterDto) {
    this.logger.log(`Filtrando itens`);
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.getFilteredItems(query);
  }

  @Get(':flowId/filtered-board')
  @ApiOperation({
    summary: 'Retorna o Kanban board com filtros aplicados',
    description:
      'Filtra o kanban por nome da coluna, datas, responsável, fornecedor, status e referência do produto',
  })
  @ApiQuery({
    name: 'stageName',
    required: false,
    type: String,
    description:
      'Filtrar por nome da coluna (ex: "Corte", "Costura", "Pintura")',
    example: 'Corte',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Data inicial para filtro (formato: YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Data final para filtro (formato: YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @ApiQuery({
    name: 'dateType',
    required: false,
    enum: DateFilterType,
    description:
      'Tipo de data para filtro: productionStartedAt (início) ou dueDate (prazo)',
    example: DateFilterType.DUE_DATE,
  })
  @ApiQuery({
    name: 'isOverdue',
    required: false,
    type: Boolean,
    description: 'Filtrar itens atrasados (true/false)',
    example: true,
  })
  @ApiQuery({
    name: 'isUpcoming',
    required: false,
    type: Boolean,
    description: 'Filtrar itens com produção programada para hoje (true/false)',
    example: false,
  })
  @ApiQuery({
    name: 'assignedToId',
    required: false,
    type: String,
    description: 'Filtrar por ID do responsável (funcionário)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    type: String,
    description:
      'Filtrar por ID do fornecedor/oficina (use "internal" para itens internos)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filtrar por status do item',
    enum: ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'],
    example: 'PENDENTE',
  })
  @ApiQuery({
    name: 'productRef',
    required: false,
    type: String,
    description: 'Filtrar por referência do produto (busca parcial)',
    example: 'MESA-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Board filtrado retornado com sucesso',
    schema: {
      example: {
        id: 'flow-id',
        name: 'Produção de Móveis',
        stages: [
          {
            id: 'stage-id',
            name: 'Corte',
            color: '#FF0000',
            items: [
              {
                id: 'item-id',
                title: 'Mesa de Jantar',
                status: 'PENDENTE',
                quantity: 10,
                assignedTo: { id: 'user-id', name: 'João Silva' },
              },
            ],
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Fluxo não encontrado ou parâmetros inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado',
  })
  @ApiResponse({
    status: 403,
    description: 'Acesso negado',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  async getFilteredBoard(
    @Req() req: any,
    @Param(
      'flowId',
      new ParseUUIDPipe({
        version: '4',
        errorHttpStatusCode: 400,
        exceptionFactory: (error) => {
          return new BadRequestException(
            'ID do fluxo inválido. Formato UUID esperado.',
          );
        },
      }),
    )
    flowId: string,
    @Query() query: FlowFilterDto,
  ) {
    console.log('🔍 QUERY RECEBIDA:', JSON.stringify(query));
    console.log('🔍 STAGE NAME:', query.stageName);
    console.log('🔍 RAW QUERY:', req.query);

    this.logger.log(`🎯 Buscando board filtrado para flow ${flowId}`);
    this.logger.debug(`📊 Filtros aplicados: ${JSON.stringify(query)}`);

    // Validação adicional para datas se vierem preenchidas
    if (query.startDate) {
      const isValidDate = !isNaN(Date.parse(query.startDate));
      if (!isValidDate) {
        throw new BadRequestException(
          'Data inicial inválida. Use o formato YYYY-MM-DD',
        );
      }
    }

    if (query.endDate) {
      const isValidDate = !isNaN(Date.parse(query.endDate));
      if (!isValidDate) {
        throw new BadRequestException(
          'Data final inválida. Use o formato YYYY-MM-DD',
        );
      }
    }

    // Validação de intervalo de datas
    if (query.startDate && query.endDate) {
      const start = new Date(query.startDate);
      const end = new Date(query.endDate);
      if (start > end) {
        throw new BadRequestException(
          'Data inicial não pode ser maior que a data final',
        );
      }
    }

    // Log específico quando filtrar por stageName
    if (query.stageName) {
      this.logger.log(
        `🔍 Aplicando filtro por nome da coluna: "${query.stageName}"`,
      );
    }

    try {
      const result = await this.flowService.getFilteredKanbanBoard(
        flowId,
        query,
      );

      this.logger.log(
        `✅ Board filtrado retornado com sucesso para flow ${flowId}`,
      );
      if (query.stageName) {
        const stagesCount = result.stages?.length || 0;
        this.logger.log(
          `📌 Encontradas ${stagesCount} coluna(s) com o nome "${query.stageName}"`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`❌ Erro ao filtrar board: ${error.message}`);
      throw error;
    }
  }
  @Post('items') // 🔥 MUDOU DE ':flowId/items' para 'items'
  async createItem(@Req() req: any, @Body() body: CreateFlowItemDto) {
    // 🔥 VALIDAÇÃO EXTRA
    if (!body.flowId) {
      throw new BadRequestException('flowId é obrigatório');
    }
    return this.flowService.createFlowItem(body.flowId, req.user.id, body);
  }

  @Post(':flowId/items/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async createItemWithUpload(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let dto: CreateFlowItemDto;
    try {
      dto = typeof body.data === 'string' ? JSON.parse(body.data) : body;
    } catch (e) {
      dto = body;
    }
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.createFlowItem(flowId, req.user.id, dto);
  }

  @Put('items/:itemId')
  async updateItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateFlowItemDto,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.updateFlowItem(itemId, req.user.id, body);
  }

  @Put('items/:itemId/move')
  @ApiOperation({ summary: 'Move item entre colunas (Drag & Drop)' })
  async moveItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body()
    body: { newStageId: string; assignedToId?: string; supplierId?: string },
    @Req() req: any,
  ) {
    return this.flowService.moveItem(
      itemId,
      body.newStageId,
      req.user.id,
      undefined, // newOrder
      body.assignedToId, // responsável funcionário
      body.supplierId, // responsável oficina
    );
  }

  @Post('items/:itemId/advance')
  @ApiOperation({
    summary: 'Automação: Move o card para a próxima coluna da esteira',
  })
  async advanceItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: any,
  ) {
    return this.flowService.advanceItemToNextStage(itemId, req.user.id);
  }

  @Delete('items/:itemId')
  async deleteItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.deleteItem(itemId, req.user.id);
  }

  @Post('items/:itemId/media/:type')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!['image', 'audio', 'video'].includes(type)) {
      throw new BadRequestException('Tipo inválido. Use: image, audio, video');
    }
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.addMediaToItem(
      itemId,
      file,
      type as any,
      req.user.id,
    );
  }

  @Delete('items/:itemId/media/:type/:mediaId')
  async deleteMedia(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('type') type: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    // 🔥 REMOVIDO: req.user.companyId
    return this.flowService.deleteMedia(
      itemId,
      type as any,
      mediaId,
      req.user.id,
    );
  }

  @Get(':flowId/stages')
  @ApiOperation({ summary: 'Lista todas as colunas/stages de um fluxo' })
  async getFlowStages(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    this.logger.log(`Buscando stages do flow ${flowId}`);
    return this.flowService.getFlowStages(flowId);
  }

  @Get(':flowId/board/by-stage')
  @ApiOperation({
    summary: 'Retorna o Kanban board filtrado por nome da coluna',
  })
  @ApiQuery({
    name: 'stageName',
    required: true,
    description: 'Nome da coluna para filtrar (ex: "Corte", "Costura")',
  })
  async getKanbanBoardByStageName(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Query('stageName') stageName: string,
  ) {
    this.logger.log(
      `Buscando board filtrado por stage: "${stageName}" para flow ${flowId}`,
    );

    if (!stageName || stageName.trim() === '') {
      throw new BadRequestException(
        'O nome da coluna (stageName) é obrigatório',
      );
    }

    return this.flowService.getKanbanBoardByStageName(flowId, stageName);
  }
}

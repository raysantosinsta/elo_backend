/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
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
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
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
  UpdateItemStageDeadlineDto,
  BulkUpdateItemStagesDto,
  MoveItemWithDeadlineDto,
  RecalculateDeadlinesDto,
  DeadlineDashboardQueryDto,
} from './dto/create-flow.dto';
import { FlowService } from './flow.service';
import { Public } from 'src/auth/public.decorator';

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
    return await this.flowService.getFilteredItemsByFlow(flowId, query);
  }

  // ===========================================================================
  // 🟢 GERENCIAMENTO DE TEMPLATES
  // ===========================================================================

  @Get('templates')
  @ApiOperation({ summary: 'Lista todos os templates de etapas da empresa' })
  async getTemplates(@Req() req: any) {
    this.logger.log(`Chamada GET /flow/templates`);
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
    return this.flowService.createStage(flowId, body, req.user.id);
  }

  @Put('stages/:stageId')
  @ApiOperation({ summary: 'Atualiza uma etapa existente' })
  async updateStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() body: Partial<CreateStageDto>,
  ) {
    return this.flowService.updateStage(stageId, body, req.user.id);
  }

  @Delete('stages/:stageId')
  async deleteStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.flowService.deleteStage(stageId, req.user.id);
  }

  // ===========================================================================
  // 3️⃣ GERENCIAMENTO DE ITENS E LEITURA
  // ===========================================================================

  @Get()
  async getFlows(@Req() req: any) {
    return this.flowService.getFlows();
  }

  @Get(':flowId/board')
  async getKanbanBoard(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
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
    } catch (error: any) {
      this.logger.error(`❌ Erro ao filtrar board: ${error.message}`);
      throw error;
    }
  }

  // ===========================================================================
  // 🔥 NOVOS ENDPOINTS PARA GESTÃO DE PRAZOS POR ETAPA (COM FEEDBACK)
  // ===========================================================================

  /**
   * Criar item com prazos por etapa (versão completa)
   */
  @Post('items/with-stages')
  @ApiOperation({
    summary: 'Cria um novo item com prazos configurados para todas as etapas',
    description:
      'Cria o item e automaticamente gera registros de prazo para cada etapa do fluxo',
  })
  async createItemWithStages(@Req() req: any, @Body() body: CreateFlowItemDto) {
    if (!body.flowId) {
      throw new BadRequestException('flowId é obrigatório');
    }
    this.logger.log(
      `🎯 Criando item com prazos por etapa no fluxo ${body.flowId}`,
    );
    return this.flowService.createFlowItemWithStages(
      body.flowId,
      req.user.id,
      body,
    );
  }

  /**
   * Buscar histórico completo de prazos de um item
   */
  @Get('items/:itemId/stages')
  @ApiOperation({
    summary: 'Busca histórico de prazos de um item por etapa',
    description: 'Retorna todos os prazos configurados para cada etapa do item',
  })
  async getItemStages(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    this.logger.log(`📋 Buscando histórico de prazos do item ${itemId}`);
    return this.flowService.getItemStages(itemId);
  }

  /**
   * Atualização em massa de prazos por etapa (COM CASCATA AUTOMÁTICA)
   * 🔥 ESTA ROTA VEM ANTES DE /:stageId
   */
  @Patch('items/:itemId/stages/bulk')
  @ApiOperation({
    summary: 'Atualiza múltiplos prazos de etapas de um item',
    description:
      'Permite atualizar vários prazos de uma vez e aplica cascata automaticamente',
  })
  @ApiResponse({
    status: 200,
    description: 'Prazos atualizados com sucesso',
    schema: {
      example: {
        message: '1 atualizações realizadas com sucesso',
        results: [],
        success: true,
        updatedStages: [
          {
            id: 'stage-id-1',
            stageId: 'stage-id-1',
            suggestedDeadline: '2026-03-25T00:00:00.000Z',
            deadline: '2026-03-25T00:00:00.000Z',
            status: 'PENDENTE',
            stage: {
              id: 'stage-id-1',
              name: 'Corte',
              color: '#FF0000',
              order: 3,
            },
          },
        ],
        cascade: {
          applied: true,
          fromStageId: 'stage-id-1',
          updatedStages: [
            {
              stageId: 'stage-id-2',
              stageName: 'Costura',
              oldDeadline: '2026-03-26T00:00:00.000Z',
              newDeadline: '2026-03-27T00:00:00.000Z',
            },
          ],
        },
      },
    },
  })
  async bulkUpdateItemStages(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body()
    bulkUpdateDto: {
      updates: Array<{
        stageId: string;
        suggestedDeadline?: string;
        actualDeadline?: string;
        status?: string;
        notes?: string;
      }>;
    },
  ) {
    this.logger.log(
      `📦 Atualizando ${bulkUpdateDto.updates.length} prazos do item ${itemId}`,
    );

    if (!bulkUpdateDto.updates || bulkUpdateDto.updates.length === 0) {
      throw new BadRequestException('Nenhuma atualização fornecida');
    }

    const result = await this.flowService.bulkUpdateItemStages(
      itemId,
      bulkUpdateDto.updates,
      req.user.id,
      req.user.companyId,
    );

    // ✅ Retorna os stages atualizados na resposta
    return {
      ...result,
      updatedStages: result.updatedStages,
    };
  }

  /**
   * Atualizar prazo de uma etapa específica (COM CASCATA AUTOMÁTICA)
   * 🔥 ESTA ROTA VEM DEPOIS DE /bulk
   */
  @Patch('items/:itemId/stages/:stageId')
  async updateItemStageDeadline(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() dto: UpdateItemStageDeadlineDto,
  ) {
    this.logger.log(
      `🔄 Atualizando prazo da etapa ${stageId} do item ${itemId}`,
    );
    return this.flowService.updateItemStageDeadline(
      itemId,
      stageId,
      dto,
      req.user.id,
    );
  }

  @Get('items/:itemId')
  @ApiOperation({ summary: 'Busca um item específico' })
  async getItemById(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    this.logger.log(`🔍 Buscando item ${itemId}`);
    return this.flowService.getItemById(itemId);
  }

  /**
   * Mover item com atualização automática de prazos
   */
  @Post('items/:itemId/move-with-deadline')
  @ApiOperation({
    summary: 'Move item entre colunas e atualiza prazos automaticamente',
    description:
      'Move o item, marca etapa anterior como concluída e atualiza dueDate com prazo da nova etapa',
  })
  async moveItemWithDeadline(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: MoveItemWithDeadlineDto,
  ) {
    this.logger.log(`🎯 Movendo item ${itemId} com atualização de prazo`);
    return this.flowService.moveItemWithDeadline(itemId, dto, req.user.id);
  }

  /**
   * Dashboard de prazos
   */
  @Get('deadline-dashboard')
  @ApiOperation({
    summary: 'Dashboard completo de prazos',
    description: 'Retorna estatísticas e timeline de prazos para análise',
  })
  @ApiQuery({
    name: 'flowId',
    required: false,
    type: String,
    description: 'Filtrar por fluxo específico',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['today', 'week', 'month', 'all'],
    description: 'Período para análise (padrão: week)',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard retornado com sucesso',
    type: Object,
  })
  @ApiResponse({
    status: 400,
    description: 'Parâmetros inválidos',
  })
  async getDeadlineDashboard(
    @Req() req: any,
    @Query() query: DeadlineDashboardQueryDto,
  ) {
    this.logger.log(
      `📊 Buscando dashboard de prazos - flowId: ${query.flowId}, period: ${query.period}`,
    );

    // Validação adicional se necessário
    if (
      query.period &&
      !['today', 'week', 'month', 'all'].includes(query.period)
    ) {
      throw new BadRequestException(
        'Período inválido. Use: today, week, month, all',
      );
    }

    if (query.flowId) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(query.flowId)) {
        throw new BadRequestException('ID do fluxo inválido');
      }
    }

    return this.flowService.getDeadlineDashboard(query);
  }

  /**
   * Recalcular prazos de um item (manual)
   */
  @Post('items/:itemId/recalculate-deadlines')
  @ApiOperation({
    summary: 'Recalcula os prazos de um item baseado no prazo final atual',
    description:
      'Redistribui os prazos das etapas restantes proporcionalmente ao prazo final',
  })
  async recalculateItemDeadlines(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    this.logger.log(`🧮 Recalculando prazos do item ${itemId}`);
    return this.flowService.recalculateItemDeadlines(itemId, req.user.id);
  }

  /**
   * Recalcular prazos de múltiplos itens
   */
  @Post('items/recalculate-deadlines/bulk')
  @ApiOperation({
    summary: 'Recalcula prazos de múltiplos itens',
    description: 'Permite recalcular prazos de vários itens de uma vez',
  })
  async bulkRecalculateDeadlines(
    @Req() req: any,
    @Body() dto: RecalculateDeadlinesDto,
  ) {
    this.logger.log(`🧮 Recalculando prazos em lote`);

    if (dto.allItems === 'true') {
      throw new BadRequestException(
        'Recálculo em massa ainda não implementado',
      );
    }

    if (!dto.itemIds || dto.itemIds.length === 0) {
      throw new BadRequestException('Nenhum item especificado para recálculo');
    }

    const results: Array<{
      itemId: string;
      success: boolean;
      result?: any;
      error?: string;
    }> = [];

    for (const itemId of dto.itemIds) {
      try {
        const result = await this.flowService.recalculateItemDeadlines(
          itemId,
          req.user.id,
        );
        results.push({
          itemId,
          success: true,
          result,
        });
      } catch (error: any) {
        results.push({
          itemId,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      total: dto.itemIds.length,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  // ===========================================================================
  // ENDPOINTS EXISTENTES (MANTIDOS)
  // ===========================================================================

  @Post('items')
  @ApiOperation({ summary: 'Cria um novo item (versão simples)' })
  async createItem(@Req() req: any, @Body() body: CreateFlowItemDto) {
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
    // @UploadedFile() file?: Express.Multer.File,
    @UploadedFile() file?: any,

  ) {
    let dto: CreateFlowItemDto;
    try {
      dto = typeof body.data === 'string' ? JSON.parse(body.data) : body;
    } catch (e) {
      dto = body;
    }
    return this.flowService.createFlowItem(flowId, req.user.id, dto);
  }

  /**
   * Atualizar item (COM REDISTRIBUIÇÃO AUTOMÁTICA se dueDate for alterado)
   */
  @Put('items/:itemId')
  @ApiOperation({
    summary: 'Atualiza um item existente',
    description:
      'Se dueDate for alterado por admin, prazos das etapas são redistribuídos automaticamente',
  })
  @ApiResponse({
    status: 200,
    description: 'Item atualizado com feedback da redistribuição',
    schema: {
      example: {
        id: 'item-123',
        title: 'Vestido Floral',
        dueDate: '2024-12-11',
        message: '✅ Item atualizado com sucesso',
        redistribution: {
          message:
            '📊 Prazos das etapas redistribuídos automaticamente com base no novo prazo final',
          daysPerStage: 2,
          updatedStages: [
            {
              stageId: 'stage-costura',
              stageName: 'Costura',
              oldDeadline: '2024-12-06',
              newDeadline: '2024-12-07',
            },
          ],
        },
      },
    },
  })
  async updateItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateFlowItemDto,
  ) {
    this.logger.log(
      `📝 Atualizando item ${itemId} pelo usuário ${req.user.id}`,
    );
    return this.flowService.updateFlowItem(itemId, req.user.id, body);
  }

  @Put('items/:itemId/move')
  @ApiOperation({
    summary: 'Move item entre colunas (Drag & Drop) - versão original',
  })
  async moveItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body()
    body: {
      newStageId: string;
      assignedToId?: string;
      supplierId?: string;
      quantity?: number;
    },
    @Req() req: any,
  ) {
    return this.flowService.moveItem(
      itemId,
      body.newStageId,
      req.user.id,
      undefined,
      body.assignedToId,
      body.supplierId,
      body.quantity,
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
    return this.flowService.deleteItem(itemId, req.user.id);
  }

  @Post('items/:itemId/media/:type')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('type') type: string,
    // @UploadedFile() file: Express.Multer.File,
    @UploadedFile() file: any,
  ) {
    if (!['image', 'audio', 'video'].includes(type)) {
      throw new BadRequestException('Tipo inválido. Use: image, audio, video');
    }
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
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

  @Get('completed-items')
  @ApiOperation({
    summary: 'Lista itens concluídos para dashboard',
    description: 'Retorna itens com status CONCLUIDO com paginação',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número da página (padrão: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Itens por página (padrão: 10)',
  })
  @ApiQuery({
    name: 'flowId',
    required: false,
    type: String,
    description: 'Filtrar por ID do fluxo',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Data inicial (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Data final (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'productRef',
    required: false,
    type: String,
    description: 'Filtrar por referência do produto',
  })
  @ApiQuery({
    name: 'assignedToId',
    required: false,
    type: String,
    description: 'Filtrar por responsável',
  })
  @ApiQuery({
    name: 'supplierId',
    required: false,
    type: String,
    description: 'Filtrar por fornecedor',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    type: String,
    description: 'Período: today, week, month, year',
  })
  async getCompletedItems(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('flowId') flowId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('productRef') productRef?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('period') period?: string,
  ) {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 [CONTROLLER] getCompletedItems');
    console.log('='.repeat(80));
    console.log('📥 Query params recebidos:');
    console.log('   - page:', page);
    console.log('   - limit:', limit);
    console.log('   - flowId:', flowId);
    console.log('   - startDate:', startDate);
    console.log('   - endDate:', endDate);
    console.log('   - productRef:', productRef);
    console.log('   - assignedToId:', assignedToId);
    console.log('   - supplierId:', supplierId);
    console.log('   - period:', period);

    const options: any = {};

    // Paginação
    if (page) options.page = parseInt(page);
    if (limit) options.limit = parseInt(limit);

    // Filtros básicos
    if (flowId) options.flowId = flowId;
    if (productRef) options.productRef = productRef;
    if (assignedToId) options.assignedToId = assignedToId;
    if (supplierId) options.supplierId = supplierId;

    // 🔥 CONVERSÃO DO PERÍODO PARA DATAS
    if (period && !startDate && !endDate) {
      console.log('\n📅 CONVERTENDO PERÍODO:', period);
      const now = new Date();
      const todayUTC = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );

      switch (period) {
        case 'today':
          options.startDate = new Date(todayUTC);
          options.endDate = new Date(todayUTC);
          options.endDate.setUTCHours(23, 59, 59, 999);
          console.log(
            `   Hoje: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`,
          );
          break;

        case 'week':
          options.startDate = new Date(todayUTC);
          options.startDate.setUTCDate(todayUTC.getUTCDate() - 7);
          options.endDate = new Date(todayUTC);
          options.endDate.setUTCHours(23, 59, 59, 999);
          console.log(
            `   Últimos 7 dias: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`,
          );
          break;

        case 'month':
          options.startDate = new Date(todayUTC);
          options.startDate.setUTCMonth(todayUTC.getUTCMonth() - 1);
          options.endDate = new Date(todayUTC);
          options.endDate.setUTCHours(23, 59, 59, 999);
          console.log(
            `   Último mês: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`,
          );
          break;

        case 'year':
          options.startDate = new Date(todayUTC);
          options.startDate.setUTCFullYear(todayUTC.getUTCFullYear() - 1);
          options.endDate = new Date(todayUTC);
          options.endDate.setUTCHours(23, 59, 59, 999);
          console.log(
            `   Último ano: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`,
          );
          break;

        default:
          console.log(`   ⚠️ Período não reconhecido: ${period}, ignorando`);
      }
    }

    // 🔥 DATAS EXPLÍCITAS SOBRESCREVEM O PERÍODO
    if (startDate) {
      console.log('\n📅 USANDO START_DATE DIRETO:', startDate);
      const date = new Date(startDate);
      date.setUTCHours(0, 0, 0, 0);
      options.startDate = date;
      console.log(`   Convertido para: ${options.startDate.toISOString()}`);
    }

    if (endDate) {
      console.log('📅 USANDO END_DATE DIRETO:', endDate);
      const date = new Date(endDate);
      date.setUTCHours(23, 59, 59, 999);
      options.endDate = date;
      console.log(`   Convertido para: ${options.endDate.toISOString()}`);
    }

    // 🔥 LOG DAS DATAS FINAIS
    console.log('\n📅 DATAS FINAIS PARA FILTRO:');
    console.log(
      `   startDate: ${options.startDate ? options.startDate.toISOString() : 'NÃO DEFINIDO'}`,
    );
    console.log(
      `   endDate: ${options.endDate ? options.endDate.toISOString() : 'NÃO DEFINIDO'}`,
    );

    console.log(
      '\n📦 Options finais enviadas para service:',
      JSON.stringify(options, null, 2),
    );

    try {
      const result = await this.flowService.getCompletedItems(options);

      console.log('\n📤 Resposta do service:');
      console.log(`   - dataLength: ${result.data.length}`);
      console.log(`   - total: ${result.total}`);
      console.log(`   - pages: ${result.pages}`);
      console.log(`   - currentPage: ${result.currentPage}`);
      console.log('='.repeat(80) + '\n');

      return result;
    } catch (error: any) {
      console.error('\n❌ ERRO AO BUSCAR ITENS CONCLUÍDOS:');
      console.error('   - Message:', error.message);
      console.error('   - Stack:', error.stack);
      console.log('='.repeat(80) + '\n');
      throw error;
    }
  }

  @Get('completed-items/stats')
  @ApiOperation({
    summary: 'Estatísticas de itens concluídos',
    description: 'Retorna estatísticas agregadas para o dashboard',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['today', 'week', 'month', 'year'],
    description: 'Período para análise (padrão: week)',
  })
  @ApiQuery({
    name: 'flowId',
    required: false,
    type: String,
    description: 'Filtrar por ID do fluxo específico',
  })
  async getCompletionStats(
    @Req() req: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'year',
    @Query('flowId') flowId?: string,
  ) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 [CONTROLLER] getCompletionStats');
    console.log('='.repeat(80));
    console.log('📥 Parâmetros recebidos:');
    console.log('   - period:', period);
    console.log('   - flowId:', flowId);

    // Validação do flowId se for fornecido
    if (flowId) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(flowId)) {
        throw new BadRequestException('ID do fluxo inválido');
      }
    }

    this.logger.log(
      `📊 [CONTROLLER] Buscando estatísticas de conclusão - período: ${period || 'week'}, fluxo: ${flowId || 'todos'}`,
    );

    const result = await this.flowService.getCompletionStats(
      period || 'week',
      flowId,
    );

    console.log('📤 Resposta das estatísticas:');
    console.log('   - total:', result.total);
    console.log('   - por fluxo:', Object.keys(result.byFlow).length);
    console.log(
      '   - por responsável:',
      Object.keys(result.byResponsible).length,
    );
    console.log('='.repeat(80) + '\n');

    return result;
  }

  @Get('completed-items/:itemId')
  @ApiOperation({ summary: 'Busca um item concluído específico' })
  async getCompletedItemById(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    this.logger.log(`📊 [CONTROLLER] Buscando item concluído ${itemId}`);

    const result = await this.flowService.getCompletedItems({
      limit: 1,
    });

    const item = result.data.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    return item;
  }
  @Public()
  @Post('test-overdue-notification')
  @HttpCode(HttpStatus.OK)
  async testOverdueNotification() {
    this.logger.log('📱 Teste manual de notificação de atrasados iniciado');
    await this.flowService.checkOverdueItemsAndNotify();
    return { 
      success: true, 
      message: 'Verificação de itens atrasados executada manualmente',
      timestamp: new Date().toISOString()
    };
  }
}

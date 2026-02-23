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
  FlowFilterDto,
} from './dto/create-flow.dto';
import { FlowService } from './flow.service';

@ApiTags('Product Flow (Kanban)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('flow')
export class FlowController {
  private readonly logger = new Logger(FlowController.name);

  constructor(private readonly flowService: FlowService) {}

  @Get(':flowId/filter/items')
  @ApiOperation({ summary: 'Filtra itens de um fluxo específico' })
  async filterItemsByFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Query() query: FlowFilterDto,
  ) {
    this.logger.log(
      `Filtrando itens do fluxo ${flowId} para empresa ${req.user.companyId}`,
    );
    return await this.flowService.getFilteredItemsByFlow(
      req.user.companyId,
      flowId,
      query,
    );
  }

  // ===========================================================================
  // 🟢 GERENCIAMENTO DE TEMPLATES
  // ===========================================================================

  @Get('templates')
  @ApiOperation({ summary: 'Lista todos os templates de etapas da empresa' })
  async getTemplates(@Req() req: any) {
    this.logger.log(
      `Chamada GET /flow/templates - Empresa: ${req.user.companyId}`,
    );
    return this.flowService.getTemplates(req.user.companyId);
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

    return this.flowService.saveTemplate(req.user.companyId, flowId, name);
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
    return this.flowService.applyTemplate(
      req.user.companyId,
      flowId,
      templateId,
    );
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
    return this.flowService.deleteTemplate(req.user.companyId, templateId);
  }

  // ===========================================================================
  // 1️⃣ GERENCIAMENTO DE FLUXO
  // ===========================================================================

  @Post()
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Cria um novo fluxo de produção' })
  async createFlow(@Req() req: any, @Body() body: CreateFlowDto) {
    this.logger.log(
      `Criando fluxo na empresa ${req.user.companyId} pelo usuário ${req.user.id}`,
    );
    return this.flowService.createFlow(req.user.companyId, req.user.id, body);
  }

  // No FlowController
@Put(':flowId')
@RequirePermissions(AppPermission.MANAGE_FLOW)
@ApiOperation({ summary: 'Atualiza um fluxo existente' })
async updateFlow(
  @Req() req: any,
  @Param('flowId', ParseUUIDPipe) flowId: string,
  @Body() body: { name?: string; color?: string; deadline?: string | null }
) {
  this.logger.log(`Atualizando fluxo ${flowId} na empresa ${req.user.companyId}`);
  
  // Converter deadline para Date se existir
  let deadline: Date | null = null;
  if (body.deadline) {
    deadline = new Date(body.deadline);
  }

  return this.flowService.updateFlow(req.user.companyId, flowId, {
    name: body.name,
    color: body.color,
    deadline,
  });
}

  @Delete(':flowId')
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Deleta um fluxo inteiro' })
  async deleteFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    return this.flowService.deleteFlow(flowId, req.user.companyId);
  }

  // ===========================================================================
  // 2️⃣ GERENCIAMENTO DE ETAPAS / STAGES
  // ===========================================================================

  @Post(':flowId/stages')
  @ApiOperation({ summary: 'Adiciona uma nova etapa ao fluxo' })
  async createStage(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: CreateStageDto, // 🔥 Agora usa o DTO completo
  ) {
    return this.flowService.createStage(
      req.user.companyId,
      flowId,
      body, // 🔥 Passa o objeto body inteiro, não campos soltos
    );
  }

  @Put('stages/:stageId')
  @ApiOperation({ summary: 'Atualiza uma etapa existente' })
  async updateStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() body: Partial<CreateStageDto>, // 🔥 Usa Partial do DTO para tipagem
  ) {
    return this.flowService.updateStage(req.user.companyId, stageId, body);
  }

  @Delete('stages/:stageId')
  async deleteStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.flowService.deleteStage(stageId, req.user.companyId);
  }

  // ===========================================================================
  // 3️⃣ GERENCIAMENTO DE ITENS E LEITURA
  // ===========================================================================

  @Get()
  async getFlows(@Req() req: any) {
    return this.flowService.getFlows(req.user.companyId);
  }

  @Get(':flowId/board')
  async getKanbanBoard(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    return this.flowService.getKanbanBoard(flowId, req.user.companyId);
  }

  /**
   * Endpoint para filtrar itens globalmente
   */
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
  @ApiQuery({ name: 'productRef', required: false, type: String }) // 🔥 NOVO
  async filterItems(@Req() req: any, @Query() query: FlowFilterDto) {
    this.logger.log(`Filtrando itens para empresa ${req.user.companyId}`);
    return this.flowService.getFilteredItems(req.user.companyId, query);
  }

  /**
   * Endpoint para obter board com filtros aplicados
   */
  @Get(':flowId/filtered-board')
  @ApiOperation({ summary: 'Retorna o Kanban board com filtros aplicados' })
  async getFilteredBoard(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Query() query: FlowFilterDto,
  ) {
    this.logger.log(`Buscando board filtrado para flow ${flowId}`);
    return this.flowService.getFilteredKanbanBoard(
      flowId,
      req.user.companyId,
      query,
    );
  }

  @Post(':flowId/items')
  async createItem(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: CreateFlowItemDto,
  ) {
    return this.flowService.createFlowItem(
      req.user.companyId,
      flowId,
      req.user.id,
      body,
    );
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
    return this.flowService.createFlowItem(
      req.user.companyId,
      flowId,
      req.user.id,
      dto,
    );
  }

  @Put('items/:itemId')
  async updateItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: any,
  ) {
    return this.flowService.updateFlowItem(
      req.user.companyId,
      itemId,
      req.user.id,
      body,
    );
  }

  // ✅ Rota de Mover (Drag & Drop)
  @Put('items/:itemId/move')
  @ApiOperation({ summary: 'Move item entre colunas (Drag & Drop)' })
  async moveItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { newStageId: string },
    @Req() req: any,
  ) {
    return this.flowService.moveItem(itemId, body.newStageId, req.user.id);
  }

  // ✅ Rota de Avançar (Botão Automático)
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
    return this.flowService.deleteItem(itemId, req.user.companyId);
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
    return this.flowService.addMediaToItem(
      req.user.companyId,
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
      req.user.companyId,
      itemId,
      type as any,
      mediaId,
    );
  }
}

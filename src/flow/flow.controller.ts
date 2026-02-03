/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Logger,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiConsumes,
} from '@nestjs/swagger';

// --- Guards e Segurança ---
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  RequirePermissions,
  AppPermission,
} from '../auth/permissions.decorator';

// --- Services e DTOs ---
import { FlowService } from './flow.service';
import {
  CreateFlowDto,
  CreateFlowItemDto,
  FlowFilterDto,
} from './dto/create-flow.dto';

@ApiTags('Product Flow (Kanban)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('flow')
export class FlowController {
  private readonly logger = new Logger(FlowController.name);

  constructor(private readonly flowService: FlowService) {}

  // ===========================================================================
  // 🟢 GERENCIAMENTO DE TEMPLATES (Rotas Estáticas Primeiro)
  // ===========================================================================

  @Get('templates')
  @ApiOperation({ summary: 'Lista todos os templates de etapas da empresa' })
  async getTemplates(@Req() req: any) {
    this.logger.log(`Chamada GET /flow/templates - Empresa: ${req.user.companyId}`);
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
    this.logger.log(`Chamada POST /flow/${flowId}/save-template - User: ${req.user.id}`);
    
    if (!name) {
      this.logger.warn(`Tentativa de salvar template sem nome - FlowID: ${flowId}`);
      throw new BadRequestException('O nome do template é obrigatório');
    }

    return this.flowService.saveTemplate(req.user.companyId, flowId, name);
  }

  @Post(':flowId/apply-template/:templateId')
  @RequirePermissions(AppPermission.MANAGE_STAGE)
  @ApiOperation({ summary: 'Aplica um template de etapas a um fluxo' })
  async applyTemplate(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    this.logger.log(`Chamada POST /flow/${flowId}/apply-template/${templateId}`);
    return this.flowService.applyTemplate(req.user.companyId, flowId, templateId);
  }

  // ===========================================================================
  // 1️⃣ GERENCIAMENTO DE FLUXO
  // ===========================================================================

  @Post()
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Cria um novo fluxo de produção' })
  async createFlow(@Req() req: any, @Body() body: CreateFlowDto) {
    this.logger.log(`Criando fluxo na empresa ${req.user.companyId} pelo usuário ${req.user.id}`);
    return this.flowService.createFlow(req.user.companyId, req.user.id, body);
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
  @RequirePermissions(AppPermission.MANAGE_STAGE)
  @ApiOperation({ summary: 'Adiciona uma nova etapa ao fluxo' })
  async createStage(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: { name: string; color?: string },
  ) {
    return this.flowService.createStage(req.user.companyId, flowId, body.name, body.color);
  }

  @Put('stages/:stageId')
  @RequirePermissions(AppPermission.MANAGE_STAGE)
  async updateStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() body: { name?: string; color?: string; order?: number },
  ) {
    return this.flowService.updateStage(req.user.companyId, stageId, body);
  }

  @Delete('stages/:stageId')
  @RequirePermissions(AppPermission.MANAGE_STAGE)
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

  @Get('filter/items')
  async filterItems(@Req() req: any, @Query() query: FlowFilterDto) {
    return this.flowService.getFilteredItems(req.user.companyId, query);
  }

  @Post(':flowId/items')
  async createItem(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: CreateFlowItemDto,
  ) {
    return this.flowService.createFlowItem(req.user.companyId, flowId, req.user.id, body);
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
    return this.flowService.createFlowItem(req.user.companyId, flowId, req.user.id, dto);
  }

  @Put('items/:itemId')
  async updateItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: any,
  ) {
    return this.flowService.updateFlowItem(req.user.companyId, itemId, req.user.id, body);
  }

  @Put('items/:itemId/move')
  async moveItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { newStageId: string },
  ) {
    return this.flowService.moveItem(itemId, body.newStageId, req.user.id);
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
    return this.flowService.addMediaToItem(req.user.companyId, itemId, file, type as any, req.user.id);
  }

  @Delete('items/:itemId/media/:type/:mediaId')
  async deleteMedia(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('type') type: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.flowService.deleteMedia(req.user.companyId, itemId, type as any, mediaId);
  }

  // flow.controller.ts

  @Delete('templates/:templateId')
  @RequirePermissions(AppPermission.MANAGE_FLOW)
  @ApiOperation({ summary: 'Exclui um template de etapas' })
  async deleteTemplate(
    @Req() req: any,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    this.logger.log(`Chamada DELETE /flow/templates/${templateId} - User: ${req.user.id}`);
    return this.flowService.deleteTemplate(req.user.companyId, templateId);
  }
}
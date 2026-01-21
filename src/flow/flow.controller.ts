/* eslint-disable prettier/prettier */
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
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';

// --- Guards e Segurança ---
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions, AppPermission } from '../auth/permissions.decorator';

// --- Services e DTOs ---
import { FlowService } from './flow.service';
import { CreateFlowDto, CreateFlowItemDto, FlowFilterDto } from './dto/create-flow.dto';

@ApiTags('Product Flow (Kanban)')
@ApiBearerAuth()
// 🔥 Ordem de Segurança: 1. Token Válido -> 2. Role Básica -> 3. Permissão Fina (Cargo)
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('flow')
export class FlowController {
  private readonly logger = new Logger(FlowController.name);

  constructor(private readonly flowService: FlowService) {}

  // ===========================================================================
  // 1️⃣ GERENCIAMENTO DE FLUXO (Restrito: "Gestor de Processos")
  // ===========================================================================

  @Post()
  @RequirePermissions(AppPermission.MANAGE_FLOW) // <--- Bloqueio por Permissão
  @ApiOperation({ summary: 'Cria um novo fluxo de produção (Restrito)' })
  async createFlow(@Req() req: any, @Body() body: CreateFlowDto) {
    this.logger.log(`Criando fluxo na empresa ${req.user.companyId} pelo usuário ${req.user.id}`);
    return this.flowService.createFlow(req.user.companyId, req.user.id, body);
  }

  @Delete(':flowId')
  @RequirePermissions(AppPermission.MANAGE_FLOW) // <--- Bloqueio por Permissão
  @ApiOperation({ summary: 'Deleta um fluxo inteiro (Restrito)' })
  async deleteFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    return this.flowService.deleteFlow(flowId, req.user.companyId);
  }

  // ===========================================================================
  // 2️⃣ GERENCIAMENTO DE ETAPAS / STAGES (Restrito: "Gestor de Processos")
  // ===========================================================================

  @Post(':flowId/stages')
  @RequirePermissions(AppPermission.MANAGE_STAGE) // <--- Bloqueio por Permissão
  @ApiOperation({ summary: 'Adiciona uma nova etapa ao fluxo (Restrito)' })
  async createStage(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: { name: string; color?: string },
  ) {
    return this.flowService.createStage(
      req.user.companyId,
      flowId,
      body.name,
      body.color,
    );
  }

  @Put('stages/:stageId')
  @RequirePermissions(AppPermission.MANAGE_STAGE) // <--- Bloqueio por Permissão
  @ApiOperation({ summary: 'Atualiza uma etapa existente (Restrito)' })
  async updateStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() body: { name?: string; color?: string; order?: number },
  ) {
    return this.flowService.updateStage(req.user.companyId, stageId, body);
  }

  @Delete('stages/:stageId')
  @RequirePermissions(AppPermission.MANAGE_STAGE) // <--- Bloqueio por Permissão
  @ApiOperation({ summary: 'Remove uma etapa e seus itens (Restrito)' })
  async deleteStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
  ) {
    return this.flowService.deleteStage(stageId, req.user.companyId);
  }

  // ===========================================================================
  // 3️⃣ GERENCIAMENTO DE ITENS E LEITURA (Aberto: Qualquer Usuário da Empresa)
  // Nota: Não usamos @RequirePermissions. A segurança de Tenant é feita pelo Prisma.
  // ===========================================================================

  @Get()
  @ApiOperation({ summary: 'Lista todos os fluxos da empresa' })
  async getFlows(@Req() req: any) {
    return this.flowService.getFlows(req.user.companyId);
  }

  @Get(':flowId/board')
  @ApiOperation({ summary: 'Carrega o quadro Kanban completo' })
  async getKanbanBoard(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    return this.flowService.getKanbanBoard(flowId, req.user.companyId);
  }

  @Get('filter/items')
  @ApiOperation({ summary: 'Filtra itens por data e terceirização' })
  async filterItems(@Req() req: any, @Query() query: FlowFilterDto) {
    return this.flowService.getFilteredItems(req.user.companyId, query);
  }

  @Post(':flowId/items')
  @ApiOperation({ summary: 'Cria um item no fluxo' })
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
  @ApiOperation({ summary: 'Cria item com upload inicial (Form Data)' })
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

    const item = await this.flowService.createFlowItem(
      req.user.companyId,
      flowId,
      req.user.id,
      dto,
    );

    // Lógica de upload separada se necessário, ou implementada no createFlowItem
    return item;
  }

  @Put('items/:itemId')
  @ApiOperation({ summary: 'Atualiza dados de um item' })
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

  @Put('items/:itemId/move')
  @ApiOperation({ summary: 'Move um item entre etapas' })
  async moveItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { newStageId: string },
  ) {
    return this.flowService.moveItem(itemId, body.newStageId, req.user.id);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove um item do fluxo' })
  async deleteItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.flowService.deleteItem(itemId, req.user.companyId);
  }

  // --- Gerenciamento de Mídia dos Itens (Aberto) ---

  @Post('items/:itemId/media/:type')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload de mídia para um item' })
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
      type as 'image' | 'audio' | 'video',
      req.user.id,
    );
  }

  @Delete('items/:itemId/media/:type/:mediaId')
  @ApiOperation({ summary: 'Remove uma mídia específica de um item' })
  async deleteMedia(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('type') type: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    if (!['image', 'audio', 'video'].includes(type)) {
      throw new BadRequestException('Tipo inválido');
    }

    return this.flowService.deleteMedia(
      req.user.companyId,
      itemId,
      type as 'image' | 'audio' | 'video',
      mediaId,
    );
  }
}
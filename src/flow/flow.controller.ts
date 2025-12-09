/* eslint-disable prettier/prettier */
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlowService } from './flow.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiConsumes,
} from '@nestjs/swagger';
import { CreateFlowDto, CreateFlowItemDto } from './dto/create-flow.dto';

@ApiTags('Product Flow (Kanban)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('flow')
export class FlowController {
  private readonly logger = new Logger(FlowController.name); // Logger para debug
  constructor(private readonly flowService: FlowService) { }

  @Post()
  @ApiOperation({ summary: 'Cria um novo fluxo de produção' })
  async createFlow(@Req() req: any, @Body() body: CreateFlowDto) {
    this.logger.log(`Recebido body para criar fluxo: ${JSON.stringify(body)}`);
    return this.flowService.createFlow(req.user.companyId, req.user.id, body);
  }

  @Get()
  async getFlows(@Req() req: any) {
    return this.flowService.getFlows(req.user.companyId);
  }

  // Adicione isso dentro da classe FlowController

  @Put('items/:itemId')
  @ApiOperation({ summary: 'Atualiza dados de um item (título, descrição, etc)' })
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

  @Get(':flowId/board')
  async getKanbanBoard(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    return this.flowService.getKanbanBoard(flowId, req.user.companyId);
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

  @Put('items/:itemId/move')
  async moveItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { newStageId: string },
  ) {
    return this.flowService.moveItem(itemId, body.newStageId, req.user.id);
  }

  @Delete(':flowId')
  async deleteFlow(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
  ) {
    return this.flowService.deleteFlow(flowId, req.user.companyId);
  }

  // Endpoint para Upload Multipart (Compatível com FormData do Frontend)
  @Post(':flowId/items/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async createItemWithUpload(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Body() body: any, // Body vem como string JSON dentro do FormData
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let dto: CreateFlowItemDto;
    try {
      dto = typeof body.data === 'string' ? JSON.parse(body.data) : body;
    } catch (e) {
      dto = body;
    }

    // 1. Cria o item
    const item = await this.flowService.createFlowItem(
      req.user.companyId,
      flowId,
      req.user.id,
      dto,
    );

    // 2. Upload (se houver)
    if (file) {
      // Lógica de upload separada no service (addMediaToItem)
      // ...
    }
    return item;
  }

  @Post(':flowId/stages')
  @ApiOperation({ summary: 'Adiciona uma nova etapa ao fluxo' })
  async createStage(
    @Req() req: any,
    @Param('flowId', ParseUUIDPipe) flowId: string,
    // ALTERAÇÃO: Adicionado 'color' ao Body
    @Body() body: { name: string; color?: string },
  ) {
    // ALTERAÇÃO: Passando a cor para o serviço
    return this.flowService.createStage(req.user.companyId, flowId, body.name, body.color);
  }

  @Put('stages/:stageId')
  @ApiOperation({ summary: 'Atualiza uma etapa existente' })
  async updateStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string,
    @Body() body: { name?: string; color?: string; order?: number },
  ) {
    return this.flowService.updateStage(req.user.companyId, stageId, body);
  }

  @Delete('stages/:stageId')
  @ApiOperation({ summary: 'Remove uma etapa e seus itens' })
  async deleteStage(
    @Req() req: any,
    @Param('stageId', ParseUUIDPipe) stageId: string
  ) {
    return this.flowService.deleteStage(stageId, req.user.companyId);
  }

  // ... outros imports e métodos ...

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove um item do fluxo' })
  async deleteItem(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string
  ) {
    // Passamos o ID do item e o ID da empresa para garantir segurança
    return this.flowService.deleteItem(itemId, req.user.companyId);
  }

  // ... imports existentes

  // Endpoint Específico para Upload de Mídia (Imagem, Áudio, Vídeo)
  // O Frontend chama: /flow/items/:itemId/media/:type
  @Post('items/:itemId/media/:type')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @Req() req: any,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    // Validação simples do tipo
    if (!['image', 'audio', 'video'].includes(type)) {
      throw new BadRequestException('Tipo de mídia inválido. Use image, audio ou video.');
    }

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    return this.flowService.addMediaToItem(
      req.user.companyId,
      itemId,
      file,
      type as 'image' | 'audio' | 'video',
      req.user.id
    );
  }
}

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
  Req,
  UploadedFiles
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlowService } from './flow.service';

@Controller('flow')
@UseGuards(JwtAuthGuard)
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  // ============ FLUXOS ============
  @Post()
  async createFlow(
    @Req() req: any,
    @Body() body: { name: string; description?: string }
  ) {
    const user = req.user;
    return this.flowService.createFlow(user.companyId, user.id, body);
  }

  @Get()
  async getFlows(@Req() req: any) {
    const user = req.user;
    return this.flowService.getFlows(user.companyId);
  }

  @Get(':flowId')
  async getFlow(
    @Req() req: any,
    @Param('flowId') flowId: string
  ) {
    const user = req.user;
    return this.flowService.getFlowById(flowId, user.companyId);
  }

  @Put(':flowId')
  async updateFlow(
    @Req() req: any,
    @Param('flowId') flowId: string,
    @Body() body: { name?: string; description?: string }
  ) {
    const user = req.user;
    return this.flowService.updateFlow(flowId, user.companyId, body);
  }

  @Delete(':flowId')
  async deleteFlow(
    @Req() req: any,
    @Param('flowId') flowId: string
  ) {
    const user = req.user;
    return this.flowService.deleteFlow(flowId, user.companyId);
  }

  // ============ ETAPAS ============
  @Post(':flowId/stages')
  async createStage(
    @Param('flowId') flowId: string,
    @Body() body: { name: string; color?: string; order?: number }
  ) {
    return this.flowService.createStage(flowId, body);
  }

  @Put('stages/:stageId')
  async updateStage(
    @Req() req: any,
    @Param('stageId') stageId: string,
    @Body() body: { name?: string; color?: string; order?: number }
  ) {
    const user = req.user;
    return this.flowService.updateStage(stageId, body);
  }

  @Delete('stages/:stageId')
  async deleteStage(
    @Req() req: any,
    @Param('stageId') stageId: string
  ) {
    const user = req.user;
    return this.flowService.deleteStage(stageId, user.companyId);
  }

  // ============ ITENS ============
  @Post(':flowId/items')
  async createFlowItem(
    @Req() req: any,
    @Param('flowId') flowId: string,
    @Body() body: {
      title: string;
      orderNumber?: string;
      productRef?: string;
      quantity?: number;
      priority?: number;
      dueDate?: Date;
      assignedToId?: string;
    }
  ) {
    const user = req.user;
    return this.flowService.createFlowItem(
      user.companyId,
      flowId,
      user.id,
      body
    );
  }

  @Get('items/:itemId')
  async getItem(
    @Req() req: any,
    @Param('itemId') itemId: string
  ) {
    const user = req.user;
    return this.flowService.getItemWithMedia(itemId, user.companyId);
  }

  @Put('items/:itemId')
  async updateFlowItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() body: {
      title?: string;
      orderNumber?: string;
      productRef?: string;
      quantity?: number;
      priority?: number;
      dueDate?: Date;
      assignedToId?: string;
      stageId?: string;
    }
  ) {
    const user = req.user;
    return this.flowService.updateFlowItem(itemId, user.companyId, body);
  }

  @Put('items/:itemId/move')
  async moveItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() body: { newStageId: string }
  ) {
    const user = req.user;
    return this.flowService.moveItem(itemId, body.newStageId, user.id);
  }

  @Delete('items/:itemId')
  async deleteFlowItem(
    @Req() req: any,
    @Param('itemId') itemId: string
  ) {
    const user = req.user;
    return this.flowService.deleteFlowItem(itemId, user.companyId);
  }

  // ============ MÍDIAS ============
  @Post('items/:itemId/media/:type')
  @UseInterceptors(FileInterceptor('file'))
  async addMediaToItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('type') type: 'image' | 'audio' | 'video',
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }) // 50MB
        ]
      })
    ) file: any
  ) {
    const user = req.user;
    return this.flowService.addMediaToItem(
      itemId,
      user.companyId,
      user.id,
      file,
      type
    );
  }

  @Delete('items/:itemId/media/:type/:mediaId')
  async removeMedia(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Param('type') type: 'image' | 'audio' | 'video',
    @Param('mediaId') mediaId: string
  ) {
    const user = req.user;
    return this.flowService.removeMedia(
      itemId,
      user.companyId,
      mediaId,
      type
    );
  }

  // ============ KANBAN BOARD ============
  @Get(':flowId/board')
  async getKanbanBoard(
    @Req() req: any,
    @Param('flowId') flowId: string
  ) {
    const user = req.user;
    return this.flowService.getKanbanBoard(flowId, user.companyId);
  }

  // ============ DASHBOARD ============
  @Get(':flowId/stats')
  async getFlowStats(
    @Req() req: any,
    @Param('flowId') flowId: string
  ) {
    const user = req.user;
    return this.flowService.getFlowStats(flowId, user.companyId);
  }

  // ============ BUSCAS ============
  @Get('items/search')
  async searchItems(
    @Req() req: any,
    @Query('flowId') flowId?: string,
    @Query('stageId') stageId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('search') search?: string
  ) {
    const user = req.user;
    return this.flowService.searchItems(
      user.companyId,
      flowId,
      stageId,
      assignedToId,
      search
    );
  }

  // ============ REORDENAÇÃO ============
  @Put('items/:itemId/reorder')
  async reorderItem(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() body: { newPosition: number; stageId?: string }
  ) {
    const user = req.user;
    return this.flowService.reorderItem(itemId, body.newPosition, body.stageId);
  }

  // ============ ATUALIZAÇÃO EM MASSA ============
  @Put('items/bulk-update')
  async bulkUpdateItems(
    @Req() req: any,
    @Body() body: {
      itemIds: string[];
      assignedToId?: string;
      priority?: number;
      stageId?: string;
    }
  ) {
    const user = req.user;
    return this.flowService.bulkUpdateItems(
      user.companyId,
      body.itemIds,
      {
        assignedToId: body.assignedToId,
        priority: body.priority,
        stageId: body.stageId
      }
    );
  }

  // ============ USUÁRIOS DA EMPRESA ============
  @Get('company/users')
  async getCompanyUsers(@Req() req: any) {
    const user = req.user;
    return this.flowService.getUsersByCompany(user.companyId);
  }

  @Post('items/:itemId/media-multiple/:type')
@UseInterceptors(FilesInterceptor('files', 10)) // Aceita até 10 arquivos
@UseGuards(JwtAuthGuard)
async addMultipleMediaToItem(
  @Req() req: any,
  @Param('itemId') itemId: string,
  @Param('type') type: 'image' | 'audio' | 'video',
  @UploadedFiles() files: any[]
) {
  const user = req.user;
  
  if (!files || files.length === 0) {
    throw new BadRequestException('Nenhum arquivo enviado');
  }

  return this.flowService.addMultipleMediaToItem(
    itemId,
    user.companyId,
    user.id,
    files,
    type
  );
}

  // NO FLOW CONTROLLER, ADICIONE ESTE ENDPOINT PARA MULTIPART/FORM-DATA
@Post(':flowId/items/upload')
@UseInterceptors(FileInterceptor('file'))
@UseGuards(JwtAuthGuard)
async createFlowItemWithFiles(
  @Req() req: any,
  @Param('flowId') flowId: string,
  @Body() body: any,
  @UploadedFile() file?: any
) {
  const user = req.user;
  
  // Parse o JSON que vem como string do FormData
  const itemData = JSON.parse(body.data || '{}');
  
  // Cria o item primeiro
  const flowItem = await this.flowService.createFlowItem(
    user.companyId,
    flowId,
    user.id,
    {
      title: itemData.title,
      orderNumber: itemData.orderNumber,
      productRef: itemData.productRef,
      quantity: itemData.quantity ? parseInt(itemData.quantity) : 1,
      priority: itemData.priority ? parseInt(itemData.priority) : 3,
      dueDate: itemData.dueDate ? new Date(itemData.dueDate) : undefined,
      assignedToId: itemData.assignedToId,
      description: itemData.description
    }
  );

  // Se houver arquivos, faz upload
  if (file) {
    const fileType = this.getFileType(file.mimetype);
    await this.flowService.addMediaToItem(
      flowItem.id,
      user.companyId,
      user.id,
      file,
      fileType
    );
  }

  // Se houver múltiplos arquivos (enviados como FormData fields)
  // Você precisaria de uma lógica mais complexa para múltiplos arquivos

  return flowItem;
}

private getFileType(mimetype: string): 'image' | 'audio' | 'video' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  throw new BadRequestException('Tipo de arquivo não suportado');
}
}
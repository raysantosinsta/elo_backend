/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Body, Controller, Get, Param, Post, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('chats')
@UseGuards(JwtAuthGuard) // 🔥 Proteger todos os endpoints do controller
export class ChatController {
  constructor(private service: ChatService) {}

  @Post()
  create(@Body() dto: CreateChatDto, @Req() req: Request) {
    // 🔥 Garantir que o usuário só pode criar chats para sua própria empresa
    const userCompanyId = (req.user as any).companyId;
    if (!userCompanyId || (dto.companyId && dto.companyId !== userCompanyId)) {
      throw new ForbiddenException('Você não pode criar chats para esta empresa.');
    }
    // Forçar o companyId correto
    const createDtoWithUserCompany = { ...dto, companyId: userCompanyId };
    return this.service.create(createDtoWithUserCompany);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    // 🔥 Passar o companyId do usuário para o service para validação
    const userCompanyId = (req.user as any).companyId;
    if (!userCompanyId) {
      throw new ForbiddenException('Usuário não associado a uma empresa.');
    }
    return this.service.findOne(id, userCompanyId);
  }

  // Novo endpoint: listar chats por companyId
  @Get()
  findAll(@Req() req: Request) {
    // 🔥 Usar o companyId do usuário autenticado, ignorando qualquer parâmetro da URL
    const userCompanyId = (req.user as any).companyId;
    return this.service.findAll(userCompanyId);
  }
}
/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'; // Ajuste o caminho se necessário

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
    companyId: string;
  };
}

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async create(
    @Body() createChatDto: CreateChatDto,
    @Req() req: RequestWithUser,
  ): Promise<ChatResponseDto> {
    const user = req.user;

    if (!user?.companyId) {
      throw new UnauthorizedException('Usuário sem empresa vinculada.');
    }

    // SEGURANÇA 1: Forçamos o companyId do usuário logado
    const secureDto = {
      ...createChatDto,
      companyId: user.companyId,
    };

    return this.chatService.create(secureDto);
  }

  @Get()
  async findAll(@Req() req: RequestWithUser): Promise<ChatResponseDto[]> {
    const user = req.user;

    if (!user?.companyId) {
      throw new UnauthorizedException('Usuário sem empresa vinculada.');
    }
    
    // SEGURANÇA 2: Buscamos APENAS chats onde companyId == user.companyId
    return this.chatService.findAll(user.companyId);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string, // Valida se é UUID
    @Req() req: RequestWithUser,
  ): Promise<ChatResponseDto> {
    const user = req.user;
    
    if (!user?.companyId) {
      throw new UnauthorizedException('Acesso negado.');
    }

    // SEGURANÇA 3: Passamos o ID do chat E o ID da empresa
    return this.chatService.findOne(id, user.companyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const user = req.user;

    if (!user?.companyId) {
        throw new UnauthorizedException('Sessão inválida.');
    }

    // SEGURANÇA 4: Passamos ID, Empresa e Role para validação completa
    await this.chatService.remove(id, user.companyId, user.role);
  }
}
/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Req,
  UseGuards, // 1. Certifique-se que está importado
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

// 🔥 2. IMPORTANTE: Importe o seu Guard real aqui.
// Se você não tiver o arquivo, me avise que eu crio ele para você.

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
    companyId: string;
  };
}

@Controller('chats')
@UseGuards(JwtAuthGuard) // 🔥 3. CRUCIAL: Isso popula o req.user
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async create(
    @Body() createChatDto: CreateChatDto,
    @Req() req: RequestWithUser,
  ): Promise<ChatResponseDto> {
    const user = req.user;

    // Validação Defensiva (Safety Check)
    if (!user || !user.companyId) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    const secureDto = {
      ...createChatDto,
      companyId: user.companyId,
    };

    return this.chatService.create(secureDto);
  }

  @Get()
  async findAll(@Req() req: RequestWithUser): Promise<ChatResponseDto[]> {
    const user = req.user;

    // 🔥 O ERRO 500 ACONTECIA AQUI
    // Se o Guard estiver desligado, 'user' é undefined e user.companyId quebra o servidor.
    if (!user || !user.companyId) {
       console.error("❌ Erro: req.user não encontrado. Verifique o JWT.");
       throw new UnauthorizedException('Usuário não autenticado.');
    }
    
    // Ignoramos o companyId que vem da URL (query param) por segurança
    // e usamos estritamente o do Token (req.user)
    return this.chatService.findAll(user.companyId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<ChatResponseDto> {
    const user = req.user;
    
    if (!user || !user.companyId) {
      throw new UnauthorizedException('Acesso negado.');
    }

    return this.chatService.findOne(id, user.companyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    const user = req.user;

    if (!user) {
        throw new UnauthorizedException('Sessão inválida.');
    }

    await this.chatService.remove(id, user.companyId, user.role);
  }
}
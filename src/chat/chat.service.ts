/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatResponseDto } from './dto/chat-response.dto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async create(createChatDto: CreateChatDto): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.create({
      data: createChatDto,
      include: { messages: true },
    });
    return new ChatResponseDto(chat);
  }

  // 🔥 MELHORIA DE SEGURANÇA AQUI
  async findOne(id: string, userCompanyId: string): Promise<ChatResponseDto> {
    // Usamos findFirst para forçar a cláusula WHERE com DOIS campos
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: id,
        companyId: userCompanyId, // AQUI ESTÁ A TRAVA DE SEGURANÇA
      },
      include: {
        messages: {
          include: { sender: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      // Se não achar, pode ser que não exista OU que pertença a outra empresa.
      // Retornamos 404 para não vazar informação.
      throw new NotFoundException('Chat não encontrado');
    }

    return new ChatResponseDto(chat);
  }

  async findAll(companyId: string): Promise<ChatResponseDto[]> {
    const chats = await this.prisma.chat.findMany({
      where: { companyId }, // Filtro direto no banco
      include: {
        messages: {
          include: {
            sender: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return chats.map((chat) => new ChatResponseDto(chat));
  }

  async remove(
    id: string,
    userCompanyId: string,
    userRole: string,
  ): Promise<void> {
    // 🔥 CORREÇÃO: Adicionar 'ADMIN' também
    const allowedRoles = ['ADMIN', 'MASTER'];
    if (!allowedRoles.includes(userRole?.toUpperCase())) {
      throw new ForbiddenException(
        'Acesso negado: Apenas ADM ou MASTER podem deletar chats.',
      );
    }

    // 2. Validação de Propriedade
    const chat = await this.prisma.chat.findFirst({
      where: {
        id,
        companyId: userCompanyId,
      },
      select: { id: true },
    });

    if (!chat) {
      throw new NotFoundException('Chat não encontrado ou permissão negada.');
    }

    // 3. Execução da Deleção
    await this.prisma.chat.delete({
      where: { id },
    });
  }
}

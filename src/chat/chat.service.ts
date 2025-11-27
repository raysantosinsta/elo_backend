/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatResponseDto } from './dto/chat-response.dto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async create(createChatDto: CreateChatDto): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.create({
      data: createChatDto,
      include: { messages: true }, // Incluir mensagens ao criar (geralmente vazio)
    });

    return new ChatResponseDto(chat);
  }

  async findOne(id: string): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id },
      include: { messages: true },
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    return new ChatResponseDto(chat);
  }

  // Novo método: listar chats por companyId (com mensagens incluídas para preview e contagem)
  async findAll(companyId?: string): Promise<ChatResponseDto[]> {
    if (!companyId) {
      throw new Error('companyId é obrigatório para listar chats');
    }

    const chats = await this.prisma.chat.findMany({
      where: { companyId },
      include: { 
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' }, // Ordem cronológica para todas as mensagens
        },
      },
      orderBy: { createdAt: 'desc' }, // Chats mais recentes primeiro
    });

    return chats.map(chat => new ChatResponseDto(chat));
  }
}
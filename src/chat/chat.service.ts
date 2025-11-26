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
    });

    return new ChatResponseDto(chat);
  }

  async findOne(id: string): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id },
      include: { messages: true },
    });

    return new ChatResponseDto(chat);
  }
}



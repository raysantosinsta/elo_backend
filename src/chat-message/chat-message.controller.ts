/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

@Controller('chat-messages')
export class ChatMessageController {
  constructor(private service: ChatMessageService) {}

  @Post()
  create(@Body() dto: CreateChatMessageDto) {
    return this.service.create(dto);
  }

  @Get('chat/:chatId')
  findByChat(@Param('chatId') chatId: string) {
    return this.service.findByChat(chatId);
  }
}
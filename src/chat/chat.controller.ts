/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';

@Controller('chats')
export class ChatController {
  constructor(private service: ChatService) {}

  @Post()
  create(@Body() dto: CreateChatDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Novo endpoint: listar chats por companyId
  @Get()
  findAll(@Query('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }
}
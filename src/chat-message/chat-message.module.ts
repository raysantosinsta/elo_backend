/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';
import { ChatMessageController } from './chat-message.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ChatModule } from 'src/chat/chat.module';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsappModule, ChatModule],
  controllers: [ChatMessageController],
  providers: [ChatMessageService],
  exports: [ChatMessageService], // Optional: if other modules need to import this
})
export class ChatMessageModule {}

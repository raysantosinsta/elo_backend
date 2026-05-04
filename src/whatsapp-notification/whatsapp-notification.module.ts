/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { WhatsAppSimpleService } from './whatsapp-notification.service';
import { WhatsAppTestController } from './whatsapp-notification.controller';

@Module({
  controllers: [WhatsAppTestController],
  providers: [WhatsAppSimpleService],
  exports: [WhatsAppSimpleService],
})
export class WhatsappNotificationModule {}

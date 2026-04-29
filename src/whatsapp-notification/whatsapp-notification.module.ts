import { Module } from '@nestjs/common';
import { WhatsappNotificationService } from './whatsapp-notification.service';

@Module({
  providers: [WhatsappNotificationService],
  exports: [WhatsappNotificationService], // 🔥 EXPORTA PARA OUTROS MÓDULOS
})
export class WhatsappNotificationModule {}

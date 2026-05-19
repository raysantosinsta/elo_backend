import { Module } from '@nestjs/common';
import { WhatsAppConnectionController } from './whatsapp-connection.controller';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { AtendeproAuthModule } from 'src/atendepro-auth/atendepro-auth.module';

@Module({
  imports: [
    PrismaModule,
    AtendeproAuthModule,
    HttpModule.register({
      // 🔥 Registrar o HttpModule
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [WhatsAppConnectionController],
  providers: [WhatsAppConnectionService],
  exports: [WhatsAppConnectionService],
})
export class WhatsappConnectionModule {}

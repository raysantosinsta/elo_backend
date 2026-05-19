/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { HttpModule } from '@nestjs/axios';
import { WhatsappConnectionModule } from 'src/whatsapp-connection/whatsapp-connection.module';


@Module({
  imports: [HttpModule, WhatsappConnectionModule],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule { }

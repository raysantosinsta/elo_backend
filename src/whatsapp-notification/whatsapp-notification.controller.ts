/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// controllers/whatsapp-test.controller.ts

import {
  Body,
  Controller,
  Logger,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WhatsAppSimpleService } from './whatsapp-notification.service';
import { Public } from 'src/auth/public.decorator';



@Controller('whatsapp-test')
export class WhatsAppTestController {
  private readonly logger = new Logger(WhatsAppTestController.name);

  constructor(private whatsAppService: WhatsAppSimpleService) { }

  /**
   * TODO: endoint oficial para elo produtivo
   * 🔥 Endpoint 1: Texto Simples
   * POST /whatsapp-test/send
   * { "phoneNumber": "558584372865", "message": "Olá teste!" }
   * curl -X POST http://localhost:3000/whatsapp-test/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "558584372865", "message": "Olá! Este é um teste do meu sistema!"}'
   */
  @Public()
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(@Body() body: any) {
    this.logger.log(`========== INÍCIO REQUISIÇÃO SEND ==========`);
    this.logger.log(`📥 Payload (Body) Recebido: ${JSON.stringify(body, null, 2)}`);
    this.logger.log(`📨 Número extraído: ${body?.phoneNumber}`);
    this.logger.log(`💬 Mensagem extraída: ${body?.message}`);

    const message = body?.message || '🧪 Teste de integração WhatsApp!';
    this.logger.log(`🎯 Mensagem final que será enviada ao Twilio: ${message}`);

    const success = await this.whatsAppService.sendSimpleMessage(
      body?.phoneNumber,
      message,
    );

    const response = {
      success,
      message: success ? 'Mensagem enviada!' : 'Falha ao enviar',
      to: body?.phoneNumber,
    };

    this.logger.log(`📤 Resposta que será enviada pro cliente (Curl/Postman): ${JSON.stringify(response)}`);
    this.logger.log(`========== FIM REQUISIÇÃO SEND ==========`);
    return response;
  }

}

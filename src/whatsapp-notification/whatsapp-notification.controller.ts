/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post
} from '@nestjs/common';
import { Public } from 'src/auth/public.decorator';
import { WhatsAppSimpleService } from './whatsapp-notification.service';

@Controller('whatsapp-test')
export class WhatsAppTestController {
  private readonly logger = new Logger(WhatsAppTestController.name);

  constructor(private whatsAppService: WhatsAppSimpleService) {}

  /**
   * 🔥 Endpoint de teste para envio de mensagem via Meta WhatsApp API
   * 
   * POST /whatsapp-test/send
   * 
   * Body:
   * {
   *   "phoneNumber": "5585984372865",
   *   "message": "Olá! Teste via Meta API 🚀"
   * }
   * 
   * @example
   * curl -X POST http://localhost:3000/whatsapp-test/send \
   *   -H "Content-Type: application/json" \
   *   -d '{"phoneNumber": "5585984372865", "message": "Teste funcionando! 🎉"}'
   */
  @Public()
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(@Body() body: { phoneNumber: string; message: string }) {
    this.logger.log(`========== INÍCIO REQUISIÇÃO SEND ==========`);
    this.logger.log(`📥 Payload Recebido: ${JSON.stringify(body, null, 2)}`);
    this.logger.log(`📨 Número: ${body?.phoneNumber}`);
    this.logger.log(`💬 Mensagem: ${body?.message}`);

    const message = body?.message || '🧪 Teste de integração WhatsApp Meta API!';
    const phoneNumber = body?.phoneNumber;

    if (!phoneNumber) {
      return {
        success: false,
        message: 'Número de telefone é obrigatório',
      };
    }

    const success = await this.whatsAppService.sendSimpleMessage(phoneNumber, message);

    const response = {
      success,
      message: success ? '✅ Mensagem enviada com sucesso via Meta API!' : '❌ Falha ao enviar mensagem',
      to: phoneNumber,
    };

    this.logger.log(`📤 Resposta: ${JSON.stringify(response)}`);
    this.logger.log(`========== FIM REQUISIÇÃO SEND ==========`);
    return response;
  }

  /**
   * 🔥 Endpoint para testar envio de notificação de novo item no Kanban
   * 
   * POST /whatsapp-test/notify-new-item
   * 
   * Body:
   * {
   *   "phoneNumber": "5585984372865",
   *   "itemTitle": "Camisa Polo Azul",
   *   "flowName": "Coleção Verão 2025",
   *   "stageName": "Corte",
   *   "quantity": 100,
   *   "productRef": "REF-001",
   *   "creatorName": "João Silva"
   * }
   */
  @Public()
  @Post('notify-new-item')
  @HttpCode(HttpStatus.OK)
  async sendNewItemNotification(@Body() body: {
    phoneNumber: string;
    itemTitle: string;
    flowName?: string;
    stageName?: string;
    quantity?: number;
    productRef?: string;
    creatorName?: string;
  }) {
    this.logger.log(`========== NOTIFICAÇÃO NOVO ITEM ==========`);
    
    const {
      phoneNumber,
      itemTitle,
      flowName = 'N/A',
      stageName = 'N/A',
      quantity = 0,
      productRef = 'N/A',
      creatorName = 'Sistema',
    } = body;

    if (!phoneNumber || !itemTitle) {
      return {
        success: false,
        message: 'Número de telefone e título do item são obrigatórios',
      };
    }

    const message = `
🎉 *NOVO ITEM CRIADO NO KANBAN!*

📦 *Item:* ${itemTitle}
📋 *Coleção:* ${flowName}
📍 *Etapa:* ${stageName}
🔢 *Quantidade:* ${quantity}
🏷️ *Referência:* ${productRef}

👤 *Criado por:* ${creatorName}
📅 *Data:* ${new Date().toLocaleString('pt-BR')}

👉 Acesse o sistema para mais detalhes.
    `.trim();

    const success = await this.whatsAppService.sendSimpleMessage(phoneNumber, message);

    return {
      success,
      message: success ? '✅ Notificação enviada com sucesso!' : '❌ Falha ao enviar notificação',
      to: phoneNumber,
    };
  }

  /**
   * 🔥 Endpoint para verificar status da configuração
   * 
   * GET /whatsapp-test/status
   */
  @Public()
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getStatus() {
    return {
      whatsapp_api: 'Meta WhatsApp API (Graph API)',
      status: 'configured',
      note: 'Usando API oficial do WhatsApp Business via Facebook Graph API',
    };
  }
}
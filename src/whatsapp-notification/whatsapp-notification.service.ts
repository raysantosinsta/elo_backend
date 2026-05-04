/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// services/whatsapp-simple.service.ts

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WhatsAppSimpleService {
  private readonly logger = new Logger(WhatsAppSimpleService.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.accessToken = this.configService.get<string>('META_WHATSAPP_ACCESS_TOKEN') || '';
    this.phoneNumberId = this.configService.get<string>('META_WHATSAPP_PHONE_NUMBER_ID') || '';
    this.apiVersion = this.configService.get<string>('META_WHATSAPP_API_VERSION') || 'v25.0';
    this.baseUrl = this.configService.get<string>('META_WHATSAPP_BASE_URL') || 'https://graph.facebook.com';

    if (this.accessToken && this.phoneNumberId) {
      this.logger.log('✅ Meta WhatsApp API inicializada com sucesso');
      this.logger.log(`📱 Phone Number ID: ${this.phoneNumberId}`);
      this.logger.log(`🔑 Access Token: ${this.accessToken.substring(0, 20)}...`);
    } else {
      this.logger.warn('⚠️ Credenciais da Meta WhatsApp API não encontradas');
    }
  }

  /**
   * 🔥 MÉTODO: Envio de mensagem via Meta WhatsApp API (Graph API)
   * 
   * @description
   * Este método envia uma mensagem de texto simples através da API oficial do WhatsApp Business.
   * Ele segue exatamente o padrão do curl que funcionou:
   * 
   * curl -X POST "https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages" \
   * -H "Authorization: Bearer {ACCESS_TOKEN}" \
   * -H "Content-Type: application/json" \
   * -d '{
   *   "messaging_product": "whatsapp",
   *   "to": "5585984372865",
   *   "type": "text",
   *   "text": { "body": "Agora vai funcionar 🚀" }
   * }'
   * 
   * @param {string} to - Número do destinatário (formato: 5585984372865, sem '+' e sem espaços)
   * @param {string} message - Conteúdo da mensagem a ser enviada
   * 
   * @returns {Promise<boolean>} - true se enviado com sucesso, false caso contrário
   */
  async sendSimpleMessage(to: string, message: string): Promise<boolean> {
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.error('❌ Meta WhatsApp API não configurada corretamente');
      return false;
    }

    try {
      // Limpa o número de telefone (remove tudo que não é dígito)
      let cleanedNumber = to.replace(/\D/g, '');
      
      // Garante que comece com 55 (código do Brasil)
      if (!cleanedNumber.startsWith('55')) {
        cleanedNumber = `55${cleanedNumber}`;
      }

      const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
      
      const payload = {
        messaging_product: 'whatsapp',
        to: cleanedNumber,
        type: 'text',
        text: {
          body: message,
        },
      };

      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      };

      this.logger.log(`📱 [META WHATSAPP] Enviando mensagem para: ${cleanedNumber}`);
      this.logger.log(`📝 [META WHATSAPP] Mensagem: ${message.substring(0, 200)}...`);
      this.logger.log(`🌐 [META WHATSAPP] URL: ${url}`);
      this.logger.log(`📦 [META WHATSAPP] Payload: ${JSON.stringify(payload, null, 2)}`);

      const response = await axios.post(url, payload, { headers });

      if (response.status === 200 || response.status === 201) {
        this.logger.log(`✅ [META WHATSAPP] Mensagem enviada com sucesso!`);
        this.logger.log(`📄 Resposta: ${JSON.stringify(response.data, null, 2)}`);
        return true;
      } else {
        this.logger.warn(`⚠️ [META WHATSAPP] Resposta inesperada: ${response.status}`);
        this.logger.warn(`📄 ${JSON.stringify(response.data, null, 2)}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`❌ [META WHATSAPP] Erro ao enviar mensagem:`);
      
      if (error.response) {
        // Erro da API do Meta
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        
        // Log detalhado do erro do Meta
        if (error.response.data?.error) {
          const metaError = error.response.data.error;
          this.logger.error(`Meta Error Code: ${metaError.code}`);
          this.logger.error(`Meta Error Message: ${metaError.message}`);
          this.logger.error(`Meta Error Type: ${metaError.type}`);
        }
      } else if (error.request) {
        this.logger.error(`Sem resposta da API: ${error.message}`);
      } else {
        this.logger.error(`Erro na configuração: ${error.message}`);
      }
      
      return false;
    }
  }

  /**
   * 🔥 Método para formatar número de telefone
   * Aceita: 558584372865, 5585984372865, 5585984372865@c.us, +5585984372865
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove todos os caracteres não numéricos
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Remove sufixo @c.us se existir (formato do WhatsApp Web)
    cleaned = cleaned.split('@')[0];
    
    // Garante que tenha 55 no início
    if (!cleaned.startsWith('55')) {
      cleaned = `55${cleaned}`;
    }
    
    return cleaned;
  }
}

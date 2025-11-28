/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import axios from "axios";

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  private readonly apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';
  private readonly baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

  onModuleInit() {
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.error('WHATSAPP_ACCESS_TOKEN e/ou WHATSAPP_PHONE_NUMBER_ID não estão definidos no ambiente.');
      this.logger.warn('O serviço de WhatsApp pode não funcionar corretamente.');
    }
  }

  async sendTextMessage(phone: string, text: string) {
    if (!this.accessToken || !this.phoneNumberId) throw new Error('Credenciais do WhatsApp não configuradas.');
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'text',
      text: { body: text },
    };

    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendTemplateMessage(phone: string, templateName: string, languageCode: string = 'en_US') {
    if (!this.accessToken || !this.phoneNumberId) throw new Error('Credenciais do WhatsApp não configuradas.');
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }
}

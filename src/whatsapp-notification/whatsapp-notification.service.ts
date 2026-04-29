/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio'; // 🔥 Mudar para import padrão

@Injectable()
export class WhatsappNotificationService {
  private readonly logger = new Logger(WhatsappNotificationService.name);
  private client: twilio.Twilio | null = null; // 🔥 Inicializar como null
  private accountSid: string;
  private authToken: string;

  constructor(private configService: ConfigService) {
    this.accountSid =
      this.configService.get<string>('TWILIO_ACCOUNT_SID') || '';
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN') || '';

    if (this.accountSid && this.authToken) {
      // 🔥 Usar twilio como função
      this.client = new twilio.Twilio(this.accountSid, this.authToken);
      this.logger.log('✅ Twilio inicializado');
    } else {
      this.logger.warn('⚠️ Credenciais Twilio não encontradas');
    }
  }

  /**
   * 🔥 MÉTODO 1: Envio SIMPLES (texto puro)
   */
  async sendSimpleMessage(to: string, message: string): Promise<boolean> {
    if (!this.client) {
      this.logger.error('❌ Cliente Twilio não inicializado');
      return false;
    }

    try {
      let formattedTo = to;
      if (!formattedTo.startsWith('+')) {
        formattedTo = `+${formattedTo}`;
      }

      const fromNumber = this.configService.get<string>(
        'TWILIO_WHATSAPP_FROM',
        'whatsapp:+14155238886',
      );

      const formattedFrom = fromNumber.startsWith('whatsapp:')
        ? fromNumber
        : `whatsapp:${fromNumber}`;

      const finalTo = `whatsapp:${formattedTo}`;

      this.logger.log(`📱 Enviando mensagem simples para ${finalTo}`);
      this.logger.log(`📝 Mensagem: ${message}`);

      const result = await this.client.messages.create({
        body: message,
        from: formattedFrom,
        to: finalTo,
      });

      this.logger.log(`✅ Mensagem enviada! SID: ${result.sid}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔥 MÉTODO 2: Envio com TEMPLATE (como na documentação)
   */
  async sendTemplateMessage(
    to: string,
    contentSid: string,
    contentVariables: Record<string, string>,
  ): Promise<boolean> {
    if (!this.client) {
      this.logger.error('❌ Cliente Twilio não inicializado');
      return false;
    }

    try {
      let formattedTo = to;
      if (!formattedTo.startsWith('+')) {
        formattedTo = `+${formattedTo}`;
      }

      const fromNumber = this.configService.get<string>(
        'TWILIO_WHATSAPP_FROM',
        'whatsapp:+14155238886',
      );

      const formattedFrom = fromNumber.startsWith('whatsapp:')
        ? fromNumber
        : `whatsapp:${fromNumber}`;

      const finalTo = `whatsapp:${formattedTo}`;

      this.logger.log(`📱 Enviando template para ${finalTo}`);
      this.logger.log(`📋 Template SID: ${contentSid}`);
      this.logger.log(`📦 Variáveis: ${JSON.stringify(contentVariables)}`);

      const result = await this.client.messages.create({
        from: formattedFrom,
        to: finalTo,
        contentSid: contentSid,
        contentVariables: JSON.stringify(contentVariables),
      });

      this.logger.log(`✅ Template enviado! SID: ${result.sid}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔥 MÉTODO 3: Teste com template de agendamento (exemplo)
   */
  async sendTestTemplate(phoneNumber: string): Promise<boolean> {
    const contentSid = this.configService.get<string>(
      'TWILIO_TEMPLATE_SID',
      'HXb5b62575e6e4ff6129ad7c8efe1f983e',
    );

    const contentVariables = {
      '1': 'Teste WhatsApp',
      '2': '12/1',
      '3': '3pm',
    };

    return this.sendTemplateMessage(phoneNumber, contentSid, contentVariables);
  }

  /**
   * 🔥 MÉTODO 4: Envio com mídia (imagem/áudio)
   */
  async sendMediaMessage(
    to: string,
    message: string,
    mediaUrl: string,
  ): Promise<boolean> {
    if (!this.client) {
      this.logger.error('❌ Cliente Twilio não inicializado');
      return false;
    }

    try {
      let formattedTo = to;
      if (!formattedTo.startsWith('+')) {
        formattedTo = `+${formattedTo}`;
      }

      const fromNumber = this.configService.get<string>(
        'TWILIO_WHATSAPP_FROM',
        'whatsapp:+14155238886',
      );

      const formattedFrom = fromNumber.startsWith('whatsapp:')
        ? fromNumber
        : `whatsapp:${fromNumber}`;

      const finalTo = `whatsapp:${formattedTo}`;

      this.logger.log(`📱 Enviando mensagem com mídia para ${finalTo}`);
      this.logger.log(`🖼️ Media URL: ${mediaUrl}`);

      const result = await this.client.messages.create({
        body: message,
        from: formattedFrom,
        to: finalTo,
        mediaUrl: [mediaUrl],
      });

      this.logger.log(`✅ Mensagem com mídia enviada! SID: ${result.sid}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);
      return false;
    }
  }

  /**
   * 🔥 MÉTODO 5: Teste simples "Hello World"
   */
  async sendHelloWorld(phoneNumber: string): Promise<boolean> {
    return this.sendSimpleMessage(
      phoneNumber,
      '🚀 Olá! Este é um teste de integração com WhatsApp! Sua API está funcionando perfeitamente.',
    );
  }

  /**
   * 🔥 MÉTODO 6: Verificar status da conexão
   */
  getStatus(): { initialized: boolean; accountSid: string } {
    return {
      initialized: this.client !== null,
      accountSid: this.accountSid
        ? `${this.accountSid.substring(0, 10)}...`
        : 'not set',
    };
  }
}

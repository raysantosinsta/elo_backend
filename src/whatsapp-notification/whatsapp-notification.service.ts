/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// services/whatsapp-simple.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio'; // 🔥 Mudar para import padrão

@Injectable()
export class WhatsAppSimpleService {
  private readonly logger = new Logger(WhatsAppSimpleService.name);
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
 * 🔥 MÉTODO 1: Envio SIMPLES (texto puro) via Twilio WhatsApp
 * 
 * @description
 * Este método envia uma mensagem de texto simples através da API do Twilio WhatsApp.
 * Ele automaticamente:
 * - Formata o número de telefone para o padrão internacional (+55...)
 * - Adiciona o prefixo 'whatsapp:' obrigatório do Twilio
 * - Configura o número de origem a partir das variáveis de ambiente
 * - Registra logs detalhados de toda a operação
 * 
 * @param {string} to - Número de telefone do destinatário *                       Aceita formatos: "558584372865" ou "+558584372865"
 * @param {string} message - Conteúdo da mensagem a ser enviada
 *                           Pode incluir emojis e quebras de linha
 * 
 * @returns {Promise<boolean>} 
 *          - `true`: Mensagem enviada com sucesso
 *          - `false`: Falha no envio (cliente não inicializado ou erro da API)
 * 
 * @example
 * // Exemplo de uso básico
 * const success = await whatsAppService.sendSimpleMessage(
 *   "558584372865",
 *   "Olá! Teste de integração WhatsApp"
 * );
 * 
 * @example
 * // Exemplo com número já formatado
 * const success = await whatsAppService.sendSimpleMessage(
 *   "+558584372865",
 *   "🚀 Mensagem com emoji!
 *   
 *   Esta é uma mensagem 
 *   com múltiplas linhas."
 * );
 * 
 * @example
 * // Exemplo de uso no FlowService
 * await this.whatsAppService.sendSimpleMessage(
 *   "558584372865",
 *   `🎉 NOVO ITEM!
 *   
 *   Item: ${item.title}
 *   Quantidade: ${item.quantity}`
 * );
 * 
 * @throws {Error} Não lança exceções - todos os erros são capturados e retornam false
 * 
 * @logs
 * - 📱 [TWILIO] Enviando mensagem simples para...
 * - 📝 [TWILIO] Corpo da Mensagem: ...
 * - 📤 [TWILIO] Payload da requisição: ...
 * - ✅ [TWILIO] Resposta de Sucesso! SID: ...
 * - ❌ [TWILIO] Erro disparado pela API do Twilio: ...
 * 
 * @notes
 * - O número de origem é configurado via env: TWILIO_WHATSAPP_FROM
 * - Padrão: 'whatsapp:+14155238886' (sandbox do Twilio)
 * - O Twilio requer o prefixo 'whatsapp:' nos números
 * - A mensagem suporta texto simples, emojis e emojis Unicode
 * - Limite de mensagem: ~1600 caracteres (prática recomendada)
 * 
 * @see {@link https://www.twilio.com/docs/whatsapp} - Documentação oficial Twilio WhatsApp
 * @see {@link https://console.twilio.com} - Console do Twilio para ver logs
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

      this.logger.log(`📱 [TWILIO] Enviando mensagem simples para ${finalTo}`);
      this.logger.log(`📝 [TWILIO] Corpo da Mensagem: ${message}`);
      this.logger.log(
        `📤 [TWILIO] Payload da requisição: ${JSON.stringify(
          {
            body: message,
            from: formattedFrom,
            to: finalTo,
          },
          null,
          2,
        )}`,
      );

      const result = await this.client.messages.create({
        body: message,
        from: formattedFrom,
        to: finalTo,
      });

      this.logger.log(`✅ [TWILIO] Resposta de Sucesso! SID: ${result.sid}`);
      this.logger.log(
        `📄 [TWILIO] Resposta Completa: ${JSON.stringify(result, null, 2)}`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(`❌ [TWILIO] Erro disparado pela API do Twilio:`);
      this.logger.error(error.message);
      if (error.code) this.logger.error(`Código do Erro: ${error.code}`);
      if (error.moreInfo) this.logger.error(`Mais Info: ${error.moreInfo}`);
      return false;
    }
  }

}

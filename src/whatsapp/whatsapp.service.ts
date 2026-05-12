/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import {
  Injectable,
  OnModuleInit,
  Logger,
  HttpException,
} from '@nestjs/common';

import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  private readonly token = process.env.WHATSAPP_TOKEN;

  private readonly baseUrl = 'https://api.atendepro.app/api/messages/send';

  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    if (!this.token) {
      this.logger.error('WHATSAPP_TOKEN não definido.');
    }
  }

  async sendTextMessage(phone: string, text: string) {
    try {
      if (!this.token) {
        throw new Error('Token do WhatsApp não configurado.');
      }

      const response = await firstValueFrom<AxiosResponse<any>>(
        this.httpService.post(
          this.baseUrl,
          {
            number: phone.replace(/\D/g, ''),
            body: text,
          },
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(error.response?.data || error.message);

      throw new HttpException(
        error.response?.data || 'Erro ao enviar mensagem',
        error.response?.status || 500,
      );
    }
  }
}

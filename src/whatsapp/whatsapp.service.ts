/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// /* eslint-disable @typescript-eslint/no-unused-vars */
// /* eslint-disable @typescript-eslint/no-unsafe-assignment */
// /* eslint-disable @typescript-eslint/no-unsafe-return */
// /* eslint-disable @typescript-eslint/no-unsafe-call */
// /* eslint-disable @typescript-eslint/no-unsafe-argument */
// /* eslint-disable @typescript-eslint/no-unsafe-member-access */
// /* eslint-disable prettier/prettier */

// TODO: falta enviar apenas a mensagem, criar instancia e ler qrcode deu certo
import { Injectable, Logger, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly baseUrl = 'https://api.atendepro.app/api/messages/send';

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  private async getToken(): Promise<string> {
    const companyId = this.cls.get<string>('tenantId');
    if (!companyId) {
      throw new Error('Empresa não identificada');
    }

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId },
    });

    if (!connection) {
      throw new Error('WhatsApp não configurado');
    }

    // 🔥 REMOVIDO A VERIFICAÇÃO DE STATUS
    // Só retorna o token, independente do status
    this.logger.log(
      `Token encontrado para empresa ${companyId}. Status: ${connection.status}`,
    );
    return connection.token;
  }

  async sendTextMessage(phone: string, text: string) {
    try {
      const token = await this.getToken();
      const cleanedPhone = phone.replace(/\D/g, '');

      this.logger.log(`📤 Enviando para: ${cleanedPhone}`);

      const response = await firstValueFrom(
        this.httpService.post(
          this.baseUrl,
          { number: cleanedPhone, body: text },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`✅ Mensagem enviada`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);
      throw new HttpException(
        error.response?.data?.message || 'Erro ao enviar mensagem',
        error.response?.status || 500,
      );
    }
  }
}

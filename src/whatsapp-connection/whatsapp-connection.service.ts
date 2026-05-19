/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/whatsapp-connection/whatsapp-connection.service.ts
// src/whatsapp-connection/whatsapp-connection.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { AtendeProAuthService } from 'src/atendepro-auth/atendepro-auth.service';

@Injectable()
export class WhatsAppConnectionService {
  private readonly logger = new Logger(WhatsAppConnectionService.name);
  private readonly API_BASE_URL = 'https://api.atendepro.app';
  private readonly AUTH_TOKEN: string;

  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private cls: ClsService,
    private authService: AtendeProAuthService, // Inject auth service
  ) {
    this.AUTH_TOKEN = process.env.ATENDEPRO_AUTH_TOKEN || '';
    if (!this.AUTH_TOKEN) {
      this.logger.error('❌ ATENDEPRO_AUTH_TOKEN não configurado');
    }
  }

  private getCompanyId(): string {
    const companyId = this.cls.get<string>('tenantId');
    if (!companyId) {
      throw new Error('Empresa não identificada');
    }
    return companyId;
  }

  // Método auxiliar para fazer requisições com token automático
  private async makeRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    data?: any,
    retryCount = 0,
  ): Promise<T> {
    const token = await this.authService.getToken();

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url: `${this.API_BASE_URL}${url}`,
          data,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        }),
      );

      return response.data;
    } catch (error: any) {
      // Se for erro 401 (Unauthorized), tenta renovar token e refazer requisição
      if (error.response?.status === 401 && retryCount < 2) {
        this.logger.warn('⚠️ Token inválido. Forçando renovação...');
        await this.authService.forceRenewToken();
        return this.makeRequest(method, url, data, retryCount + 1);
      }

      throw error;
    }
  }

  async createWhatsAppInstance(dto: any) {
    this.logger.log('📱 Criando instância WhatsApp...');

    const payload = {
      botFlowId: null,
      complationMessage: '',
      expiresInactiveMessage: '',
      expiresTicket: 0,
      greetingMessage: '',
      isDefault: false,
      maxUseBotQueues: 3,
      metaBusinessId: '',
      metaPhoneNumberId: '',
      metaWabaId: '',
      name: dto.name,
      outOfHoursMessage: '',
      promptId: null,
      provider: dto.provider || 'beta',
      queueIds: [],
      ratingMessage: '',
      timeUseBotQueues: 0,
      token: dto.token,
      transferQueueId: null,
    };

    try {
      const instance = await this.makeRequest<any>(
        'post',
        '/whatsapp',
        payload,
      );

      this.logger.log(`✅ Instância criada: ID ${instance.id}`);

      const companyId = this.getCompanyId();
      await this.prisma.whatsAppConnection.upsert({
        where: { companyId },
        update: {
          name: instance.name,
          token: dto.token,
          status: instance.status === 'CONNECTED' ? 'connected' : 'connecting',
        },
        create: {
          companyId,
          name: instance.name,
          token: dto.token,
          status: instance.status === 'CONNECTED' ? 'connected' : 'connecting',
        },
      });

      return instance;
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);
      throw new BadRequestException(
        error.response?.data?.message || 'Erro ao criar instância',
      );
    }
  }

  async getQRCode(instanceId: number) {
    this.logger.log(`📱 Buscando QR Code para instância ${instanceId}...`);

    try {
      const response = await this.makeRequest<any>(
        'get',
        `/whatsapp/${instanceId}`,
      );

      const companyId = this.getCompanyId();
      const apiStatus = response.status;
      const localStatus =
        apiStatus === 'CONNECTED'
          ? 'connected'
          : apiStatus === 'qrcode'
            ? 'connecting'
            : 'disconnected';

      await this.prisma.whatsAppConnection.update({
        where: { companyId },
        data: {
          status: localStatus,
          qrCode: response.qrcode,
        },
      });

      return {
        qrCode: response.qrcode,
        status: apiStatus,
      };
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);
      throw new BadRequestException('Erro ao buscar QR Code');
    }
  }

  async getConnection() {
    const companyId = this.getCompanyId();
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId },
    });
    if (!connection) {
      throw new NotFoundException('WhatsApp não configurado');
    }
    return connection;
  }

  async getToken(): Promise<string> {
    const connection = await this.getConnection();
    if (connection.status !== 'connected') {
      throw new Error(
        `WhatsApp não está conectado. Status: ${connection.status}`,
      );
    }
    return connection.token;
  }
}

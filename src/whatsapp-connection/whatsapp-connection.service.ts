/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/whatsapp-connection/whatsapp-connection.service.ts
// src/whatsapp-connection/whatsapp-connection.service.ts
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { firstValueFrom } from 'rxjs';
import { AtendeProAuthService } from 'src/atendepro-auth/atendepro-auth.service';
import { PrismaService } from '../prisma/prisma.service';

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

  // whatsapp-connection.service.ts
  private async makeRequest<T>(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    data?: any,
    retryCount = 0,
  ): Promise<T> {
    // 🔥 Usa ensureValidToken ao invés de getToken
    const token = await this.authService.ensureValidToken();

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
      // 🔥 TRATAMENTO PARA 403 (Invalid token)
      if (error.response?.status === 403 && retryCount < 2) {
        const errorMsg = error.response?.data?.error || '';

        if (
          errorMsg.includes('Invalid token') ||
          errorMsg.includes('expired')
        ) {
          this.logger.warn('⚠️ Token inválido/expirado. Forçando renovação...');

          // Força renovação do token
          await this.authService.forceRenewToken();

          // Tenta novamente com o novo token
          return this.makeRequest(method, url, data, retryCount + 1);
        }
      }

      // Tratamento para 401
      if (error.response?.status === 401 && retryCount < 2) {
        this.logger.warn('⚠️ Não autorizado. Forçando renovação...');
        await this.authService.forceRenewToken();
        return this.makeRequest(method, url, data, retryCount + 1);
      }

      this.logger.error(`❌ Erro na requisição: ${error.message}`);
      if (error.response) {
        this.logger.error(`Status da API: ${error.response.status}`);
        this.logger.error(
          `Resposta da API: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }

  // async createWhatsAppInstance(dto: any) {
  //   this.logger.log('📱 Criando instância WhatsApp...');

  //   const payload = {
  //     botFlowId: null,
  //     complationMessage: '',
  //     expiresInactiveMessage: '',
  //     expiresTicket: 0,
  //     greetingMessage: '',
  //     isDefault: false,
  //     maxUseBotQueues: 3,
  //     metaBusinessId: '',
  //     metaPhoneNumberId: '',
  //     metaWabaId: '',
  //     name: dto.name,
  //     outOfHoursMessage: '',
  //     promptId: null,
  //     provider: dto.provider || 'beta',
  //     queueIds: [],
  //     ratingMessage: '',
  //     timeUseBotQueues: 0,
  //     token: dto.token,
  //     transferQueueId: null,
  //   };

  //   try {
  //     const instance = await this.makeRequest<any>(
  //       'post',
  //       '/whatsapp',
  //       payload,
  //     );

  //     this.logger.log(`✅ Instância criada: ID ${instance.id}`);

  //     const companyId = this.getCompanyId();
  //     await this.prisma.whatsAppConnection.upsert({
  //       where: { companyId },
  //       update: {
  //         name: instance.name,
  //         token: dto.token,
  //         status: instance.status === 'CONNECTED' ? 'connected' : 'connecting',
  //       },
  //       create: {
  //         companyId,
  //         name: instance.name,
  //         token: dto.token,
  //         status: instance.status === 'CONNECTED' ? 'connected' : 'connecting',
  //       },
  //     });

  //     return instance;
  //   } catch (error: any) {
  //     this.logger.error(`❌ Erro: ${error.message}`);
  //     throw new BadRequestException(
  //       error.response?.data?.message || 'Erro ao criar instância',
  //     );
  //   }
  // }
  // src/whatsapp-connection/whatsapp-connection.service.ts
  async createWhatsAppInstance(dto: any) {
    this.logger.log('📱 Criando instância WhatsApp...');

    const companyId = this.getCompanyId();
    this.logger.log(`🏢 Company ID: ${companyId}`);

    // Payload para a API do AtendePro (SEM companyId)
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
      // ⚠️ NÃO enviar companyId para a API externa
    };

    try {
      this.logger.log(`📤 Enviando requisição para API do AtendePro`);

      const instance = await this.makeRequest<any>(
        'post',
        '/whatsapp',
        payload,
      );

      this.logger.log(
        `✅ Instância criada: ID ${instance.id}, Status: ${instance.status}`,
      );

      // Salvar no banco local com o companyId
      const savedInstance = await this.prisma.whatsAppConnection.upsert({
        where: { companyId },
        update: {
          name: instance.name,
          token: dto.token,
          status: instance.status === 'CONNECTED' ? 'connected' : 'connecting',
          instanceId: instance.id,
        },
        create: {
          companyId,
          name: instance.name,
          token: dto.token,
          status: instance.status === 'CONNECTED' ? 'connected' : 'connecting',
          instanceId: instance.id,
        },
      });

      this.logger.log(`💾 Instância salva no banco local: ${savedInstance.id}`);

      return {
        ...instance,
        localId: savedInstance.id,
      };
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);

      if (error.response) {
        this.logger.error(`Status da API: ${error.response.status}`);
        this.logger.error(
          `Resposta da API: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw new BadRequestException(
        error.response?.data?.message || 'Erro ao criar instância',
      );
    }
  }

  //   try {
  //     // Aguarda 1 segundo para garantir que a instância foi criada
  //     await new Promise((resolve) => setTimeout(resolve, 1000));

  //     const response = await this.makeRequest<any>(
  //       'get',
  //       `/whatsapp/${instanceId}`,
  //     );

  //     this.logger.log(
  //       `✅ Resposta da API: status=${response.status}, temQRCode=${!!response.qrcode}`,
  //     );
  //     this.logger.debug(
  //       `Resposta completa: ${JSON.stringify(response, null, 2)}`,
  //     );

  //     const companyId = this.getCompanyId();
  //     const apiStatus = response.status;
  //     const localStatus =
  //       apiStatus === 'CONNECTED'
  //         ? 'connected'
  //         : apiStatus === 'qrcode'
  //           ? 'connecting'
  //           : 'disconnected';

  //     await this.prisma.whatsAppConnection.upsert({
  //       where: { companyId },
  //       update: {
  //         status: localStatus,
  //         qrCode: response.qrcode,
  //       },
  //       create: {
  //         companyId,
  //         name: response.name || 'WhatsApp',
  //         token: response.token || '',
  //         status: localStatus,
  //         qrCode: response.qrcode,
  //       },
  //     });

  //     return {
  //       qrCode: response.qrcode,
  //       status: apiStatus,
  //       id: response.id,
  //       name: response.name,
  //     };
  //   } catch (error: any) {
  //     this.logger.error(`❌ Erro: ${error.message}`);

  //     // Log mais detalhado do erro
  //     if (error.response) {
  //       this.logger.error(`Status da API: ${error.response.status}`);
  //       this.logger.error(
  //         `Resposta da API: ${JSON.stringify(error.response.data)}`,
  //       );

  //       // Se for 404, a instância pode não existir
  //       if (error.response.status === 404) {
  //         throw new NotFoundException(`Instância ${instanceId} não encontrada`);
  //       }
  //     }

  //     throw new BadRequestException(
  //       error.response?.data?.message || 'Erro ao buscar QR Code',
  //     );
  //   }
  // }
  // src/whatsapp-connection/whatsapp-connection.service.ts
  // src/whatsapp-connection/whatsapp-connection.service.ts
  // src/whatsapp-connection/whatsapp-connection.service.ts

  async getQRCode(instanceId: number) {
    this.logger.log(`📱 Buscando QR Code para instância ${instanceId}...`);

    try {
      const response = await this.makeRequest<any>(
        'get',
        `/whatsapp/${instanceId}`,
      );

      this.logger.log(
        `✅ Resposta: status=${response.status}, temQRCode=${!!response.qrcode}`,
      );

      if (response.qrcode) {
        return {
          qrcode: response.qrcode,
          status: response.status,
          id: response.id,
        };
      }

      if (response.status === 'CONNECTED') {
        return {
          qrcode: null,
          status: 'CONNECTED',
          id: response.id,
        };
      }

      if (response.status === 'qrcode' && !response.qrcode) {
        throw new Error('QR Code ainda não gerado');
      }

      return {
        qrcode: response.qrcode,
        status: response.status,
        id: response.id,
      };
    } catch (error: any) {
      this.logger.error(`❌ Erro: ${error.message}`);

      // 🔥 TRATAMENTO ESPECÍFICO PARA ERRO 400 COM MENSAGEM "Não é possível acessar registros de outra empresa"
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || '';

        if (
          errorMsg.includes('Não é possível acessar registros de outra empresa')
        ) {
          this.logger.warn(
            `⚠️ Instância ${instanceId} pertence a outra empresa. Deletando referência local...`,
          );

          // Deleta a referência local já que não podemos acessar
          const companyId = this.getCompanyId();
          await this.prisma.whatsAppConnection
            .delete({
              where: { companyId },
            })
            .catch(() => {});

          throw new BadRequestException(
            'Esta instância não pertence à sua empresa. Por favor, crie uma nova conexão.',
          );
        }
      }

      if (error.response?.status === 404) {
        throw new BadRequestException(
          'Instância não encontrada. Por favor, crie uma nova conexão.',
        );
      }

      throw new BadRequestException(
        error.response?.data?.message || 'Erro ao buscar QR Code',
      );
    }
  }

  async getConnection() {
    const companyId = this.getCompanyId();
    this.logger.log(`🔍 Buscando conexão para empresa: ${companyId}`);

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId },
    });

    // Se não tem conexão, retorna null (sem erro)
    if (!connection) {
      this.logger.log(
        `ℹ️ Nenhuma conexão WhatsApp encontrada para empresa ${companyId}`,
      );
      return null;
    }

    // SE TEM INSTANCE ID, BUSCA STATUS ATUALIZADO DA API
    if (connection.instanceId) {
      try {
        this.logger.log(
          `🔄 Sincronizando status da instância ${connection.instanceId}...`,
        );

        const apiInstance = await this.makeRequest<any>(
          'get',
          `/whatsapp/${connection.instanceId}`,
        );

        this.logger.log(`📊 Status da API: ${apiInstance.status}`);
        this.logger.log(`📊 Tem QR Code: ${!!apiInstance.qrcode}`);

        // Mapeamento correto dos status
        let updatedStatus = 'disconnected';
        if (apiInstance.status === 'CONNECTED') {
          updatedStatus = 'connected';
        } else if (apiInstance.status === 'qrcode') {
          updatedStatus = 'qrcode';
        } else if (apiInstance.status === 'OPENING') {
          updatedStatus = 'connecting';
        } else if (apiInstance.status === 'CLOSED') {
          updatedStatus = 'disconnected';
        }

        // SE O STATUS MUDOU, ATUALIZA NO BANCO
        if (updatedStatus !== connection.status) {
          this.logger.log(
            `✅ Status alterado: ${connection.status} -> ${updatedStatus}`,
          );

          await this.prisma.whatsAppConnection.update({
            where: { companyId },
            data: {
              status: updatedStatus,
              qrCode: apiInstance.qrcode || null,
            },
          });

          // ✅ CORREÇÃO AQUI: Atualiza a variável connection (usando let)
          connection.status = updatedStatus;
          connection.qrCode = apiInstance.qrcode || null;
        } else {
          this.logger.log(
            `✅ Status já está sincronizado: ${connection.status}`,
          );
        }
      } catch (error: any) {
        this.logger.warn(
          `⚠️ Não foi possível sincronizar status: ${error.message}`,
        );
        // Mantém o status existente
      }
    }

    return connection;
  }

  async getToken(): Promise<string> {
    const connection = await this.getConnection();

    // 🔥 Verifica se existe e está conectado
    if (!connection) {
      throw new Error(
        'WhatsApp não configurado. Configure uma instância primeiro.',
      );
    }

    if (connection.status !== 'connected') {
      throw new Error(
        `WhatsApp não está conectado. Status atual: ${connection.status}. Escaneie o QR Code para conectar.`,
      );
    }

    return connection.token;
  }

  async disconnectInstance() {
    const companyId = this.getCompanyId();
    this.logger.log(`🔌 Desconectando WhatsApp da empresa ${companyId}`);

    try {
      // Busca a instância local
      const connection = await this.prisma.whatsAppConnection.findUnique({
        where: { companyId },
      });

      if (connection && connection.instanceId) {
        // Tenta desconectar na API
        await this.makeRequest<any>(
          'delete',
          `/whatsapp/${connection.instanceId}`,
        );
      }

      // Remove do banco local
      await this.prisma.whatsAppConnection.delete({
        where: { companyId },
      });

      this.logger.log(`✅ WhatsApp desconectado com sucesso`);
      return { message: 'WhatsApp desconectado com sucesso' };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao desconectar: ${error.message}`);
      // Mesmo com erro, tenta remover do banco local
      try {
        await this.prisma.whatsAppConnection.delete({
          where: { companyId },
        });
      } catch (e: any) {
        // Ignora erro se não existir
        console.log(`⚠️ Erro ao remover do banco local: ${e.message}`);
      }

      throw new BadRequestException(
        error.response?.data?.message || 'Erro ao desconectar WhatsApp',
      );
    }
  }

  async deleteInstance(instanceId: number) {
    this.logger.log(`🗑️ Deletando instância ${instanceId}...`);

    let apiError: any = null;
    let deletedFromApi = false;

    try {
      const instance = await this.makeRequest<any>(
        'get',
        `/whatsapp/${instanceId}`,
      );

      if (instance) {
        await this.makeRequest<any>('delete', `/whatsapp/${instanceId}`);
        deletedFromApi = true;
        this.logger.log(
          `✅ Instância ${instanceId} deletada da API com sucesso`,
        );
      }
    } catch (error: any) {
      apiError = error;

      // 🔥 Verifica se o erro é de acesso negado (instância de outra empresa)
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.error || '';
        if (
          errorMsg.includes('Não é possível acessar registros de outra empresa')
        ) {
          this.logger.warn(
            `⚠️ Instância ${instanceId} pertence a outra empresa. Apenas removendo referência local.`,
          );
          // Não consideramos como erro, apenas continuamos para deletar do banco local
          apiError = null;
        }
      } else {
        this.logger.warn(`⚠️ Erro na API (continuando): ${error.message}`);
      }
    }

    // Sempre tenta deletar do banco local
    try {
      const companyId = this.getCompanyId();
      const localInstance = await this.prisma.whatsAppConnection.findUnique({
        where: { companyId },
      });

      if (localInstance) {
        await this.prisma.whatsAppConnection.delete({
          where: { companyId },
        });
        this.logger.log(`✅ Instância removida do banco local`);
      }
    } catch (error: any) {
      this.logger.error(`❌ Erro ao remover do banco local: ${error.message}`);
      throw new BadRequestException('Erro ao remover instância do banco local');
    }

    // Sucesso total ou parcial
    if (!deletedFromApi && apiError) {
      return {
        message: 'Instância removida localmente, mas houve erro na API.',
        instanceId: instanceId,
        partialSuccess: true,
      };
    }

    return {
      message: 'Instância deletada com sucesso',
      instanceId: instanceId,
      success: true,
    };
  }
}

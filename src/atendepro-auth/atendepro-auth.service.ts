/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/atendepro-auth/atendepro-auth.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AtendeProAuthService {
  private readonly logger = new Logger(AtendeProAuthService.name);
  private cachedToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private readonly LOGIN_URL = 'https://api.atendepro.app/auth/login';
  private readonly CREDENTIALS = {
    email: 'santosray62@gmail.com',
    password: 'Blessedhr10@',
  };

  constructor(private httpService: HttpService) {}

  async getToken(): Promise<string> {
    if (this.isTokenValid()) {
      this.logger.debug('✅ Usando token em cache');
      return this.cachedToken!;
    }

    this.logger.log('🔄 Token expirado ou não encontrado. Realizando login...');
    await this.authenticate();
    return this.cachedToken!;
  }

  private isTokenValid(): boolean {
    if (!this.cachedToken || !this.tokenExpiresAt) {
      return false;
    }

    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutos de margem
    return now.getTime() + bufferTime < this.tokenExpiresAt.getTime();
  }

  private async authenticate(): Promise<void> {
    try {
      this.logger.log('🔑 Autenticando no AtendePro...');

      const response = await firstValueFrom(
        this.httpService.post(this.LOGIN_URL, this.CREDENTIALS, {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }),
      );

      this.logger.log(`✅ Login response status: ${response.status}`);

      // Log da resposta completa para debug
      this.logger.debug(
        `Resposta completa: ${JSON.stringify(response.data, null, 2)}`,
      );

      // Extrai o token da resposta
      const token = this.extractToken(response.data);

      if (!token) {
        this.logger.error('❌ Token não encontrado na resposta do login');
        this.logger.error(
          `Estrutura da resposta: ${JSON.stringify(Object.keys(response.data))}`,
        );
        throw new UnauthorizedException(
          'Token não encontrado na resposta do login',
        );
      }

      this.cachedToken = token;

      // Tenta extrair tempo de expiração da resposta, se não tiver, coloca 24h
      const expiresIn = this.extractExpiresIn(response.data);
      this.tokenExpiresAt = new Date();
      this.tokenExpiresAt.setSeconds(
        this.tokenExpiresAt.getSeconds() + (expiresIn || 86400),
      );

      this.logger.log('✅ Autenticado com sucesso!');
      this.logger.debug(`Token: ${token.substring(0, 30)}...`);
      this.logger.debug(`Expira em: ${this.tokenExpiresAt.toISOString()}`);
    } catch (error: any) {
      this.logger.error(`❌ Falha na autenticação: ${error.message}`);

      if (error.response) {
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
        this.logger.error(`Data: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        this.logger.error(`Sem resposta do servidor: ${error.message}`);
      } else {
        this.logger.error(`Erro na configuração: ${error.message}`);
      }

      throw new UnauthorizedException(
        `Não foi possível autenticar com o AtendePro: ${error.message}`,
      );
    }
  }

  private extractToken(data: any): string | null {
    // Tenta diferentes formatos de resposta
    if (!data) return null;

    // Caso 1: { token: "xxx" }
    if (data.token) return data.token;

    // Caso 2: { access_token: "xxx" }
    if (data.access_token) return data.access_token;

    // Caso 3: { accessToken: "xxx" }
    if (data.accessToken) return data.accessToken;

    // Caso 4: { data: { token: "xxx" } }
    if (data.data?.token) return data.data.token;

    // Caso 5: { data: { access_token: "xxx" } }
    if (data.data?.access_token) return data.data.access_token;

    // Caso 6: A resposta é diretamente o token (string)
    if (typeof data === 'string' && data.length > 20) return data;

    // Caso 7: Procura por qualquer campo que contenha 'token'
    for (const key of Object.keys(data)) {
      if (
        key.toLowerCase().includes('token') &&
        typeof data[key] === 'string' &&
        data[key].length > 20
      ) {
        this.logger.debug(`Token encontrado no campo: ${key}`);
        return data[key];
      }
    }

    return null;
  }

  private extractExpiresIn(data: any): number | null {
    if (data.expires_in) return data.expires_in;
    if (data.expiresIn) return data.expiresIn;
    if (data.data?.expires_in) return data.data.expires_in;
    if (data.data?.expiresIn) return data.data.expiresIn;
    return null;
  }

  async forceRenewToken(): Promise<string> {
    this.logger.log('🔄 Forçando renovação do token...');
    this.cachedToken = null;
    this.tokenExpiresAt = null;
    return this.getToken();
  }

  // 🔥 NOVO MÉTODO: Verifica se o token é válido na API
  async validateToken(token: string): Promise<boolean> {
    try {
      this.logger.debug('🔍 Validando token...');

      const response = await firstValueFrom(
        this.httpService.get('https://api.atendepro.app/whatsapp', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000,
        }),
      );

      this.logger.debug('✅ Token válido');
      return true;
    } catch (error: any) {
      if (error.response?.status === 403 || error.response?.status === 401) {
        this.logger.warn('⚠️ Token inválido ou expirado');
        return false;
      }
      // Outros erros podem ser de rede, considerar como válido para não ficar renovando
      this.logger.warn(`⚠️ Erro ao validar token: ${error.message}`);
      return true;
    }
  }

  // 🔥 NOVO MÉTODO: Garante que o token é válido, renovando se necessário
  async ensureValidToken(): Promise<string> {
    let token = await this.getToken();

    // Verifica se o token é válido fazendo uma requisição de teste
    const isValid = await this.validateToken(token);

    if (!isValid) {
      this.logger.warn('⚠️ Token atual inválido. Forçando renovação...');
      token = await this.forceRenewToken();
    }

    return token;
  }
}

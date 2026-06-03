/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly client: AxiosInstance;
  private readonly baseURL: string;
  private readonly environment: string;

  constructor(private readonly config: ConfigService) {
    this.environment = this.config.get<string>('ASAAS_ENV') || 'sandbox';
    this.baseURL =
      this.config.get<string>('ASAAS_BASE_URL') ||
      (this.environment === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3');

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        access_token: this.config.get<string>('ASAAS_API_KEY') || '',
        'Content-Type': 'application/json',
      },
    });
  }

  assertConfigured() {
    if (!this.config.get<string>('ASAAS_API_KEY')) {
      throw new BadRequestException('ASAAS_API_KEY nao configurada');
    }
  }

  async createCustomer(data: {
    name: string;
    email?: string;
    cpfCnpj: string;
    phone?: string;
    externalReference?: string;
  }) {
    this.assertConfigured();
    const response = await this.client.post('/customers', data);
    return response.data;
  }

  async createSubscription(data: {
    customer: string;
    billingType: string;
    value: number;
    nextDueDate: string;
    cycle: 'MONTHLY' | 'YEARLY';
    description?: string;
    externalReference?: string;
  }) {
    this.assertConfigured();
    const response = await this.client.post('/subscriptions', data);
    return response.data;
  }

  async getPayment(paymentId: string) {
    this.assertConfigured();
    const response = await this.client.get(`/payments/${paymentId}`);
    return response.data;
  }

  sanitizeError(error: any) {
    const message = error?.response?.data?.errors?.[0]?.description || error?.response?.data?.message || error?.message || 'Erro ao chamar Asaas';
    const isEnvironmentMismatch = error?.response?.status === 401 && String(message).toLowerCase().includes('ambiente');
    const detail = isEnvironmentMismatch
      ? `${message}. Backend configurado com ASAAS_ENV=${this.environment} e ASAAS_BASE_URL=${this.baseURL}. Confira se a chave pertence ao mesmo ambiente.`
      : message;
    this.logger.warn({ message: 'Falha Asaas', status: error?.response?.status, detail });
    return detail;
  }
}


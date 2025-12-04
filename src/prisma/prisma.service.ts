/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // ❌ REMOVIDO: private static instance: PrismaService; 
  // O NestJS já garante o Singleton por padrão.

  constructor() {
    super({
      log: ['warn', 'error'],
      errorFormat: 'minimal',
    });
    
    // ❌ REMOVIDO: A lógica de verificação e atribuição manual do Singleton.
  }

  // --- Ciclos de Vida do Módulo ---

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Conectado ao banco de dados (Gerenciado pelo NestJS)');
    } catch (error) {
      console.error('❌ Erro ao conectar com o banco:', error);
      if (error instanceof Error) {
        console.error('Mensagem:', error.message);
      }
      // Dependendo da gravidade, você pode querer relançar o erro ou encerrar o aplicativo.
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      console.log('❌ Desconectado do banco de dados');
    } catch (error) {
      console.error('❌ Erro ao desconectar:');
      if (error instanceof Error) {
        console.error('Mensagem:', error.message);
      }
    }
  }

  // --- Métodos de Negócio (Exemplo) ---

  async findChatByCompany(companyId: string) {
    return await this.chat.findFirst({ 
      where: { companyId },
      include: {
        messages: {
          include: {
            sender: true,
            mentionedProfessional: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }

  async findOrCreateCompanyChat(companyId: string) {
    let chat = await this.chat.findFirst({
      where: { companyId },
      include: {
        messages: {
          include: {
            sender: true,
            mentionedProfessional: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!chat) {
      chat = await this.chat.create({
        data: { companyId },
        include: {
          messages: {
            include: {
              sender: true,
              mentionedProfessional: true
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });
    }

    return chat;
  }
}
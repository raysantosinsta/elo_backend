/* eslint-disable prettier/prettier */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static instance: PrismaService;

  constructor() {
    super({
      log: ['warn', 'error'],
      errorFormat: 'minimal',
    });

    if (PrismaService.instance) {
      return PrismaService.instance;
    }
    PrismaService.instance = this;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ Conectado ao banco de dados (Singleton)');
    } catch (error) {
      console.error('❌ Erro ao conectar com o banco:', error);
      // 🔥 CORREÇÃO: Não atribuir error a tipo any
      if (error instanceof Error) {
        console.error('Mensagem:', error.message);
      }
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      console.log('❌ Desconectado do banco de dados');
    } catch (error) {
      console.error('❌ Erro ao desconectar:');
      // 🔥 CORREÇÃO: Não atribuir error a tipo any
      if (error instanceof Error) {
        console.error('Mensagem:', error.message);
      }
    }
  }

  // 🔥 CORREÇÃO: Remover 'async' se não usa await OU adicionar await
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
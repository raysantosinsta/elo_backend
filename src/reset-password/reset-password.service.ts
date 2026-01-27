/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma/prisma.service";
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  // Cria o sistema de logs para aparecer no terminal
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async forgotPassword(email: string) {
    this.logger.log(`1. Iniciando recuperação para: ${email}`);

    try {
      // Passo 1: Busca usuário
      const user = await this.prisma.user.findUnique({ where: { email } });
      
      if (!user) {
        this.logger.warn(`2. Usuário não encontrado no banco: ${email}`);
        return; 
      }
      this.logger.log(`2. Usuário encontrado: ${user.id}`);

      // Passo 2: Invalida tokens antigos
      this.logger.log('3. Invalidando tokens antigos...');
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      // Passo 3: Cria token novo
      this.logger.log('4. Gerando novo token...');
      const token = randomUUID();

      // SE DER ERRO DE "TABLE DOES NOT EXIST", VAI ESTOURAR AQUI
      await this.prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutos
        },
      });
      this.logger.log('5. Token salvo no banco com sucesso.');

      // Passo 4: Envia Email
      this.logger.log('6. Tentando enviar e-mail via MailService...');
      // SE DER ERRO DE CONEXÃO/SMTP, VAI ESTOURAR AQUI
      await this.mail.sendPasswordReset(user.email, token);
      
      this.logger.log('7. ✅ E-mail enviado com sucesso!');

    } catch (error: any) {
      // --- AQUI QUE A MÁGICA ACONTECE ---
      // Esse log vai aparecer vermelho no seu terminal com o motivo exato
      this.logger.error(`❌ ERRO NO PROCESSO: ${error.message}`, error.stack);
      
      // Lança erro 500 para o frontend saber que falhou
      throw new InternalServerErrorException('Erro interno ao tentar recuperar senha.');
    }
  }

  async resetPassword(token: string, password: string) {
    // Log também no reset para garantir
    this.logger.log(`Tentativa de reset com token: ${token}`);
    
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!reset || reset.used || reset.expiresAt < new Date()) {
      this.logger.warn('Token inválido ou expirado');
      throw new InternalServerErrorException('Token inválido ou expirado');
    }

    const hash = await bcrypt.hash(password, 10);

    await this.prisma.user.update({
      where: { id: reset.userId },
      data: { password: hash },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { used: true },
    });
    
    this.logger.log('Senha alterada com sucesso.');
  }
}
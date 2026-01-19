/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MailService } from "src/mail/mail.service";
import { PrismaService } from "src/prisma/prisma.service";
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = randomUUID();

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutos
      },
    });

    await this.mail.sendPasswordReset(user.email, token);
  }

  async resetPassword(token: string, password: string) {
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!reset || reset.used || reset.expiresAt < new Date()) {
      throw new BadRequestException('Token inválido ou expirado');
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
  }
}

/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendPasswordReset(email: string, token: string) {
    const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Recuperação de Senha',
      html: `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        /* Reset para garantir visual consistente */
        body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #F5F0E6; }
        .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
        .header { background-color: #2C3E50; padding: 30px 40px; text-align: center; }
        .content { padding: 40px; color: #2D3436; line-height: 1.6; }
        .button { display: inline-block; padding: 14px 32px; background-color: #D35400; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; transition: background-color 0.3s; }
        .button:hover { background-color: #b54500; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #95A5A6; border-top: 1px solid #eee; }
        .link-text { color: #D35400; word-break: break-all; font-size: 12px; }
      </style>
    </head>
    <body>
      <br><br>
      <div class="container">
        <div style="height: 6px; background-color: #D35400; width: 100%;"></div>
        
        <div class="header">
           <div style="font-size: 40px;">🔐</div>
        </div>

        <div class="content">
          <h2 style="color: #2C3E50; margin-top: 0;">Esqueceu sua senha?</h2>
          <p>Olá,</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta. Se foi você, basta clicar no botão abaixo para criar uma nova:</p>
          
          <div style="text-align: center;">
            <a href="${link}" class="button">Redefinir Minha Senha</a>
          </div>

          <p style="font-size: 14px; color: #636e72;">Este link é válido por apenas <strong>30 minutos</strong> por motivos de segurança.</p>
          
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="font-size: 13px; color: #999;">
            Se você não fez essa solicitação, pode ignorar este e-mail com segurança. Sua senha permanecerá a mesma.
          </p>
        </div>

        <div class="footer">
          <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
          <p class="link-text">${link}</p>
          <br>
          <p>© ${new Date().getFullYear()} Seu Sistema. Todos os direitos reservados.</p>
        </div>
      </div>
      <br><br>
    </body>
    </html>
  `,
    });
  }
} 
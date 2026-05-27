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
      html: this.getPasswordResetTemplate(link),
    });
  }

  /**
   * 🔥 NOVO MÉTODO: Envia e-mail de boas-vindas para novo usuário
   */
  async sendWelcomeEmail(email: string, name: string, password: string) {
    const loginUrl = `${process.env.FRONTEND_URL}/login`;

    const html = this.getWelcomeTemplate(name, email, password, loginUrl);

    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: `Bem-vindo ao ELOSPRO, ${name}! 🎉`,
      html,
    });
  }

  private getWelcomeTemplate(
    name: string,
    email: string,
    password: string,
    loginUrl: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao ELOSPRO</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #F5F6FA;
      -webkit-font-smoothing: antialiased;
    }
    
    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .card {
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.1);
      animation: fadeInUp 0.6s ease-out;
    }
    
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .header {
      background: linear-gradient(135deg, #2F80ED 0%, #1E5CB8 100%);
      padding: 40px 30px;
      text-align: center;
      position: relative;
    }
    
    .logo {
      font-size: 48px;
      margin-bottom: 10px;
    }
    
    .header h1 {
      color: #ffffff;
      font-size: 28px;
      font-weight: 600;
      margin: 10px 0 0;
    }
    
    .header p {
      color: rgba(255,255,255,0.85);
      font-size: 14px;
      margin-top: 8px;
    }
    
    .content {
      padding: 40px 35px;
    }
    
    .greeting {
      font-size: 24px;
      color: #353A40;
      margin-bottom: 20px;
      font-weight: 600;
    }
    
    .greeting span {
      color: #2F80ED;
    }
    
    .message {
      color: #7A7E83;
      line-height: 1.8;
      margin-bottom: 30px;
      font-size: 16px;
    }
    
    .credentials-box {
      background: #F8FAFC;
      border-radius: 16px;
      padding: 25px;
      margin: 25px 0;
      border-left: 4px solid #2F80ED;
    }
    
    .credential-item {
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .credential-label {
      font-weight: 700;
      color: #353A40;
      min-width: 70px;
      font-size: 14px;
    }
    
    .credential-value {
      background: white;
      padding: 8px 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #2F80ED;
      font-weight: 600;
      letter-spacing: 0.5px;
      border: 1px solid #E2E8F0;
      flex: 1;
    }
    
    .alert-box {
      background: #FEF3C7;
      border-radius: 12px;
      padding: 15px 20px;
      margin: 25px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      border: 1px solid #FDE68A;
    }
    
    .alert-icon {
      font-size: 24px;
    }
    
    .alert-text {
      flex: 1;
      font-size: 14px;
      color: #D97706;
      font-weight: 500;
    }
    
    .button {
      display: inline-block;
      background: #2F80ED;
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(47, 128, 237, 0.3);
      text-align: center;
    }
    
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(47, 128, 237, 0.4);
      background: #1E5CB8;
    }
    
    .features {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      margin: 30px 0;
      padding: 20px 0;
      border-top: 1px solid #E2E8F0;
      border-bottom: 1px solid #E2E8F0;
    }
    
    .feature {
      text-align: center;
      flex: 1;
    }
    
    .feature-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }
    
    .feature-text {
      font-size: 12px;
      color: #7A7E83;
      font-weight: 500;
    }
    
    .footer {
      background: #F8FAFC;
      padding: 25px 35px;
      text-align: center;
      border-top: 1px solid #E2E8F0;
    }
    
    .footer p {
      color: #7A7E83;
      font-size: 12px;
      margin: 5px 0;
      line-height: 1.5;
    }
    
    .support-link {
      color: #2F80ED;
      text-decoration: none;
      font-weight: 500;
    }
    
    @media (max-width: 600px) {
      .content {
        padding: 25px 20px;
      }
      .features {
        flex-direction: column;
        gap: 15px;
      }
      .credential-item {
        flex-direction: column;
        align-items: flex-start;
      }
      .button {
        display: block;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">🎉</div>
        <h1>ELOSPRO</h1>
        <p>Sistema de Gestão Inteligente</p>
      </div>
      
      <div class="content">
        <div class="greeting">
          Olá, <span>${name}</span>!
        </div>
        
        <div class="message">
          Estamos muito felizes em tê-lo(a) conosco! Sua conta foi criada com sucesso 
          no <strong>ELOSPRO</strong>, a plataforma completa para gestão da sua produção.
        </div>
        
        <!-- Credenciais de Acesso -->
        <div class="credentials-box">
          <div class="credential-item">
            <div class="credential-label">📧 E-mail:</div>
            <div class="credential-value">${email}</div>
          </div>
          <div class="credential-item">
            <div class="credential-label">🔑 Senha:</div>
            <div class="credential-value">${password}</div>
          </div>
        </div>
        
        <!-- Alerta de segurança -->
        <div class="alert-box">
          <div class="alert-icon">⚠️</div>
          <div class="alert-text">
            <strong>Por segurança, altere sua senha no primeiro acesso!</strong>
          </div>
        </div>
        
        <!-- Botão de Acesso -->
        <div style="text-align: center;">
          <a href="${loginUrl}" class="button">
            🚀 Acessar o Sistema
          </a>
        </div>
        
        <!-- Features -->
        <div class="features">
          <div class="feature">
            <div class="feature-icon">📊</div>
            <div class="feature-text">Dashboard Inteligente</div>
          </div>
          <div class="feature">
            <div class="feature-icon">🎯</div>
            <div class="feature-text">Gestão de Tarefas</div>
          </div>
          <div class="feature">
            <div class="feature-icon">💬</div>
            <div class="feature-text">Notificações via WhatsApp</div>
          </div>
        </div>
        
        <div class="message" style="font-size: 14px; text-align: center; margin-top: 20px;">
          💡 <strong>Dica:</strong> Acesse pelo computador ou celular e mantenha sua produção sempre organizada!
        </div>
      </div>
      
      <div class="footer">
        <p>Este é um e-mail automático, por favor não responda.</p>
        <p>Precisa de ajuda? <a href="${loginUrl}" class="support-link">app.elospro.com.br</a></p>
        <p>© ${new Date().getFullYear()} ELOSPRO - Todos os direitos reservados</p>
        <p style="font-size: 10px; margin-top: 10px;">ELOSPRO | Sistema de Gestão de Fluxos de Produção</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  private getPasswordResetTemplate(link: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #F5F6FA; }
    .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #2F80ED 0%, #1E5CB8 100%); padding: 30px 40px; text-align: center; }
    .content { padding: 40px; color: #353A40; line-height: 1.6; }
    .button { display: inline-block; padding: 14px 32px; background-color: #2F80ED; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; transition: background-color 0.3s; }
    .button:hover { background-color: #1E5CB8; }
    .footer { background-color: #F8FAFC; padding: 20px; text-align: center; font-size: 12px; color: #7A7E83; border-top: 1px solid #E2E8F0; }
    .link-text { color: #2F80ED; word-break: break-all; font-size: 12px; }
  </style>
</head>
<body>
  <br><br>
  <div class="container">
    <div style="height: 6px; background: linear-gradient(90deg, #2F80ED 0%, #1E5CB8 100%); width: 100%;"></div>
    <div class="header">
      <div style="font-size: 40px;">🔐</div>
      <h1 style="color: #ffffff; margin: 15px 0 0 0; font-size: 24px;">ELOSPRO</h1>
      <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">Sistema de Gestão Inteligente</p>
    </div>
    <div class="content">
      <h2 style="color: #353A40; margin-top: 0; font-weight: 600;">Recuperação de Senha</h2>
      <p style="color: #353A40;">Olá,</p>
      <p style="color: #7A7E83;">Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
      <div style="text-align: center;">
        <a href="${link}" class="button">Redefinir Minha Senha</a>
      </div>
      <p style="font-size: 14px; color: #7A7E83;">Este link é válido por apenas <strong style="color: #2F80ED;">30 minutos</strong>.</p>
      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 30px 0;">
      <p style="font-size: 13px; color: #7A7E83;">Se você não fez essa solicitação, ignore este e-mail.</p>
      <p style="font-size: 13px; color: #7A7E83; margin-top: 15px;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
      <p style="font-size: 12px; color: #2F80ED; word-break: break-all; background: #F8FAFC; padding: 10px; border-radius: 6px; text-decoration: none;">${link}</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ELOSPRO. Todos os direitos reservados.</p>
      <p style="margin-top: 8px; font-size: 11px;">ELOSPRO | Sistema de Gestão de Fluxos de Produção</p>
    </div>
  </div>
  <br><br>
</body>
</html>
    `;
  }
}

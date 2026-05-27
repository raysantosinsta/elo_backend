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

  private getWelcomeTemplate(name: string, email: string, password: string, loginUrl: string): string {
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
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
      background: linear-gradient(135deg, #2C3E50 0%, #1a252f 100%);
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
      color: rgba(255,255,255,0.8);
      font-size: 14px;
      margin-top: 8px;
    }
    
    .content {
      padding: 40px 35px;
    }
    
    .greeting {
      font-size: 24px;
      color: #2C3E50;
      margin-bottom: 20px;
      font-weight: 600;
    }
    
    .greeting span {
      color: #D35400;
    }
    
    .message {
      color: #4a5568;
      line-height: 1.8;
      margin-bottom: 30px;
      font-size: 16px;
    }
    
    .credentials-box {
      background: linear-gradient(135deg, #f8f9fa 0%, #f1f3f5 100%);
      border-radius: 16px;
      padding: 25px;
      margin: 25px 0;
      border-left: 4px solid #D35400;
    }
    
    .credential-item {
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .credential-label {
      font-weight: 700;
      color: #2C3E50;
      min-width: 70px;
      font-size: 14px;
    }
    
    .credential-value {
      background: white;
      padding: 8px 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #D35400;
      font-weight: 600;
      letter-spacing: 0.5px;
      border: 1px solid #e2e8f0;
      flex: 1;
    }
    
    .alert-box {
      background: #fff3e0;
      border-radius: 12px;
      padding: 15px 20px;
      margin: 25px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      border: 1px solid #ffe0b3;
    }
    
    .alert-icon {
      font-size: 24px;
    }
    
    .alert-text {
      flex: 1;
      font-size: 14px;
      color: #e67e22;
      font-weight: 500;
    }
    
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #D35400 0%, #e67e22 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(211, 84, 0, 0.3);
      text-align: center;
    }
    
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(211, 84, 0, 0.4);
      background: linear-gradient(135deg, #b54500 0%, #d35400 100%);
    }
    
    .features {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      margin: 30px 0;
      padding: 20px 0;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
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
      color: #4a5568;
      font-weight: 500;
    }
    
    .footer {
      background: #f8f9fa;
      padding: 25px 35px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    
    .footer p {
      color: #95A5A6;
      font-size: 12px;
      margin: 5px 0;
      line-height: 1.5;
    }
    
    .support-link {
      color: #D35400;
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
      <h2 style="color: #2C3E50; margin-top: 0;">Recuperação de Senha</h2>
      <p>Olá,</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
      <div style="text-align: center;">
        <a href="${link}" class="button">Redefinir Minha Senha</a>
      </div>
      <p style="font-size: 14px; color: #636e72;">Este link é válido por apenas <strong>30 minutos</strong>.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="font-size: 13px; color: #999;">Se você não fez essa solicitação, ignore este e-mail.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ELOSPRO. Todos os direitos reservados.</p>
    </div>
  </div>
  <br><br>
</body>
</html>
    `;
  }
}
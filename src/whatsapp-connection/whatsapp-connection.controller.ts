/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
// /* eslint-disable @typescript-eslint/no-unsafe-return */
// /* eslint-disable @typescript-eslint/no-unsafe-call */
// // src/whatsapp-connection/whatsapp-connection.controller.ts

// /* eslint-disable prettier/prettier */
// import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
// import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
// import { Public } from 'src/auth/public.decorator';
// import { RolesGuard } from 'src/auth/roles.guard';
// import { WhatsAppConnectionService } from './whatsapp-connection.service';

// @Controller('whatsapp')
// @UseGuards(JwtAuthGuard, RolesGuard)
// export class WhatsAppConnectionController {
//   constructor(private readonly whatsappService: WhatsAppConnectionService) {}

//   @Public()
//   @Post('create-instance')
//   async createInstance(@Body() body: any) {
//     console.log('📥 Body recebido:', JSON.stringify(body, null, 2));
//     return this.whatsappService.createWhatsAppInstance(body);
//   }

//   @Public()
//   @Get('qrcode/:id')
//   async getQRCode(@Param('id') id: string) {
//     console.log(`📱 Buscando QR Code para instância ${id}`);
//     return this.whatsappService.getQRCode(parseInt(id));
//   }
// }
// src/whatsapp-connection/whatsapp-connection.controller.ts
// src/whatsapp-connection/whatsapp-connection.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  Req,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('whatsapp')
export class WhatsAppConnectionController {
  constructor(private readonly whatsappService: WhatsAppConnectionService) {}

  @Post('create-instance')
  async createInstance(@Body() dto: any) {
    return this.whatsappService.createWhatsAppInstance(dto);
  }

  @Get('qrcode/:id')
  async getQRCode(@Param('id') id: string) {
    return this.whatsappService.getQRCode(parseInt(id));
  }

  @Get('connection')
  @ApiOperation({ summary: 'Busca a conexão WhatsApp da empresa' })
  @ApiResponse({ status: 200, description: 'Conexão encontrada ou null' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async getConnection(@Req() req: any) {
    const companyId = req.user?.companyId;

    if (!companyId) {
      throw new UnauthorizedException('Empresa não identificada');
    }

    // 🔥 SEMPRE RETORNA 200 - PODE SER null OU A CONEXÃO
    const connection = await this.whatsappService.getConnection();

    return {
      success: true,
      data: connection, // PODE SER NULL
    };
  }

  @Get('token')
  @ApiOperation({ summary: 'Busca o token da conexão WhatsApp' })
  @ApiResponse({ status: 200, description: 'Token retornado com sucesso' })
  @ApiResponse({ status: 404, description: 'WhatsApp não configurado' })
  @ApiResponse({ status: 400, description: 'WhatsApp não está conectado' })
  async getToken(@Req() req: any) {
    try {
      const token = await this.whatsappService.getToken();
      return { success: true, token };
    } catch (error: any) {
      // 🔥 Tratamento específico para cada tipo de erro
      if (error.message.includes('não configurado')) {
        throw new NotFoundException(error.message);
      }
      if (error.message.includes('não está conectado')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Delete('disconnect')
  async disconnectInstance() {
    return this.whatsappService.disconnectInstance();
  }

  @Delete('instance/:id')
  async deleteInstance(@Param('id') id: string) {
    console.log(`🗑️ Recebendo requisição para deletar instância ID: ${id}`);
    return this.whatsappService.deleteInstance(parseInt(id));
  }
}

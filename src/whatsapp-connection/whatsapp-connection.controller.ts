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
import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

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
  async getConnection() {
    return this.whatsappService.getConnection();
  }
}

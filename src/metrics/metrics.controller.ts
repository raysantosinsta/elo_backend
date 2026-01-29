/* eslint-disable prettier/prettier */
import { Controller, Get, Res } from '@nestjs/common';
import express from 'express';
import { register } from 'prom-client';
import { Public } from 'src/auth/public.decorator';

@Controller('metrics') // O caminho da rota
export class MetricsController {
  
  @Public() // Libera o acesso
  @Get()
  async getMetrics(@Res() res: express.Response) {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
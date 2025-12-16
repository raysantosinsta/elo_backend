/* eslint-disable prettier/prettier */
// src/app.controller.ts (adicione este endpoint)
import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'ELO API',
    };
  }

  // @Public()
  // @Get('api/health')
  // apiHealthCheck() {
  //   return {
  //     status: 'ok',
  //     timestamp: new Date().toISOString(),
  //     endpoints: {
  //       notifications: '/notifications',
  //       tasks: '/tasks',
  //       auth: '/auth',
  //     },
  //   };
  // }
}
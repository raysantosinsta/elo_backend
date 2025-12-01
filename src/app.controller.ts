/* eslint-disable prettier/prettier */
// src/app.controller.ts (adicione este endpoint)
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Highlander API',
    };
  }

  @Get('api/health')
  apiHealthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      endpoints: {
        notifications: '/notifications',
        tasks: '/tasks',
        auth: '/auth',
      },
    };
  }
}
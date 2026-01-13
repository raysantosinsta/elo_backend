/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { UserRole } from '@prisma/client';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user) {
      // Salva dados cruciais no contexto isolado da requisição
      this.cls.set('tenantId', user.companyId);
      this.cls.set('userRole', user.role);
      this.cls.set('userId', user.id);
      
      // Flag rápida para saber se é master
      this.cls.set('isMaster', user.role === UserRole.MASTER);
    }

    return next.handle();
  }
}
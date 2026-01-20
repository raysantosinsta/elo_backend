/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/auth/tenant.interceptor.ts
/* eslint-disable prettier/prettier */
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // PEGAR O TOKEN BRUTO (String) caso precise repassar para outra API
    // Se o user existe, assume-se que o header authorization também existe
    const authHeader = request.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (user) {
      // Setup do Contexto (DADOS JÁ VALIDADOS PELO GUARD)
      this.cls.set('userId', user.id);
      this.cls.set('tenantId', user.companyId);
      this.cls.set('userRole', user.role);
      
      // Setup do Token Bruto (Útil se o backend precisar chamar outro microsserviço)
      this.cls.set('accessToken', token); 

      const isMaster = user.role === 'MASTER';
      this.cls.set('isMaster', isMaster);

      // Log simplificado para não poluir tanto, a menos que seja debug
      // this.logger.debug(`🔒 Contexto: User=${user.email}, Tenant=${user.companyId}`);
    } 

    return next.handle();
  }
}
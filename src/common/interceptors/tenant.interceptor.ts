/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/auth/tenant.interceptor.ts
/* eslint-disable prettier/prettier */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    this.logger.log(`🔍 [Interceptor] Iniciando request: ${request.method} ${request.url}`);

    if (user) {
      this.logger.log(`👤 [Interceptor] Usuário encontrado: ${user.email} (${user.role})`);
      this.logger.log(`🏢 [Interceptor] CompanyID no Token: ${user.companyId}`);

      // Setup do Contexto
      this.cls.set('userId', user.id);
      this.cls.set('tenantId', user.companyId);
      this.cls.set('userRole', user.role);
      
      const isMaster = user.role === 'MASTER';
      this.cls.set('isMaster', isMaster);

      this.logger.log(`🔒 [Interceptor] Contexto Definido -> IsMaster: ${isMaster}, TenantId: ${user.companyId}`);
    } else {
      this.logger.warn(`⚠️ [Interceptor] NENHUM usuário no request (Rota pública ou Guard falhou?)`);
    }

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`✅ [Interceptor] Request finalizado com sucesso`),
        error: (err) => this.logger.error(`❌ [Interceptor] Erro durante o processamento: ${err.message}`, err.stack),
      }),
    );
  }
}
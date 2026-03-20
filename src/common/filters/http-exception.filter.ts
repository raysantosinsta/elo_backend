/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';
    let errors: string[] = [];

    // 🔥 LOG DA REQUISIÇÃO
    console.log('\n' + '='.repeat(80));
    console.log('🔥 [EXCEPTION FILTER] ERRO CAPTURADO');
    console.log('='.repeat(80));
    console.log(`📌 Método: ${request.method}`);
    console.log(`📌 URL: ${request.url}`);
    console.log(`📌 Headers:`, request.headers);
    console.log(`📌 Body:`, JSON.stringify(request.body, null, 2));
    console.log(`📌 Query:`, request.query);
    console.log(`📌 Params:`, request.params);
    console.log('='.repeat(80));

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      // 🔥 LOG DO ERRO HTTP
      console.log(`\n❌ HTTP Exception - Status: ${status}`);
      console.log(`❌ Response:`, JSON.stringify(res, null, 2));
      console.log(`❌ Stack:`, exception.stack);

      // --- NOVA LÓGICA PARA PERMISSÃO ---
      if (status === HttpStatus.FORBIDDEN) {
        message = 'Você não tem permissão para realizar esta ação.';
      } 
      // --- VALIDAÇÃO DTO (400) ---
      else if (status === HttpStatus.BAD_REQUEST) {
        message = 'Erro de validação nos dados enviados';
        if (typeof res === 'object' && res !== null) {
          if (Array.isArray(res.message)) {
            errors = res.message;
            console.log(`📋 Erros de validação:`);
            errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
          } else if (res.message) {
            message = res.message;
          }
        }
      }
      // --- MANTER LÓGICA EXISTENTE ---
      else if (typeof res === 'object' && res !== null) {
        if (Array.isArray(res.message)) {
          message = 'Erros de validação encontrados';
          errors = res.message;
        } else {
          message = res.message || res.error || message;
        }
      } else {
        message = res;
      }
    } else {
      // 🔥 LOG DE ERRO NÃO HTTP (ex: erro interno)
      console.error(`\n❌ Erro não HTTP:`);
      console.error(exception);
    }

    // 🔥 LOG FINAL DO QUE SERÁ ENVIADO AO CLIENTE
    console.log('\n📤 Resposta enviada:');
    console.log(`   statusCode: ${status}`);
    console.log(`   message: ${message}`);
    if (errors.length > 0) {
      console.log(`   errors:`, errors);
    }
    console.log('='.repeat(80) + '\n');

    // Registrar no logger do NestJS também
    this.logger.error(`[${request.method}] ${request.url} - Status: ${status}`);
    this.logger.error(`   Body: ${JSON.stringify(request.body)}`);
    this.logger.error(`   Error: ${message}`);
    if (errors.length > 0) {
      this.logger.error(`   Validation errors: ${JSON.stringify(errors)}`);
    }

    // O Contrato JSON final permanece o mesmo para não quebrar o seu Front-end
    response.status(status).json({
      statusCode: status,
      message,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  }
}
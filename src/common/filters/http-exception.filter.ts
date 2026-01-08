/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';
    let errors: string[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      // --- NOVA LÓGICA PARA PERMISSÃO ---
      if (status === HttpStatus.FORBIDDEN) {
        message = 'Você não tem permissão para realizar esta ação.';
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
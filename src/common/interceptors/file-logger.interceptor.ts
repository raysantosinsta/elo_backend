/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class FileLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('FileDebug');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const files = request.files;

    if (files) {
      // Itera sobre os campos (images, audios, videos)
      Object.keys(files).forEach((key) => {
        const fileList = files[key];
        fileList.forEach((file) => {
          this.logger.warn(
            `📁 [Upload Check] Campo: ${key} | Nome: ${file.originalname} | Mimetype: '${file.mimetype}' | Tamanho: ${file.size}`,
          );
        });
      });
    } else {
      this.logger.warn('📁 [Upload Check] Nenhum arquivo encontrado no request.');
    }

    return next.handle();
  }
}
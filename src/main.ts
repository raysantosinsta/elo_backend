/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
// import compression = require('compression');
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // 1. Logger de Inicialização (Observabilidade)
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    // Ativa logs do sistema baseados em níveis (pode ser substituído por 'nestjs-pino' para JSON logs em prod)
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const server = app.getHttpAdapter().getInstance();
  server.set('trust proxy', 1);

  // 2. CONFIGURAÇÃO DE TAMANHO (Adicione estas duas linhas antes de tudo)
  // Permite uploads de até 500MB (ajuste conforme necessidade)

  const bodyLimit = process.env.BODY_LIMIT || '10mb';

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));



  // 2. Segurança (Security & Governance)
  // Helmet configura headers HTTP seguros (proteção contra XSS, Clickjacking, etc.)
  app.use(helmet());

  // CORS configurado para produção (aceita variáveis de ambiente)
  app.enableCors({
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // 3. Performance & Custo (Cost Control)
  // Compressão Gzip diminui o tamanho do payload JSON (menos custo de banda / resposta mais rápida)
  // app.use(compression());

  // 4. Governança e Evolução de API (Evolution)
  // Prefixo global evita conflitos com frontends servidos no mesmo domínio
  // app.setGlobalPrefix('api/v1');

  // Versionamento de API (permite evoluir endpoints sem quebrar clientes antigos: /v1/, /v2/)
  // app.enableVersioning({
  //   type: VersioningType.URI,
  // });

  // 5. Validação e Sanitização Global (Reliability & Security)
  // Bloqueia dados que não estão nos DTOs (whitelist) e transforma payloads (transform)
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: true, // Remove propriedades não decoradas no DTO (Sanitização)
      // forbidNonWhitelisted: true, // Retorna erro se enviar campo extra (Segurança estrita)
      transform: true, // Converte tipos automaticamente (ex: string "1" -> number 1)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Ativa filtro de erro global
  app.useGlobalFilters(new AllExceptionsFilter());

  // 6. Resiliência (Resilience)
  // Garante que a aplicação ouça sinais de encerramento (SIGTERM) para fechar conexões de banco graciosamente
  app.enableShutdownHooks();

  // 7. Documentação Swagger (DevEx)
  // Só ativa em ambiente de desenvolvimento ou homologação para não expor a API map em produção
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Elo Produtivo API')
      .setDescription('API de gestão e produção com arquitetura resiliente')
      .setVersion('1.0')
      .addBearerAuth() // Adiciona botão de autenticação JWT no Swagger
      .addTag('Companies', 'Endpoints de gestão de empresas')
      // .addTag('Tasks', 'Endpoints de tarefas') // Adicione conforme crescer
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs/json', // URL para exportar o JSON do Swagger
    });
    logger.log('Swagger is running on: /api/docs');
  }


  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application is running on: ${await app.getUrl()}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}
bootstrap();

// /* eslint-disable prettier/prettier */
// import { NestFactory } from '@nestjs/core';
// import { AppModule } from './app.module';

// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);

//   // No backend (Nest.js exemplo)
//   app.enableCors({
//     origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
//     credentials: true,
//   });

//   await app.listen(process.env.PORT ?? 3000);
// }
// bootstrap();

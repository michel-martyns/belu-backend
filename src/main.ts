import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  GlobalExceptionFilter,
  LoggingInterceptor,
  createValidationPipe,
} from './common';
import { configureBullBoard } from './queues/bull-board.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // CORS
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:4000', 'http://localhost:3000'],
    credentials: true,
  });

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global Validation Pipe (com mensagens em português)
  app.useGlobalPipes(createValidationPipe());

  // Global Logging Interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Prefixo da API
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/live', 'health/ready', 'admin/queues'],
  });

  // Configurar Bull Board para monitoramento de filas
  configureBullBoard(app);

  // Configurar Swagger/OpenAPI (temporariamente desabilitado para testes)
  // TODO: Corrigir dependência circular em AuditStatsDto
  /*
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Belu API')
    .setDescription('API do Sistema Belu')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Insira o token JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'Belu API Documentation',
  });
  */

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  logger.log(`Backend running on http://localhost:${port}`);
  logger.log(`API available at http://localhost:${port}/api`);
  logger.log(`API Documentation at http://localhost:${port}/api/docs`);
  logger.log(`Health check at http://localhost:${port}/health`);
  logger.log(`Queue Dashboard at http://localhost:${port}/admin/queues`);
}
bootstrap();

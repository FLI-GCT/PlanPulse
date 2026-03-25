import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './core/app.module';
import { TEnvVariables } from './core/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ prefix: 'PlanPulse' }),
  });

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  const configService = app.get(ConfigService<TEnvVariables>);

  const corsOrigins = JSON.parse(configService.get<string>('CORS_ORIGINS')!);
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const prefix = configService.get<string>('ROOT_PATH_PREFIX')!;
  app.setGlobalPrefix(prefix);

  // Socket.IO adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('PlanPulse API')
    .setDescription('API de planification dynamique de production')
    .setVersion('0.1.0')
    .addTag('OF', 'Ordres de fabrication')
    .addTag('Achat', 'Achats')
    .addTag('Nomenclature', 'Nomenclatures (BOM)')
    .addTag('Graph', 'Graphe de dependances (DAG)')
    .addTag('KPI', 'Indicateurs cles')
    .addTag('Alert', 'Alertes')
    .addTag('Scenario', 'Scenarios what-if')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document);

  const port = configService.get<number>('PORT')!;
  await app.listen(port);

  console.info(`PlanPulse API running on http://localhost:${port}${prefix}/docs`);
}

bootstrap().catch((error) => {
  console.error('Error starting PlanPulse:', error);
  process.exit(1);
});

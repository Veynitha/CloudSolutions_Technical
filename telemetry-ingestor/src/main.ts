/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Config
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', { infer: true }) ?? 3000;
  const levels = config.get<string[]>('app.logLevels', { infer: true }) ?? [
    'log',
    'error',
    'warn',
  ];

  app.useLogger(levels as any);
  app.setGlobalPrefix('api');

  // Security & limits
  app.use(helmet());
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));

  // Global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`HTTP server listening on http://localhost:${port}/api`);
}
bootstrap();

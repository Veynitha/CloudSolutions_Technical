import { registerAs } from '@nestjs/config';

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  redisUrl: string;
  alertWebhookUrl: string;
  ingestToken: string;
  logLevels: string[]; // Nest logger levels
};

export default registerAs<AppConfig>('app', () => ({
  nodeEnv: (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'],
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGO_URI as string,
  redisUrl: process.env.REDIS_URL as string,
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL ?? '',
  ingestToken: process.env.INGEST_TOKEN ?? '',
  logLevels: (process.env.LOG_LEVEL ?? 'log,error,warn')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}));

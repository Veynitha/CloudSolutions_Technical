import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('app.redisUrl', { infer: true })!;
    this.client = new Redis(url, {
      lazyConnect: false,
      enableReadyCheck: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 2,
    });

    this.client.on('ready', () => {
      console.log('[redis] connected');
    });
    this.client.on('error', (err) => {
      console.error('[redis] error', err?.message);
    });
  }

  get raw(): Redis {
    return this.client;
  }

  async setJSON(key: string, value: unknown, ttlSeconds?: number) {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  async getJSON<T = any>(key: string): Promise<T | null> {
    const s = await this.client.get(key);
    return s ? (JSON.parse(s) as T) : null;
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

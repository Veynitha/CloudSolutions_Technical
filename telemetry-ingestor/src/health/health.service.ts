/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { RedisService } from '../cache/redis.service';

type ComponentStatus = 'up' | 'down' | 'degraded';
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  mongo: { status: ComponentStatus; details?: string };
  redis: { status: ComponentStatus; details?: string };
  uptimeSec: number;
  timestamp: string;
  version: string;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService,
  ) {}

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`timeout after ${ms}ms`)),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(t);
          resolve(value);
        },
        (error) => {
          clearTimeout(t);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private async checkMongo(): Promise<{
    status: ComponentStatus;
    details?: string;
  }> {
    try {
      if (!this.connection.db || !this.connection.db.admin) {
        throw new Error('MongoDB connection or admin is undefined');
      }
      await this.withTimeout(
        this.connection.db.admin().command({ ping: 1 }),
        2000,
      );
      return { status: 'up' };
    } catch (err: any) {
      return { status: 'down', details: err?.message ?? String(err) };
    }
  }

  private async checkRedis(): Promise<{
    status: ComponentStatus;
    details?: string;
  }> {
    try {
      const res = await this.withTimeout(this.redis.raw.ping(), 2000);
      return String(res).toUpperCase() === 'PONG'
        ? { status: 'up' }
        : { status: 'degraded', details: `unexpected reply: ${res}` };
    } catch (err: any) {
      return { status: 'down', details: err?.message ?? String(err) };
    }
  }

  async report(): Promise<HealthReport> {
    const [mongo, redis] = await Promise.all([
      this.checkMongo(),
      this.checkRedis(),
    ]);
    const components = [mongo.status, redis.status];

    const status: HealthReport['status'] = components.every((s) => s === 'up')
      ? 'ok'
      : components.some((s) => s === 'down')
        ? 'down'
        : 'degraded';

    return {
      status,
      mongo,
      redis,
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry } from './schema/telemetry.schema';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import {
  InsertManyTelemetryResponse,
  InsertOneTelemetryResponse,
} from './types/types';
import { RedisService } from '../cache/redis.service';
import { TelemetryPublic, toPublic } from './telemetry.public';

const LATEST_TTL_SECONDS = 60 * 60 * 24; // 24h; adjust or remove if you don’t want TTL
const latestKey = (deviceId: string) => `latest:${deviceId}`;

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<Telemetry>,
    private readonly redis: RedisService,
  ) {}

  private async upsertLatestIfNewer(doc: Telemetry) {
    const key = latestKey(doc.deviceId);
    const cached = await this.redis.getJSON<TelemetryPublic>(key);
    const incomingTs = doc.ts instanceof Date ? doc.ts : new Date(doc.ts);
    const cachedTs = cached ? new Date(cached.ts) : null;

    if (!cachedTs || incomingTs > cachedTs) {
      await this.redis.setJSON(key, toPublic(doc), LATEST_TTL_SECONDS);
    }
  }

  private formatDocStructure(dto: CreateTelemetryDto) {
    return {
      deviceId: dto.deviceId,
      siteId: dto.siteId,
      ts: new Date(dto.ts),
      metrics: {
        temperature: dto.metrics.temperature,
        humidity: dto.metrics.humidity,
      },
    };
  }

  async saveOne(dto: CreateTelemetryDto) {
    const doc = this.formatDocStructure(dto);
    const response: InsertOneTelemetryResponse =
      await this.telemetryModel.create(doc);
    await this.upsertLatestIfNewer(response);
    return response;
  }

  async saveMany(dtos: CreateTelemetryDto[]) {
    const docs = dtos.map((dto) => this.formatDocStructure(dto));
    const response: InsertManyTelemetryResponse =
      await this.telemetryModel.insertMany(docs, {
        ordered: true,
      });

    // Update Redis cache for each inserted document
    const perDeviceLatest = new Map<string, Telemetry>();
    for (const doc of response) {
      const prev = perDeviceLatest.get(doc.deviceId);
      if (!prev || (doc.ts as any) > (prev.ts as any)) {
        perDeviceLatest.set(doc.deviceId, doc);
      }
    }

    await Promise.all(
      Array.from(perDeviceLatest.values()).map((doc) =>
        this.upsertLatestIfNewer(doc),
      ),
    );

    return {
      inserted: response.length,
      docs: response.map((d) => toPublic(d)),
    };
  }
}

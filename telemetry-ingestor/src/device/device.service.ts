/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry } from '../telemetry/schema/telemetry.schema';
import { TelemetryPublic, toPublic } from '../telemetry/telemetry.public';

const LATEST_TTL_SECONDS = 60 * 60 * 24;
const latestKey = (deviceId: string) => `latest:${deviceId}`;

@Injectable()
export class DeviceService {
  constructor(
    private readonly redis: RedisService,
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<Telemetry>,
  ) {}

  async getLatest(deviceId: string): Promise<TelemetryPublic> {
    // Check device ID in redis
    const key = latestKey(deviceId);
    const cached = await this.redis.getJSON<TelemetryPublic>(key);
    if (cached) return cached;

    // 2) Mongo fallback
    const doc = await this.telemetryModel
      .findOne({ deviceId })
      .sort({ ts: -1 })
      .lean<Telemetry>(); // lean returns plain object (no mongoose Doc methods)

    if (!doc)
      throw new NotFoundException(`No telemetry for device ${deviceId}`);

    const pub = toPublic({
      ...doc,
      _id: doc._id as any,
      ts: doc.ts as any,
    } as any);

    // 3) Backfill Redis
    await this.redis.setJSON(key, pub, LATEST_TTL_SECONDS);
    return pub;
  }
}

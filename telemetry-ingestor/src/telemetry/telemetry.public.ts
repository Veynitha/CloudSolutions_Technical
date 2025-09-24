/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Types } from 'mongoose';
import { MetricsDto } from './dto/metrics.dto';

export type TelemetryPublic = {
  id: string;
  deviceId: string;
  siteId: string;
  ts: string; // ISO
  metrics: { temperature: number; humidity: number };
  createdAt?: string;
  updatedAt?: string;
};

export function toPublic<
  T extends {
    _id: any;
    deviceId: string;
    siteId: string;
    ts: Date;
    metrics: MetricsDto;
    createdAt?: Date;
    updatedAt?: Date;
  },
>(d: T): TelemetryPublic {
  return {
    id: d._id instanceof Types.ObjectId ? d._id.toString() : String(d._id),
    deviceId: d.deviceId,
    siteId: d.siteId,
    ts:
      d.ts instanceof Date
        ? d.ts.toISOString()
        : new Date(d.ts as any).toISOString(),
    metrics: {
      temperature: d.metrics.temperature,
      humidity: d.metrics.humidity,
    },
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  };
}

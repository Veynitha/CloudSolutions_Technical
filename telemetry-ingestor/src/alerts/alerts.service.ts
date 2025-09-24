/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import axios from 'axios';

export type AlertReason = 'HIGH_TEMPERATURE' | 'HIGH_HUMIDITY';

export interface AlertPayload {
  deviceId: string;
  siteId: string;
  ts: string;
  reason: AlertReason;
  value: number;
}

const DEDUP_TTL_SEC = 60;
const alertKey = (deviceId: string, reason: AlertReason) =>
  `alert:${deviceId}:${reason}`;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly webhookUrl: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.webhookUrl =
      this.cfg.get<string>('app.alertWebhookUrl', { infer: true }) ?? '';
    if (!this.webhookUrl) {
      this.logger.warn('ALERT_WEBHOOK_URL is empty — alerts are DISABLED');
    }
  }

  async maybeSendFor(reading: {
    deviceId: string;
    siteId: string;
    ts: Date;
    metrics: { temperature: number; humidity: number };
  }) {
    if (!this.webhookUrl) return; // disabled

    const candidates: AlertPayload[] = [];
    const { deviceId, siteId, ts, metrics } = reading;

    if (typeof metrics.temperature === 'number' && metrics.temperature > 50) {
      candidates.push({
        deviceId,
        siteId,
        ts: ts.toISOString(),
        reason: 'HIGH_TEMPERATURE',
        value: metrics.temperature,
      });
    }
    if (typeof metrics.humidity === 'number' && metrics.humidity > 90) {
      candidates.push({
        deviceId,
        siteId,
        ts: ts.toISOString(),
        reason: 'HIGH_HUMIDITY',
        value: metrics.humidity,
      });
    }

    if (candidates.length === 0) return;

    await Promise.all(
      candidates.map(async (payload) => {
        // 60s dedup per device+reason
        const key = alertKey(payload.deviceId, payload.reason);
        const set = await this.redis.raw.set(key, '1', 'EX', DEDUP_TTL_SEC);
        if (set !== 'OK') {
          // duplicate within window — skip silently
          return;
        }

        // POST with a short timeout; small retry if transient
        const postOnce = () =>
          axios.post(this.webhookUrl, payload, {
            timeout: 3000,
            headers: { 'Content-Type': 'application/json' },
          });

        try {
          try {
            await postOnce();
          } catch (error) {
            this.logger.warn(
              `Webhook failed once, retrying… reason=${payload.reason} device=${payload.deviceId}`,
            );
            await postOnce(); // one retry
          }
          this.logger.log(
            `Alert sent: ${payload.reason} device=${payload.deviceId} value=${payload.value}`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to send alert: ${payload.reason} device=${payload.deviceId} — ${err?.message ?? err}`,
          );
        }
      }),
    );
  }
}

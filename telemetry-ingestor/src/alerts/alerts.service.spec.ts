/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import axios from 'axios';

// ---- Mocks ----
jest.mock('axios');

const redisSetMock = jest.fn();

const redisMock = {
  raw: {
    set: redisSetMock,
  },
};

const cfgMockWithUrl = (url: string) => ({
  get: jest.fn((key: string) =>
    key === 'app.alertWebhookUrl' ? url : undefined,
  ),
});

describe('AlertsService.maybeSendFor', () => {
  const WEBHOOK_URL = 'https://webhook.site/your-id';

  // silence logger output during tests
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const build = async (configService: any) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: ConfigService, useValue: configService },
        {
          provide: require('../cache/redis.service').RedisService,
          useValue: redisMock,
        },
      ],
    }).compile();
    return moduleRef.get(AlertsService);
  };

  const readingBase = {
    deviceId: 'dev-001',
    siteId: 'site-A',
    ts: new Date('2025-09-01T10:00:00.000Z'),
    metrics: { temperature: 0, humidity: 0 },
  };

  it('does nothing when ALERT_WEBHOOK_URL is empty (alerts disabled)', async () => {
    const service = await build(cfgMockWithUrl('')); // empty URL => disabled
    await service.maybeSendFor({
      ...readingBase,
      metrics: { temperature: 60, humidity: 95 },
    });
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(axios.post as jest.Mock).not.toHaveBeenCalled();
  });

  it('sends HIGH_TEMPERATURE alert when temperature > 50', async () => {
    const service = await build(cfgMockWithUrl(WEBHOOK_URL));
    redisSetMock.mockResolvedValue('OK'); // pass dedup gate
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    const reading = {
      ...readingBase,
      metrics: { temperature: 51.2, humidity: 40 },
    };
    await service.maybeSendFor(reading);

    // dedup key and TTL
    expect(redisSetMock).toHaveBeenCalledTimes(1);
    const [key, value, ex, ttl] = redisSetMock.mock.calls[0];
    expect(key).toBe('alert:dev-001:HIGH_TEMPERATURE');
    expect(value).toBe('1');
    expect(ex).toBe('EX');
    expect(ttl).toBe(60);

    // webhook POST
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      WEBHOOK_URL,
      {
        deviceId: 'dev-001',
        siteId: 'site-A',
        ts: '2025-09-01T10:00:00.000Z',
        reason: 'HIGH_TEMPERATURE',
        value: 51.2,
      },
      { timeout: 3000, headers: { 'Content-Type': 'application/json' } },
    );
  });

  it('sends both alerts when temperature >50 and humidity >90', async () => {
    const service = await build(cfgMockWithUrl(WEBHOOK_URL));
    // let both dedup gates succeed
    redisSetMock.mockResolvedValue('OK');
    (axios.post as jest.Mock).mockResolvedValue({ status: 200 });

    const reading = {
      ...readingBase,
      metrics: { temperature: 55, humidity: 95 },
    };
    await service.maybeSendFor(reading);

    // two dedup attempts for two reasons
    expect(redisSetMock).toHaveBeenCalledTimes(2);
    const dedupKeys = redisSetMock.mock.calls.map((c) => c[0]).sort();
    expect(dedupKeys).toEqual([
      'alert:dev-001:HIGH_HUMIDITY',
      'alert:dev-001:HIGH_TEMPERATURE',
    ]);

    // two webhook POSTs
    expect(axios.post).toHaveBeenCalledTimes(2);
    const payloads = (axios.post as jest.Mock).mock.calls
      .map((c) => c[1])
      .sort((a: any, b: any) => a.reason.localeCompare(b.reason));
    expect(payloads[0]).toMatchObject({ reason: 'HIGH_HUMIDITY', value: 95 });
    expect(payloads[1]).toMatchObject({
      reason: 'HIGH_TEMPERATURE',
      value: 55,
    });
  });

  it('skips sending when dedup key already exists (redis set != "OK")', async () => {
    const service = await build(cfgMockWithUrl(WEBHOOK_URL));
    // simulate dedup already set (e.g., returns null)
    redisSetMock.mockResolvedValue(null);

    const reading = {
      ...readingBase,
      metrics: { temperature: 60, humidity: 40 },
    };
    await service.maybeSendFor(reading);

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('retries once when first POST fails, then succeeds', async () => {
    const service = await build(cfgMockWithUrl(WEBHOOK_URL));
    redisSetMock.mockResolvedValue('OK');

    // First call throws, second resolves
    (axios.post as jest.Mock)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ status: 200 });

    const reading = {
      ...readingBase,
      metrics: { temperature: 60, humidity: 40 },
    };
    await service.maybeSendFor(reading);

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    // two attempts due to retry
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('logs error (and does not throw) when both POST attempts fail', async () => {
    const service = await build(cfgMockWithUrl(WEBHOOK_URL));
    redisSetMock.mockResolvedValue('OK');

    (axios.post as jest.Mock)
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'));

    const reading = {
      ...readingBase,
      metrics: { temperature: 60, humidity: 40 },
    };
    await expect(service.maybeSendFor(reading)).resolves.toBeUndefined();

    expect(redisSetMock).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no thresholds are breached', async () => {
    const service = await build(cfgMockWithUrl(WEBHOOK_URL));
    const reading = {
      ...readingBase,
      metrics: { temperature: 30, humidity: 40 },
    };
    await service.maybeSendFor(reading);
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});

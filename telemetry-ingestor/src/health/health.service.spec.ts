/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { HealthService } from './health.service';

// Minimal Redis mock with the `raw` interface used by the service
const redisMock = {
  raw: {
    ping: jest.fn(),
  },
};

function makeMongoConnectionMock() {
  // We simulate the shape: connection.db.admin().command(...)
  const command = jest.fn();
  const admin = jest.fn(() => ({ command }));
  const db = { admin } as unknown as Connection['db'];
  const connection = { db } as unknown as Connection;
  return { connection, db, admin, command };
}

describe('HealthService', () => {
  let service: HealthService;
  let mongo: ReturnType<typeof makeMongoConnectionMock>;

  beforeEach(async () => {
    jest.useRealTimers();
    jest.resetAllMocks();

    mongo = makeMongoConnectionMock();

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: getConnectionToken(), useValue: mongo.connection },
        { provide: 'RedisService', useValue: redisMock }, // fallback token in case DI by class name fails
        {
          provide: require('../cache/redis.service').RedisService,
          useValue: redisMock,
        }, // prefer class token
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  const expectCommonShape = (report: any) => {
    expect(['ok', 'degraded', 'down']).toContain(report.status);
    expect(['up', 'degraded', 'down']).toContain(report.mongo.status);
    expect(['up', 'degraded', 'down']).toContain(report.redis.status);
    expect(typeof report.uptimeSec).toBe('number');
    expect(report.uptimeSec).toBeGreaterThanOrEqual(0);
    expect(typeof report.timestamp).toBe('string');
    // version comes from env; default '0.0.0' per service
    expect(typeof report.version).toBe('string');
  };

  it('returns status "ok" when Mongo ping = ok and Redis ping = PONG', async () => {
    // Mongo OK
    mongo.admin().command.mockResolvedValue({ ok: 1 });
    // Redis OK
    redisMock.raw.ping.mockResolvedValue('PONG');

    const report = await service.report();

    expect(report.status).toBe('ok');
    expect(report.mongo.status).toBe('up');
    expect(report.redis.status).toBe('up');
    expectCommonShape(report);

    expect(mongo.admin).toHaveBeenCalled();
    expect(mongo.admin().command).toHaveBeenCalledWith({ ping: 1 });
    expect(redisMock.raw.ping).toHaveBeenCalledTimes(1);
  });

  it('marks Redis as "degraded" when ping reply is unexpected (not PONG)', async () => {
    mongo.admin().command.mockResolvedValue({ ok: 1 });
    redisMock.raw.ping.mockResolvedValue('OK'); // unexpected

    const report = await service.report();

    expect(report.redis.status).toBe('degraded');
    // overall degraded since mongo=up and redis=degraded
    expect(report.status).toBe('degraded');
    expect(report.redis.details).toMatch(/unexpected reply/i);
    expectCommonShape(report);
  });

  it('marks Redis as "down" when ping throws, overall "down"', async () => {
    mongo.admin().command.mockResolvedValue({ ok: 1 });
    redisMock.raw.ping.mockRejectedValue(new Error('redis unavailable'));

    const report = await service.report();

    expect(report.mongo.status).toBe('up');
    expect(report.redis.status).toBe('down');
    expect(report.status).toBe('down');
    expect(report.redis.details).toContain('redis unavailable');
    expectCommonShape(report);
  });

  it('marks Mongo as "down" when admin().command rejects, overall "down"', async () => {
    mongo.admin().command.mockRejectedValue(new Error('mongo ping failed'));
    redisMock.raw.ping.mockResolvedValue('PONG');

    const report = await service.report();

    expect(report.mongo.status).toBe('down');
    expect(report.mongo.details).toContain('mongo ping failed');
    expect(report.redis.status).toBe('up');
    expect(report.status).toBe('down');
    expectCommonShape(report);
  });

  it('marks Mongo as "down" when connection.db or admin is undefined', async () => {
    // simulate missing admin()
    (mongo.connection as any).db = undefined;
    // Redis OK so overall depends on mongo only
    redisMock.raw.ping.mockResolvedValue('PONG');

    const report = await service.report();

    expect(report.mongo.status).toBe('down');
    expect(report.redis.status).toBe('up');
    expect(report.status).toBe('down');
    expectCommonShape(report);
  });

  it('computes overall status "degraded" when neither is down but at least one is degraded', async () => {
    // Mongo up
    mongo.admin().command.mockResolvedValue({ ok: 1 });
    // Redis degraded
    redisMock.raw.ping.mockResolvedValue('HELLO');

    const report = await service.report();

    expect(report.mongo.status).toBe('up');
    expect(report.redis.status).toBe('degraded');
    expect(report.status).toBe('degraded');
  });
});

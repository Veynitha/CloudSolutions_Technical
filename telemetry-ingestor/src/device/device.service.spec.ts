/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { DeviceService } from './device.service';
import { RedisService } from '../cache/redis.service';
import { Telemetry } from '../telemetry/schema/telemetry.schema';
import { TelemetryPublic } from '../telemetry/telemetry.public';

describe('DeviceService.getLatest', () => {
  let service: DeviceService;

  // Mocks
  const redisMock = {
    getJSON: jest.fn(),
    setJSON: jest.fn(),
  };

  const telemetryModelMock = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: RedisService, useValue: redisMock },
        // eslint-disable-next-line prettier/prettier
        { provide: getModelToken(Telemetry.name), useValue: telemetryModelMock },
      ],
    }).compile();

    service = moduleRef.get(DeviceService);
  });

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  function mockMongoChainResolve(doc: any | null) {
    const sort = jest.fn().mockReturnThis();
    const lean = jest.fn().mockResolvedValue(doc);
    telemetryModelMock.findOne.mockReturnValue({ sort, lean });
    return { sort, lean };
  }

  it('returns cached value when Redis has latest (no Mongo call, no cache set)', async () => {
    const deviceId = 'dev-001';
    const cached: TelemetryPublic = {
      id: 'abc123',
      deviceId,
      siteId: 'site-A',
      ts: '2025-09-01T10:00:00.000Z',
      metrics: { temperature: 22.2, humidity: 55 },
      createdAt: '2025-09-24T00:00:00.000Z',
      updatedAt: '2025-09-24T00:00:00.000Z',
    };

    redisMock.getJSON.mockResolvedValue(cached);

    const res = await service.getLatest(deviceId);

    expect(res).toEqual(cached);
    expect(redisMock.getJSON).toHaveBeenCalledWith(`latest:${deviceId}`);
    expect(telemetryModelMock.findOne).not.toHaveBeenCalled();
    expect(redisMock.setJSON).not.toHaveBeenCalled();
  });

  it('falls back to Mongo when cache miss, returns public doc and backfills Redis with TTL', async () => {
    const deviceId = 'dev-002';
    redisMock.getJSON.mockResolvedValue(null);

    // Simulate Mongo doc returned by lean()
    const mongoDoc = {
      _id: new Types.ObjectId(),
      deviceId,
      siteId: 'site-A',
      ts: new Date('2025-09-01T10:01:00.000Z'),
      metrics: { temperature: 25.1, humidity: 60 },
      createdAt: new Date('2025-09-24T10:00:00.000Z'),
      updatedAt: new Date('2025-09-24T10:00:00.000Z'),
    };
    const { sort, lean } = mockMongoChainResolve(mongoDoc);

    const res = await service.getLatest(deviceId);

    // verify Mongo query chain
    expect(telemetryModelMock.findOne).toHaveBeenCalledWith({ deviceId });
    expect(sort).toHaveBeenCalledWith({ ts: -1 });
    expect(lean).toHaveBeenCalled();

    // result shape (toPublic applied)
    expect(res.deviceId).toBe(deviceId);
    expect(res.siteId).toBe('site-A');
    expect(res.ts).toBe('2025-09-01T10:01:00.000Z');
    expect(res.metrics).toEqual({ temperature: 25.1, humidity: 60 });
    expect(typeof res.id).toBe('string');

    // backfill to Redis with TTL (24h = 86400s)
    expect(redisMock.setJSON).toHaveBeenCalledTimes(1);
    const [keyArg, pubArg, ttlArg] = redisMock.setJSON.mock.calls[0];
    expect(keyArg).toBe(`latest:${deviceId}`);
    expect(pubArg).toEqual(res);
    expect(ttlArg).toBe(60 * 60 * 24);
  });

  it('throws NotFoundException when neither cache nor Mongo has data', async () => {
    const deviceId = 'dev-003';
    redisMock.getJSON.mockResolvedValue(null);
    mockMongoChainResolve(null);

    // eslint-disable-next-line prettier/prettier
    await expect(service.getLatest(deviceId)).rejects.toBeInstanceOf(NotFoundException);

    expect(redisMock.setJSON).not.toHaveBeenCalled();
  });

  it('uses the correct Redis key format', async () => {
    const deviceId = 'X-100';
    redisMock.getJSON.mockResolvedValue(null);

    const mongoDoc = {
      _id: 'oid-like',
      deviceId,
      siteId: 's',
      ts: new Date('2025-01-01T00:00:00.000Z'),
      metrics: { temperature: 1, humidity: 2 },
    };
    mockMongoChainResolve(mongoDoc);

    await service.getLatest(deviceId);

    expect(redisMock.getJSON).toHaveBeenCalledWith(`latest:${deviceId}`);
    expect(redisMock.setJSON).toHaveBeenCalledWith(
      `latest:${deviceId}`,
      expect.objectContaining({ deviceId }),
      60 * 60 * 24,
    );
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { TelemetryService } from './telemetry.service';
import { Telemetry } from './schema/telemetry.schema';
import { RedisService } from '../cache/redis.service';
import { AlertsService } from '../alerts/alerts.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { TelemetryPublic } from './telemetry.public';

// If your toPublic has complex logic and you only want to assert shape,
// you can keep it real. Here we exercise the real toPublic through service.

describe('TelemetryService', () => {
  let service: TelemetryService;

  const telemetryModelMock = {
    create: jest.fn(),
    insertMany: jest.fn(),
  };

  const redisMock = {
    getJSON: jest.fn(),
    setJSON: jest.fn(),
  };

  const alertsMock = {
    maybeSendFor: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TelemetryService,
        {
          provide: getModelToken(Telemetry.name),
          useValue: telemetryModelMock,
        },
        { provide: RedisService, useValue: redisMock },
        { provide: AlertsService, useValue: alertsMock },
      ],
    }).compile();

    service = moduleRef.get(TelemetryService);
  });

  const makeDto = (
    overrides: Partial<CreateTelemetryDto> = {},
  ): CreateTelemetryDto => ({
    deviceId: 'dev-1',
    siteId: 'site-A',
    ts: '2025-09-01T10:00:00.000Z',
    metrics: { temperature: 25.5, humidity: 60 },
    ...overrides,
  });

  const makeDoc = (overrides: Partial<any> = {}) => ({
    _id: new Types.ObjectId(),
    deviceId: 'dev-1',
    siteId: 'site-A',
    ts: new Date('2025-09-01T10:00:00.000Z'),
    metrics: { temperature: 25.5, humidity: 60 },
    createdAt: new Date('2025-09-24T10:00:00.000Z'),
    updatedAt: new Date('2025-09-24T10:00:00.000Z'),
    ...overrides,
  });

  describe('saveOne', () => {
    it('creates a doc, updates Redis when cache empty, calls alerts, and returns created doc', async () => {
      const dto = makeDto();
      const created = makeDoc();

      telemetryModelMock.create.mockImplementation(async (arg: any) => {
        // Ensure service converted ts to Date before calling create
        expect(arg.ts).toBeInstanceOf(Date);
        return created;
      });

      // Cache miss
      redisMock.getJSON.mockResolvedValue(null);

      const res = await service.saveOne(dto);

      // Model.create called once
      expect(telemetryModelMock.create).toHaveBeenCalledTimes(1);

      // Redis read latest:<deviceId>
      expect(redisMock.getJSON).toHaveBeenCalledWith('latest:dev-1');

      // Redis set latest with TTL 24h
      expect(redisMock.setJSON).toHaveBeenCalledTimes(1);
      const [key, value, ttl] = redisMock.setJSON.mock.calls[0];
      expect(key).toBe('latest:dev-1');
      // value is TelemetryPublic
      expect((value as TelemetryPublic).deviceId).toBe('dev-1');
      expect(ttl).toBe(60 * 60 * 24);

      // Alerts called for created doc
      expect(alertsMock.maybeSendFor).toHaveBeenCalledTimes(1);
      expect(alertsMock.maybeSendFor).toHaveBeenCalledWith(created);

      // Returned the created mongoose doc
      expect(res).toBe(created);
    });

    it('skips Redis set when cached ts is newer or equal', async () => {
      const dto = makeDto({ ts: '2025-09-01T10:00:00.000Z' });
      const created = makeDoc({ ts: new Date('2025-09-01T10:00:00.000Z') });
      telemetryModelMock.create.mockResolvedValue(created);

      // Cache has newer timestamp
      redisMock.getJSON.mockResolvedValue({
        id: 'cached-id',
        deviceId: 'dev-1',
        siteId: 'site-A',
        ts: '2025-09-01T10:05:00.000Z', // newer than created.ts
        metrics: { temperature: 30, humidity: 50 },
      } as TelemetryPublic);

      await service.saveOne(dto);

      // Should read cache, but not set since cached is newer
      expect(redisMock.getJSON).toHaveBeenCalledWith('latest:dev-1');
      expect(redisMock.setJSON).not.toHaveBeenCalled();

      // Still calls alerts
      expect(alertsMock.maybeSendFor).toHaveBeenCalledWith(created);
    });
  });

  describe('saveMany', () => {
    it('inserts many, updates Redis only for latest per device, calls alerts for each, and returns shape', async () => {
      const batch: CreateTelemetryDto[] = [
        makeDto({
          deviceId: 'dev-A',
          ts: '2025-09-01T10:00:00.000Z',
          metrics: { temperature: 21, humidity: 55 },
        }),
        makeDto({
          deviceId: 'dev-A',
          ts: '2025-09-01T10:01:00.000Z',
          metrics: { temperature: 22, humidity: 56 },
        }),
        makeDto({
          deviceId: 'dev-B',
          ts: '2025-09-01T09:59:59.000Z',
          metrics: { temperature: 23, humidity: 57 },
        }),
      ];

      const createdDocs = [
        makeDoc({
          deviceId: 'dev-A',
          ts: new Date('2025-09-01T10:00:00.000Z'),
          metrics: { temperature: 21, humidity: 55 },
        }),
        makeDoc({
          deviceId: 'dev-A',
          ts: new Date('2025-09-01T10:01:00.000Z'),
          metrics: { temperature: 22, humidity: 56 },
        }),
        makeDoc({
          deviceId: 'dev-B',
          ts: new Date('2025-09-01T09:59:59.000Z'),
          metrics: { temperature: 23, humidity: 57 },
        }),
      ];

      telemetryModelMock.insertMany.mockImplementation(async (arg: any) => {
        // Ensure service converted ts to Date for all docs before insert
        expect(Array.isArray(arg)).toBe(true);
        expect(arg[0].ts).toBeInstanceOf(Date);
        expect(arg[1].ts).toBeInstanceOf(Date);
        expect(arg[2].ts).toBeInstanceOf(Date);
        return createdDocs;
      });

      // Cache miss for both devices → allow setJSON
      redisMock.getJSON.mockResolvedValue(null);

      const res = await service.saveMany(batch);

      // insertMany called once, ordered true
      expect(telemetryModelMock.insertMany).toHaveBeenCalledTimes(1);
      const [, options] = telemetryModelMock.insertMany.mock.calls[0];
      expect(options).toMatchObject({ ordered: true });

      // Alerts called once per created doc
      expect(alertsMock.maybeSendFor).toHaveBeenCalledTimes(createdDocs.length);
      createdDocs.forEach((d) =>
        expect(alertsMock.maybeSendFor).toHaveBeenCalledWith(d),
      );

      // Redis: for dev-A, only newest (10:01) should be set; for dev-B the single one
      const setCalls = redisMock.setJSON.mock.calls;
      // Could be 2 calls (dev-A latest, dev-B)
      expect(setCalls.length).toBe(2);

      // Collect keys used
      const keys = setCalls.map((c) => c[0]).sort();
      expect(keys).toEqual(['latest:dev-A', 'latest:dev-B']);

      const devASetCall = setCalls.find((c) => c[0] === 'latest:dev-A')!;
      const devBSetCall = setCalls.find((c) => c[0] === 'latest:dev-B')!;

      // Assert dev-A cached ts is 10:01:00Z
      const devAPub = devASetCall[1] as TelemetryPublic;
      expect(devAPub.deviceId).toBe('dev-A');
      expect(devAPub.ts).toBe('2025-09-01T10:01:00.000Z');
      expect(devASetCall[2]).toBe(60 * 60 * 24); // TTL

      // Assert dev-B cached ts is 09:59:59Z
      const devBPub = devBSetCall[1] as TelemetryPublic;
      expect(devBPub.deviceId).toBe('dev-B');
      expect(devBPub.ts).toBe('2025-09-01T09:59:59.000Z');

      // Return shape
      expect(res.inserted).toBe(createdDocs.length);
      expect(res.docs).toHaveLength(createdDocs.length);
      // Ensure docs are public shape (string id, ISO ts)
      expect(typeof res.docs[0].id).toBe('string');
      expect(res.docs[0].ts).toMatch(/Z$/);
    });

    it('does not overwrite cache if existing cache is newer than any batch doc', async () => {
      const batch: CreateTelemetryDto[] = [
        makeDto({ deviceId: 'dev-A', ts: '2025-09-01T10:00:00.000Z' }),
        makeDto({ deviceId: 'dev-A', ts: '2025-09-01T10:01:00.000Z' }),
      ];

      const createdDocs = [
        makeDoc({
          deviceId: 'dev-A',
          ts: new Date('2025-09-01T10:00:00.000Z'),
        }),
        makeDoc({
          deviceId: 'dev-A',
          ts: new Date('2025-09-01T10:01:00.000Z'),
        }),
      ];

      telemetryModelMock.insertMany.mockResolvedValue(createdDocs);

      // Cached is newer than latest in batch (10:02)
      redisMock.getJSON.mockResolvedValue({
        id: 'cached',
        deviceId: 'dev-A',
        siteId: 'site-A',
        ts: '2025-09-01T10:02:00.000Z',
        metrics: { temperature: 30, humidity: 40 },
      } as TelemetryPublic);

      const res = await service.saveMany(batch);

      // No setJSON since cache newer
      expect(redisMock.setJSON).not.toHaveBeenCalled();

      // Alerts still called for each doc
      expect(alertsMock.maybeSendFor).toHaveBeenCalledTimes(createdDocs.length);

      // Response still OK
      expect(res.inserted).toBe(2);
      expect(res.docs).toHaveLength(2);
    });
  });
});

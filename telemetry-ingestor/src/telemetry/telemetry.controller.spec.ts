/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prettier/prettier */
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

// ✅ Keep the real module, override only `validate`
jest.mock('class-validator', () => {
  const actual = jest.requireActual('class-validator');
  return {
    ...actual,
    validate: jest.fn(),
  };
});
import { validate } from 'class-validator';

describe('TelemetryController.ingest', () => {
  let controller: TelemetryController;

  const telemetryServiceMock = {
    saveOne: jest.fn(),
    saveMany: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [TelemetryController],
      providers: [
        { provide: TelemetryService, useValue: telemetryServiceMock },
      ],
    }).compile();

    controller = moduleRef.get(TelemetryController);
  });

  describe('array payload', () => {
    it('throws 400 when array is empty', async () => {
      await expect(controller.ingest([])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(telemetryServiceMock.saveMany).not.toHaveBeenCalled();
    });

    it('throws 400 when any DTO in array is invalid', async () => {
      // First DTO valid, second invalid
      (validate as jest.Mock)
        .mockResolvedValueOnce([]) // first ok
        .mockResolvedValueOnce([{} as any]); // second has errors

      const body = [
        {
          deviceId: 'dev-1',
          siteId: 'site-A',
          ts: '2025-09-01T10:00:00.000Z',
          metrics: { temperature: 21, humidity: 55 },
        },
        {
          deviceId: 'dev-2',
          siteId: 'site-A',
          ts: 'not-a-date',
          metrics: { temperature: 'x' as any, humidity: 55 },
        },
      ];

      await expect(controller.ingest(body)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(telemetryServiceMock.saveMany).not.toHaveBeenCalled();
      expect(validate).toHaveBeenCalledTimes(2);
    });

    it('calls saveMany and returns its result when all DTOs are valid', async () => {
      (validate as jest.Mock).mockResolvedValue([]); // all items valid

      const body = [
        {
          deviceId: 'dev-1',
          siteId: 'site-A',
          ts: '2025-09-01T10:00:00.000Z',
          metrics: { temperature: 21, humidity: 55 },
        },
        {
          deviceId: 'dev-2',
          siteId: 'site-A',
          ts: '2025-09-01T10:01:00.000Z',
          metrics: { temperature: 23, humidity: 57 },
        },
      ];

      const svcResult = {
        inserted: 2,
        docs: [
          {
            id: 'id1',
            deviceId: 'dev-1',
            siteId: 'site-A',
            ts: '2025-09-01T10:00:00.000Z',
            metrics: { temperature: 21, humidity: 55 },
          },
          {
            id: 'id2',
            deviceId: 'dev-2',
            siteId: 'site-A',
            ts: '2025-09-01T10:01:00.000Z',
            metrics: { temperature: 23, humidity: 57 },
          },
        ],
      };
      telemetryServiceMock.saveMany.mockResolvedValue(svcResult);

      const resp = await controller.ingest(body);

      expect(telemetryServiceMock.saveMany).toHaveBeenCalledTimes(1);
      expect(resp).toEqual(svcResult);
      expect(validate).toHaveBeenCalledTimes(body.length);
    });
  });

  describe('single object payload', () => {
    it('throws 400 when DTO is invalid', async () => {
      (validate as jest.Mock).mockResolvedValue([{} as any]); // invalid
      const body = {
        deviceId: '',
        siteId: 'site-A',
        ts: 'nope',
        metrics: { temperature: 'x' as any, humidity: 55 },
      };

      await expect(controller.ingest(body)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(telemetryServiceMock.saveOne).not.toHaveBeenCalled();
      expect(validate).toHaveBeenCalledTimes(1);
    });

    it('calls saveOne and returns pared down fields when DTO is valid', async () => {
      (validate as jest.Mock).mockResolvedValue([]); // valid
      const body = {
        deviceId: 'dev-9',
        siteId: 'site-A',
        ts: '2025-09-01T10:02:00.000Z',
        metrics: { temperature: 22.5, humidity: 60 },
      };

      const savedDoc = {
        _id: { toString: () => 'abc123' },
        deviceId: 'dev-9',
        siteId: 'site-A',
        ts: new Date('2025-09-01T10:02:00.000Z'),
        metrics: { temperature: 22.5, humidity: 60 },
      };
      telemetryServiceMock.saveOne.mockResolvedValue(savedDoc);

      const resp = await controller.ingest(body);

      expect(telemetryServiceMock.saveOne).toHaveBeenCalledTimes(1);
      expect(resp).toEqual({
        id: 'abc123',
        deviceId: 'dev-9',
        siteId: 'site-A',
        ts: savedDoc.ts,
        metrics: { temperature: 22.5, humidity: 60 },
      });
    });

    it('handles missing _id.toString by returning undefined id', async () => {
      (validate as jest.Mock).mockResolvedValue([]); // valid
      const body = {
        deviceId: 'dev-10',
        siteId: 'site-A',
        ts: '2025-09-01T10:03:00.000Z',
        metrics: { temperature: 20.1, humidity: 50 },
      };

      const savedDoc = {
        _id: null as any,
        deviceId: 'dev-10',
        siteId: 'site-A',
        ts: new Date('2025-09-01T10:03:00.000Z'),
        metrics: { temperature: 20.1, humidity: 50 },
      };
      telemetryServiceMock.saveOne.mockResolvedValue(savedDoc);

      const resp = await controller.ingest(body);

      expect((resp as any).id).toBeUndefined();
      expect((resp as any).deviceId).toBe('dev-10');
    });
  });
});

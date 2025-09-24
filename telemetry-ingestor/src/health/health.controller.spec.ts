import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import type { Response } from 'express';

describe('HealthController', () => {
  let controller: HealthController;

  const healthMock = {
    report: jest.fn(),
  };

  // Simple Express Response mock
  const makeRes = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response & {
      status: jest.Mock;
      json: jest.Mock;
    };
    return res;
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthMock }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  const baseReport = {
    uptimeSec: 123,
    timestamp: '2025-09-24T10:00:00.000Z',
    version: '0.0.0',
  };

  it('returns 200 and the report when everything is up', async () => {
    const report = {
      status: 'ok' as const,
      mongo: { status: 'up' as const },
      redis: { status: 'up' as const },
      ...baseReport,
    };
    healthMock.report.mockResolvedValue(report);

    const res = makeRes();
    await controller.get(res);

    expect(healthMock.report).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(report);
  });

  it('returns 200 when degraded (no component is down)', async () => {
    const report = {
      status: 'degraded' as const,
      mongo: { status: 'up' as const },
      redis: { status: 'degraded' as const, details: 'unexpected reply' },
      ...baseReport,
    };
    healthMock.report.mockResolvedValue(report);

    const res = makeRes();
    await controller.get(res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(report);
  });

  it('returns 503 when any component is down', async () => {
    const report = {
      status: 'down' as const,
      mongo: { status: 'down' as const, details: 'ping failed' },
      redis: { status: 'up' as const },
      ...baseReport,
    };
    healthMock.report.mockResolvedValue(report);

    const res = makeRes();
    await controller.get(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(report);
  });
});

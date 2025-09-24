import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { SitesService, SiteSummary } from './sites.service';
import { Telemetry } from '../telemetry/schema/telemetry.schema';

describe('SitesService.summary', () => {
  let service: SitesService;
  let telemetryModel: {
    aggregate: jest.Mock;
  };

  beforeEach(async () => {
    telemetryModel = {
      // We will return an object that has .exec()
      aggregate: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SitesService,
        {
          provide: getModelToken(Telemetry.name),
          useValue: telemetryModel,
        },
      ],
    }).compile();

    service = moduleRef.get(SitesService);
  });

  function mockAggregateReturn(resultArray: SiteSummary[]) {
    // make aggregate() return an object with exec()
    const exec = jest.fn().mockResolvedValue(resultArray);
    telemetryModel.aggregate.mockReturnValue({ exec });
    return { exec };
  }

  it('throws BadRequestException when "from" is invalid ISO', async () => {
    const invalidFrom = 'not-a-date';
    await expect(
      service.summary('site-A', invalidFrom, '2025-09-01T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telemetryModel.aggregate).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when "to" is invalid ISO', async () => {
    const invalidTo = 'nope';
    await expect(
      service.summary('site-A', '2025-09-01T00:00:00.000Z', invalidTo),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telemetryModel.aggregate).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when from >= to (equal)', async () => {
    const iso = '2025-09-01T00:00:00.000Z';
    await expect(service.summary('site-A', iso, iso)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(telemetryModel.aggregate).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when from >= to (from > to)', async () => {
    await expect(
      service.summary(
        'site-A',
        '2025-09-02T00:00:00.000Z',
        '2025-09-01T00:00:00.000Z',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telemetryModel.aggregate).not.toHaveBeenCalled();
  });

  it('returns zeros/nulls when aggregation returns no result', async () => {
    mockAggregateReturn([]); // empty array from aggregate().exec()

    const res = await service.summary(
      'site-A',
      '2025-09-01T00:00:00.000Z',
      '2025-09-02T00:00:00.000Z',
    );

    expect(res).toEqual({
      count: 0,
      avgTemperature: null,
      maxTemperature: null,
      avgHumidity: null,
      maxHumidity: null,
      uniqueDevices: 0,
    });
  });

  it('returns the aggregation result when present', async () => {
    const aggResult: SiteSummary = {
      count: 3,
      avgTemperature: 22.5,
      maxTemperature: 51.2,
      avgHumidity: 60.1,
      maxHumidity: 95,
      uniqueDevices: 2,
    };
    mockAggregateReturn([aggResult]);

    const res = await service.summary(
      'site-A',
      '2025-09-01T00:00:00.000Z',
      '2025-09-02T00:00:00.000Z',
    );

    expect(res).toEqual(aggResult);
  });

  it('builds the pipeline with correct siteId and date bounds', async () => {
    const fromISO = '2025-09-01T00:00:00.000Z';
    const toISO = '2025-09-02T00:00:00.000Z';

    mockAggregateReturn([
      {
        count: 1,
        avgTemperature: 10,
        maxTemperature: 10,
        avgHumidity: 10,
        maxHumidity: 10,
        uniqueDevices: 1,
      },
    ]);

    await service.summary('site-XYZ', fromISO, toISO);

    expect(telemetryModel.aggregate).toHaveBeenCalledTimes(1);
    const pipelineArg = telemetryModel.aggregate.mock.calls[0][0];

    // Pipeline shape assertions
    expect(Array.isArray(pipelineArg)).toBe(true);
    expect(pipelineArg[0]).toHaveProperty('$match');
    expect(pipelineArg[0].$match.siteId).toBe('site-XYZ');

    // Verify the date range was converted to Date objects and applied
    expect(pipelineArg[0].$match.ts).toHaveProperty('$gte');
    expect(pipelineArg[0].$match.ts).toHaveProperty('$lt');
    expect(pipelineArg[0].$match.ts.$gte).toBeInstanceOf(Date);
    expect(pipelineArg[0].$match.ts.$lt).toBeInstanceOf(Date);

    // Dates should match the provided ISO values
    expect(pipelineArg[0].$match.ts.$gte.toISOString()).toBe(fromISO);
    expect(pipelineArg[0].$match.ts.$lt.toISOString()).toBe(toISO);

    // Check that group/project stages exist
    const stages = pipelineArg.map((s: any) => Object.keys(s)[0]);
    expect(stages).toContain('$group');
    expect(stages).toContain('$project');
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesService, SiteSummary } from './sites.service';

describe('SitesController', () => {
  let controller: SitesController;

  const sitesMock = {
    summary: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [SitesController],
      providers: [{ provide: SitesService, useValue: sitesMock }],
    }).compile();

    controller = moduleRef.get(SitesController);
  });

  it('calls SitesService.summary with siteId, from, to and returns its result', async () => {
    const params = { siteId: 'site-A' };
    const query = {
      from: '2025-09-01T00:00:00.000Z',
      to: '2025-09-02T00:00:00.000Z',
    };

    const result: SiteSummary = {
      count: 3,
      avgTemperature: 24.5,
      maxTemperature: 51.2,
      avgHumidity: 60.1,
      maxHumidity: 95,
      uniqueDevices: 2,
    };

    sitesMock.summary.mockResolvedValue(result);

    const resp = await controller.getSummary(params as any, query as any);

    expect(sitesMock.summary).toHaveBeenCalledTimes(1);
    expect(sitesMock.summary).toHaveBeenCalledWith(
      params.siteId,
      query.from,
      query.to,
    );
    expect(resp).toEqual(result);
  });

  it('propagates errors from SitesService.summary (e.g., BadRequestException)', async () => {
    const params = { siteId: 'site-A' };
    const query = {
      from: 'invalid',
      to: '2025-09-02T00:00:00.000Z',
    };

    sitesMock.summary.mockRejectedValue(
      new BadRequestException('from/to must be valid ISO timestamps'),
    );

    await expect(
      controller.getSummary(params as any, query as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(sitesMock.summary).toHaveBeenCalledWith(
      params.siteId,
      query.from,
      query.to,
    );
  });
});

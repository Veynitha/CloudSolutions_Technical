import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

describe('DeviceController', () => {
  let controller: DeviceController;

  const devicesMock = {
    getLatest: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [{ provide: DeviceService, useValue: devicesMock }],
    }).compile();

    controller = moduleRef.get(DeviceController);
  });

  it('calls DeviceService.getLatest with the deviceId and returns its result', async () => {
    const deviceId = 'dev-123';
    const result = {
      id: 'abc',
      deviceId,
      siteId: 'site-A',
      ts: '2025-09-01T10:00:00.000Z',
      metrics: { temperature: 22.1, humidity: 55 },
    };
    devicesMock.getLatest.mockResolvedValue(result);

    const resp = await controller.latest(deviceId);

    expect(devicesMock.getLatest).toHaveBeenCalledTimes(1);
    expect(devicesMock.getLatest).toHaveBeenCalledWith(deviceId);
    expect(resp).toEqual(result);
  });

  it('propagates errors from DeviceService.getLatest (e.g., NotFoundException)', async () => {
    const deviceId = 'missing';
    devicesMock.getLatest.mockRejectedValue(new NotFoundException('not found'));

    // eslint-disable-next-line prettier/prettier
    await expect(controller.latest(deviceId)).rejects.toBeInstanceOf(NotFoundException);
    expect(devicesMock.getLatest).toHaveBeenCalledWith(deviceId);
  });
});

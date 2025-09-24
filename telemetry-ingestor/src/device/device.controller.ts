import { Controller, Get, Param } from '@nestjs/common';
import { DeviceService } from './device.service';

@Controller('v1/devices')
export class DeviceController {
  constructor(private readonly devices: DeviceService) {}

  @Get(':deviceId/latest')
  async latest(@Param('deviceId') deviceId: string) {
    return this.devices.getLatest(deviceId);
  }
}

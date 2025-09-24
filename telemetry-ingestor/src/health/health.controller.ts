import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(@Res() res: Response) {
    const report = await this.health.report();
    const anyDown =
      report.mongo.status === 'down' || report.redis.status === 'down';
    const code = anyDown ? 503 : 200;
    res.status(code).json(report);
  }
}

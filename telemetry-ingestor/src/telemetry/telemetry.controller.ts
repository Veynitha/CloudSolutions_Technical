import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Controller('v1/telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  // I will keep the body as unknow since we can get either an object or an array, and then validate inside
  async ingest(@Body() body: unknown) {
    // Array Telemetry implementation
    if (Array.isArray(body)) {
      if (body.length === 0) {
        throw new BadRequestException('Array payload cannot be empty');
      }
      const dtos = plainToInstance(CreateTelemetryDto, body);
      const errors = await Promise.all(
        dtos.map((dto) =>
          validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
        ),
      );
      const firstError = errors.find((e) => e.length > 0);
      if (firstError) {
        throw new BadRequestException(firstError);
      }
      return this.telemetryService.saveMany(dtos);
    }

    //Single Object Telemetry implementation
    const dto = plainToInstance(CreateTelemetryDto, body);
    const errs = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errs.length) {
      throw new BadRequestException(errs);
    }
    const saved = await this.telemetryService.saveOne(dto);
    // return pared down public fields
    return {
      id: saved._id?.toString?.() ?? undefined,
      deviceId: saved.deviceId,
      siteId: saved.siteId,
      ts: saved.ts,
      metrics: saved.metrics,
    };
  }
}

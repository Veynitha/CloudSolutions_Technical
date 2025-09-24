import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry } from './schema/telemetry.schema';
import { CreateTelemetryDto } from './dto/create-telemetry.dto';
import {
  InsertManyTelemetryResponse,
  InsertOneTelemetryResponse,
} from './types/types';

@Injectable()
export class TelemetryService {
  constructor(
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<Telemetry>,
  ) {}

  private formatDocStructure(dto: CreateTelemetryDto) {
    return {
      deviceId: dto.deviceId,
      siteId: dto.siteId,
      ts: new Date(dto.ts),
      metrics: {
        temperature: dto.metrics.temperature,
        humidity: dto.metrics.humidity,
      },
    };
  }

  async saveOne(dto: CreateTelemetryDto) {
    const doc = this.formatDocStructure(dto);
    const response: InsertOneTelemetryResponse =
      await this.telemetryModel.create(doc);
    return response;
  }

  async saveMany(dtos: CreateTelemetryDto[]) {
    const docs = dtos.map((dto) => this.formatDocStructure(dto));
    const response: InsertManyTelemetryResponse =
      await this.telemetryModel.insertMany(docs, {
        ordered: true,
      });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    // Testing any for arry until I see what it is
    console.log('Inserted many response', response);
    return { count: response.length, inserted: response };
  }
}

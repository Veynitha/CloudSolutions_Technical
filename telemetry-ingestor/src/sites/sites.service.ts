import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Telemetry } from '../telemetry/schema/telemetry.schema';

export type SiteSummary = {
  count: number;
  avgTemperature: number | null;
  maxTemperature: number | null;
  avgHumidity: number | null;
  maxHumidity: number | null;
  uniqueDevices: number;
};

@Injectable()
export class SitesService {
  constructor(
    @InjectModel(Telemetry.name)
    private readonly telemetryModel: Model<Telemetry>,
  ) {}

  async summary(
    siteId: string,
    fromISO: string,
    toISO: string,
  ): Promise<SiteSummary> {
    const from = new Date(fromISO);
    const to = new Date(toISO);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('from/to must be valid ISO timestamps');
    }
    if (from >= to) {
      throw new BadRequestException('from must be earlier than to');
    }

    const pipeline = [
      { $match: { siteId, ts: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgTemperature: { $avg: '$metrics.temperature' },
          maxTemperature: { $max: '$metrics.temperature' },
          avgHumidity: { $avg: '$metrics.humidity' },
          maxHumidity: { $max: '$metrics.humidity' },
          devices: { $addToSet: '$deviceId' },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          avgTemperature: { $ifNull: ['$avgTemperature', null] },
          maxTemperature: { $ifNull: ['$maxTemperature', null] },
          avgHumidity: { $ifNull: ['$avgHumidity', null] },
          maxHumidity: { $ifNull: ['$maxHumidity', null] },
          uniqueDevices: { $size: '$devices' },
        },
      },
    ] as any[];

    const [result] = await this.telemetryModel
      .aggregate<SiteSummary>(pipeline)
      .exec();

    if (!result) {
      return {
        count: 0,
        avgTemperature: null,
        maxTemperature: null,
        avgHumidity: null,
        maxHumidity: null,
        uniqueDevices: 0,
      };
    }
    return result;
  }
}

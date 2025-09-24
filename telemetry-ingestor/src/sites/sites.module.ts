import { Module } from '@nestjs/common';
import { SitesService } from './sites.service';
import { SitesController } from './sites.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Telemetry,
  TelemetrySchema,
} from '../telemetry/schema/telemetry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Telemetry.name, schema: TelemetrySchema },
    ]),
  ],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}

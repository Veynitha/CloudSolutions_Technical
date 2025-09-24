import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'telemetry', timestamps: true })
export class Telemetry extends Document {
  @Prop({ type: String, required: true, index: true })
  deviceId!: string;

  @Prop({ type: String, required: true, index: true })
  siteId!: string;

  @Prop({ type: Date, required: true, index: true })
  ts!: Date;

  @Prop({
    type: {
      temperature: { type: Number, required: true },
      humidity: { type: Number, required: true },
    },
    _id: false,
    required: true,
  })
  metrics!: {
    temperature: number;
    humidity: number;
  };
}

export const TelemetrySchema = SchemaFactory.createForClass(Telemetry);

TelemetrySchema.index({ deviceId: 1, ts: -1 });
TelemetrySchema.index({ siteId: 1, ts: -1 });

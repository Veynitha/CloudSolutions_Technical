import { HydratedDocument } from 'mongoose';
import { Telemetry } from '../schema/telemetry.schema';

export type InsertOneTelemetryResponse = HydratedDocument<Telemetry>;
export type InsertManyTelemetryResponse = HydratedDocument<Telemetry>[];

import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { MetricsDto } from './metrics.dto';

export class CreateTelemetryDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  siteId!: string;

  @IsISO8601()
  @IsNotEmpty()
  ts!: string;

  @ValidateNested()
  @Type(() => MetricsDto)
  metrics!: MetricsDto;
}

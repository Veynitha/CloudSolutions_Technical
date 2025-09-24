import { IsNumber, IsNotEmpty } from 'class-validator';

export class MetricsDto {
  @IsNumber()
  @IsNotEmpty()
  temperature!: number;

  @IsNumber()
  @IsNotEmpty()
  humidity!: number;
}

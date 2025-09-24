import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class SiteSummaryQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}

export class SiteParamDto {
  @IsString()
  @IsNotEmpty()
  siteId!: string;
}

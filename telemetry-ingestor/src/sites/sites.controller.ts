import { Controller, Get, Param, Query } from '@nestjs/common';
import { SitesService } from './sites.service';
import {
  SiteSummaryQueryDto,
  SiteParamDto,
} from './dto/site-summary.query.dto';

@Controller('v1/sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get(':siteId/summary')
  async getSummary(
    @Param() params: SiteParamDto,
    @Query() query: SiteSummaryQueryDto,
  ) {
    const { siteId } = params;
    const { from, to } = query;
    return this.sites.summary(siteId, from, to);
  }
}

import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CacheModule } from '../cache/cache.module';
import { AppConfigModule } from '../common/config/config.module';

@Module({
  imports: [AppConfigModule, CacheModule],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}

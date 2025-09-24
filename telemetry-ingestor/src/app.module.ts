import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AppConfigModule } from './common/config/config.module';
import { MongoModule } from './database/mongo.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { DeviceModule } from './device/device.module';

@Module({
  imports: [
    TelemetryModule,
    AppConfigModule,
    MongoModule,
    CacheModule,
    HealthModule,
    DeviceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

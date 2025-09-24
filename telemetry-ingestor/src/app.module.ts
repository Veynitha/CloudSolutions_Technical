import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AppConfigModule } from './common/config/config.module';

@Module({
  imports: [TelemetryModule, AppConfigModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

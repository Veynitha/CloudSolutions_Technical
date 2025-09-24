import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelemetryModule } from './telemetry/telemetry.module';
import { AppConfigModule } from './common/config/config.module';
import { MongoModule } from './database/mongo.module';

@Module({
  imports: [TelemetryModule, AppConfigModule, MongoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

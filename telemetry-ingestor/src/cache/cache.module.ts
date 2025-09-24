import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Module({
  providers: [ConfigService, RedisService],
  exports: [RedisService],
})
export class CacheModule {}

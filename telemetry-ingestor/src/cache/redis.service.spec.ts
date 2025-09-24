/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

// --- Mock ioredis ---
const onMock = jest.fn();
const setMock = jest.fn();
const getMock = jest.fn();
const quitMock = jest.fn();
const disconnectMock = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: onMock,
    set: setMock,
    get: getMock,
    quit: quitMock,
    disconnect: disconnectMock,
  }));
});

describe('RedisService', () => {
  const redisUrl = 'redis://127.0.0.1:6379';
  let service: RedisService;

  const configMock = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'app.redisUrl') return redisUrl;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = moduleRef.get(RedisService);
  });

  it('constructs ioredis with URL and expected options, and attaches event listeners', () => {
    expect(Redis).toHaveBeenCalledTimes(1);
    const [passedUrl, options] = (Redis as unknown as jest.Mock).mock.calls[0];

    expect(passedUrl).toBe(redisUrl);
    expect(options).toMatchObject({
      lazyConnect: false,
      enableReadyCheck: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 2,
    });

    // two listeners: 'ready' and 'error'
    // on('ready', fn) and on('error', fn)
    // We don't assert the exact handler functions, just that they were registered.
    expect(onMock).toHaveBeenCalledWith('ready', expect.any(Function));
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('raw getter returns the underlying ioredis client', () => {
    const returned = (Redis as unknown as jest.Mock).mock.results[0].value;
    expect(service.raw).toBe(returned); // same object reference
  });

  describe('setJSON', () => {
    it('calls set without TTL when ttlSeconds is not provided', async () => {
      await service.setJSON('k', { a: 1 });
      expect(setMock).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }));
    });

    it('calls set with EX TTL when ttlSeconds > 0', async () => {
      await service.setJSON('k', { a: 1 }, 42);
      expect(setMock).toHaveBeenCalledWith(
        'k',
        JSON.stringify({ a: 1 }),
        'EX',
        42,
      );
    });

    it('does not use TTL when ttlSeconds is 0', async () => {
      await service.setJSON('k', { a: 1 }, 0);
      expect(setMock).toHaveBeenCalledWith('k', JSON.stringify({ a: 1 }));
    });
  });

  describe('getJSON', () => {
    it('parses JSON string to object', async () => {
      getMock.mockResolvedValueOnce(JSON.stringify({ x: 5 }));
      const res = await service.getJSON<{ x: number }>('key-x');
      expect(getMock).toHaveBeenCalledWith('key-x');
      expect(res).toEqual({ x: 5 });
    });

    it('returns null when key does not exist', async () => {
      getMock.mockResolvedValueOnce(null);
      const res = await service.getJSON('missing');
      expect(getMock).toHaveBeenCalledWith('missing');
      expect(res).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('calls quit() on the client when shutting down', async () => {
      quitMock.mockResolvedValueOnce('OK');
      await service.onModuleDestroy();
      expect(quitMock).toHaveBeenCalledTimes(1);
      expect(disconnectMock).not.toHaveBeenCalled();
    });

    it('falls back to disconnect() if quit() throws', async () => {
      quitMock.mockRejectedValueOnce(new Error('boom'));
      await service.onModuleDestroy();
      expect(quitMock).toHaveBeenCalledTimes(1);
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });
});

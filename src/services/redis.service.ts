import Redis from 'ioredis';
import { AggregatedHotelOffer } from '../types/hotel.types';
import { normalizeHotelName } from '../utils/comparison';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class RedisService {
  private client: Redis;
  private ttlSeconds: number;

  constructor(customClient?: Redis, ttlSeconds: number = config.redis.cacheTtlSeconds) {
    this.ttlSeconds = ttlSeconds;
    if (customClient) {
      this.client = customClient;
    } else if (config.redis.useMock) {
      logger.info('[Redis] Running in local in-memory mock mode (ioredis-mock)');
      const RedisMockModule = require('ioredis-mock');
      const RedisMock = RedisMockModule.default ?? RedisMockModule;
      this.client = new RedisMock() as Redis;
    } else {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        tls: config.redis.tls ? {} : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on('error', (err) => {
        logger.error(`[Redis] Connection error: ${err.message}`);
      });

      this.client.on('connect', () => {
        logger.info('[Redis] Successfully connected to Redis server');
      });
    }
  }

  public getClient(): Redis {
    return this.client;
  }

  public async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  private getPricesKey(city: string): string {
    return `hotels:${city.toLowerCase()}:prices`;
  }

  private getDataKey(city: string): string {
    return `hotels:${city.toLowerCase()}:data`;
  }

  private getMetaKey(city: string): string {
    return `hotels:${city.toLowerCase()}:meta`;
  }

  /**
   * Check if valid cached data exists for the given city.
   */
  public async hasCityCache(city: string): Promise<boolean> {
    const metaKey = this.getMetaKey(city);
    const exists = await this.client.exists(metaKey);
    return exists === 1;
  }

  /**
   * Stores aggregated hotels into Redis using Sorted Sets (for price queries)
   * and Hashes (for complete hotel data objects).
   * Uses MULTI / EXEC transaction block to guarantee atomic cache replacement
   * and prevent race conditions or stale member leakage.
   */
  public async saveHotels(city: string, hotels: AggregatedHotelOffer[]): Promise<void> {
    const pricesKey = this.getPricesKey(city);
    const dataKey = this.getDataKey(city);
    const metaKey = this.getMetaKey(city);

    // Use MULTI/EXEC transaction to guarantee atomic execution on Redis server
    const tx = this.client.multi();

    // 1. Atomically delete previous keys to avoid stale members
    tx.del(pricesKey, dataKey, metaKey);

    if (hotels.length > 0) {
      const zaddArgs: (string | number)[] = [pricesKey];
      const hsetData: Record<string, string> = {};

      for (const hotel of hotels) {
        const memberKey = normalizeHotelName(hotel.name);
        zaddArgs.push(hotel.price, memberKey);
        hsetData[memberKey] = JSON.stringify(hotel);
      }

      tx.zadd(...(zaddArgs as [string, ...any[]]));
      tx.hset(dataKey, hsetData);
      tx.set(metaKey, 'cached');

      if (this.ttlSeconds > 0) {
        tx.expire(pricesKey, this.ttlSeconds);
        tx.expire(dataKey, this.ttlSeconds);
        tx.expire(metaKey, this.ttlSeconds);
      }
    } else {
      // Mark as cached even if empty to prevent repeated external queries
      tx.set(metaKey, 'empty');
      if (this.ttlSeconds > 0) {
        tx.expire(metaKey, this.ttlSeconds);
      }
    }

    const execResults = await tx.exec();
    if (!execResults) {
      throw new Error(`[Redis] Transaction aborted for city: ${city}`);
    }
    logger.info(`[Redis] Atomically cached ${hotels.length} hotels for city: ${city} (MULTI/EXEC)`);
  }

  /**
   * Performs price-range query directly inside Redis using Redis Sorted Set (ZSET).
   * Uses ZRANGEBYSCORE to filter by price directly inside Redis.
   * Then fetches corresponding hotel objects from Redis Hash.
   */
  public async getHotelsByPriceRange(
    city: string,
    minPrice?: number,
    maxPrice?: number
  ): Promise<AggregatedHotelOffer[]> {
    const pricesKey = this.getPricesKey(city);
    const dataKey = this.getDataKey(city);

    // Format min and max for Redis ZRANGEBYSCORE
    const minScore = minPrice !== undefined ? minPrice.toString() : '-inf';
    const maxScore = maxPrice !== undefined ? maxPrice.toString() : '+inf';

    // Query Redis sorted set directly by score range
    const members = await this.client.zrangebyscore(pricesKey, minScore, maxScore);

    if (!members || members.length === 0) {
      return [];
    }

    // Retrieve corresponding hotel objects from Redis Hash
    const hotelJsonStrings = await this.client.hmget(dataKey, ...members);

    const results: AggregatedHotelOffer[] = [];
    for (const jsonStr of hotelJsonStrings) {
      if (jsonStr) {
        try {
          results.push(JSON.parse(jsonStr) as AggregatedHotelOffer);
        } catch (e) {
          logger.error(`[Redis] Failed to parse hotel json: ${jsonStr}`);
        }
      }
    }

    logger.info(
      `[Redis] Retrieved ${results.length} hotels for city: ${city} (min: ${minScore}, max: ${maxScore})`
    );
    return results;
  }

  /**
   * Clears cache for a specific city.
   */
  public async clearCityCache(city: string): Promise<void> {
    const pricesKey = this.getPricesKey(city);
    const dataKey = this.getDataKey(city);
    const metaKey = this.getMetaKey(city);
    await this.client.del(pricesKey, dataKey, metaKey);
  }
}

export const redisService = new RedisService();


import { AggregatedHotelOffer, HotelQueryParams } from '../types/hotel.types';
import { RedisService, redisService as defaultRedisService } from './redis.service';
import { TemporalService, temporalService as defaultTemporalService } from './temporal.service';
import { logger } from '../utils/logger';

export class HotelService {
  private redis: RedisService;
  private temporal: TemporalService;

  constructor(
    redis: RedisService = defaultRedisService,
    temporal: TemporalService = defaultTemporalService
  ) {
    this.redis = redis;
    this.temporal = temporal;
  }

  /**
   * Retrieves hotel offers for a city, applying optional price filtering.
   *
   * 1. Check Redis cache.
   * 2. If cached, query Redis by price range.
   * 3. On cache miss, execute the Temporal aggregation workflow.
   * 4. Cache results only when both suppliers succeeded.
   * 5. Query Redis for consistent price filtering.
   */
  public async getHotels(params: HotelQueryParams): Promise<{
    hotels: AggregatedHotelOffer[];
    fromCache: boolean;
  }> {
    const { city, minPrice, maxPrice } = params;
    const normalizedCity = city.toLowerCase();

    const isCached = await this.redis.hasCityCache(normalizedCity);

    if (isCached) {
      logger.info(`[HotelService] Cache HIT for city: ${normalizedCity}`);
      const hotels = await this.redis.getHotelsByPriceRange(
        normalizedCity,
        minPrice,
        maxPrice
      );
      return { hotels, fromCache: true };
    }

    logger.info(
      `[HotelService] Cache MISS for city: ${normalizedCity}. Invoking Temporal workflow...`
    );

    const aggregationResult =
      await this.temporal.executeAggregationWorkflow(normalizedCity);

    const aggregatedHotels = aggregationResult.offers;

    if (aggregationResult.complete) {
      await this.redis.saveHotels(normalizedCity, aggregatedHotels);
    } else {
      logger.warn(
        `[HotelService] Skipping cache for ${normalizedCity}: supplier data is incomplete`
      );

      const hotels = aggregatedHotels.filter(
        (hotel) =>
          (minPrice === undefined || hotel.price >= minPrice) &&
          (maxPrice === undefined || hotel.price <= maxPrice)
      );

      return { hotels, fromCache: false };
    }

    const hotels = await this.redis.getHotelsByPriceRange(
      normalizedCity,
      minPrice,
      maxPrice
    );

    return { hotels, fromCache: false };
  }
}

export const hotelService = new HotelService();

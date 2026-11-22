import RedisMock from 'ioredis-mock';
import { HotelService } from '../src/services/hotel.service';
import { RedisService } from '../src/services/redis.service';
import { TemporalService } from '../src/services/temporal.service';
import { AggregatedHotelOffer } from '../src/types/hotel.types';

describe('HotelService - Cache and Temporal Orchestration', () => {
  let redisMock: any;
  let redisService: RedisService;
  let mockTemporalService: jest.Mocked<TemporalService>;
  let hotelService: HotelService;

  const sampleOffers: AggregatedHotelOffer[] = [
    { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    { name: 'Radisson Blu', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
  ];

  beforeEach(() => {
    redisMock = new RedisMock();
    redisService = new RedisService(redisMock as any, 300);

    mockTemporalService = {
      getClient: jest.fn(),
      isHealthy: jest.fn().mockResolvedValue(true),
      executeAggregationWorkflow: jest.fn().mockResolvedValue(sampleOffers),
    } as unknown as jest.Mocked<TemporalService>;

    hotelService = new HotelService(redisService, mockTemporalService);
  });

  afterEach(async () => {
    await redisMock.flushall();
    jest.clearAllMocks();
  });

  it('should execute Temporal workflow on CACHE MISS and persist results to Redis', async () => {
    const result = await hotelService.getHotels({ city: 'delhi' });

    expect(result.fromCache).toBe(false);
    expect(result.hotels).toHaveLength(2);
    expect(mockTemporalService.executeAggregationWorkflow).toHaveBeenCalledTimes(1);
    expect(mockTemporalService.executeAggregationWorkflow).toHaveBeenCalledWith('delhi');

    // Verify data is now in Redis
    const hasCache = await redisService.hasCityCache('delhi');
    expect(hasCache).toBe(true);
  });

  it('should NOT invoke Temporal workflow on CACHE HIT, serving directly from Redis', async () => {
    // Pre-populate cache
    await redisService.saveHotels('delhi', sampleOffers);

    const result = await hotelService.getHotels({ city: 'delhi' });

    expect(result.fromCache).toBe(true);
    expect(result.hotels).toHaveLength(2);
    // Temporal workflow must NOT be invoked
    expect(mockTemporalService.executeAggregationWorkflow).not.toHaveBeenCalled();
  });

  it('should apply price filters correctly during cache hit', async () => {
    await redisService.saveHotels('delhi', sampleOffers);

    const result = await hotelService.getHotels({
      city: 'delhi',
      minPrice: 5500,
      maxPrice: 6000,
    });

    expect(result.fromCache).toBe(true);
    expect(result.hotels).toHaveLength(1);
    expect(result.hotels[0].name).toBe('Radisson Blu');
    expect(result.hotels[0].price).toBe(5900);
    expect(mockTemporalService.executeAggregationWorkflow).not.toHaveBeenCalled();
  });
});

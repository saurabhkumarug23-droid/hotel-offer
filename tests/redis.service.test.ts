import RedisMock from 'ioredis-mock';
import { RedisService } from '../src/services/redis.service';
import { AggregatedHotelOffer } from '../src/types/hotel.types';

describe('RedisService - Price Filtering & Caching', () => {
  let redisMock: any;
  let redisService: RedisService;

  const mockHotels: AggregatedHotelOffer[] = [
    { name: 'City Inn Deluxe', price: 3500, supplier: 'Supplier A', commissionPct: 8 },
    { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    { name: 'Radisson Blu', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
    { name: 'Grand Hyatt', price: 7500, supplier: 'Supplier A', commissionPct: 12 },
    { name: 'Marriott Suites', price: 8500, supplier: 'Supplier B', commissionPct: 15 },
    { name: 'The Oberoi', price: 12000, supplier: 'Supplier A', commissionPct: 15 },
  ];

  beforeEach(async () => {
    redisMock = new RedisMock();
    redisService = new RedisService(redisMock as any, 300);
    // Populate Delhi cache
    await redisService.saveHotels('delhi', mockHotels);
  });

  afterEach(async () => {
    await redisMock.flushall();
  });

  // Requirement 13: Redis cache hit and cache miss
  it('Requirement 13: should report cache hit for populated city and miss for unknown city', async () => {
    expect(await redisService.hasCityCache('delhi')).toBe(true);
    expect(await redisService.hasCityCache('kolkata')).toBe(false);
  });

  // Requirement 7: Price filtering with minPrice and maxPrice
  it('Requirement 7: should filter hotels by price range using Redis Sorted Set (minPrice & maxPrice)', async () => {
    // Range: 5000 to 7000 (Holtin: 5340, Radisson Blu: 5900)
    const result = await redisService.getHotelsByPriceRange('delhi', 5000, 7000);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Holtin');
    expect(result[0].price).toBe(5340);
    expect(result[1].name).toBe('Radisson Blu');
    expect(result[1].price).toBe(5900);
  });

  // Requirement 8: Filtering with only minPrice
  it('Requirement 8: should filter hotels with only minPrice (minPrice to +inf)', async () => {
    // minPrice: 7500 (Grand Hyatt: 7500, Marriott: 8500, Oberoi: 12000)
    const result = await redisService.getHotelsByPriceRange('delhi', 7500, undefined);

    expect(result).toHaveLength(3);
    expect(result.map((h) => h.name)).toEqual(['Grand Hyatt', 'Marriott Suites', 'The Oberoi']);
  });

  // Requirement 9: Filtering with only maxPrice
  it('Requirement 9: should filter hotels with only maxPrice (-inf to maxPrice)', async () => {
    // maxPrice: 5500 (City Inn: 3500, Holtin: 5340)
    const result = await redisService.getHotelsByPriceRange('delhi', undefined, 5500);

    expect(result).toHaveLength(2);
    expect(result.map((h) => h.name)).toEqual(['City Inn Deluxe', 'Holtin']);
  });

  it('should return all hotels when no price filter is specified', async () => {
    const result = await redisService.getHotelsByPriceRange('delhi');
    expect(result).toHaveLength(6);
    expect(result[0].price).toBe(3500);
    expect(result[5].price).toBe(12000);
  });

  it('should return empty array if price range matches no hotels', async () => {
    const result = await redisService.getHotelsByPriceRange('delhi', 50000, 60000);
    expect(result).toEqual([]);
  });

  it('should cleanly replace cached entries without leaving stale sorted-set members', async () => {
    const updatedHotels: AggregatedHotelOffer[] = [
      { name: 'Brand New Hotel', price: 4000, supplier: 'Supplier A', commissionPct: 10 },
    ];

    await redisService.saveHotels('delhi', updatedHotels);

    const result = await redisService.getHotelsByPriceRange('delhi');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Brand New Hotel');

    // Confirm old members like 'holtin' are removed from Redis
    const oldMemberScore = await redisMock.zscore('hotels:delhi:prices', 'holtin');
    expect(oldMemberScore).toBeNull();
  });

  it('should apply TTL to prices sorted set, data hash, and meta key', async () => {
    const ttlPrices = await redisMock.ttl('hotels:delhi:prices');
    const ttlData = await redisMock.ttl('hotels:delhi:data');
    const ttlMeta = await redisMock.ttl('hotels:delhi:meta');

    expect(ttlPrices).toBeGreaterThan(0);
    expect(ttlData).toBeGreaterThan(0);
    expect(ttlMeta).toBeGreaterThan(0);
  });
});

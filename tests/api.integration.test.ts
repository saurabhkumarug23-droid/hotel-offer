import request from 'supertest';
import { app } from '../src/app';
import { hotelService } from '../src/services/hotel.service';
import { redisService } from '../src/services/redis.service';
import { temporalService } from '../src/services/temporal.service';

describe('HTTP API End-to-End Integration Tests', () => {
  describe('Mock Supplier Endpoints', () => {
    it('GET /supplierA/hotels?city=delhi should return Supplier A Delhi hotels', async () => {
      const res = await request(app).get('/supplierA/hotels?city=delhi');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('hotelId');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('price');
      expect(res.body[0]).toHaveProperty('city', 'delhi');
      expect(res.body[0]).toHaveProperty('commissionPct');
    });

    it('GET /supplierB/hotels?city=delhi should return Supplier B Delhi hotels', async () => {
      const res = await request(app).get('/supplierB/hotels?city=delhi');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('city', 'delhi');
    });

    it('GET /supplierA/hotels without city parameter should return 400', async () => {
      const res = await request(app).get('/supplierA/hotels');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /supplierB/hotels?city=mumbai should return Mumbai hotels', async () => {
      const res = await request(app).get('/supplierB/hotels?city=mumbai');
      expect(res.status).toBe(200);
      expect(res.body.every((h: any) => h.city === 'mumbai')).toBe(true);
    });
  });

  describe('Main Hotel Aggregation API (GET /api/hotels)', () => {
    beforeEach(() => {
      // Mock hotelService.getHotels to test HTTP controller and middleware responses
      jest.spyOn(hotelService, 'getHotels').mockResolvedValue({
        fromCache: false,
        hotels: [
          { name: 'City Inn Deluxe', price: 3500, supplier: 'Supplier A', commissionPct: 8 },
          { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
          { name: 'Radisson Blu', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
        ],
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('GET /api/hotels?city=delhi should return aggregated hotels without internal fields', async () => {
      const res = await request(app).get('/api/hotels?city=delhi');
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('MISS');
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);

      const first = res.body[0];
      expect(first).toEqual({
        name: 'City Inn Deluxe',
        price: 3500,
        supplier: 'Supplier A',
        commissionPct: 8,
      });
      // Must not expose internal fields
      expect(first).not.toHaveProperty('hotelId');
      expect(first).not.toHaveProperty('city');
    });

    it('GET /api/hotels without city should return 400 Bad Request', async () => {
      const res = await request(app).get('/api/hotels');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'City parameter is required and cannot be empty.');
    });

    it('GET /api/hotels with invalid price range (minPrice > maxPrice) should return 400 Bad Request', async () => {
      const res = await request(app).get('/api/hotels?city=delhi&minPrice=9000&maxPrice=5000');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'minPrice cannot be greater than maxPrice.');
    });

    it('GET /api/hotels with non-numeric price should return 400 Bad Request', async () => {
      const res = await request(app).get('/api/hotels?city=delhi&minPrice=invalid');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'minPrice must be a valid number.');
    });

    it('GET /api/hotels with negative price should return 400 Bad Request', async () => {
      const res = await request(app).get('/api/hotels?city=delhi&minPrice=-100');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'minPrice cannot be negative.');
    });
  });

  describe('Health Check API (GET /health)', () => {
    it('GET /health should return system status', async () => {
      jest.spyOn(redisService, 'isHealthy').mockResolvedValue(true);
      jest.spyOn(temporalService, 'isHealthy').mockResolvedValue(true);

      const res = await request(app).get('/health');
      // Status code may be 200 or 503 depending on supplier live reachability in test
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('services');
      expect(res.body.services).toHaveProperty('redis');
      expect(res.body.services).toHaveProperty('temporal');
      expect(res.body.services).toHaveProperty('supplierA');
      expect(res.body.services).toHaveProperty('supplierB');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/non-existent-endpoint');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Endpoint not found' });
    });
  });
});

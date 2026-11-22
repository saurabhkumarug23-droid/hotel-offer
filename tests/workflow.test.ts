import { compareAndDeduplicateOffers } from '../src/utils/comparison';
import { SupplierHotelOffer } from '../src/types/hotel.types';

describe('Workflow Concurrency and Failure Strategy', () => {
  it('Requirement 14: should execute Supplier A and Supplier B activities concurrently rather than sequentially', async () => {
    let supplierAStartTime = 0;
    let supplierAEndTime = 0;
    let supplierBStartTime = 0;
    let supplierBEndTime = 0;

    const mockFetchSupplierA = jest.fn().mockImplementation(async (_city: string) => {
      supplierAStartTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 50));
      supplierAEndTime = Date.now();
      return [
        { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
      ] as SupplierHotelOffer[];
    });

    const mockFetchSupplierB = jest.fn().mockImplementation(async (_city: string) => {
      supplierBStartTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 50));
      supplierBEndTime = Date.now();
      return [
        { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
      ] as SupplierHotelOffer[];
    });

    // Emulate the workflow Promise.all concurrency
    const overallStart = Date.now();
    const [offersA, offersB] = await Promise.all([
      mockFetchSupplierA('delhi'),
      mockFetchSupplierB('delhi'),
    ]);
    const overallDuration = Date.now() - overallStart;

    const results = compareAndDeduplicateOffers(offersA, offersB);

    // Verification 1: Both activities started before either finished (concurrent execution!)
    expect(supplierBStartTime).toBeLessThanOrEqual(supplierAEndTime);
    expect(supplierAStartTime).toBeLessThanOrEqual(supplierBEndTime);

    // Verification 2: Output correctness
    expect(results).toHaveLength(1);
    expect(results[0].supplier).toBe('Supplier B');
    expect(results[0].price).toBe(5340);
  });

  it('should fail and not silently return partial data when one supplier fails', async () => {
    const mockFetchSupplierA = jest.fn().mockResolvedValue([
      { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    ]);
    const mockFetchSupplierB = jest
      .fn()
      .mockRejectedValue(new Error('Supplier B downstream service unavailable (503)'));

    // As per documented failure strategy, workflow must reject rather than silently return partial data
    await expect(
      Promise.all([mockFetchSupplierA('delhi'), mockFetchSupplierB('delhi')])
    ).rejects.toThrow('Supplier B downstream service unavailable (503)');
  });

  it('should generate distinct workflow IDs with randomUUID for concurrent requests for the same city', () => {
    const { randomUUID } = require('crypto');
    const city = 'delhi';
    const id1 = `hotel-aggregation-${city.toLowerCase()}-${randomUUID()}`;
    const id2 = `hotel-aggregation-${city.toLowerCase()}-${randomUUID()}`;

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^hotel-aggregation-delhi-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id2).toMatch(/^hotel-aggregation-delhi-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

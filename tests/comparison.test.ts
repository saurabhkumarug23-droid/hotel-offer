import { compareAndDeduplicateOffers, normalizeHotelName } from '../src/utils/comparison';
import { SupplierHotelOffer } from '../src/types/hotel.types';

describe('Hotel Comparison and Deduplication Logic', () => {
  describe('normalizeHotelName', () => {
    it('should trim and lowercase names', () => {
      expect(normalizeHotelName('  Taj Palace  ')).toBe('taj palace');
      expect(normalizeHotelName('HOLTIN')).toBe('holtin');
      expect(normalizeHotelName('Radisson Blu')).toBe('radisson blu');
    });
  });

  // Requirement 1: Duplicate hotel: Supplier B has the cheaper price
  it('Requirement 1: should choose Supplier B when Supplier B has cheaper price', () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    ];
    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    ];

    const result = compareAndDeduplicateOffers(supplierA, supplierB);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Holtin',
      price: 5340,
      supplier: 'Supplier B',
      commissionPct: 20,
    });
  });

  // Requirement 2: Duplicate hotel: Supplier A has the cheaper price
  it('Requirement 2: should choose Supplier A when Supplier A has cheaper price', () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a2', name: 'Radisson Blu', price: 5900, city: 'delhi', commissionPct: 13 },
    ];
    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b2', name: 'Radisson Blu', price: 6400, city: 'delhi', commissionPct: 18 },
    ];

    const result = compareAndDeduplicateOffers(supplierA, supplierB);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Radisson Blu',
      price: 5900,
      supplier: 'Supplier A',
      commissionPct: 13,
    });
  });

  // Requirement 3: Equal prices: Supplier A wins
  it('Requirement 3: should choose Supplier A as tie-breaker when prices are equal', () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a3', name: 'Grand Hyatt', price: 7500, city: 'delhi', commissionPct: 12 },
    ];
    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b3', name: 'Grand Hyatt', price: 7500, city: 'delhi', commissionPct: 22 },
    ];

    const result = compareAndDeduplicateOffers(supplierA, supplierB);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Grand Hyatt',
      price: 7500,
      supplier: 'Supplier A',
      commissionPct: 12,
    });
  });

  // Requirement 4: Hotel exists only in Supplier A
  it('Requirement 4: should retain hotel when it exists exclusively in Supplier A', () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a4', name: 'The Oberoi', price: 12000, city: 'delhi', commissionPct: 15 },
    ];
    const supplierB: SupplierHotelOffer[] = [];

    const result = compareAndDeduplicateOffers(supplierA, supplierB);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'The Oberoi',
      price: 12000,
      supplier: 'Supplier A',
      commissionPct: 15,
    });
  });

  // Requirement 5: Hotel exists only in Supplier B
  it('Requirement 5: should retain hotel when it exists exclusively in Supplier B', () => {
    const supplierA: SupplierHotelOffer[] = [];
    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b4', name: 'Marriott Suites', price: 8500, city: 'delhi', commissionPct: 15 },
    ];

    const result = compareAndDeduplicateOffers(supplierA, supplierB);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Marriott Suites',
      price: 8500,
      supplier: 'Supplier B',
      commissionPct: 15,
    });
  });

  // Requirement 6: Case-insensitive and whitespace-insensitive name deduplication
  it('Requirement 6: should deduplicate across different casing and whitespace padding', () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a5', name: '  Taj Palace  ', price: 9000, city: 'delhi', commissionPct: 14 },
    ];
    const supplierB: SupplierHotelOffer[] = [
      { hotelId: 'b5', name: 'TAJ PALACE', price: 8200, city: 'delhi', commissionPct: 19 },
    ];

    const result = compareAndDeduplicateOffers(supplierA, supplierB);

    expect(result).toHaveLength(1);
    expect(result[0].name.toLowerCase()).toBe('taj palace');
    expect(result[0].price).toBe(8200);
    expect(result[0].supplier).toBe('Supplier B');
    expect(result[0].commissionPct).toBe(19);
  });

  // Requirement 11: Empty supplier results
  it('Requirement 11: should handle empty supplier lists gracefully', () => {
    const result = compareAndDeduplicateOffers([], []);
    expect(result).toEqual([]);
  });

  it('should not leak internal fields like hotelId or city', () => {
    const supplierA: SupplierHotelOffer[] = [
      { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    ];
    const result = compareAndDeduplicateOffers(supplierA, []);
    expect(result[0]).not.toHaveProperty('hotelId');
    expect(result[0]).not.toHaveProperty('city');
  });
});

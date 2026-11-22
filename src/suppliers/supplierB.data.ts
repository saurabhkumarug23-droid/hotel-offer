import { SupplierHotelOffer } from '../types/hotel.types';

export const supplierBHotels: SupplierHotelOffer[] = [
  // --- Delhi Hotels ---
  // 1. Holtin: Cheaper in B (5340 vs 6000 in A)
  {
    hotelId: 'b1',
    name: 'Holtin',
    price: 5340,
    city: 'delhi',
    commissionPct: 20,
  },
  // 2. Radisson Blu: More expensive in B (6400 vs 5900 in A) -> A should win
  {
    hotelId: 'b2',
    name: 'Radisson Blu',
    price: 6400,
    city: 'delhi',
    commissionPct: 18,
  },
  // 3. Grand Hyatt: Equal price (7500 vs 7500 in A) -> A wins tie-breaker
  {
    hotelId: 'b3',
    name: 'Grand Hyatt',
    price: 7500,
    city: 'delhi',
    commissionPct: 22,
  },
  // 4. Marriott Suites: Exclusive to B
  {
    hotelId: 'b4',
    name: 'Marriott Suites',
    price: 8500,
    city: 'delhi',
    commissionPct: 15,
  },
  // 5. TAJ PALACE: Case variation of "  Taj Palace  ", cheaper in B (8200 vs 9000 in A) -> B wins
  {
    hotelId: 'b5',
    name: 'TAJ PALACE',
    price: 8200,
    city: 'delhi',
    commissionPct: 19,
  },
  // 6. Backpackers Haven: Exclusive to B
  {
    hotelId: 'b6',
    name: 'Backpackers Haven',
    price: 2200,
    city: 'delhi',
    commissionPct: 10,
  },

  // --- Mumbai Hotels ---
  {
    hotelId: 'b10',
    name: 'Trident Nariman Point',
    price: 10500, // Cheaper than A (11000)
    city: 'mumbai',
    commissionPct: 15,
  },
  {
    hotelId: 'b11',
    name: 'The St. Regis',
    price: 15800, // More expensive than A (15000)
    city: 'mumbai',
    commissionPct: 20,
  },
  {
    hotelId: 'b12',
    name: 'The Taj Mahal Palace',
    price: 22000, // Exclusive to B
    city: 'mumbai',
    commissionPct: 18,
  },
  {
    hotelId: 'b13',
    name: 'Marine Plaza',
    price: 6500, // Exclusive to B
    city: 'mumbai',
    commissionPct: 12,
  },
];

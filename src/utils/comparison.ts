import { SupplierHotelOffer, AggregatedHotelOffer } from '../types/hotel.types';

export function normalizeHotelName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Deduplicates and selects the cheapest hotel offer across suppliers.
 *
 * Rules:
 * 1. Lower price wins.
 * 2. If prices are equal, Supplier A wins (deterministic tie-breaker).
 * 3. Preserve original display name from winning offer.
 * 4. Preserve commissionPct and supplier from winning offer.
 * 5. Single supplier offerings are retained as-is.
 * 6. Internal fields (hotelId, city) are stripped.
 */
export function compareAndDeduplicateOffers(
  supplierAOffers: SupplierHotelOffer[],
  supplierBOffers: SupplierHotelOffer[]
): AggregatedHotelOffer[] {
  // Map normalized hotel name -> selected offer
  const hotelMap = new Map<string, AggregatedHotelOffer>();

  // Process Supplier A offers first
  for (const offer of supplierAOffers) {
    if (!offer || !offer.name || typeof offer.price !== 'number') continue;
    const normalized = normalizeHotelName(offer.name);
    hotelMap.set(normalized, {
      name: offer.name.trim(),
      price: offer.price,
      supplier: 'Supplier A',
      commissionPct: offer.commissionPct,
    });
  }

  // Process Supplier B offers
  for (const offer of supplierBOffers) {
    if (!offer || !offer.name || typeof offer.price !== 'number') continue;
    const normalized = normalizeHotelName(offer.name);
    const existing = hotelMap.get(normalized);

    if (!existing) {
      // Hotel only exists in Supplier B
      hotelMap.set(normalized, {
        name: offer.name.trim(),
        price: offer.price,
        supplier: 'Supplier B',
        commissionPct: offer.commissionPct,
      });
    } else {
      // Hotel exists in both: compare price
      // Rule: Lower price wins. If equal, Supplier A wins (which is already in `existing`).
      if (offer.price < existing.price) {
        hotelMap.set(normalized, {
          name: offer.name.trim(),
          price: offer.price,
          supplier: 'Supplier B',
          commissionPct: offer.commissionPct,
        });
      }
      // If offer.price >= existing.price, existing (Supplier A) stays
    }
  }

  // Convert map values to array sorted by price ascending for consistent output
  return Array.from(hotelMap.values()).sort((a, b) => a.price - b.price);
}

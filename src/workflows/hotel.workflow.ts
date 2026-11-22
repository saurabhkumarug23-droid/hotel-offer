
import { proxyActivities } from '@temporalio/workflow';
import type { HotelActivities } from '../activities/hotel.activities';
import { AggregatedHotelOffer } from '../types/hotel.types';
import { compareAndDeduplicateOffers } from '../utils/comparison';

const { fetchSupplierAHotels, fetchSupplierBHotels } = proxyActivities<HotelActivities>({
  startToCloseTimeout: '10s',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

export interface AggregationResult {
  offers: AggregatedHotelOffer[];
  complete: boolean;
}

export async function aggregateHotelOffersWorkflow(
  city: string
): Promise<AggregationResult> {
  const [resultA, resultB] = await Promise.allSettled([
    fetchSupplierAHotels(city),
    fetchSupplierBHotels(city),
  ]);

  const supplierAOffers =
    resultA.status === 'fulfilled' ? resultA.value : [];

  const supplierBOffers =
    resultB.status === 'fulfilled' ? resultB.value : [];

  if (resultA.status === 'rejected') {
    console.error('Supplier A failed:', resultA.reason);
  }

  if (resultB.status === 'rejected') {
    console.error('Supplier B failed:', resultB.reason);
  }

  if (resultA.status === 'rejected' && resultB.status === 'rejected') {
    throw new Error('Both suppliers failed to fetch hotel offers');
  }

  return {
    offers: compareAndDeduplicateOffers(supplierAOffers, supplierBOffers),
    complete: resultA.status === 'fulfilled' && resultB.status === 'fulfilled',
  };
}

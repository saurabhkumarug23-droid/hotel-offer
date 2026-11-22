import axios from 'axios';
import { SupplierHotelOffer } from '../types/hotel.types';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface HotelActivities {
  fetchSupplierAHotels(city: string): Promise<SupplierHotelOffer[]>;
  fetchSupplierBHotels(city: string): Promise<SupplierHotelOffer[]>;
}

export function createActivities(
  supplierAUrl: string = config.suppliers.supplierAUrl,
  supplierBUrl: string = config.suppliers.supplierBUrl
): HotelActivities {
  return {
    async fetchSupplierAHotels(city: string): Promise<SupplierHotelOffer[]> {
      const url = `${supplierAUrl}?city=${encodeURIComponent(city)}`;
      logger.info(`[Activity] Fetching hotels from Supplier A: ${url}`);
      try {
        const response = await axios.get<SupplierHotelOffer[]>(url, {
          timeout: 5000,
          headers: { Accept: 'application/json' },
        });

        if (!Array.isArray(response.data)) {
          throw new Error('Supplier A returned invalid data format (expected array)');
        }

        logger.info(`[Activity] Supplier A returned ${response.data.length} hotels for city: ${city}`);
        return response.data;
      } catch (error: any) {
        const msg = error.response
          ? `Supplier A failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
          : error.message;
        logger.error(`[Activity] Supplier A fetch error: ${msg}`);
        throw new Error(`Supplier A error: ${msg}`);
      }
    },

    async fetchSupplierBHotels(city: string): Promise<SupplierHotelOffer[]> {
      const url = `${supplierBUrl}?city=${encodeURIComponent(city)}`;
      logger.info(`[Activity] Fetching hotels from Supplier B: ${url}`);
      try {
        const response = await axios.get<SupplierHotelOffer[]>(url, {
          timeout: 5000,
          headers: { Accept: 'application/json' },
        });

        if (!Array.isArray(response.data)) {
          throw new Error('Supplier B returned invalid data format (expected array)');
        }

        logger.info(`[Activity] Supplier B returned ${response.data.length} hotels for city: ${city}`);
        return response.data;
      } catch (error: any) {
        const msg = error.response
          ? `Supplier B failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`
          : error.message;
        logger.error(`[Activity] Supplier B fetch error: ${msg}`);
        throw new Error(`Supplier B error: ${msg}`);
      }
    },
  };
}

export const activities = createActivities();

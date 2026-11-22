export interface SupplierHotelOffer {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface AggregatedHotelOffer {
  name: string;
  price: number;
  supplier: string; // "Supplier A" | "Supplier B"
  commissionPct: number;
}

export interface InternalOfferCandidate extends AggregatedHotelOffer {
  normalizedName: string;
}

export interface HotelQueryParams {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    redis: 'healthy' | 'unhealthy';
    temporal: 'healthy' | 'unhealthy';
    supplierA: 'healthy' | 'unhealthy';
    supplierB: 'healthy' | 'unhealthy';
  };
}

export interface SupplierErrorDetails {
  supplier: string;
  message: string;
  statusCode?: number;
}

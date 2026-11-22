import { HotelQueryParams } from '../types/hotel.types';

export class ValidationError extends Error {
  public statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export function validateHotelQueryParams(query: Record<string, unknown>): HotelQueryParams {
  const cityRaw = query.city;

  if (cityRaw === undefined || cityRaw === null || typeof cityRaw !== 'string' || cityRaw.trim() === '') {
    throw new ValidationError('City parameter is required and cannot be empty.');
  }

  const city = cityRaw.trim().toLowerCase();

  let minPrice: number | undefined;
  if (query.minPrice !== undefined && query.minPrice !== null && query.minPrice !== '') {
    const parsedMin = Number(query.minPrice);
    if (isNaN(parsedMin)) {
      throw new ValidationError('minPrice must be a valid number.');
    }
    if (parsedMin < 0) {
      throw new ValidationError('minPrice cannot be negative.');
    }
    minPrice = parsedMin;
  }

  let maxPrice: number | undefined;
  if (query.maxPrice !== undefined && query.maxPrice !== null && query.maxPrice !== '') {
    const parsedMax = Number(query.maxPrice);
    if (isNaN(parsedMax)) {
      throw new ValidationError('maxPrice must be a valid number.');
    }
    if (parsedMax < 0) {
      throw new ValidationError('maxPrice cannot be negative.');
    }
    maxPrice = parsedMax;
  }

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ValidationError('minPrice cannot be greater than maxPrice.');
  }

  return {
    city,
    minPrice,
    maxPrice,
  };
}

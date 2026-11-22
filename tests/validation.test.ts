import { validateHotelQueryParams, ValidationError } from '../src/utils/validation';

describe('Parameter Validation Logic', () => {
  it('should validate and normalize valid city query', () => {
    const params = validateHotelQueryParams({ city: '  Delhi  ' });
    expect(params.city).toBe('delhi');
    expect(params.minPrice).toBeUndefined();
    expect(params.maxPrice).toBeUndefined();
  });

  it('should reject missing city', () => {
    expect(() => validateHotelQueryParams({})).toThrow(ValidationError);
    expect(() => validateHotelQueryParams({})).toThrow('City parameter is required');
  });

  it('should reject empty city string or whitespace', () => {
    expect(() => validateHotelQueryParams({ city: '   ' })).toThrow(ValidationError);
  });

  // Requirement 10: Invalid price ranges
  it('Requirement 10: should reject minPrice greater than maxPrice', () => {
    expect(() =>
      validateHotelQueryParams({ city: 'delhi', minPrice: '8000', maxPrice: '5000' })
    ).toThrow('minPrice cannot be greater than maxPrice.');
  });

  it('should reject non-numeric minPrice', () => {
    expect(() =>
      validateHotelQueryParams({ city: 'delhi', minPrice: 'abc' })
    ).toThrow('minPrice must be a valid number.');
  });

  it('should reject negative minPrice', () => {
    expect(() =>
      validateHotelQueryParams({ city: 'delhi', minPrice: '-100' })
    ).toThrow('minPrice cannot be negative.');
  });

  it('should reject non-numeric maxPrice', () => {
    expect(() =>
      validateHotelQueryParams({ city: 'delhi', maxPrice: 'xyz' })
    ).toThrow('maxPrice must be a valid number.');
  });

  it('should reject negative maxPrice', () => {
    expect(() =>
      validateHotelQueryParams({ city: 'delhi', maxPrice: '-500' })
    ).toThrow('maxPrice cannot be negative.');
  });

  it('should accept valid minPrice and maxPrice numbers', () => {
    const params = validateHotelQueryParams({
      city: 'delhi',
      minPrice: '5000',
      maxPrice: '7000',
    });
    expect(params.minPrice).toBe(5000);
    expect(params.maxPrice).toBe(7000);
  });
});

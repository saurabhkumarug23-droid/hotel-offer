import axios from 'axios';
import { createActivities } from '../src/activities/hotel.activities';
import { SupplierHotelOffer } from '../src/types/hotel.types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Hotel Activities - Supplier Fetching & Error Handling', () => {
  const activities = createActivities(
    'http://mock-supplier-a/hotels',
    'http://mock-supplier-b/hotels'
  );

  const mockOffers: SupplierHotelOffer[] = [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  ];

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchSupplierAHotels', () => {
    it('should successfully fetch hotel offers from Supplier A', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockOffers,
      });

      const result = await activities.fetchSupplierAHotels('delhi');
      expect(result).toEqual(mockOffers);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://mock-supplier-a/hotels?city=delhi',
        expect.objectContaining({ timeout: 5000 })
      );
    });

    // Requirement 12: Supplier failure handling
    it('Requirement 12: should throw an error when Supplier A returns 500 server error', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'Internal Supplier Error' } },
        message: 'Request failed with status code 500',
      });

      await expect(activities.fetchSupplierAHotels('delhi')).rejects.toThrow(
        /Supplier A error: Supplier A failed with status 500/
      );
    });

    it('should throw an error when Supplier A returns invalid non-array format', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { error: 'Not an array' },
      });

      await expect(activities.fetchSupplierAHotels('delhi')).rejects.toThrow(
        /Supplier A returned invalid data format/
      );
    });
  });

  describe('fetchSupplierBHotels', () => {
    it('should successfully fetch hotel offers from Supplier B', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: mockOffers,
      });

      const result = await activities.fetchSupplierBHotels('delhi');
      expect(result).toEqual(mockOffers);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://mock-supplier-b/hotels?city=delhi',
        expect.objectContaining({ timeout: 5000 })
      );
    });

    // Requirement 12: Supplier failure handling
    it('Requirement 12: should throw an error when Supplier B network times out', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

      await expect(activities.fetchSupplierBHotels('delhi')).rejects.toThrow(
        /timeout of 5000ms exceeded/
      );
    });
  });
});

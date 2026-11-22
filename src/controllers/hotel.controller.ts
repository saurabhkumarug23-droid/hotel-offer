import { Request, Response, NextFunction } from 'express';
import { validateHotelQueryParams } from '../utils/validation';
import { HotelService, hotelService as defaultHotelService } from '../services/hotel.service';

export class HotelController {
  private hotelService: HotelService;

  constructor(service: HotelService = defaultHotelService) {
    this.hotelService = service;
  }

  public getHotels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedParams = validateHotelQueryParams(req.query as Record<string, unknown>);
      const result = await this.hotelService.getHotels(validatedParams);
      res.setHeader('X-Cache', result.fromCache ? 'HIT' : 'MISS');
      res.status(200).json(result.hotels);
    } catch (error) {
      next(error);
    }
  };
}

export const hotelController = new HotelController();

import { Request, Response } from 'express';
import { supplierAHotels } from '../suppliers/supplierA.data';
import { supplierBHotels } from '../suppliers/supplierB.data';
import { logger } from '../utils/logger';

export class SupplierController {
  public static getSupplierAHotels(req: Request, res: Response): void {
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';

    if (!city) {
      res.status(400).json({ error: 'City query parameter is required.' });
      return;
    }

    const filtered = supplierAHotels.filter((h) => h.city.toLowerCase() === city);
    logger.info(`Supplier A returned ${filtered.length} hotels for city: ${city}`);
    res.status(200).json(filtered);
  }

  public static getSupplierBHotels(req: Request, res: Response): void {
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';

    if (!city) {
      res.status(400).json({ error: 'City query parameter is required.' });
      return;
    }

    const filtered = supplierBHotels.filter((h) => h.city.toLowerCase() === city);
    logger.info(`Supplier B returned ${filtered.length} hotels for city: ${city}`);
    res.status(200).json(filtered);
  }
}

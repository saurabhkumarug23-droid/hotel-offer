import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/validation';
import { logger } from '../utils/logger';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Client validation errors
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Temporal or downstream supplier errors
  if (err.message && err.message.includes('Supplier')) {
    logger.error(`[ErrorHandler] Downstream supplier failure: ${err.message}`);
    res.status(502).json({
      error: 'Upstream supplier error. Hotel offer aggregation failed.',
      details: err.message,
    });
    return;
  }

  // General internal server error
  logger.error('[ErrorHandler] Unexpected server error:', {
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: 'Internal server error. Please try again later.',
  });
}

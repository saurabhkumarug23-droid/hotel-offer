import express, { Application, Request, Response, NextFunction } from 'express';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

export function createApp(): Application {
  const app = express();

  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info(`[HTTP] ${req.method} ${req.url}`);
    next();
  });

  // Mount API routes
  app.use(routes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

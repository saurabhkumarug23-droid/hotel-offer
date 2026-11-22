import { Request, Response } from 'express';
import axios from 'axios';
import { redisService } from '../services/redis.service';
import { temporalService } from '../services/temporal.service';
import { config } from '../config/env';
import { HealthStatus } from '../types/hotel.types';
import { logger } from '../utils/logger';

export class HealthController {
  private static async checkSupplier(url: string): Promise<boolean> {
    try {
      const response = await axios.get(`${url}?city=delhi`, {
        timeout: 2000,
        validateStatus: (status) => status === 200,
      });
      return response.status === 200 && Array.isArray(response.data);
    } catch {
      return false;
    }
  }

  public static async getHealth(_req: Request, res: Response): Promise<void> {
    try {
      const [redisOk, temporalOk, supplierAOk, supplierBOk] = await Promise.all([
        redisService.isHealthy(),
        temporalService.isHealthy(),
        HealthController.checkSupplier(config.suppliers.supplierAUrl),
        HealthController.checkSupplier(config.suppliers.supplierBUrl),
      ]);

      const allHealthy = redisOk && temporalOk && supplierAOk && supplierBOk;
      const anyHealthy = redisOk || temporalOk || supplierAOk || supplierBOk;

      const overallStatus: HealthStatus['status'] = allHealthy
        ? 'healthy'
        : anyHealthy
        ? 'degraded'
        : 'unhealthy';

      const response: HealthStatus = {
        status: overallStatus,
        services: {
          redis: redisOk ? 'healthy' : 'unhealthy',
          temporal: temporalOk ? 'healthy' : 'unhealthy',
          supplierA: supplierAOk ? 'healthy' : 'unhealthy',
          supplierB: supplierBOk ? 'healthy' : 'unhealthy',
        },
      };

      const statusCode = allHealthy ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error: any) {
      logger.error('[Health] Health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        services: {
          redis: 'unhealthy',
          temporal: 'unhealthy',
          supplierA: 'unhealthy',
          supplierB: 'unhealthy',
        },
      });
    }
  }
}

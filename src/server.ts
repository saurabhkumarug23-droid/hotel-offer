import { app } from './app';
import { config } from './config/env';
import { redisService } from './services/redis.service';
import { logger } from './utils/logger';

async function startServer() {
  try {
    // Attempt Redis connection
    try {
      await redisService.connect();
      logger.info('[Server] Connected to Redis successfully.');
    } catch (redisErr: any) {
      logger.warn(`[Server] Redis connection warning: ${redisErr.message}`);
    }

    const server = app.listen(config.port, () => {
      logger.info(`===============================================`);
      logger.info(` Hotel Offer Orchestrator API is running`);
      logger.info(` Port:        http://localhost:${config.port}`);
      logger.info(` Environment: ${config.nodeEnv}`);
      logger.info(`===============================================`);
    });

    const shutdown = async () => {
      logger.info('[Server] Gracefully shutting down HTTP server...');
      server.close(async () => {
        await redisService.disconnect();
        logger.info('[Server] Closed Redis and HTTP server.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('[Server] Fatal startup error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export { startServer };

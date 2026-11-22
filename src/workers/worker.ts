import { Worker, NativeConnection } from '@temporalio/worker';
import { activities } from '../activities/hotel.activities';
import { config } from '../config/env';
import { logger } from '../utils/logger';

async function runWorker() {
  try {
    logger.info(`[Worker] Connecting to Temporal server at ${config.temporal.address}...`);

    const connection = await NativeConnection.connect({
      address: config.temporal.address,
    });

    const worker = await Worker.create({
      connection,
      namespace: config.temporal.namespace,
      taskQueue: config.temporal.taskQueue,
      workflowsPath: require.resolve('../workflows/hotel.workflow'),
      activities,
    });

    logger.info(`[Worker] Worker successfully registered on queue: ${config.temporal.taskQueue}`);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('[Worker] Shutting down Temporal worker...');
      worker.shutdown();
      await connection.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await worker.run();
  } catch (error) {
    logger.error(`[Worker] Fatal worker error:`, error);
    process.exit(1);
  }
}

if (require.main === module) {
  runWorker();
}

export { runWorker };

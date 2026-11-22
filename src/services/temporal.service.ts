
import { randomUUID } from 'crypto';
import { Connection, Client } from '@temporalio/client';
import { AggregatedHotelOffer } from '../types/hotel.types';
import {
  aggregateHotelOffersWorkflow,
  AggregationResult,
} from '../workflows/hotel.workflow';
import { activities } from '../activities/hotel.activities';
import { compareAndDeduplicateOffers } from '../utils/comparison';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class TemporalService {
  private client: Client | null = null;
  private connection: Connection | null = null;

  constructor(customClient?: Client) {
    if (customClient) {
      this.client = customClient;
    }
  }

  public async getClient(): Promise<Client> {
    if (!this.client) {
      logger.info(`[Temporal] Connecting to Temporal server at ${config.temporal.address}`);
      this.connection = await Connection.connect({
        address: config.temporal.address,
      });
      this.client = new Client({
        connection: this.connection,
        namespace: config.temporal.namespace,
      });
      logger.info('[Temporal] Successfully connected to Temporal server');
    }
    return this.client;
  }

  public async isHealthy(): Promise<boolean> {
    if (config.temporal.standaloneMode) {
      return true;
    }

    try {
      if (!this.connection) {
        this.connection = await Connection.connect({
          address: config.temporal.address,
          connectTimeout: 1000,
        });
      }

      await this.connection.workflowService.getSystemInfo({});
      return true;
    } catch {
      if (config.temporal.standaloneFallback) {
        return true;
      }
      return false;
    }
  }

  /**
   * Executes hotel aggregation through Temporal or standalone mode.
   * Partial results are returned when one supplier fails.
   * The complete flag indicates whether both suppliers succeeded.
   */
  public async executeAggregationWorkflow(city: string): Promise<AggregationResult> {
    if (config.temporal.standaloneMode) {
      logger.info(
        `[Temporal] Running aggregation workflow in local standalone mode for city: ${city}`
      );

      return this.executeStandaloneAggregation(city);
    }

    try {
      const client = await this.getClient();
      const workflowId = `hotel-aggregation-${city.toLowerCase()}-${randomUUID()}`;

      logger.info(
        `[Temporal] Starting workflow ${workflowId} on queue ${config.temporal.taskQueue}`
      );

      const handle = await client.workflow.start(aggregateHotelOffersWorkflow, {
        args: [city],
        taskQueue: config.temporal.taskQueue,
        workflowId,
      });

      const result = await handle.result();

      logger.info(
        `[Temporal] Workflow ${workflowId} completed successfully with ${result.offers.length} offers (complete: ${result.complete})`
      );

      return result;
    } catch (temporalErr: any) {
      if (config.temporal.standaloneFallback) {
        logger.warn(
          `[Temporal] Temporal server unreachable (${temporalErr.message}). Executing workflow in standalone local mode...`
        );

        return this.executeStandaloneAggregation(city);
      }

      throw temporalErr;
    }
  }

  /**
   * Runs both supplier requests concurrently without Temporal.
   * Returns partial results if exactly one supplier succeeds.
   */
  private async executeStandaloneAggregation(city: string): Promise<AggregationResult> {
    const [resultA, resultB] = await Promise.allSettled([
      activities.fetchSupplierAHotels(city),
      activities.fetchSupplierBHotels(city),
    ]);

    if (resultA.status === 'rejected') {
      logger.error('[Temporal] Standalone Supplier A failed:', resultA.reason);
    }

    if (resultB.status === 'rejected') {
      logger.error('[Temporal] Standalone Supplier B failed:', resultB.reason);
    }

    if (resultA.status === 'rejected' && resultB.status === 'rejected') {
      throw new Error('Both suppliers failed to fetch hotel offers');
    }

    const supplierAOffers =
      resultA.status === 'fulfilled' ? resultA.value : [];

    const supplierBOffers =
      resultB.status === 'fulfilled' ? resultB.value : [];

    return {
      offers: compareAndDeduplicateOffers(supplierAOffers, supplierBOffers),
      complete:
        resultA.status === 'fulfilled' &&
        resultB.status === 'fulfilled',
    };
  }
}

export const temporalService = new TemporalService();

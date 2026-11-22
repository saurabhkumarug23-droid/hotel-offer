# 12. Complete Code Walkthrough

This document delivers an in-depth, file-by-file and function-by-function breakdown of the source code in `src/`.

---

## 1. Entry Points & Server Bootstrap

### `src/server.ts`
- **Purpose**: Bootstraps the HTTP server, establishes foundational network connections, and manages OS process termination signals.
- **Key Functions**:
  - `startServer()`: Connects to Redis lazily, mounts `app.listen(config.port)`, and registers listeners for `SIGTERM` and `SIGINT` to cleanly close Redis sockets and server ports.
- **Request Contribution**: Entry point for container runtime.

### `src/app.ts`
- **Purpose**: Express application factory. Configures global middlewares and router mounting.
- **Key Functions**:
  - `createApp(): Application`: Configures `express.json()`, attaches HTTP request logging, mounts master router `routes`, and binds the 404 handler and `errorHandler`.
- **Why Separate `app.ts` from `server.ts`?**: Enables `supertest` in integration tests to bind directly to `app` without binding a physical TCP socket port, avoiding port-collision issues during test execution.

---

## 2. Configuration & Utilities

### `src/config/env.ts`
- **Purpose**: Centralized typed configuration with environment fallbacks.
- **Key Variables**: `port`, `nodeEnv`, `redis.host`, `redis.port`, `redis.cacheTtlSeconds`, `temporal.address`, `temporal.taskQueue`, `suppliers.supplierAUrl`, `suppliers.supplierBUrl`.

### `src/utils/logger.ts`
- **Purpose**: Structured logging wrapper providing formatted timestamps, log levels (`DEBUG`, `INFO`, `WARN`, `ERROR`), and JSON metadata strings.
- **Key Methods**: `info()`, `warn()`, `error()`, `debug()`. Automatically suppresses noisy `DEBUG`/`INFO` outputs during Jest test runs.

### `src/utils/validation.ts`
- **Purpose**: Pure parameter validation for user queries.
- **Key Functions**:
  - `validateHotelQueryParams(query: Record<string, unknown>): HotelQueryParams`: Validates that `city` is present and non-empty, coerces and checks non-negativity of `minPrice` and `maxPrice`, and verifies `minPrice <= maxPrice`. Throws `ValidationError` on failure.

### `src/utils/comparison.ts`
- **Purpose**: Core deduplication and business rules engine.
- **Key Functions**:
  - `normalizeHotelName(name: string): string`: Trims leading/trailing whitespace and converts to lowercase.
  - `compareAndDeduplicateOffers(supplierAOffers, supplierBOffers): AggregatedHotelOffer[]`:
    1. Populates a `Map<string, AggregatedHotelOffer>` with Supplier A offers.
    2. Iterates over Supplier B offers; if the hotel already exists, compares prices and selects the cheaper offer (preserving Supplier A on equality).
    3. Strips `hotelId` and `city`.
    4. Sorts output array by price ascending.

---

## 3. Services Layer

### `src/services/redis.service.ts`
- **Purpose**: Data access layer managing Redis Sorted Sets, Hashes, and Pipelines.
- **Key Methods**:
  - `hasCityCache(city: string): Promise<boolean>`: Checks if `hotels:{city}:meta` key exists in Redis.
  - `saveHotels(city: string, hotels: AggregatedHotelOffer[]): Promise<void>`: Executes an atomic pipeline:
    ```typescript
    pipeline.del(pricesKey, dataKey, metaKey);
    pipeline.zadd(pricesKey, ...scoresAndMembers);
    pipeline.hset(dataKey, hashKeyValues);
    pipeline.set(metaKey, 'cached');
    pipeline.expire(...);
    await pipeline.exec();
    ```
  - `getHotelsByPriceRange(city, minPrice, maxPrice): Promise<AggregatedHotelOffer[]>`:
    Calls `zrangebyscore(pricesKey, min, max)` to fetch matching member names, then `hmget(dataKey, ...members)` to retrieve serialized objects.
  - `isHealthy(): Promise<boolean>`: Sends a `PING` command, returning `true` on `'PONG'`.

### `src/services/temporal.service.ts`
- **Purpose**: Temporal Client wrapper connecting Express to the Temporal cluster over gRPC.
- **Key Methods**:
  - `getClient(): Promise<Client>`: Lazily creates gRPC connection to `config.temporal.address`.
  - `executeAggregationWorkflow(city: string): Promise<AggregatedHotelOffer[]>`: Generates a unique workflow ID (`hotel-aggregation-${city}-${Date.now()}`), schedules `aggregateHotelOffersWorkflow` on `hotel-offers-queue`, and awaits the final workflow result.
  - `isHealthy(): Promise<boolean>`: Pings Temporal Server's `workflowService.getSystemInfo({})`.

### `src/services/hotel.service.ts`
- **Purpose**: Primary orchestrator implementing the cache-aside pattern.
- **Key Methods**:
  - `getHotels(params: HotelQueryParams)`: Checks Redis cache. On HIT, queries Redis directly. On MISS, invokes Temporal workflow, stores output into Redis via pipeline, and queries Redis to return filtered results.

---

## 4. Workflows & Activities

### `src/activities/hotel.activities.ts`
- **Purpose**: Executes external HTTP requests to Supplier A and Supplier B.
- **Key Methods**:
  - `fetchSupplierAHotels(city: string)`: Calls `GET ${supplierAUrl}?city=${city}` with a 5000ms timeout via Axios. Validates array format. Throws detailed error on non-200 or timeout.
  - `fetchSupplierBHotels(city: string)`: Same logic for Supplier B.

### `src/workflows/hotel.workflow.ts`
- **Purpose**: Pure, deterministic Temporal workflow function.
- **Key Methods**:
  - `aggregateHotelOffersWorkflow(city: string)`: Proxies activities with retry policy (3 max attempts, exponential backoff). Calls `Promise.all([fetchSupplierAHotels(city), fetchSupplierBHotels(city)])`. Passes results to `compareAndDeduplicateOffers()`.

### `src/workers/worker.ts`
- **Purpose**: Standalone executable process running the Temporal Worker.
- **Key Methods**:
  - `runWorker()`: Connects to Temporal Server via `NativeConnection`, registers workflows from `workflows/hotel.workflow.ts` and activities from `activities/hotel.activities.ts`, and polls `hotel-offers-queue`.

---

## 5. Controllers, Routes & Middleware

### `src/controllers/hotel.controller.ts`
- **Purpose**: HTTP controller for `GET /api/hotels`.
- **Flow**: Validates query parameters $\to$ delegates to `hotelService.getHotels` $\to$ sets `X-Cache: HIT|MISS` header $\to$ sends JSON response.

### `src/controllers/supplier.controller.ts`
- **Purpose**: Serves mock supplier endpoints (`GET /supplierA/hotels`, `GET /supplierB/hotels`) filtering static inventory by `city`.

### `src/controllers/health.controller.ts`
- **Purpose**: Health check endpoint (`GET /health`). Executes concurrent health checks against Redis, Temporal, Supplier A, and Supplier B via `Promise.all`. Returns HTTP 200 if all are healthy, HTTP 503 if degraded/unhealthy.

### `src/middleware/error.middleware.ts`
- **Purpose**: Centralized Express error handler.
- **Flow**: Catches `ValidationError` and responds with HTTP 400. Catches upstream supplier failures and responds with HTTP 502. Catches unexpected exceptions and responds with HTTP 500 without leaking internal stack traces.

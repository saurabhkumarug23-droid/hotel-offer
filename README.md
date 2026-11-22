# Hotel Offer Orchestrator

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.3-lightgrey.svg)](https://expressjs.com/)
[![Temporal.io](https://img.shields.io/badge/Temporal.io-1.26-black.svg)](https://temporal.io/)
[![Redis](https://img.shields.io/badge/Redis-7.0-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://www.docker.com/)
[![Jest](https://img.shields.io/badge/Tests-46%20Passed-brightgreen.svg)](https://jestjs.io/)

A production-quality backend aggregation service that orchestrates hotel room offers from multiple mock suppliers, deduplicates properties, selects the most economical offer using deterministic tie-breaking, caches results in Redis, and executes high-performance price filtering directly inside Redis Sorted Sets (`ZSET`).

---

## 1. Architecture Diagram

```mermaid
flowchart TD
    Client["Client / Postman (HTTP)"] -->|GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000| Express["Express API Server"]
    Express -->|1. Check Cache (EXISTS)| Redis[("Redis Engine (Port 6379)")]
    
    Express -.->|2. Cache Miss: Start Workflow| TemporalClient["Temporal Client SDK"]
    TemporalClient -->|3. Schedule Task| TemporalServer["Temporal Cluster (Port 7233)"]
    TemporalServer -->|4. Dispatch Tasks via Queue| TemporalWorker["Temporal Worker Daemon"]
    
    subgraph "Parallel Outbound Activities"
        TemporalWorker -->|Activity: Fetch A| SuppA["Supplier A API (Port 3000)"]
        TemporalWorker -->|Activity: Fetch B| SuppB["Supplier B API (Port 3000)"]
    end
    
    SuppA -->|Raw Offers A| TemporalWorker
    SuppB -->|Raw Offers B| TemporalWorker
    TemporalWorker -->|Deduplicate, Lower Price Wins| AggregatedResult["Aggregated Offers"]
    AggregatedResult -->|Workflow Completed| Express
    
    Express -->|5. Atomic Pipeline: DEL, ZADD, HSET, EXPIRE| Redis
    Redis -->|6. ZRANGEBYSCORE 5000 7000 + HMGET| Express
    Express -->|7. JSON Response (X-Cache: HIT / MISS)| Client
```

---

## 2. Key Features

- **Concurrent Supplier Orchestration**: Outbound requests to Supplier A and Supplier B execute concurrently via `Promise.all` inside Temporal activities, minimizing total aggregation latency.
- **Durable Temporal Workflow**: Reliable execution with automatic exponential retries (up to 3 attempts), activity timeouts (10s), and deterministic replay guarantees.
- **Intelligent Deduplication & Tie-Breaking**: Trims whitespace and normalizes casing. Lower price always wins; on identical prices, Supplier A wins deterministically. Internal fields (`hotelId`, `city`) are stripped.
- **In-Database Redis Price Filtering**: Price-range queries (`minPrice`, `maxPrice`) are executed directly in Redis using **Sorted Sets (`ZSET`)** with `ZRANGEBYSCORE` ($O(\log N + M)$ complexity) rather than filtering in JavaScript memory ($O(N)$ linear scan).
- **Atomic Cache Invalidation**: Uses Redis pipelines to purge stale members and atomically refresh both sorted sets and entity hashes.
- **Health Verification**: `/health` endpoint performing live connectivity validation against Redis, Temporal Server, Supplier A, and Supplier B.
- **Containerized Multi-Service Deployment**: Production-ready `Dockerfile` and `docker-compose.yml` orchestrating API, Worker, Redis, Temporal Server, and Temporal Web UI.
- **100% Test Coverage for Core Scenarios**: 46 automated tests across 7 test suites validating all requirements.

---

## 3. Technology Stack

- **Runtime**: Node.js (v20+), TypeScript (v5.7, ES2022, Node16)
- **Web Framework**: Express.js (v5.3)
- **Workflow Orchestration**: Temporal.io TypeScript SDK (`@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`)
- **Database / Cache**: Redis (v7.0) via `ioredis`
- **Testing**: Jest, ts-jest, supertest, ioredis-mock
- **Containerization**: Docker, Docker Compose

---

## 4. Architectural Decisions & FAQs

### Why Temporal.io?
1. **Worker Isolation**: Delegating long-running supplier HTTP calls to a dedicated worker container prevents exhausting API socket pools and event-loop capacity.
2. **Durable Fault Tolerance**: If a process restarts during a supplier fetch, Temporal resumes execution from the exact point of interruption on another worker without losing state.
3. **Declarative Retries & Observability**: Declarative retry policies with exponential backoff and visual execution tracing via the Temporal Web UI (Port 8233).

### Why Parallel Supplier Invocations?
Supplier calls are independent I/O-bound operations. Executing them concurrently via `Promise.all` reduces aggregation turnaround from $T_A + T_B$ (sequential) to $\max(T_A, T_B)$ (parallel).

### Why Redis Sorted Sets (`ZSET`) for Price Filtering?
Filtering in JavaScript application memory requires transferring all hotel records over the network and running an $O(N)$ loop on the single-threaded Node.js event loop. 
Redis Sorted Sets use a **Skip List** indexed by price, executing range queries in **$O(\log N + M)$** time directly inside Redis memory. Only matching member keys are returned and then fetched from the Redis Hash via `HMGET`.

### How Deduplication Works:
1. Hotel names are trimmed and converted to lowercase (e.g., `"  Taj Palace  "` $\to$ `"taj palace"`).
2. For duplicate hotels, the offer with the lower price is selected.
3. If prices are equal, Supplier A wins (deterministic tie-breaker).
4. Commission percentages are preserved verbatim from the winning offer (never blended).
5. Internal fields (`hotelId`, `city`) are removed from the response.

### Cache Hit vs. Cache Miss Strategy:
- **Cache Miss**: Express initiates the Temporal workflow $\to$ workers fetch supplier data in parallel $\to$ results are aggregated $\to$ stored into Redis via an atomic pipeline $\to$ filtered via `ZRANGEBYSCORE` $\to$ returned with header `X-Cache: MISS`.
- **Cache Hit**: Temporal is **completely bypassed**; data is filtered and served directly from Redis in $<5\text{ms}$ with header `X-Cache: HIT`.

---

## 5. API Reference

### Main Aggregation Endpoint: `GET /api/hotels`

#### Query Parameters:
- `city` (string, **required**): Name of city (e.g. `delhi`, `mumbai`).
- `minPrice` (number, optional): Minimum price threshold ($\ge 0$).
- `maxPrice` (number, optional): Maximum price threshold ($\ge \text{minPrice}$).

#### Example: Aggregated Hotels in Delhi with Price Filter
```bash
curl -X GET "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=7000"
```

**Response (`200 OK`)**:
```json
[
  {
    "name": "Holtin",
    "price": 5340,
    "supplier": "Supplier B",
    "commissionPct": 20
  },
  {
    "name": "Radisson Blu",
    "price": 5900,
    "supplier": "Supplier A",
    "commissionPct": 13
  }
]
```

### Mock Supplier Endpoints
- `GET /supplierA/hotels?city=delhi`
- `GET /supplierB/hotels?city=delhi`

### System Health Endpoint: `GET /health`
```bash
curl -X GET "http://localhost:3000/health"
```
**Response (`200 OK`)**:
```json
{
  "status": "healthy",
  "services": {
    "redis": "healthy",
    "temporal": "healthy",
    "supplierA": "healthy",
    "supplierB": "healthy"
  }
}
```

---

## 6. Local Development Setup

### Prerequisites
- Node.js v20+
- npm v10+
- Redis (optional for unit tests, as `ioredis-mock` is built-in; required for running full app)
- Temporal Server (optional for unit tests; required for full app)

### Installation
```bash
# Clone and enter directory
cd "hotel offer"

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Build TypeScript
npm run build
```

### Running Locally
```bash
# Terminal 1: Run Express API Server
npm run dev

# Terminal 2: Run Temporal Worker
npm run worker
```

---

## 7. Docker Deployment

The complete topology (API Gateway, Temporal Server, Temporal Web UI, Redis, and Temporal Worker) can be started with a single command:

```bash
docker compose up --build
```

### Published Ports:
- **Express API**: `http://localhost:3000`
- **Temporal Web UI**: `http://localhost:8080`
- **Temporal Server (gRPC)**: `localhost:7233`
- **Redis Server**: `localhost:6379`

### Stopping Containers:
```bash
docker compose down
```

---

## 8. Automated Testing

The project includes 46 automated tests covering all 14 core assignment requirements:

```bash
# Run complete test suite
npm test

# Run tests with code coverage report
npm run test:coverage
```

### Test Suite Summary:
- `tests/comparison.test.ts`: Lower price wins, tie-breaking favors Supplier A, single supplier retention, case/whitespace normalization, empty results.
- `tests/redis.service.test.ts`: Redis Sorted Set `ZRANGEBYSCORE` filtering with min/max, min only, max only, atomic member purge.
- `tests/workflow.test.ts`: Concurrency verification (parallel execution time $< \text{sequential}$), failure strategy (no silent partial data).
- `tests/activities.test.ts`: Outbound Axios calls, timeouts, HTTP 500 error handling.
- `tests/hotel.service.test.ts`: Cache-aside coordinator (Cache Miss invokes Temporal; Cache Hit serves directly from Redis).
- `tests/validation.test.ts`: Parameter boundaries (missing city, negative prices, `minPrice > maxPrice`).
- `tests/api.integration.test.ts`: Supertest end-to-end HTTP API lifecycle testing.

---

## 9. Postman Collection

A complete, automated Postman collection is located at:
```
postman/Hotel-Offer-Orchestrator.postman_collection.json
```

Import this file into Postman to run pre-configured test scripts for:
- System Health (`GET /health`)
- Raw Supplier A and B endpoints
- Delhi and Mumbai aggregations
- Price range queries (`5000` to `7000`)
- Single-bound queries (`minPrice=5000`, `maxPrice=7000`)
- Validation edge cases (invalid price range, missing city)

---

## 10. Comprehensive Documentation Suite

For deeper technical documentation, please explore the `docs/` directory:
- [01. Project Overview](file:///Users/saurabh/Documents/hotel%20offer/docs/01-project-overview.md)
- [02. Project Structure](file:///Users/saurabh/Documents/hotel%20offer/docs/02-project-structure.md)
- [03. System Architecture](file:///Users/saurabh/Documents/hotel%20offer/docs/03-system-architecture.md)
- [04. Complete Workflow Execution (24 Steps)](file:///Users/saurabh/Documents/hotel%20offer/docs/04-complete-workflow.md)
- [05. Temporal.io Deep Dive](file:///Users/saurabh/Documents/hotel%20offer/docs/05-temporal-deep-dive.md)
- [06. Redis Deep Dive & In-Database Price Filtering](file:///Users/saurabh/Documents/hotel%20offer/docs/06-redis-deep-dive.md)
- [07. Dependencies & Tech Stack Analysis](file:///Users/saurabh/Documents/hotel%20offer/docs/07-dependencies-and-technology.md)
- [08. Complete API Reference](file:///Users/saurabh/Documents/hotel%20offer/docs/08-api-reference.md)
- [09. Data Models & Business Logic](file:///Users/saurabh/Documents/hotel%20offer/docs/09-data-model-and-business-logic.md)
- [10. Docker & Deployment Guide](file:///Users/saurabh/Documents/hotel%20offer/docs/10-docker-and-deployment.md)
- [11. Testing & Verification Strategy](file:///Users/saurabh/Documents/hotel%20offer/docs/11-testing-and-debugging.md)
- [12. Code Walkthrough (File by File)](file:///Users/saurabh/Documents/hotel%20offer/docs/12-code-walkthrough.md)
- [13. Senior Backend Engineer Interview Preparation](file:///Users/saurabh/Documents/hotel%20offer/docs/13-interview-preparation.md)

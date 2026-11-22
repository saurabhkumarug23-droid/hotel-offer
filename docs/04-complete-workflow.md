# 04. Complete End-to-End Request Workflow

This document traces the complete execution lifecycle of a hotel search request from the moment an HTTP client dispatches:

```http
GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000 HTTP/1.1
Host: localhost:3000
```

until the final serialized JSON array is returned to the client.

---

## 1. Step-by-Step Execution Lifecycle (24 Steps)

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (HTTP)
    participant E as Express Router & Middleware
    participant Ctrl as HotelController
    participant Svc as HotelService
    participant R as Redis Service
    participant TClient as Temporal Client
    participant TServer as Temporal Cluster
    participant W as Temporal Worker
    participant Act as HotelActivities
    participant Supp as Supplier APIs (A & B)

    C->>E: 1. GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000
    E->>E: 2. Request logging middleware captures timestamp & URI
    E->>Ctrl: 3. Route match dispatches to HotelController.getHotels
    Ctrl->>Ctrl: 4. validateHotelQueryParams checks city, minPrice, maxPrice
    Ctrl->>Svc: 5. Invoke hotelService.getHotels({ city: 'delhi', minPrice: 5000, maxPrice: 7000 })
    Svc->>R: 6. redisService.hasCityCache('delhi')
    R-->>Svc: 7. Returns false (Cache MISS)
    Svc->>TClient: 8. temporalService.executeAggregationWorkflow('delhi')
    TClient->>TServer: 9. Start workflow 'hotel-aggregation-delhi-<ts>' on 'hotel-offers-queue'
    TServer->>W: 10. Worker polls task and initializes aggregateHotelOffersWorkflow('delhi')
    
    par Concurrent Activity Execution
        W->>Act: 11. fetchSupplierAHotels('delhi')
        W->>Act: 12. fetchSupplierBHotels('delhi')
    end
    
    par HTTP Requests to Suppliers
        Act->>Supp: 13. GET /supplierA/hotels?city=delhi (via Axios, timeout=5s)
        Act->>Supp: 14. GET /supplierB/hotels?city=delhi (via Axios, timeout=5s)
    end

    Supp-->>Act: 15. Returns JSON arrays for Supplier A & B
    Act-->>W: 16. Activities return SupplierHotelOffer[] to workflow
    W->>W: 17. Workflow invokes compareAndDeduplicateOffers()
    W->>W: 18. Normalize names: trim() and toLowerCase()
    W->>W: 19. Deduplicate & compare: lower price wins; tie-break favors Supplier A
    W->>W: 20. Strip internal fields (hotelId, city); return AggregatedHotelOffer[]
    W-->>TServer: 21. Workflow status marked COMPLETED with result payload
    TServer-->>TClient: 22. handle.result() resolves in Express process
    Svc->>R: 23. Pipeline: DEL old keys -> ZADD sorted set -> HSET hash -> SET meta
    Svc->>R: 24. ZRANGEBYSCORE 5000 7000 -> HMGET -> return filtered hotels
    Svc-->>Ctrl: 25. Return { hotels: AggregatedHotelOffer[], fromCache: false }
    Ctrl-->>C: 26. HTTP 200 OK + Header X-Cache: MISS + JSON Response
```

### Detailed Breakdown of Key Steps:

#### Step 1–4: Ingress & Validation
- **Request Received**: Express matches `GET /api/hotels`.
- **Validation**: `validateHotelQueryParams()` confirms `city` is a non-empty string, normalizes it to lowercase (`"delhi"`), parses `minPrice` (`5000`) and `maxPrice` (`7000`), and verifies that `minPrice <= maxPrice` and neither is negative.

#### Step 5–7: Cache Interrogation
- `hotelService` queries Redis: `EXISTS hotels:delhi:meta`.
- If key exists, execution jumps directly to Step 24 (Cache HIT).
- If key does not exist, a Cache MISS is registered.

#### Step 8–10: Temporal Workflow Scheduling
- `temporalService` initializes a client and invokes `client.workflow.start(aggregateHotelOffersWorkflow, { args: ['delhi'], taskQueue: 'hotel-offers-queue', workflowId: 'hotel-aggregation-delhi-1700000000000' })`.
- Temporal Server creates the workflow execution, logs the `WorkflowExecutionStarted` event in the immutable event history, and dispatches a task to the `hotel-offers-queue`.

#### Step 11–16: Concurrent Activity Execution
- The worker executes `Promise.all([fetchSupplierAHotels('delhi'), fetchSupplierBHotels('delhi')])`.
- Both HTTP requests are dispatched in parallel. If Supplier A takes 45ms and Supplier B takes 50ms, the total activity duration is approximately 50ms (not 95ms sequential).
- Axios parses the JSON arrays and verifies that the response is an array.

#### Step 17–20: Normalization & Deduplication Logic
- `compareAndDeduplicateOffers()` is called with both arrays.
- For each hotel offer:
  1. `normalizeHotelName(name)` trims whitespace and converts to lowercase.
  2. If the normalized key does not exist, insert it into the map.
  3. If the normalized key exists, compare prices:
     - `offer.price < existing.price`: Replace with the cheaper offer.
     - `offer.price === existing.price`: Retain existing offer (Supplier A wins tie-breaker).
     - `offer.price > existing.price`: Discard the incoming offer.
  4. Preserve original winning display name, supplier name, and commission percentage without blending.
  5. Strip internal fields (`hotelId` and `city`).

#### Step 21–23: Result Delivery & Redis Persistence
- The worker completes the workflow task. Temporal Server records `WorkflowExecutionCompleted`.
- The Express service awaits the workflow handle result.
- Once received, `redisService.saveHotels('delhi', results)` creates a multi-command pipeline:
  ```redis
  DEL hotels:delhi:prices hotels:delhi:data hotels:delhi:meta
  ZADD hotels:delhi:prices 3500 "city inn deluxe" 5340 "holtin" 5900 "radisson blu" ...
  HSET hotels:delhi:data "city inn deluxe" '{"name":"City Inn Deluxe","price":3500,...}' ...
  SET hotels:delhi:meta "cached" EX 300
  ```
- The pipeline executes atomically on the Redis server, guaranteeing no stale members linger.

#### Step 24–26: Database Filtering & Egress
- `redisService.getHotelsByPriceRange('delhi', 5000, 7000)` executes:
  ```redis
  ZRANGEBYSCORE hotels:delhi:prices 5000 7000
  ```
  Redis returns `["holtin", "radisson blu"]`.
- `redisService` retrieves complete objects:
  ```redis
  HMGET hotels:delhi:data "holtin" "radisson blu"
  ```
- The JSON objects are parsed into an array and returned.
- Controller sets header `X-Cache: MISS` and sends HTTP 200.

---

## 2. Failure Scenarios & Edge Cases

### A. When Both Suppliers Succeed
- Workflow successfully fetches both arrays, deduplicates, caches, and returns the combined market offers.

### B. When One Supplier Fails (Chosen Failure Strategy)
- **Design Decision**: The orchestrator **does not silently return partial data**.
- **Rationale**: If Supplier B fails and we return only Supplier A's inventory, the customer might book Holtin at ₹6,000, believing it to be the cheapest price, when in reality Supplier B had it for ₹5,340. Returning incomplete data destroys the core value proposition of an aggregator.
- **Behavior**: The failing supplier activity retries up to 3 times with exponential backoff (`1s`, `2s`, `4s`). If all retries fail, the activity throws an error. `Promise.all` in the workflow rejects. The workflow terminates with `WorkflowExecutionFailed`. Express catches this and responds with `HTTP 502 Bad Gateway` (`{"error": "Upstream supplier error. Hotel offer aggregation failed."}`).

### C. When Both Suppliers Fail
- Both activities fail their retry policies. The workflow fails immediately, returning an HTTP 502 error to the client.

### D. Empty Supplier Responses (e.g., Unknown City)
- Both suppliers return `[]`.
- Deduplication returns `[]`.
- Redis writes `SET hotels:unknown:meta "empty"` with TTL to prevent hammering external suppliers repeatedly for cities that do not exist (Cache Penetration protection).
- Endpoint returns HTTP 200 `[]`.

### E. Redis Cache Hit
- When a subsequent client queries `GET /api/hotels?city=delhi`, `hasCityCache('delhi')` returns `true`.
- The Temporal workflow is completely bypassed.
- Filtering is executed natively in Redis via `ZRANGEBYSCORE`.
- Response is dispatched in < 5ms with `X-Cache: HIT`.

### F. Temporal Worker Unavailable
- If the worker process is killed or down, the workflow execution request remains safely queued on Temporal Server's task queue (`hotel-offers-queue`).
- As soon as a worker restarts, it immediately claims the queued task and processes it without data loss.
- If the Express client times out, Temporal Server preserves the execution so other clients can retrieve the result.

### G. Redis Unavailable
- If Redis is down, health checks reflect `redis: "unhealthy"`.
- If a query arrives, `hasCityCache` triggers an error or falls back gracefully; `redisService` retry strategies handle transient reconnects.

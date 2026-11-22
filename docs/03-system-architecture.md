# 03. System Architecture

## 1. High-Level Architectural Overview

The **Hotel Offer Orchestrator** is designed as a distributed, decoupled aggregation system. It ensures high performance for read queries through in-memory Redis indexing while offloading complex, unreliable third-party supplier interactions to a durable orchestration engine (Temporal.io).

```mermaid
flowchart TD
    subgraph ClientZone ["External / Client Tier"]
        Client["HTTP Client / Browser / Mobile"]
    end

    subgraph APITier ["Express API Gateway Tier (Port 3000)"]
        Router["Express Router (/api/hotels, /health, /supplier*)"]
        Controller["Hotel / Health / Supplier Controllers"]
        Validation["Parameter Validation"]
        HotelSvc["Hotel Service"]
        Router --> Controller
        Controller --> Validation
        Controller --> HotelSvc
    end

    subgraph CacheTier ["In-Memory Data Tier (Redis 6379)"]
        ZSet[("hotels:{city}:prices (Sorted Set)")]
        Hash[("hotels:{city}:data (Hash)")]
        Meta[("hotels:{city}:meta (String)")]
    end

    subgraph TemporalTier ["Temporal Orchestration Cluster"]
        TemporalSvc["Temporal Client (SDK)"]
        Server["Temporal Server (Port 7233)"]
        Queue["Task Queue: 'hotel-offers-queue'"]
        UI["Temporal Web UI (Port 8233)"]
        Server --- UI
    end

    subgraph WorkerTier ["Temporal Worker Daemon (Dedicated Process)"]
        Worker["Worker Process"]
        Workflow["Hotel Aggregation Workflow"]
        ActivityA["Supplier A Activity"]
        ActivityB["Supplier B Activity"]
        ComparisonEngine["Comparison & Deduplication Engine"]
        Worker --> Workflow
        Workflow --> ActivityA
        Workflow --> ActivityB
        Workflow --> ComparisonEngine
    end

    subgraph SupplierTier ["Supplier Endpoints (Mock Distribution Systems)"]
        SuppA["Supplier A HTTP API"]
        SuppB["Supplier B HTTP API"]
    end

    %% Interactions
    Client -->|1. HTTP GET /api/hotels| Router
    HotelSvc -->|2. Check Cache| Meta
    HotelSvc -->|3. On Cache Hit: ZRANGEBYSCORE + HMGET| ZSet
    HotelSvc -->|3. On Cache Hit: ZRANGEBYSCORE + HMGET| Hash
    HotelSvc -->|4. On Cache Miss: Start Workflow| TemporalSvc
    TemporalSvc -->|5. Schedule Workflow Execution| Server
    Server -->|6. Enqueue Activity / Workflow Tasks| Queue
    Queue -->|7. Poll Tasks| Worker
    ActivityA -->|8a. Parallel GET /supplierA/hotels| SuppA
    ActivityB -->|8b. Parallel GET /supplierB/hotels| SuppB
    ComparisonEngine -->|9. Deduplicate & Select Cheapest| Workflow
    Worker -->|10. Complete Workflow| Server
    Server -->|11. Await Result| TemporalSvc
    HotelSvc -->|12. Pipeline Atomic DEL, ZADD, HSET| ZSet
    HotelSvc -->|12. Pipeline Atomic DEL, ZADD, HSET| Hash
    HotelSvc -->|13. Filter Price Range| ZSet
    HotelSvc -->|14. Return Serialized Offers| Controller
    Controller -->|15. HTTP 200 JSON Response| Client
```

---

## 2. Component Interaction Architecture

The application cleanly segregates read queries from write-heavy workflow executions:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Postman / Browser)
    participant API as Express API Server
    participant Redis as Redis In-Memory Store
    participant Temporal as Temporal Server (7233)
    participant Worker as Temporal Worker Daemon
    participant SuppA as Supplier A Mock API
    participant SuppB as Supplier B Mock API

    User->>API: GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000
    API->>API: Validate parameters (city, minPrice, maxPrice)
    API->>Redis: Check cache presence (EXISTS hotels:delhi:meta)

    alt Cache Miss (Data not yet cached)
        Redis-->>API: Cache MISS (0)
        API->>Temporal: Start Workflow (aggregateHotelOffersWorkflow, city='delhi')
        Temporal->>Worker: Dispatch Workflow Task to 'hotel-offers-queue'
        
        par Parallel Supplier Invocations
            Worker->>SuppA: HTTP GET /supplierA/hotels?city=delhi
            Worker->>SuppB: HTTP GET /supplierB/hotels?city=delhi
        end
        
        SuppA-->>Worker: HTTP 200 (Supplier A JSON array)
        SuppB-->>Worker: HTTP 200 (Supplier B JSON array)
        
        Worker->>Worker: Deduplicate, compare prices, apply tie-breaking
        Worker-->>Temporal: Workflow Execution Complete (Aggregated Offers)
        Temporal-->>API: Return Aggregated Offers Array
        
        API->>Redis: Pipeline: DEL old keys -> ZADD prices -> HSET data -> SET meta (TTL=300s)
        Redis-->>API: OK
    else Cache Hit (Data already cached in Redis)
        Redis-->>API: Cache HIT (1)
    end

    API->>Redis: ZRANGEBYSCORE hotels:delhi:prices 5000 7000
    Redis-->>API: Matching member keys ['holtin', 'radisson blu']
    API->>Redis: HMGET hotels:delhi:data 'holtin' 'radisson blu'
    Redis-->>API: JSON strings for matching hotels
    API->>API: Parse JSON objects into AggregatedHotelOffer[]
    API-->>User: HTTP 200 JSON Response (Cheapest filtered offers)
```

---

## 3. Runtime & Deployment Architecture

In production and Docker Compose environments, the system runs as five independent networked containers:

```mermaid
graph TB
    subgraph Host ["Docker Host Environment"]
        subgraph Ports ["Published Ports"]
            P3000["3000 (API Gateway)"]
            P8233["8233 (Temporal UI)"]
            P7233["7233 (Temporal gRPC)"]
            P6379["6379 (Redis)"]
        end

        subgraph DockerNetwork ["Bridge Network: hotel-network"]
            APIContainer["Container: hotel-orchestrator-api<br/>(Node.js / Express Server)"]
            WorkerContainer["Container: hotel-orchestrator-worker<br/>(Node.js / Temporal Worker)"]
            RedisContainer["Container: hotel-orchestrator-redis<br/>(Redis 7 Alpine)"]
            TemporalContainer["Container: hotel-orchestrator-temporal<br/>(Temporal Auto-Setup / SQLite)"]
            UIContainer["Container: hotel-orchestrator-temporal-ui<br/>(Temporal Web UI)"]
            Volume[("Named Volume: redis_data")]
        end
    end

    P3000 --> APIContainer
    P8233 --> UIContainer
    P7233 --> TemporalContainer
    P6379 --> RedisContainer

    APIContainer -->|TCP 6379| RedisContainer
    APIContainer -->|gRPC 7233| TemporalContainer
    WorkerContainer -->|gRPC 7233| TemporalContainer
    WorkerContainer -->|HTTP 3000| APIContainer
    UIContainer -->|gRPC 7233| TemporalContainer
    RedisContainer --- Volume
```

### Key Service Boundaries:
1. **API Service (`api`)**: Dedicated solely to serving user-facing HTTP requests. Does not execute workflows internally; acts only as a Temporal client.
2. **Worker Service (`worker`)**: Scales independently based on supplier activity volume. If supplier APIs slow down, worker containers can be horizontally scaled without impacting API server throughput.
3. **Temporal Service (`temporal`)**: Durable execution cluster managing execution histories and task distribution.
4. **Redis Service (`redis`)**: High-throughput memory store with persistent AOF (Append-Only File) storage.

---

## 4. Redis Storage Architecture

To achieve $O(\log N + M)$ price filtering without deserializing the entire inventory in Node.js memory, Redis uses a dual-structure storage model partitioned by city:

```mermaid
classDiagram
    class CityNamespace {
        +String hotels:{city}:meta
        +SortedSet hotels:{city}:prices
        +Hash hotels:{city}:data
    }

    class SortedSetPrices {
        Score: hotel.price (Double)
        Member: normalizeHotelName(hotel.name) (String)
    }

    class HashData {
        Field: normalizeHotelName(hotel.name) (String)
        Value: JSON.stringify(hotelObject) (String)
    }

    CityNamespace *-- SortedSetPrices : Price Index
    CityNamespace *-- HashData : Entity Payload
```

### Detailed Redis Keys:
- **`hotels:{city}:prices` (Sorted Set)**:
  - **Member**: Normalized hotel name (e.g., `'holtin'`, `'radisson blu'`). Guarantees unique entity representation.
  - **Score**: Winning offer price (e.g., `5340`, `5900`). Enables native `ZRANGEBYSCORE` filtering.
- **`hotels:{city}:data` (Hash)**:
  - **Field**: Normalized hotel name.
  - **Value**: Complete JSON string of the winning offer (`{"name":"Holtin","price":5340,"supplier":"Supplier B","commissionPct":20}`).
- **`hotels:{city}:meta` (String)**:
  - Stores cache metadata (`'cached'` or `'empty'`) with TTL to track cache validity.

---

## 5. Temporal Workflow Architecture

```mermaid
stateDiagram-v2
    [*] --> WorkflowStarted: aggregateHotelOffersWorkflow(city)
    
    state "Parallel Activity Execution" as ParallelExec {
        [*] --> FetchSupplierA
        [*] --> FetchSupplierB
        FetchSupplierA --> JoinParallel
        FetchSupplierB --> JoinParallel
    }

    WorkflowStarted --> ParallelExec: Promise.all()
    
    state JoinParallel {
        [*] --> CheckSupplierResponses
        CheckSupplierResponses --> BothSucceeded: Status 200 OK
        CheckSupplierResponses --> SupplierFailed: Timeout or 5xx
    }

    SupplierFailed --> WorkflowFailed: Throw ApplicationFailure (No partial data)
    WorkflowFailed --> [*]

    BothSucceeded --> DeduplicationEngine: Run compareAndDeduplicateOffers()
    
    state DeduplicationEngine {
        [*] --> TrimAndLowercaseNames
        TrimAndLowercaseNames --> PriceComparison: Lower price wins
        PriceComparison --> TieBreaker: If equal, Supplier A wins
        TieBreaker --> PreserveWinningSupplierAndCommission
        PreserveWinningSupplierAndCommission --> StripInternalIDs
    }

    DeduplicationEngine --> WorkflowCompleted: Return AggregatedHotelOffer[]
    WorkflowCompleted --> [*]
```

### Determinism Guarantee:
Temporal mandates that workflow code must be 100% deterministic. The workflow:
- Performs **no network I/O** directly.
- Performs **no disk or database reads/writes** directly.
- Generates **no unseeded random numbers or wall-clock timestamps**.
- Delegates external HTTP requests exclusively to `fetchSupplierAHotels` and `fetchSupplierBHotels` activities.
- Uses pure, deterministic JavaScript functions for deduplication and sorting.

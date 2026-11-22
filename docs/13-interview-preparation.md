# 13. Senior Backend Engineer Interview Preparation Guide

This guide compiles in-depth technical interview questions, trade-offs, and design defenses specifically tailored to this project's architecture and source code.

---

## 1. System Architecture & High-Level Design

### Q1: Can you walk me through the architecture of the Hotel Offer Orchestrator?
**Answer**:
"The system is built as a decoupled, event-driven aggregation engine designed to solve the challenges of third-party supplier latency, duplicate inventories, and high-frequency price filtering.
1. The **Express API Gateway** receives incoming HTTP queries (`GET /api/hotels?city=delhi&minPrice=...`).
2. It interrogates **Redis** to check if cached results exist for that city.
3. On a **Cache Hit**, it queries a Redis **Sorted Set (`ZSET`)** using `ZRANGEBYSCORE` to perform price filtering directly inside Redis, and retrieves the corresponding hotel objects from a Redis **Hash** via `HMGET`.
4. On a **Cache Miss**, Express acts as a Temporal client, scheduling a workflow on the Temporal cluster.
5. A dedicated **Temporal Worker** executes the workflow: it runs `Promise.all` to fetch inventories from Supplier A and Supplier B concurrently via Temporal Activities with automatic retry policies and timeouts.
6. The workflow executes deterministic deduplication, case-insensitive normalization, price comparison (cheaper wins), and tie-breaking (Supplier A wins).
7. The aggregated result is saved into Redis using an atomic pipeline (`DEL`, `ZADD`, `HSET`, `EXPIRE`) and the filtered results are returned to the client with an `X-Cache: MISS` header."

---

### Q2: Why did you choose Temporal instead of just using `Promise.all` inside an Express route?
**Answer**:
"While a simple in-process `Promise.all` inside Express is trivial to write, it fails in production for several critical reasons:
1. **Worker Isolation**: In vanilla Express, outbound HTTP requests consume the API server's event loop, socket pools, and memory. If suppliers become slow, the API server starves incoming user requests. Temporal delegates execution to a separate worker container.
2. **Durable Execution & Crash Fault Tolerance**: If the API process restarts or crashes during a 10-second supplier call in Express, all pending requests are permanently lost. In Temporal, if a worker crashes, another worker picks up the workflow and reconstructs state via event history replay without re-executing already-completed activities.
3. **Declarative Retries & Timeouts**: Temporal handles exponential backoff, jitter, and non-retryable error types declaratively without messy `try/catch/while` code in business logic.
4. **Rate Limiting & Backpressure**: Temporal Task Queues naturally buffer demand, protecting third-party suppliers from getting overwhelmed during traffic spikes."

---

### Q3: Why separate the Temporal Worker from the Express API into different Docker containers?
**Answer**:
"This aligns with the **Single Responsibility Principle** and allows **independent horizontal scaling**:
- The **API Gateway** is I/O-bound with high request concurrency and short-lived connections. It requires low latency and minimal CPU.
- The **Temporal Worker** is bound by external supplier latency, activity polling, and business computation.
- If we experience a sudden spike in search requests or if suppliers slow down, we can scale the worker deployment (e.g. from 2 to 20 containers) without provisioning redundant API endpoints, and vice versa."

---

## 2. Temporal.io Deep Dive

### Q4: What is the difference between a Temporal Workflow and an Activity?
**Answer**:
- **Workflow**: Orchestrates execution order and handles branching logic. It must be **strictly deterministic**. It cannot make HTTP calls, generate random numbers, or access local files.
- **Activity**: The unit of real-world side effects. It makes the actual network requests to suppliers, reads databases, or writes files. Temporal records the result of an activity in the workflow's history ledger so that during replay, the activity is not re-executed.

---

### Q5: What does workflow determinism mean, and what happens if a workflow is non-deterministic?
**Answer**:
"Determinism means that given the same sequence of event inputs, the workflow function must execute the exact same sequence of code paths and schedule the exact same sequence of commands.
If non-deterministic code (like `Math.random()`, `Date.now()`, or direct `axios.get()`) is placed in a workflow, Temporal's replay engine will detect that the replayed execution history does not match the recorded event history, throwing a fatal `DeterministicError` and blocking the workflow from completing."

---

### Q6: How does Temporal handle supplier failure? What failure strategy did you choose and why?
**Answer**:
"In `src/activities/hotel.activities.ts`, each supplier call is configured with a 5-second HTTP timeout and an activity retry policy of 3 maximum attempts with exponential backoff (`1s`, `2s`, `4s`).
If a supplier remains unavailable after all retries, the activity throws an error.
**Our Chosen Strategy**: We fail the workflow rather than silently returning partial data.
**Rationale**: In travel aggregation, price comparison integrity is paramount. If Supplier B is down and we silently return only Supplier A's hotels, a user could book Holtin for ₹6,000 believing it is the cheapest offer, unaware that Supplier B offered it for ₹5,340. Transparently returning an HTTP 502 error maintains user trust and alerts operations to supplier downtime."

---

## 3. Redis & Caching Strategy

### Q7: Why use Redis Sorted Sets (`ZSET`) instead of filtering in JavaScript memory?
**Answer**:
"1. **Algorithmic Complexity**: Array filtering in JavaScript (`hotels.filter(h => h.price >= min && h.price <= max)`) is an $O(N)$ linear scan. Redis Sorted Sets use a **Skip List** indexed by score (price), executing `ZRANGEBYSCORE` in **$O(\log N + M)$** time.
2. **Event Loop Offloading**: For a city with 10,000 hotels, deserializing and scanning objects in Node.js ties up the single-threaded event loop. In Redis, the database engine returns only the matching members.
3. **Network Efficiency**: We transfer only the keys that match the price filter from the Sorted Set, then fetch only those specific objects from the Hash via `HMGET`."

---

### Q8: How do you prevent stale sorted-set members when refreshing the cache for a city?
**Answer**:
"In `src/services/redis.service.ts`, we utilize a Redis **Pipeline**.
Before inserting new sorted set members or hash fields, the pipeline explicitly deletes the previous keys:
```typescript
pipeline.del(pricesKey, dataKey, metaKey);
pipeline.zadd(pricesKey, ...scoresAndMembers);
pipeline.hset(dataKey, hashPayload);
pipeline.set(metaKey, 'cached');
pipeline.expire(...);
await pipeline.exec();
```
Because the `DEL` and `ZADD` execute in an atomic batch on the Redis server, old hotels that are no longer returned by suppliers or whose prices have changed cannot leave orphaned members in the sorted set."

---

## 4. System Design, Concurrency & Scalability

### Q9: How would you prevent a 'Cache Stampede' if 1,000 concurrent users request Delhi simultaneously on a cache miss?
**Answer**:
"Currently, if 1,000 requests hit simultaneously on a cache miss, multiple Temporal workflows could be started for the same city.
In production, I would implement **Single-Flight Request Coalescing** or a **Distributed Lock**:
1. **Single-Flight (In-Memory)**: Maintain a map of active promises in Node.js: `Map<city, Promise<AggregatedHotels>>`. If a workflow is already in flight for `'delhi'`, subsequent incoming requests await that same pending promise instead of triggering new workflows.
2. **Temporal Workflow ID Reuse Policy**: Temporal natively supports unique Workflow IDs (e.g. `hotel-aggregation-${city}`). By setting `workflowIdReusePolicy: WorkflowIdReusePolicy.WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE_FAILED_ONLY`, Temporal automatically rejects duplicate concurrent workflow executions for the same city, allowing Express to attach to the existing running workflow."

---

### Q10: How would you scale this system from 2 suppliers to 50 suppliers?
**Answer**:
"1. **Dynamic Activity Dispatch**: Refactor `aggregateHotelOffersWorkflow` to accept an array of supplier configuration objects or query a Supplier Registry service.
2. **Fan-Out / Fan-In**: Use `Promise.all(suppliers.map(s => fetchSupplierHotels(s.id, city)))`.
3. **Partitioned Queues**: Isolate volatile or slow suppliers into dedicated Temporal task queues so slow suppliers do not consume worker capacity meant for fast suppliers.
4. **Partial Aggregation with Deadlines**: When querying 50 suppliers, set a strict workflow timeout (e.g., 2.5 seconds) and use `Promise.allSettled`. Aggregate whatever valid responses arrive within the window, logging tardy suppliers for health metrics."

---

### Q11: What are the primary trade-offs made in this implementation?
**Answer**:
1. **Consistency vs. Latency on Cache Miss**: We await workflow completion synchronously to return the fresh aggregated data to the user. A trade-off would be polling or WebSockets, but for an HTTP REST assignment, synchronous waiting provides a clean, predictable client contract.
2. **Strict Failure Strategy vs. Availability**: Failing the entire request when one supplier fails guarantees price accuracy at the expense of partial availability.
3. **In-Memory Mock Suppliers vs. Real Network**: Mock endpoints are hosted on the Express server for self-contained testing; in production, these would be external microservices behind separate DNS domains.

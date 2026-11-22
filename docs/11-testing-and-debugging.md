# 11. Testing & Verification Strategy

## 1. Testing Philosophy

The test suite is architected to guarantee **100% test coverage of all core requirements**, ensuring that edge cases in deduplication, pricing, caching, concurrency, and validation are caught prior to deployment.

The suite utilizes:
- **Jest**: Primary test runner and assertion framework.
- **ts-jest**: Transpiles TypeScript tests on-the-fly.
- **ioredis-mock**: High-fidelity in-memory Redis mock replicating Sorted Sets (`ZADD`, `ZRANGEBYSCORE`) and Hashes (`HSET`, `HMGET`).
- **Supertest**: HTTP agent executing real HTTP assertions against the Express application.

---

## 2. Requirement-to-Test Mapping (14 Core Scenarios)

| # | Requirement Scenario | Test File | Test Name |
| :--- | :--- | :--- | :--- |
| **1** | Duplicate hotel: Supplier B cheaper | `tests/comparison.test.ts` | `Requirement 1: should choose Supplier B when Supplier B has cheaper price` |
| **2** | Duplicate hotel: Supplier A cheaper | `tests/comparison.test.ts` | `Requirement 2: should choose Supplier A when Supplier A has cheaper price` |
| **3** | Equal prices: Supplier A wins tie-break | `tests/comparison.test.ts` | `Requirement 3: should choose Supplier A as tie-breaker when prices are equal` |
| **4** | Hotel exists only in Supplier A | `tests/comparison.test.ts` | `Requirement 4: should retain hotel when it exists exclusively in Supplier A` |
| **5** | Hotel exists only in Supplier B | `tests/comparison.test.ts` | `Requirement 5: should retain hotel when it exists exclusively in Supplier B` |
| **6** | Case & whitespace insensitive deduplication | `tests/comparison.test.ts` | `Requirement 6: should deduplicate across different casing and whitespace padding` |
| **7** | Price filtering with minPrice and maxPrice | `tests/redis.service.test.ts` | `Requirement 7: should filter hotels by price range using Redis Sorted Set` |
| **8** | Filtering with only minPrice | `tests/redis.service.test.ts` | `Requirement 8: should filter hotels with only minPrice (minPrice to +inf)` |
| **9** | Filtering with only maxPrice | `tests/redis.service.test.ts` | `Requirement 9: should filter hotels with only maxPrice (-inf to maxPrice)` |
| **10** | Invalid price ranges (min > max, NaN, negative) | `tests/validation.test.ts` | `Requirement 10: should reject minPrice greater than maxPrice` |
| **11** | Empty supplier results | `tests/comparison.test.ts` | `Requirement 11: should handle empty supplier lists gracefully` |
| **12** | Supplier failure handling (timeouts, 500s) | `tests/activities.test.ts` | `Requirement 12: should throw an error when Supplier A returns 500 server error` |
| **13** | Redis cache hit and cache miss | `tests/redis.service.test.ts` | `Requirement 13: should report cache hit for populated city and miss for unknown city` |
| **14** | Concurrent supplier activity execution | `tests/workflow.test.ts` | `Requirement 14: should execute Supplier A and B activities concurrently rather than sequentially` |

---

## 3. Test Suites Overview

### 1. `tests/comparison.test.ts` (8 Tests)
- Verifies name normalization (`trim()` and `toLowerCase()`).
- Tests lower price selection (Holtin ₹5,340 from Supplier B vs ₹6,000 from Supplier A).
- Tests Supplier A price superiority (Radisson Blu ₹5,900 from A vs ₹6,400 from B).
- Validates deterministic tie-breaking (Grand Hyatt ₹7,500 in both $\to$ Supplier A wins).
- Asserts that internal IDs (`hotelId`, `city`) are never leaked in response objects.

### 2. `tests/redis.service.test.ts` (7 Tests)
- Tests `ZRANGEBYSCORE` against in-memory Redis instance (`ioredis-mock`).
- Verifies bounds handling:
  - Range `[5000, 7000]` returns Holtin and Radisson Blu.
  - Bound `[7500, +inf]` returns Grand Hyatt, Marriott Suites, and The Oberoi.
  - Bound `[-inf, 5500]` returns City Inn Deluxe and Holtin.
- Asserts atomic deletion of old sorted-set members on cache updates.

### 3. `tests/workflow.test.ts` (2 Tests)
- Measures activity initiation timestamps: verifies that Supplier B starts while Supplier A is still pending.
- Demonstrates that total execution time ($\approx 60\text{ms}$) is approximately equal to $\max(T_A, T_B)$ rather than $T_A + T_B$ ($100\text{ms}$).
- Verifies that if a supplier fails, the workflow rejects and does not return partial data.

### 4. `tests/activities.test.ts` (5 Tests)
- Mocks Axios network calls.
- Validates successful deserialization of JSON arrays.
- Asserts error throwing on HTTP 500 status, request timeouts (5s), and malformed payloads.

### 5. `tests/hotel.service.test.ts` (3 Tests)
- Tests the cache-aside coordinator.
- Proves that on Cache Miss, the Temporal workflow is invoked and results are cached.
- Proves that on Cache Hit, Temporal is **bypassed completely**, serving directly from Redis.

### 6. `tests/validation.test.ts` (9 Tests)
- Validates query parameter boundary conditions:
  - Missing city parameter $\to$ throws `ValidationError` (HTTP 400).
  - Whitespace-only city $\to$ throws `ValidationError`.
  - Negative `minPrice` or `maxPrice` $\to$ throws `ValidationError`.
  - Non-numeric prices $\to$ throws `ValidationError`.
  - `minPrice > maxPrice` $\to$ throws `ValidationError`.

### 7. `tests/api.integration.test.ts` (12 Tests)
- Supertest end-to-end HTTP integration tests for:
  - `GET /supplierA/hotels?city=delhi`
  - `GET /supplierB/hotels?city=delhi`
  - `GET /api/hotels?city=delhi`
  - `GET /health`
  - Error middleware response structure and 404 handler.

---

## 4. Running the Tests

### Execute All Tests:
```bash
npm test
```

### Run Tests with Coverage Report:
```bash
npm run test:coverage
```

### Watch Mode (Development):
```bash
npm run test:watch
```

# 06. Redis Deep Dive & In-Database Price Filtering

## 1. Why Redis?

In high-throughput hospitality APIs, hotel search queries almost always include price filtering criteria (e.g., "show me hotels between ₹5,000 and ₹7,000"). 

Many naive implementations fetch the entire inventory into Node.js application memory and execute:
```typescript
// ANTI-PATTERN: In-memory filtering
const filtered = allHotels.filter(h => h.price >= min && h.price <= max);
```
### Why In-Memory Filtering Fails at Scale:
1. **Network & Deserialization Overhead**: Transporting 10,000 hotel objects from the database to Node.js and parsing megabytes of JSON consumes memory and blocks the single-threaded Node.js event loop.
2. **Computational Complexity**: Array filtering requires $O(N)$ linear scans through all items for every request.
3. **Cache Inefficiency**: When 1,000 concurrent users request slightly different price windows for Delhi, the application redundantly iterates over the entire dataset 1,000 times.

### The Solution: Native Redis Sorted Sets (`ZSET`)
Redis Sorted Sets maintain an internal **Skip List** and **Hash Table** data structure. Elements are automatically sorted by a floating-point **score**.
- **Score**: Hotel Price (e.g., `5340.0`).
- **Member**: Normalized unique identifier (e.g., `"holtin"`).
- **Query Complexity**: Filtering by score range (`ZRANGEBYSCORE`) completes in **$O(\log N + M)$**, where $N$ is total hotels in the city and $M$ is the number of results returned.
- For 10,000 hotels, finding 5 matching hotels takes approximately **14 comparisons** rather than 10,000 iterations!

---

## 2. Key Architecture & Data Structures

For each city (e.g. `delhi`), three dedicated Redis keys are maintained:

```
hotels:delhi:prices -> Sorted Set (ZSET) [Member: normalizedName, Score: price]
hotels:delhi:data   -> Hash (HSET)       [Field: normalizedName, Value: JSON string]
hotels:delhi:meta   -> String (SET)      [Value: "cached", TTL: 300s]
```

### 1. `hotels:delhi:prices` (Price Index)
```redis
ZADD hotels:delhi:prices 2200 "backpackers haven"
ZADD hotels:delhi:prices 3500 "city inn deluxe"
ZADD hotels:delhi:prices 5340 "holtin"
ZADD hotels:delhi:prices 5900 "radisson blu"
ZADD hotels:delhi:prices 7500 "grand hyatt"
ZADD hotels:delhi:prices 8200 "taj palace"
ZADD hotels:delhi:prices 8500 "marriott suites"
ZADD hotels:delhi:prices 12000 "the oberoi"
```

### 2. `hotels:delhi:data` (Object Store)
```redis
HSET hotels:delhi:data "holtin" '{"name":"Holtin","price":5340,"supplier":"Supplier B","commissionPct":20}'
HSET hotels:delhi:data "radisson blu" '{"name":"Radisson Blu","price":5900,"supplier":"Supplier A","commissionPct":13}'
HSET hotels:delhi:data "city inn deluxe" '{"name":"City Inn Deluxe","price":3500,"supplier":"Supplier A","commissionPct":8}'
```

### 3. `hotels:delhi:meta` (Metadata & Cache Invalidation Key)
```redis
SET hotels:delhi:meta "cached" EX 300
```

---

## 3. Atomic Cache Invalidation & MULTI/EXEC Transactions

When refreshing a city's offers or populating a cache miss, **old sorted-set members must not linger**. If a hotel was previously ₹6,000 but the new offer is ₹5,340, or if a hotel was delisted by suppliers, leaving stale members corrupts search results.

### Pipelining vs. Transactions (MULTI/EXEC):
- **Pipelining (`pipeline()`)**: Batches network packets to reduce round-trip time. It does **not** provide transactional isolation or atomicity on the Redis server; commands from other connections can interleave.
- **Transactions (`multi()`)**: Issues the `MULTI` command to Redis. All subsequent operations are queued on the server and executed atomically in an isolated block upon `EXEC`.

In `src/services/redis.service.ts`, updates are executed atomically using **`this.client.multi()`**:

```typescript
public async saveHotels(city: string, hotels: AggregatedHotelOffer[]): Promise<void> {
  const pricesKey = this.getPricesKey(city);
  const dataKey = this.getDataKey(city);
  const metaKey = this.getMetaKey(city);

  // Use MULTI/EXEC transaction to guarantee true atomicity on the Redis server
  const tx = this.client.multi();

  // 1. Purge existing keys atomically
  tx.del(pricesKey, dataKey, metaKey);

  if (hotels.length > 0) {
    const zaddArgs: (string | number)[] = [pricesKey];
    const hsetData: Record<string, string> = {};

    for (const hotel of hotels) {
      const memberKey = normalizeHotelName(hotel.name);
      zaddArgs.push(hotel.price, memberKey);
      hsetData[memberKey] = JSON.stringify(hotel);
    }

    // 2. Insert new price index and payload
    tx.zadd(...(zaddArgs as [string, ...any[]]));
    tx.hset(dataKey, hsetData);
    tx.set(metaKey, 'cached');

    // 3. Set TTL expiration on all three keys
    if (this.ttlSeconds > 0) {
      tx.expire(pricesKey, this.ttlSeconds);
      tx.expire(dataKey, this.ttlSeconds);
      tx.expire(metaKey, this.ttlSeconds);
    }
  }

  await tx.exec();
}
```

---

## 4. In-Database Price Range Queries

When an HTTP client requests a filtered view:
```
GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000
```

The application translates this directly to Redis operations:

### Query Translation:
1. `minScore = 5000`, `maxScore = 7000`
2. **Execute Range Query**:
   ```redis
   ZRANGEBYSCORE hotels:delhi:prices 5000 7000
   ```
   **Redis Output**:
   ```
   1) "holtin"
   2) "radisson blu"
   ```
   *(Note: The result is already sorted by price in ascending order naturally by the Skip List!)*

3. **Fetch Serialized Objects**:
   ```redis
   HMGET hotels:delhi:data "holtin" "radisson blu"
   ```
   **Redis Output**:
   ```
   1) "{\"name\":\"Holtin\",\"price\":5340,\"supplier\":\"Supplier B\",\"commissionPct\":20}"
   2) "{\"name\":\"Radisson Blu\",\"price\":5900,\"supplier\":\"Supplier A\",\"commissionPct\":13}"
   ```

4. Parse JSON strings into TypeScript `AggregatedHotelOffer[]` and return directly to the caller.

### Handling Unbounded Ranges:
- **`minPrice` only (e.g. `minPrice=7500`)**:
  ```redis
  ZRANGEBYSCORE hotels:delhi:prices 7500 +inf
  ```
- **`maxPrice` only (e.g. `maxPrice=5500`)**:
  ```redis
  ZRANGEBYSCORE hotels:delhi:prices -inf 5500
  ```
- **No price filters specified**:
  ```redis
  ZRANGEBYSCORE hotels:delhi:prices -inf +inf
  ```

---

## 5. Performance Comparison: Memory vs. Redis

| Feature | Filtering in JavaScript Memory | Filtering in Redis Sorted Sets |
| :--- | :--- | :--- |
| **Complexity** | $O(N)$ linear array iteration | $O(\log N + M)$ binary skip-list search |
| **Data Transferred** | Entire dataset transferred over network | Only matching member keys transferred |
| **Event Loop Impact** | Blocks Node.js thread parsing large JSON arrays | Zero blocking; processing offloaded to Redis |
| **Sorting** | Requires separate `.sort((a, b) => a.price - b.price)` | Results naturally pre-sorted by score |
| **Throughput** | Drops sharply as inventory size increases | Remains constant (> 80,000 ops/sec on Redis) |

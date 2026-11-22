Hotel Offer Orchestrator
A Node.js and TypeScript backend that combines hotel offers from two mock suppliers, removes duplicate hotels, selects the lowest-priced offer for each hotel, and supports price-range filtering backed by Redis.

Live API: https://hotel-offer.onrender.com
Health check: https://hotel-offer.onrender.com/health
Example request: https://hotel-offer.onrender.com/api/hotels?city=delhi


What the application does
Two suppliers can return offers for the same hotel at different prices. Returning both records would create duplicates and make it harder for a client to compare offers.

The orchestrator:
1. Accepts a city and optional price boundaries.
2. Checks Redis for a previously aggregated result.
3. On a cache miss, runs the supplier aggregation workflow.
4. Fetches Supplier A and Supplier B offers concurrently.
5. Normalizes hotel names and keeps the cheapest offer for each hotel. Hotels returned by only one supplier are retained.
6. Saves complete aggregation results in Redis.
7. Applies price filtering inside Redis and returns the matching hotel records.
If one supplier fails, the application can return the successful supplier's offers. Partial results are not cached as complete results. If both suppliers fail, the aggregation fails rather than returning a misleading empty list.

# Approach – Hotel Offer Orchestrator

I built the Hotel Offer Orchestrator as a Node.js and TypeScript application using Express, Temporal.io, Redis and Docker.

The main objective was to collect hotel offers from two independent suppliers, combine their responses, remove duplicate hotels, and return the cheapest available offer for each hotel.

### 1. API and request handling

I created an Express API that accepts requests such as `GET /api/hotels?city=delhi`. The API also supports optional `minPrice` and `maxPrice` query parameters.

I separated the application into controllers, services, workflows, activities and utility modules so that request handling, business logic, orchestration and caching remain independent.

### 2. Supplier orchestration using Temporal

When a request arrives, the HotelService first checks whether aggregated hotel data for the requested city is already available in Redis.

If the data is not cached, it invokes a Temporal workflow. The workflow calls Supplier A and Supplier B concurrently through separate Temporal activities.

I configured retry policies for supplier activities so temporary failures can be retried automatically. I also used `Promise.allSettled()` to handle both supplier outcomes independently. This allows the application to return available offers when one supplier fails, instead of failing the entire request.

### 3. Hotel comparison and deduplication

After receiving supplier responses, I combine the hotel records and compare them using their names.

Before comparison, hotel names are normalized by trimming whitespace and converting them to lowercase. This ensures that variations such as "Holtin", " holtin " and "HOLTIN" are treated as the same hotel.

For duplicate hotels, the application retains the offer with the lower price. If a hotel appears in only one supplier's response, that offer is retained. In case of equal prices, the first encountered offer is retained.

The final result contains one record per hotel, including the selected price, supplier name and commission percentage.

### 4. Redis caching and price filtering

I implemented a cache-aside strategy using Redis to avoid repeatedly calling both suppliers for the same city.

For efficient storage and retrieval, I used two Redis data structures:

- **Sorted Sets:** Store normalized hotel names as members and hotel prices as scores. I use `ZRANGEBYSCORE` to filter hotels directly inside Redis based on the requested price range.
- **Hashes:** Store the complete hotel objects as JSON, indexed by normalized hotel names. After obtaining matching hotel names from the Sorted Set, I use `HMGET` to retrieve their complete details.

I also configured a cache TTL of 300 seconds so cached data expires after five minutes.

To maintain cache consistency during refreshes, I used Redis `MULTI`/`EXEC` transactions to delete old cache entries and insert updated data as one atomic operation.

Additionally, I introduced a completeness flag in the aggregation result. Only results where both suppliers succeed are cached, preventing partial supplier responses from being stored as complete data.

### 5. Docker and deployment

I containerized the application using Docker and Docker Compose. The local setup includes the Express API, Temporal server, Temporal worker, Redis and PostgreSQL services.

I also deployed the API publicly on Render and connected it to Upstash Redis for hosted caching.

### 6. Testing and error handling

I created automated tests for comparison logic, input validation, Redis operations, activities, workflows and API integration.

I also created a Postman collection covering normal hotel searches, price filtering, empty-result scenarios and supplier failure testing.

A health endpoint reports the status of the application dependencies and both mock suppliers.

Overall, the implementation focuses on reliable supplier orchestration, accurate hotel comparison, efficient Redis-based filtering, and separation of responsibilities across the application.


Supplier comparison
Hotel names are normalized by trimming surrounding whitespace and converting to lowercase. For example, Holtin, holtin and HOLTIN are treated as the same name.

For each normalized name:
- The lower-priced offer is selected.
- If prices are equal, the first encountered offer is retained (Supplier A is processed first).
- Hotels present in only one supplier's response are retained.
- The supplier and commission percentage belonging to the selected offer are preserved.
Redis data model and price filtering
The application uses two Redis data structures:
- Sorted Set (ZSET): normalized hotel name is the member and hotel price is its score. ZRANGEBYSCORE finds members within the requested price range. Its range-query complexity is approximately O(log N + M), where N is the number of indexed hotels and M is the number of matching results.
- Hash (HASH): stores each complete hotel object as JSON, indexed by normalized hotel name. HMGET retrieves the full records for members returned by the Sorted Set.


The API also returns an X-Cache response header. MISS indicates the application performed aggregation for that request; HIT indicates the result was served from Redis. A previously populated cache can therefore make the first request in a new test show HIT.
Mock supplier endpoints
GET /supplierA/hotels?city=delhi
GET /supplierB/hotels?city=delhi
These endpoints return the static mock supplier data used by the aggregation workflow.
GET /health
Checks the application dependencies and mock supplier endpoints.
curl -i "http://localhost:3001/health"
A healthy response reports the status of Redis, Temporal (according to the configured execution mode/connection check), Supplier A and Supplier B.
Prerequisites
For the Docker-based setup:
- Git
- Docker Desktop with Docker Compose
- A terminal
For running without Docker:
- Node.js 20 or later
- npm
- A reachable Redis instance
- A reachable Temporal server and a Temporal worker
Run locally with Docker Compose (recommended)
Docker Compose starts the local application infrastructure, including the API, Temporal server, Temporal UI, Redis, and worker.
1. Clone the repository
git clone https://github.com/saurabhkumarug23-droid/hotel-offer.git
cd hotel-offer
If your local folder has a different name, run cd into that folder instead.
2. Create the environment file
cp .env.example .env
For the standard Docker Compose setup, the API and worker should use the Compose service names to reach one another and their dependencies. In particular, the worker's supplier URLs should point to the API container:
SUPPLIER_A_URL=http://api:3000/supplierA/hotels
SUPPLIER_B_URL=http://api:3000/supplierB/hotels
Use the other local values supplied in .env.example for Redis and Temporal. Do not put hosted Upstash credentials in a file that you plan to commit.
3. Build and start the containers
docker compose up --build -d
Check container status:
docker compose ps
Follow logs:
docker compose logs -f api worker temporal
4. Test the local API
The project Compose configuration maps the API container's port 3000 to host port 3001.
curl -i "http://localhost:3001/health"
curl -i "http://localhost:3001/api/hotels?city=delhi"
curl -i "http://localhost:3001/api/hotels?city=delhi&minPrice=5000&maxPrice=7000"
The Temporal UI is available at:
http://localhost:8080
The Temporal gRPC endpoint is available to local host tools at:
localhost:7233
Redis is available to local host tools at:
localhost:6379
Do not expose Redis or Temporal ports publicly on an internet-facing server unless you have secured them appropriately.
5. Stop the local stack
docker compose down
This stops and removes the containers but preserves named volumes. Do not use docker compose down -v unless you intentionally want to delete the persisted local database/cache volumes.
Run locally without Docker
This mode requires you to provide your own reachable Redis instance and Temporal server.
1. Install dependencies
npm install
cp .env.example .env
Edit .env with the connection details for your local Redis and Temporal services. For this mode, use the appropriate local supplier URLs for the API process.
2. Start the API and worker in separate terminals
Terminal 1:
npm run dev
Terminal 2:
npm run worker
If your package.json uses different script names, check the available scripts with:
npm run
3. Build the TypeScript project
npm run build
Environment variables
The exact variables read by the application are defined in src/config/env.ts. The following table describes the configuration used by the current application.
Variable	Purpose	Typical local value
PORT	API listening port inside the container	3000
NODE_ENV	Runtime environment	development
REDIS_HOST	Redis hostname	redis in Compose
REDIS_PORT	Redis port	6379
REDIS_PASSWORD	Redis password, if required	Empty for local Redis
REDIS_TLS	Enables TLS for hosted Redis connections	false locally; true for TLS-enabled Upstash
REDIS_USE_MOCK	Use the in-memory Redis mock	false for real Redis
CACHE_TTL_SECONDS	Cache lifetime in seconds	300
TEMPORAL_ADDRESS	Temporal server address	temporal:7233 in Compose
TEMPORAL_NAMESPACE	Temporal namespace	default
TEMPORAL_TASK_QUEUE	Worker task queue	hotel-offers-queue
TEMPORAL_STANDALONE_MODE	Run aggregation without Temporal	false for the full local Compose setup
TEMPORAL_STANDALONE_FALLBACK	Permit standalone fallback if Temporal is unavailable	false when requiring Temporal
SUPPLIER_A_URL	Supplier A endpoint used by the worker	http://api:3000/supplierA/hotels
SUPPLIER_B_URL	Supplier B endpoint used by the worker	http://api:3000/supplierB/hotels


Important: Never commit .env, passwords, tokens, or other credentials. The repository should contain .env.example with placeholders only. The Redis TLS option must be supported by the version of src/config/env.ts and src/services/redis.service.ts you deploy; set REDIS_TLS=true only when that implementation is present.
Deploy the API to Render
The hosted API is available at https://hotel-offer.onrender.com.

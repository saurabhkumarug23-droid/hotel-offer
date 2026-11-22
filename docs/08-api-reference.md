# 08. Complete API Reference

This document provides exhaustive documentation for all HTTP endpoints exposed by the **Hotel Offer Orchestrator**.

---

## 1. Summary of Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | System health check (Redis, Temporal, Supplier A, Supplier B) |
| `GET` | `/supplierA/hotels` | Raw hotel offers from Mock Supplier A |
| `GET` | `/supplierB/hotels` | Raw hotel offers from Mock Supplier B |
| `GET` | `/api/hotels` | Aggregated, deduplicated, and price-filtered hotel offers |

---

## 2. Main Aggregation Endpoint: `GET /api/hotels`

Aggregates hotel inventory across suppliers, performs price comparisons, removes duplicates, applies tie-breaking rules, persists into Redis, and executes in-database price-range queries.

### Query Parameters

| Parameter | Type | Required? | Validation Rules | Description |
| :--- | :--- | :--- | :--- | :--- |
| `city` | `string` | **Yes** | Non-empty string. Case-insensitive. | The target city (e.g., `delhi`, `mumbai`). |
| `minPrice`| `number` | Optional | Non-negative numeric value ($\ge 0$). | Minimum acceptable hotel room price. |
| `maxPrice`| `number` | Optional | Non-negative numeric value ($\ge 0$). | Maximum acceptable hotel room price. Must be $\ge$ `minPrice`. |

---

### Request & Response Examples

#### A. Standard Aggregation (No Price Filter)
**Request**:
```bash
curl -X GET "http://localhost:3000/api/hotels?city=delhi"
```

**Response (`200 OK`)**:
```json
[
  {
    "name": "Backpackers Haven",
    "price": 2200,
    "supplier": "Supplier B",
    "commissionPct": 10
  },
  {
    "name": "City Inn Deluxe",
    "price": 3500,
    "supplier": "Supplier A",
    "commissionPct": 8
  },
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
  },
  {
    "name": "Grand Hyatt",
    "price": 7500,
    "supplier": "Supplier A",
    "commissionPct": 12
  },
  {
    "name": "Taj Palace",
    "price": 8200,
    "supplier": "Supplier B",
    "commissionPct": 19
  },
  {
    "name": "Marriott Suites",
    "price": 8500,
    "supplier": "Supplier B",
    "commissionPct": 15
  },
  {
    "name": "The Oberoi",
    "price": 12000,
    "supplier": "Supplier A",
    "commissionPct": 15
  }
]
```
*Response Headers:* `X-Cache: MISS` (first request) or `X-Cache: HIT` (subsequent requests).

---

#### B. Range Filter (`minPrice` and `maxPrice`)
**Request**:
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

---

#### C. Lower-Bound Filter (`minPrice` only)
**Request**:
```bash
curl -X GET "http://localhost:3000/api/hotels?city=delhi&minPrice=8000"
```

**Response (`200 OK`)**:
```json
[
  {
    "name": "Taj Palace",
    "price": 8200,
    "supplier": "Supplier B",
    "commissionPct": 19
  },
  {
    "name": "Marriott Suites",
    "price": 8500,
    "supplier": "Supplier B",
    "commissionPct": 15
  },
  {
    "name": "The Oberoi",
    "price": 12000,
    "supplier": "Supplier A",
    "commissionPct": 15
  }
]
```

---

#### D. Upper-Bound Filter (`maxPrice` only)
**Request**:
```bash
curl -X GET "http://localhost:3000/api/hotels?city=delhi&maxPrice=5000"
```

**Response (`200 OK`)**:
```json
[
  {
    "name": "Backpackers Haven",
    "price": 2200,
    "supplier": "Supplier B",
    "commissionPct": 10
  },
  {
    "name": "City Inn Deluxe",
    "price": 3500,
    "supplier": "Supplier A",
    "commissionPct": 8
  }
]
```

---

### Error Responses for `GET /api/hotels`

#### 1. Missing City Parameter
**Request**: `GET /api/hotels`
**Response (`400 Bad Request`)**:
```json
{
  "error": "City parameter is required and cannot be empty."
}
```

#### 2. Invalid Price Range (`minPrice > maxPrice`)
**Request**: `GET /api/hotels?city=delhi&minPrice=9000&maxPrice=5000`
**Response (`400 Bad Request`)**:
```json
{
  "error": "minPrice cannot be greater than maxPrice."
}
```

#### 3. Negative Price
**Request**: `GET /api/hotels?city=delhi&minPrice=-50`
**Response (`400 Bad Request`)**:
```json
{
  "error": "minPrice cannot be negative."
}
```

#### 4. Non-Numeric Price
**Request**: `GET /api/hotels?city=delhi&maxPrice=xyz`
**Response (`400 Bad Request`)**:
```json
{
  "error": "maxPrice must be a valid number."
}
```

---

## 3. Mock Supplier Endpoints

### `GET /supplierA/hotels`
Returns raw hotel inventory from Supplier A.

**Request**:
```bash
curl -X GET "http://localhost:3000/supplierA/hotels?city=delhi"
```

**Response (`200 OK`)**:
```json
[
  {
    "hotelId": "a1",
    "name": "Holtin",
    "price": 6000,
    "city": "delhi",
    "commissionPct": 10
  },
  {
    "hotelId": "a2",
    "name": "Radisson Blu",
    "price": 5900,
    "city": "delhi",
    "commissionPct": 13
  },
  {
    "hotelId": "a3",
    "name": "Grand Hyatt",
    "price": 7500,
    "city": "delhi",
    "commissionPct": 12
  },
  {
    "hotelId": "a4",
    "name": "The Oberoi",
    "price": 12000,
    "city": "delhi",
    "commissionPct": 15
  },
  {
    "hotelId": "a5",
    "name": "  Taj Palace  ",
    "price": 9000,
    "city": "delhi",
    "commissionPct": 14
  },
  {
    "hotelId": "a6",
    "name": "City Inn Deluxe",
    "price": 3500,
    "city": "delhi",
    "commissionPct": 8
  }
]
```

---

### `GET /supplierB/hotels`
Returns raw hotel inventory from Supplier B.

**Request**:
```bash
curl -X GET "http://localhost:3000/supplierB/hotels?city=delhi"
```

**Response (`200 OK`)**:
```json
[
  {
    "hotelId": "b1",
    "name": "Holtin",
    "price": 5340,
    "city": "delhi",
    "commissionPct": 20
  },
  {
    "hotelId": "b2",
    "name": "Radisson Blu",
    "price": 6400,
    "city": "delhi",
    "commissionPct": 18
  },
  {
    "hotelId": "b3",
    "name": "Grand Hyatt",
    "price": 7500,
    "city": "delhi",
    "commissionPct": 22
  },
  {
    "hotelId": "b4",
    "name": "Marriott Suites",
    "price": 8500,
    "city": "delhi",
    "commissionPct": 15
  },
  {
    "hotelId": "b5",
    "name": "TAJ PALACE",
    "price": 8200,
    "city": "delhi",
    "commissionPct": 19
  },
  {
    "hotelId": "b6",
    "name": "Backpackers Haven",
    "price": 2200,
    "city": "delhi",
    "commissionPct": 10
  }
]
```

---

## 4. Health Check Endpoint: `GET /health`

Performs live connectivity verification against Redis, Temporal Server, Supplier A, and Supplier B.

**Request**:
```bash
curl -X GET "http://localhost:3000/health"
```

**Response (`200 OK` - All Healthy)**:
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

**Response (`503 Service Unavailable` - Degraded or Unhealthy)**:
```json
{
  "status": "degraded",
  "services": {
    "redis": "healthy",
    "temporal": "unhealthy",
    "supplierA": "healthy",
    "supplierB": "healthy"
  }
}
```

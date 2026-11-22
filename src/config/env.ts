import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
    cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300', 10),
    useMock: process.env.REDIS_USE_MOCK === 'true',
  },
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'hotel-offers-queue',
    standaloneFallback: process.env.TEMPORAL_STANDALONE_FALLBACK !== 'false',
    standaloneMode: process.env.TEMPORAL_STANDALONE_MODE === 'true',
  },
  suppliers: {
    supplierAUrl: process.env.SUPPLIER_A_URL || 'http://localhost:3000/supplierA/hotels',
    supplierBUrl: process.env.SUPPLIER_B_URL || 'http://localhost:3000/supplierB/hotels',
  },
};


# Stage 1: Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]

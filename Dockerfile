# Stage 1: Build frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package.json ./

RUN mkdir -p /app/data

ENV DASHBOARD_PORT=8800
ENV OPENCLAW_DIR=/openclaw
ENV NODE_ENV=production

EXPOSE 8800

CMD ["node", "server.js"]

# Build stage
FROM oven/bun:latest AS builder
WORKDIR /app

# Install build deps (cache package manifests)
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN bun run build

# Production stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
# Copy build output (adjust if your output dir differs)
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
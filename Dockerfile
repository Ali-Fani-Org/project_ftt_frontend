# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb ./

# Install dependencies using bun
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build the app
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy custom nginx config to listen on port 3000
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built static files to nginx
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port 3000
EXPOSE 3000
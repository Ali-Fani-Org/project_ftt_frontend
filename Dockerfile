# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Install build deps (cache package manifests)
COPY package*.json ./
COPY pnpm-lock.yaml* ./
RUN npm ci --silent

# Copy source
COPY . .

# Build
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
# Copy build output (adjust if your output dir differs)
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 3000
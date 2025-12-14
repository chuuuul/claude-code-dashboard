# Claude Code Dashboard - Production Dockerfile
# Multi-stage build for optimized image size

# Stage 1: Build frontend
FROM node:25-slim AS frontend-builder

WORKDIR /app/client

# Copy frontend package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY client/ ./

# Build frontend
RUN npm run build

# Stage 2: Build backend
FROM node:25-slim AS backend-builder

WORKDIR /app

# Install build dependencies for native modules (node-pty)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy backend package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Stage 3: Production image
FROM node:25-slim

# Create non-privileged user
RUN groupadd -r claude && useradd -r -g claude claude

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tmux \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI (if available via npm)
# Uncomment when claude-code is available on npm
# RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy built node_modules from builder
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy backend source
COPY server/ ./server/
COPY package.json ./

# Copy built frontend from builder
COPY --from=frontend-builder /app/client/build ./client/build

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R claude:claude /app/data

# Set ownership
RUN chown -R claude:claude /app

# Switch to non-privileged user
USER claude

# Environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/app/data/dashboard.db
ENV HOME=/app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "server/app.js"]

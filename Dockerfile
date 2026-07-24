# ---- Build stage ----
# Node 20: the SmartThings CLI is known to crash on Node 24, so we pin a
# stable LTS that works for both the CLI and the MCP SDK.
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including dev deps for the build)
COPY package.json package-lock.json* ./
RUN npm install

# Compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production dependencies only
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Install the SmartThings CLI globally so the server can shell out to it.
# The CLI handles OAuth access-token refresh automatically using the mounted
# credentials file, giving us unattended, non-expiring operation.
RUN npm install -g @smartthings/cli@latest

# Copy production node_modules and compiled output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Run as the built-in non-root user (uid 1000, matches a typical Linux user)
USER node

# Default to HTTP transport inside a container (stdio is for local spawning)
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]

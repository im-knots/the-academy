FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm

# Copy package files (building from inside academy directory)
COPY package.json ./
# Copy pnpm-lock.yaml if it exists
COPY pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
RUN npm install -g pnpm

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy configuration files
COPY package.json ./
COPY next.config.ts ./
COPY postcss.config.mjs ./
COPY tsconfig.json ./

# Copy source code
COPY public/ ./public/
COPY src/ ./src/

# Build the application
RUN pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime
ENV NEXT_TELEMETRY_DISABLED=1

# Create user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set the correct permissions for precomputed static assets
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy the standalone build and static files with correct permissions
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
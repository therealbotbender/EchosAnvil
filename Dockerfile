# Use Node.js LTS version
FROM node:20-alpine

# Install runtime dependencies (ffmpeg, python3, and su-exec for user switching)
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    su-exec

# Install build tools temporarily for native module compilation
RUN apk add --no-cache --virtual .build-deps \
    make \
    g++ \
    gcc \
    libc-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Make yt-dlp executable
RUN chmod +x /app/node_modules/youtube-dl-exec/bin/yt-dlp 2>/dev/null || true

# Remove only build dependencies (keep python3 and ffmpeg)
RUN apk del .build-deps

# Copy application source
COPY src/ ./src/
COPY docs/ ./docs/

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directory for database persistence
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Use entrypoint to handle permissions
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the bot
CMD ["node", "src/index.js"]

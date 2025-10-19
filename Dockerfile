# Use Node.js LTS version
FROM node:20-alpine

# Install runtime dependencies (ffmpeg and python3 needed by yt-dlp)
RUN apk add --no-cache \
    ffmpeg \
    python3

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

# Remove only build dependencies (keep python3 and ffmpeg)
RUN apk del .build-deps

# Copy application source
COPY src/ ./src/
COPY docs/ ./docs/

# Create directory for database persistence
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Start the bot
CMD ["node", "src/index.js"]

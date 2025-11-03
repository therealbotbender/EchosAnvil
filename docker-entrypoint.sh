#!/bin/sh
set -e

# Fix permissions for the data directory if it exists
if [ -d "/app/data" ]; then
    echo "Ensuring /app/data has correct permissions..."

    # Create database file if it doesn't exist (so we can set permissions)
    touch /app/data/radio.db 2>/dev/null || true

    # Try to fix permissions (will work if running as root)
    chown -R nodejs:nodejs /app/data 2>/dev/null || true
    chmod -R 755 /app/data 2>/dev/null || true
fi

# If we're root, switch to nodejs user
if [ "$(id -u)" = "0" ]; then
    echo "Starting as nodejs user..."
    exec su-exec nodejs "$@"
else
    echo "Starting as current user..."
    exec "$@"
fi

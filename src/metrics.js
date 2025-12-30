// Performance metrics tracking module

class Metrics {
  constructor() {
    this.startTime = Date.now();
    this.commandsExecuted = 0;
    this.songsPlayed = 0;
    this.errors = 0;
    this.retries = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.dbWrites = 0;
    this.avgSongLoadTime = 0;
    this.songLoadTimes = [];
    this.maxSongLoadTimeSamples = 100; // Keep last 100 samples
  }

  // Increment counters
  incrementCommands() {
    this.commandsExecuted++;
  }

  incrementSongsPlayed() {
    this.songsPlayed++;
  }

  incrementErrors() {
    this.errors++;
  }

  incrementRetries() {
    this.retries++;
  }

  incrementCacheHits() {
    this.cacheHits++;
  }

  incrementCacheMisses() {
    this.cacheMisses++;
  }

  incrementDbWrites() {
    this.dbWrites++;
  }

  // Record song load time
  recordSongLoadTime(milliseconds) {
    this.songLoadTimes.push(milliseconds);

    // Keep only the last N samples
    if (this.songLoadTimes.length > this.maxSongLoadTimeSamples) {
      this.songLoadTimes.shift();
    }

    // Update average
    this.avgSongLoadTime = this.songLoadTimes.reduce((a, b) => a + b, 0) / this.songLoadTimes.length;
  }

  // Get uptime in seconds
  getUptimeSeconds() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  // Get cache hit ratio
  getCacheHitRatio() {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 0;
    return (this.cacheHits / total * 100).toFixed(1);
  }

  // Get error rate (errors per hour)
  getErrorRate() {
    const uptimeHours = this.getUptimeSeconds() / 3600;
    if (uptimeHours === 0) return 0;
    return (this.errors / uptimeHours).toFixed(1);
  }

  // Get retry rate
  getRetryRate() {
    if (this.songsPlayed === 0) return 0;
    return (this.retries / this.songsPlayed * 100).toFixed(1);
  }

  // Format uptime as human-readable string
  getFormattedUptime() {
    const seconds = this.getUptimeSeconds();
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  // Get all metrics as object
  getSnapshot() {
    return {
      uptime: this.getFormattedUptime(),
      uptimeSeconds: this.getUptimeSeconds(),
      commandsExecuted: this.commandsExecuted,
      songsPlayed: this.songsPlayed,
      errors: this.errors,
      retries: this.retries,
      errorRate: this.getErrorRate(),
      retryRate: `${this.getRetryRate()}%`,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRatio: `${this.getCacheHitRatio()}%`,
      dbWrites: this.dbWrites,
      avgSongLoadTime: `${Math.round(this.avgSongLoadTime)}ms`,
      memoryUsage: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
      }
    };
  }

  // Log metrics to console
  logMetrics() {
    const snapshot = this.getSnapshot();
    console.log('\n📊 === Performance Metrics ===');
    console.log(`⏱️  Uptime: ${snapshot.uptime}`);
    console.log(`📋 Commands: ${snapshot.commandsExecuted}`);
    console.log(`🎵 Songs Played: ${snapshot.songsPlayed}`);
    console.log(`❌ Errors: ${snapshot.errors} (${snapshot.errorRate}/hr)`);
    console.log(`🔄 Retries: ${snapshot.retries} (${snapshot.retryRate})`);
    console.log(`📦 Cache: ${snapshot.cacheHits} hits, ${snapshot.cacheMisses} misses (${snapshot.cacheHitRatio} hit ratio)`);
    console.log(`💾 DB Writes: ${snapshot.dbWrites}`);
    console.log(`⚡ Avg Load Time: ${snapshot.avgSongLoadTime}`);
    console.log(`🧠 Memory: ${snapshot.memoryUsage.heapUsed} / ${snapshot.memoryUsage.heapTotal} (RSS: ${snapshot.memoryUsage.rss})`);
    console.log('=============================\n');
  }
}

// Export singleton instance
const metrics = new Metrics();

export default metrics;

// Also export for database tracking
export function trackCacheHit() {
  metrics.incrementCacheHits();
}

export function trackCacheMiss() {
  metrics.incrementCacheMisses();
}

export function trackDbWrite() {
  metrics.incrementDbWrites();
}

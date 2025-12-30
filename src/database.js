import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { trackCacheHit, trackCacheMiss, trackDbWrite } from './metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use /app/data for Docker persistence, otherwise use project root
const isDocker = existsSync('/app/data');
const dbPath = isDocker
  ? '/app/data/radio.db'
  : join(__dirname, '..', 'radio.db');

let SQL;
let db;

// Database batching configuration
let isDirty = false;
let saveTimeout = null;
let periodicSaveInterval = null;
const SAVE_DEBOUNCE_MS = 5000; // 5 seconds debounce
const PERIODIC_SAVE_MS = 60000; // 60 seconds periodic save

// Query cache configuration
const queryCache = new Map();
const CACHE_TTL_MS = 300000; // 5 minutes cache TTL

// Initialize database
async function initDatabase() {
  console.log(`📊 Initializing database at: ${dbPath}`);

  SQL = await initSqlJs({
    locateFile: (file) => join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)
  });

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✓ Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('✓ Created new database');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS user_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      song_url TEXT NOT NULL,
      song_title TEXT NOT NULL,
      song_artist TEXT,
      request_count INTEGER DEFAULT 1,
      last_requested DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, song_url)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listening_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_url TEXT NOT NULL,
      song_title TEXT NOT NULL,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS radio_talks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audio_path TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      duration INTEGER,
      last_played DATETIME,
      play_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS song_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_url TEXT NOT NULL,
      song_title TEXT NOT NULL,
      rating INTEGER NOT NULL,
      rated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, song_url)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_user_songs ON user_songs(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_listening_history ON listening_history(user_id, played_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_song_ratings ON song_ratings(user_id, song_url)`);

  // Initial save
  saveDatabaseImmediate();

  // Start periodic save interval
  periodicSaveInterval = setInterval(() => {
    if (isDirty) {
      console.log('⏰ Periodic database save triggered');
      saveDatabaseImmediate();
    }
  }, PERIODIC_SAVE_MS);

  console.log(`✓ Database auto-save: ${SAVE_DEBOUNCE_MS}ms debounce, ${PERIODIC_SAVE_MS}ms periodic`);
}

// Immediate save (synchronous)
function saveDatabaseImmediate() {
  try {
    const data = db.export();
    writeFileSync(dbPath, data);
    isDirty = false;
    trackDbWrite();
    console.log('💾 Database saved to disk');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Debounced save (batches multiple writes)
function saveDatabase() {
  isDirty = true;

  // Clear existing timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Schedule save after debounce period
  saveTimeout = setTimeout(() => {
    saveDatabaseImmediate();
  }, SAVE_DEBOUNCE_MS);
}

// Graceful shutdown handler
export function shutdownDatabase() {
  console.log('🛑 Shutting down database...');

  // Clear intervals and timeouts
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  if (periodicSaveInterval) {
    clearInterval(periodicSaveInterval);
  }

  // Final save if dirty
  if (isDirty) {
    console.log('💾 Final database save before shutdown');
    saveDatabaseImmediate();
  }

  console.log('✓ Database shutdown complete');
}

await initDatabase();

// --- Helper utilities for parameterized queries ---
function runStmt(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
}

function allRows(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }
  return rows;
}

// User song tracking functions
export function trackUserSong(userId, userName, songUrl, songTitle, songArtist = null) {
  try {
    // Check if exists
    const existing = allRows(
      `SELECT id, request_count FROM user_songs WHERE user_id = ? AND song_url = ?`,
      [userId, songUrl]
    );

    if (existing.length > 0) {
      // Update existing
      runStmt(
        `UPDATE user_songs SET request_count = request_count + 1, last_requested = CURRENT_TIMESTAMP, user_name = ? WHERE user_id = ? AND song_url = ?`,
        [userName, userId, songUrl]
      );
    } else {
      // Insert new
      runStmt(
        `INSERT INTO user_songs (user_id, user_name, song_url, song_title, song_artist, request_count) VALUES (?, ?, ?, ?, ?, 1)`,
        [userId, userName, songUrl, songTitle, songArtist]
      );
    }

    // Invalidate cache since song library changed
    queryCache.clear();

    saveDatabase();
  } catch (error) {
    console.error('Error tracking user song:', error);
  }
}

export function getUserSongs(userId, limit = 50) {
  try {
    const rows = allRows(
      `SELECT * FROM user_songs WHERE user_id = ? ORDER BY request_count DESC, last_requested DESC LIMIT ?`,
      [userId, limit]
    );

    return rows;
  } catch (error) {
    console.error('Error getting user songs:', error);
    return [];
  }
}

export function getMultipleUsersSongs(userIds, limit = 100) {
  if (userIds.length === 0) return [];

  try {
    // Create cache key from sorted user IDs and limit
    const cacheKey = `multi_users:${[...userIds].sort().join(',')}:${limit}`;

    // Check cache
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('📦 Using cached radio song list');
      trackCacheHit();
      return cached.data;
    }

    trackCacheMiss();

    // Query database
    const placeholders = userIds.map(() => '?').join(',');
    const rows = allRows(
      `SELECT
        song_url,
        song_title,
        song_artist,
        SUM(request_count) as total_requests,
        COUNT(DISTINCT user_id) as user_count,
        MAX(last_requested) as last_requested
      FROM user_songs
      WHERE user_id IN (${placeholders})
      GROUP BY song_url
      ORDER BY user_count DESC, total_requests DESC, last_requested DESC
      LIMIT ?`,
      [...userIds, limit]
    );

    // Cache the results
    queryCache.set(cacheKey, {
      data: rows,
      timestamp: Date.now()
    });

    return rows;
  } catch (error) {
    console.error('Error getting multiple users songs:', error);
    return [];
  }
}

export function recordListeningHistory(userId, songUrl, songTitle) {
  try {
    runStmt(
      `INSERT INTO listening_history (user_id, song_url, song_title) VALUES (?, ?, ?)`,
      [userId, songUrl, songTitle]
    );
    saveDatabase();
  } catch (error) {
    console.error('Error recording listening history:', error);
  }
}

export function getUserListeningHistory(userId, limit = 50) {
  try {
    const rows = allRows(
      `SELECT * FROM listening_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?`,
      [userId, limit]
    );

    return rows;
  } catch (error) {
    console.error('Error getting user listening history:', error);
    return [];
  }
}

// Radio talk functions (for future use)
export function addRadioTalk(audioPath, category = 'general', duration = null) {
  try {
    runStmt(
      `INSERT INTO radio_talks (audio_path, category, duration) VALUES (?, ?, ?)`,
      [audioPath, category, duration]
    );
    saveDatabase();
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    return idRes[0]?.values?.[0]?.[0] ?? null;
  } catch (error) {
    console.error('Error adding radio talk:', error);
    return null;
  }
}

export function getRandomRadioTalk(category = null) {
  try {
    if (category) {
      const rows = allRows(
        `SELECT * FROM radio_talks WHERE category = ? ORDER BY RANDOM() LIMIT 1`,
        [category]
      );
      return rows[0] ?? null;
    }

    const rows = allRows(`SELECT * FROM radio_talks ORDER BY RANDOM() LIMIT 1`);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Error getting random radio talk:', error);
    return null;
  }
}

export function updateRadioTalkPlayCount(talkId) {
  try {
    runStmt(
      `UPDATE radio_talks SET play_count = play_count + 1, last_played = CURRENT_TIMESTAMP WHERE id = ?`,
      [talkId]
    );
    saveDatabase();
  } catch (error) {
    console.error('Error updating radio talk play count:', error);
  }
}

export function getStats() {
  try {
    const userCount = db.exec('SELECT COUNT(DISTINCT user_id) as count FROM user_songs');
    const songCount = db.exec('SELECT COUNT(*) as count FROM user_songs');
    const historyCount = db.exec('SELECT COUNT(*) as count FROM listening_history');

    return {
      uniqueUsers: userCount[0]?.values[0]?.[0] || 0,
      trackedSongs: songCount[0]?.values[0]?.[0] || 0,
      totalPlays: historyCount[0]?.values[0]?.[0] || 0
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return {
      uniqueUsers: 0,
      trackedSongs: 0,
      totalPlays: 0
    };
  }
}

// Song rating functions
export function rateSong(userId, songUrl, songTitle, rating, userName = 'Unknown') {
  try {
    // Check if exists
    const existing = allRows(
      `SELECT id FROM song_ratings WHERE user_id = ? AND song_url = ?`,
      [userId, songUrl]
    );

    if (existing.length > 0) {
      // Update existing rating
      runStmt(
        `UPDATE song_ratings SET rating = ?, rated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND song_url = ?`,
        [rating, userId, songUrl]
      );
    } else {
      // Insert new rating
      runStmt(
        `INSERT INTO song_ratings (user_id, song_url, song_title, rating) VALUES (?, ?, ?, ?)`,
        [userId, songUrl, songTitle, rating]
      );
    }

    // If thumbs up (rating = 1), also track it as a user song for radio
    if (rating === 1) {
      const existingSong = allRows(
        `SELECT id FROM user_songs WHERE user_id = ? AND song_url = ?`,
        [userId, songUrl]
      );

      if (existingSong.length === 0) {
        // Add to user_songs so it appears in their radio rotation
        // Try to get user_name from existing records, fall back to provided userName
        const existingUserName = allRows(
          `SELECT user_name FROM user_songs WHERE user_id = ? LIMIT 1`,
          [userId]
        );

        const finalUserName = existingUserName.length > 0 ? existingUserName[0].user_name : userName;

        runStmt(
          `INSERT INTO user_songs (user_id, user_name, song_url, song_title, song_artist, request_count) VALUES (?, ?, ?, ?, NULL, 1)`,
          [userId, finalUserName, songUrl, songTitle]
        );
      }
    }

    saveDatabase();
    return true;
  } catch (error) {
    console.error('Error rating song:', error);
    return false;
  }
}

export function getSongRating(userId, songUrl) {
  try {
    const rows = allRows(
      `SELECT rating FROM song_ratings WHERE user_id = ? AND song_url = ?`,
      [userId, songUrl]
    );
    return rows[0]?.rating ?? null;
  } catch (error) {
    console.error('Error getting song rating:', error);
    return null;
  }
}

export function getUserRatings(userId, ratingFilter = null) {
  try {
    if (ratingFilter !== null) {
      const rows = allRows(
        `SELECT * FROM song_ratings WHERE user_id = ? AND rating = ? ORDER BY rated_at DESC`,
        [userId, ratingFilter]
      );
      return rows;
    }

    const rows = allRows(
      `SELECT * FROM song_ratings WHERE user_id = ? ORDER BY rated_at DESC`,
      [userId]
    );
    return rows;
  } catch (error) {
    console.error('Error getting user ratings:', error);
    return [];
  }
}

export default db;

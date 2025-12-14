/**
 * Database initialization and connection management
 * Uses better-sqlite3 for synchronous SQLite operations with WAL mode
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || process.env.DB_PATH || './data/dashboard.db';
    this.db = null;
  }

  /**
   * Initialize database connection and create tables
   */
  initialize() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Open database connection
    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });

    // Enable WAL mode for better concurrent performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    // Run schema
    this.runSchema();

    return this.db;
  }

  /**
   * Run the schema SQL file
   */
  runSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Remove PRAGMA lines (already set above) and execute entire schema
    const cleanedSchema = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('PRAGMA'))
      .join('\n');

    try {
      this.db.exec(cleanedSchema);
    } catch (error) {
      // Ignore "table already exists" errors for idempotent schema
      if (!error.message.includes('already exists')) {
        console.error('Schema error:', error.message);
      }
    }
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Create a new in-memory database for testing
   */
  static createTestDb() {
    const manager = new DatabaseManager(':memory:');
    manager.initialize();
    return manager;
  }
}

// Singleton instance for production use
let instance = null;

function getDatabase() {
  if (!instance) {
    instance = new DatabaseManager();
    instance.initialize();
  }
  return instance.getDb();
}

function closeDatabase() {
  if (instance) {
    instance.close();
    instance = null;
  }
}

module.exports = {
  DatabaseManager,
  getDatabase,
  closeDatabase
};

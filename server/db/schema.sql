-- Claude Code Dashboard Database Schema v2.1
-- SQLite with WAL mode for concurrent read/write performance

-- Enable WAL mode and performance settings
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- Users table (simple authentication)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (Claude tmux sessions)
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    project_path TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'idle', 'terminated')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);

-- Metadata logs table (Claude CLI status tracking)
CREATE TABLE IF NOT EXISTS metadata_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    token_usage INTEGER,
    context_percent INTEGER,
    cost_usd REAL,
    source TEXT CHECK(source IN ('json-api', 'log-file', 'fallback')),
    raw_data TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- Create indexes for metadata_logs
CREATE INDEX IF NOT EXISTS idx_metadata_session ON metadata_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_metadata_timestamp ON metadata_logs(timestamp);

-- Audit logs table (security and activity tracking)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT CHECK(resource_type IN ('session', 'file', 'tunnel', 'auth', 'system')),
    resource_id TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);

-- Share tokens table (for viewer access links)
CREATE TABLE IF NOT EXISTS share_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    session_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    max_uses INTEGER DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for share_tokens
CREATE INDEX IF NOT EXISTS idx_share_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_session ON share_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_share_expires ON share_tokens(expires_at);

-- Refresh tokens table (for JWT refresh)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token ON refresh_tokens(token_hash);

-- NOTE: Default admin user creation has been moved to bootstrap.js for security
-- The admin user is only created if:
-- 1. No users exist in the database, AND
-- 2. ADMIN_PASSWORD environment variable is set (required for first-run setup)
-- This prevents hardcoded credentials from existing in the schema

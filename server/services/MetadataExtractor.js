/**
 * MetadataExtractor - Claude CLI status extraction service
 *
 * Extracts metadata from Claude CLI using multiple strategies:
 * 1. claude --print --output-format json (if available)
 * 2. ~/.claude/projects/<hash>/sessions.jsonl file watching
 * 3. ~/.claude/statsig-cache.json global stats
 * 4. tmux capture-pane TUI scraping (fallback)
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

// Use dynamic import for chokidar if available
let chokidar = null;
try {
  chokidar = require('chokidar');
} catch {
  console.warn('[MetadataExtractor] chokidar not available, file watching disabled');
}

const execFileAsync = promisify(execFile);

class MetadataExtractor extends EventEmitter {
  constructor() {
    super();
    this.claudeHome = path.join(process.env.HOME || '', '.claude');
    this.watchers = new Map();
    this.pollingIntervals = new Map();
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5 seconds cache
  }

  /**
   * Priority 1: Use --print --output-format json
   * Non-interactive query for Claude status
   */
  async getStatusViaJSON(projectPath) {
    try {
      const { stdout } = await execFileAsync('claude', [
        '--print',
        '--output-format', 'json',
        '--cwd', projectPath,
        '/status'
      ], { timeout: 5000 });

      return JSON.parse(stdout);
    } catch (error) {
      // JSON mode not supported or command failed
      return null;
    }
  }

  /**
   * Priority 2: Watch project session log file
   * ~/.claude/projects/<hash>/sessions.jsonl
   */
  async watchSessionLogs(sessionId, projectPath) {
    if (!chokidar) return null;

    const projectHash = this.hashPath(projectPath);
    const logPath = path.join(
      this.claudeHome,
      'projects',
      projectHash,
      'sessions.jsonl'
    );

    try {
      await fs.access(logPath);

      // Check if watcher already exists
      if (this.watchers.has(sessionId)) {
        return await this.parseSessionLog(logPath);
      }

      const watcher = chokidar.watch(logPath, {
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 500 }
      });

      watcher.on('change', async () => {
        try {
          const metadata = await this.parseSessionLog(logPath);
          this.emit('metadata', { sessionId, ...metadata });
        } catch (error) {
          console.error('[MetadataExtractor] Parse error:', error.message);
        }
      });

      watcher.on('error', (error) => {
        console.error(`[MetadataExtractor] Watcher error for session ${sessionId}:`, error);
        // Clean up failed watcher
        watcher.close();
        this.watchers.delete(sessionId);
      });

      this.watchers.set(sessionId, watcher);

      // Return initial data
      return await this.parseSessionLog(logPath);
    } catch {
      return null;
    }
  }

  /**
   * Parse session log file (JSONL format)
   */
  async parseSessionLog(logPath) {
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      if (lines.length === 0) return null;

      // Parse last entry
      const lastEntry = JSON.parse(lines[lines.length - 1]);

      return {
        tokenUsage: lastEntry.usage?.total_tokens,
        contextPercent: lastEntry.context?.percent_used,
        lastMessage: lastEntry.message?.content?.substring(0, 100),
        timestamp: lastEntry.timestamp,
        model: lastEntry.model,
        costUsd: lastEntry.cost?.usd
      };
    } catch {
      return null;
    }
  }

  /**
   * Priority 3: Read statsig-cache.json for global stats
   */
  async getGlobalStats() {
    const statsPath = path.join(this.claudeHome, 'statsig-cache.json');

    try {
      const content = await fs.readFile(statsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Priority 4: Capture tmux pane and parse TUI output
   */
  async capturePane(sessionId, tmuxSocket = 'claude-dashboard') {
    try {
      const { stdout } = await execFileAsync('tmux', [
        '-L', tmuxSocket,
        'capture-pane', '-t', sessionId, '-p'
      ]);

      return this.parseTuiOutput(stdout);
    } catch {
      return null;
    }
  }

  /**
   * Parse TUI output using configurable patterns
   */
  parseTuiOutput(output) {
    const patterns = this.getParsePatterns();
    const result = {};

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = output.match(pattern);
      if (match) {
        result[key] = match[1];
      }
    }

    // Try to extract status from common patterns
    if (output.includes('Thinking')) {
      result.status = 'thinking';
    } else if (output.includes('Writing')) {
      result.status = 'writing';
    } else if (output.includes('Reading')) {
      result.status = 'reading';
    } else if (output.includes('Waiting')) {
      result.status = 'waiting';
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Get parse patterns for TUI output
   */
  getParsePatterns() {
    return {
      contextPercent: /Context[:\s]+(\d+)%/i,
      tokenUsage: /Tokens?[:\s]+([\d,]+)/i,
      costUsd: /Cost[:\s]+\$([\d.]+)/i,
      step: /Step[:\s]+(\d+)\s*\/\s*(\d+)/i,
      status: /(Thinking|Writing|Reading|Waiting|Done)/i
    };
  }

  /**
   * Get metadata using priority-based strategy
   * Caches results for performance
   */
  async getMetadata(sessionId, projectPath) {
    // Check cache
    const cacheKey = `${sessionId}:${projectPath}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    let metadata = null;

    // 1. Try JSON API
    metadata = await this.getStatusViaJSON(projectPath);
    if (metadata) {
      const result = { source: 'json-api', ...metadata };
      this.cacheMetadata(cacheKey, result);
      return result;
    }

    // 2. Try log file (reuse existing watcher)
    if (!this.watchers.has(sessionId)) {
      metadata = await this.watchSessionLogs(sessionId, projectPath);
    } else {
      // Use existing watcher, just parse log
      const projectHash = this.hashPath(projectPath);
      const logPath = path.join(this.claudeHome, 'projects', projectHash, 'sessions.jsonl');
      metadata = await this.parseSessionLog(logPath);
    }
    if (metadata) {
      const result = { source: 'log-file', ...metadata };
      this.cacheMetadata(cacheKey, result);
      return result;
    }

    // 3. Global stats
    const stats = await this.getGlobalStats();

    // 4. TUI scraping
    const tuiData = await this.capturePane(sessionId);

    const result = {
      source: 'fallback',
      globalStats: stats,
      tuiData
    };

    this.cacheMetadata(cacheKey, result);
    return result;
  }

  /**
   * Cache metadata result
   */
  cacheMetadata(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Start adaptive polling for a session
   * Active sessions: 1 second interval
   * Inactive sessions: 10 second interval
   */
  startPolling(sessionId, projectPath, isActive = true) {
    // Stop existing polling if any
    this.stopPolling(sessionId);

    const interval = isActive ? 1000 : 10000;

    const pollFn = async () => {
      try {
        const metadata = await this.getMetadata(sessionId, projectPath);
        this.emit('metadata', { sessionId, ...metadata });
      } catch (error) {
        console.error(`[MetadataExtractor] Polling error for ${sessionId}:`, error.message);
      }
    };

    const timerId = setInterval(pollFn, interval);
    this.pollingIntervals.set(sessionId, { timerId, interval, projectPath });

    // Run immediately
    pollFn();
  }

  /**
   * Update polling rate based on activity
   */
  updatePollingRate(sessionId, isActive) {
    const current = this.pollingIntervals.get(sessionId);
    if (!current) return;

    const newInterval = isActive ? 1000 : 10000;
    if (current.interval === newInterval) return;

    // Restart with new interval
    clearInterval(current.timerId);
    this.startPolling(sessionId, current.projectPath, isActive);
  }

  /**
   * Stop polling for a session
   */
  stopPolling(sessionId) {
    const polling = this.pollingIntervals.get(sessionId);
    if (polling) {
      clearInterval(polling.timerId);
      this.pollingIntervals.delete(sessionId);
    }

    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
    }

    // Clear cache
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stop all polling and watchers
   */
  stopAll() {
    for (const sessionId of this.pollingIntervals.keys()) {
      this.stopPolling(sessionId);
    }
  }

  /**
   * Hash project path for directory name
   */
  hashPath(p) {
    return crypto.createHash('sha256').update(p).digest('hex').substring(0, 16);
  }

  /**
   * Get all active sessions being monitored
   */
  getActiveMonitors() {
    return Array.from(this.pollingIntervals.keys());
  }

  /**
   * Get cached metadata if available
   */
  getCached(sessionId, projectPath) {
    const cacheKey = `${sessionId}:${projectPath}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }
}

module.exports = MetadataExtractor;

/**
 * AuditLogger - Security and activity tracking service
 *
 * Logs all important actions for security auditing:
 * - Session operations (create, attach, kill)
 * - File operations (read, write, delete)
 * - Authentication events (login, logout, token refresh)
 * - Tunnel operations (ngrok start/stop)
 */

class AuditLogger {
  constructor(db) {
    this.db = db;

    // Prepare statements for performance
    this.insertStmt = db.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Log an audit event
   * @param {Object} event - Audit event details
   * @param {string} event.userId - User ID (optional)
   * @param {string} event.action - Action performed
   * @param {string} event.resourceType - Type of resource (session, file, tunnel, auth, system)
   * @param {string} event.resourceId - Resource identifier
   * @param {Object} event.details - Additional details (will be JSON stringified)
   * @param {string} event.ipAddress - Client IP address
   * @param {string} event.userAgent - Client user agent
   */
  log(event) {
    const {
      userId = null,
      action,
      resourceType = null,
      resourceId = null,
      details = null,
      ipAddress = null,
      userAgent = null
    } = event;

    try {
      this.insertStmt.run(
        userId,
        action,
        resourceType,
        resourceId,
        details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent
      );
    } catch (error) {
      // Log to console but don't throw - audit logging shouldn't break functionality
      console.error('[AuditLogger] Failed to log event:', error.message, event);
    }
  }

  /**
   * Log session creation
   */
  logSessionCreated(userId, sessionId, projectPath, ipAddress) {
    this.log({
      userId,
      action: 'session_created',
      resourceType: 'session',
      resourceId: sessionId,
      details: { projectPath },
      ipAddress
    });
  }

  /**
   * Log session attachment
   */
  logSessionAttached(userId, sessionId, mode, ipAddress) {
    this.log({
      userId,
      action: 'session_attached',
      resourceType: 'session',
      resourceId: sessionId,
      details: { mode },
      ipAddress
    });
  }

  /**
   * Log session termination
   */
  logSessionKilled(userId, sessionId, ipAddress) {
    this.log({
      userId,
      action: 'session_killed',
      resourceType: 'session',
      resourceId: sessionId,
      ipAddress
    });
  }

  /**
   * Log file read
   */
  logFileRead(userId, filePath, ipAddress) {
    this.log({
      userId,
      action: 'file_read',
      resourceType: 'file',
      resourceId: filePath,
      ipAddress
    });
  }

  /**
   * Log file write
   */
  logFileWrite(userId, filePath, ipAddress) {
    this.log({
      userId,
      action: 'file_write',
      resourceType: 'file',
      resourceId: filePath,
      ipAddress
    });
  }

  /**
   * Log file deletion
   */
  logFileDelete(userId, filePath, ipAddress) {
    this.log({
      userId,
      action: 'file_delete',
      resourceType: 'file',
      resourceId: filePath,
      ipAddress
    });
  }

  /**
   * Log successful login
   */
  logLogin(userId, username, ipAddress, userAgent) {
    this.log({
      userId,
      action: 'login_success',
      resourceType: 'auth',
      details: { username },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log failed login attempt
   */
  logLoginFailed(username, ipAddress, userAgent) {
    this.log({
      action: 'login_failed',
      resourceType: 'auth',
      details: { username },
      ipAddress,
      userAgent
    });
  }

  /**
   * Log logout
   */
  logLogout(userId, ipAddress) {
    this.log({
      userId,
      action: 'logout',
      resourceType: 'auth',
      ipAddress
    });
  }

  /**
   * Log token refresh
   */
  logTokenRefresh(userId, ipAddress) {
    this.log({
      userId,
      action: 'token_refresh',
      resourceType: 'auth',
      ipAddress
    });
  }

  /**
   * Log ngrok tunnel start
   */
  logTunnelStart(userId, tunnelUrl, ipAddress) {
    this.log({
      userId,
      action: 'tunnel_started',
      resourceType: 'tunnel',
      details: { url: tunnelUrl },
      ipAddress
    });
  }

  /**
   * Log ngrok tunnel stop
   */
  logTunnelStop(userId, ipAddress) {
    this.log({
      userId,
      action: 'tunnel_stopped',
      resourceType: 'tunnel',
      ipAddress
    });
  }

  /**
   * Get recent logs (admin only)
   * @param {number} limit - Maximum number of logs to return
   * @returns {Array} Recent audit logs
   */
  getRecentLogs(limit = 100) {
    return this.db.prepare(`
      SELECT
        al.*,
        u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get logs for specific user
   * @param {string} userId - User ID
   * @param {number} days - Number of days to look back
   * @returns {Array} User's audit logs
   */
  getUserActivity(userId, days = 7) {
    return this.db.prepare(`
      SELECT * FROM audit_logs
      WHERE user_id = ? AND timestamp > datetime('now', ?)
      ORDER BY timestamp DESC
    `).all(userId, `-${days} days`);
  }

  /**
   * Get logs for specific resource
   * @param {string} resourceType - Resource type
   * @param {string} resourceId - Resource ID
   * @returns {Array} Resource audit logs
   */
  getResourceHistory(resourceType, resourceId) {
    return this.db.prepare(`
      SELECT
        al.*,
        u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.resource_type = ? AND al.resource_id = ?
      ORDER BY al.timestamp DESC
      LIMIT 100
    `).all(resourceType, resourceId);
  }

  /**
   * Get failed login attempts (security monitoring)
   * @param {string} ipAddress - Optional IP filter
   * @param {number} hours - Hours to look back
   * @returns {Array} Failed login attempts
   */
  getFailedLogins(ipAddress = null, hours = 24) {
    if (ipAddress) {
      return this.db.prepare(`
        SELECT * FROM audit_logs
        WHERE action = 'login_failed'
          AND ip_address = ?
          AND timestamp > datetime('now', ?)
        ORDER BY timestamp DESC
      `).all(ipAddress, `-${hours} hours`);
    }

    return this.db.prepare(`
      SELECT * FROM audit_logs
      WHERE action = 'login_failed'
        AND timestamp > datetime('now', ?)
      ORDER BY timestamp DESC
    `).all(`-${hours} hours`);
  }

  /**
   * Get activity summary for dashboard
   * @param {number} hours - Hours to summarize
   * @returns {Object} Activity summary
   */
  getActivitySummary(hours = 24) {
    const results = this.db.prepare(`
      SELECT
        action,
        COUNT(*) as count
      FROM audit_logs
      WHERE timestamp > datetime('now', ?)
      GROUP BY action
    `).all(`-${hours} hours`);

    const summary = {};
    for (const row of results) {
      summary[row.action] = row.count;
    }

    return summary;
  }

  /**
   * Clean up old audit logs
   * @param {number} days - Days to keep
   */
  cleanup(days = 90) {
    const result = this.db.prepare(`
      DELETE FROM audit_logs
      WHERE timestamp < datetime('now', ?)
    `).run(`-${days} days`);

    console.log(`[AuditLogger] Cleaned up ${result.changes} old logs`);
    return result.changes;
  }
}

module.exports = AuditLogger;

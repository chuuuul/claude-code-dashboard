/**
 * AuthService - JWT-based authentication service
 *
 * Features:
 * - bcrypt password hashing
 * - JWT access tokens (short-lived)
 * - Refresh tokens (long-lived, stored in DB)
 * - Token revocation support
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class AuthService {
  constructor(db) {
    this.db = db;
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    this.saltRounds = 10;

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Hash a password using bcrypt
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>}
   */
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate access and refresh tokens
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {string} role - User role
   * @returns {Object} Tokens object
   */
  generateTokens(userId, username, role) {
    const accessToken = jwt.sign(
      {
        userId,
        username,
        role,
        type: 'access'
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );

    const refreshToken = jwt.sign(
      {
        userId,
        type: 'refresh',
        jti: uuidv4() // Unique token ID for revocation
      },
      this.jwtSecret,
      { expiresIn: this.refreshExpiresIn }
    );

    // Calculate expiration time in seconds
    const decoded = jwt.decode(accessToken);
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify access token
   * @param {string} token - JWT access token
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  verifyAccessToken(token) {
    const payload = jwt.verify(token, this.jwtSecret);

    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return payload;
  }

  /**
   * Login user with credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Tokens and user info
   */
  async login(username, password) {
    // Find user
    const user = this.db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).get(username);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id, user.username, user.role);

    // Store refresh token hash
    const tokenHash = this.hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + this.parseExpiration(this.refreshExpiresIn));

    this.db.prepare(`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, tokenHash, expiresAt.toISOString());

    return {
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };
  }

  /**
   * Refresh tokens using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshTokens(refreshToken) {
    // Verify refresh token
    let payload;
    try {
      payload = jwt.verify(refreshToken, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Check token in database
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = this.db.prepare(
      'SELECT * FROM refresh_tokens WHERE token_hash = ?'
    ).get(tokenHash);

    if (!storedToken || storedToken.revoked_at) {
      throw new Error('Invalid refresh token');
    }

    // Check expiration
    if (new Date(storedToken.expires_at) < new Date()) {
      throw new Error('Refresh token expired');
    }

    // Get user
    const user = this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).get(storedToken.user_id);

    if (!user) {
      throw new Error('User not found');
    }

    // Revoke old refresh token
    this.db.prepare(
      'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?'
    ).run(tokenHash);

    // Generate new tokens
    const newTokens = this.generateTokens(user.id, user.username, user.role);

    // Store new refresh token
    const newTokenHash = this.hashToken(newTokens.refreshToken);
    const expiresAt = new Date(Date.now() + this.parseExpiration(this.refreshExpiresIn));

    this.db.prepare(`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, newTokenHash, expiresAt.toISOString());

    return newTokens;
  }

  /**
   * Create a new user
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {string} role - User role (admin/user)
   * @returns {Promise<string>} Created user ID
   */
  async createUser(username, password, role = 'user') {
    // Validate role
    const validRoles = ['admin', 'user'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role');
    }

    // Check if username exists
    const existing = this.db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).get(username);

    if (existing) {
      throw new Error('Username already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const userId = uuidv4();

    this.db.prepare(`
      INSERT INTO users (id, username, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(userId, username, passwordHash, role);

    return userId;
  }

  /**
   * Revoke a specific refresh token
   * @param {string} refreshToken - Refresh token to revoke
   */
  async revokeRefreshToken(refreshToken) {
    const tokenHash = this.hashToken(refreshToken);

    this.db.prepare(
      'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token_hash = ?'
    ).run(tokenHash);
  }

  /**
   * Revoke all refresh tokens for a user (logout all devices)
   * @param {string} userId - User ID
   */
  async revokeAllUserTokens(userId) {
    this.db.prepare(
      'UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL'
    ).run(userId);
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await this.verifyPassword(currentPassword, user.password_hash);

    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newHash = await this.hashPassword(newPassword);

    // Update password
    this.db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?'
    ).run(newHash, userId);

    // Revoke all refresh tokens (force re-login)
    await this.revokeAllUserTokens(userId);
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Object|null} User object
   */
  getUser(userId) {
    const user = this.db.prepare(
      'SELECT id, username, role, created_at FROM users WHERE id = ?'
    ).get(userId);

    return user || null;
  }

  /**
   * Hash token for storage (SHA-256)
   * @param {string} token - Token to hash
   * @returns {string} Token hash
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Parse expiration string to milliseconds
   * @param {string} exp - Expiration string (e.g., '1h', '7d')
   * @returns {number} Milliseconds
   */
  parseExpiration(exp) {
    const units = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const match = exp.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${exp}`);
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Clean up expired refresh tokens
   */
  cleanupExpiredTokens() {
    this.db.prepare(
      'DELETE FROM refresh_tokens WHERE expires_at < datetime("now") OR revoked_at IS NOT NULL'
    ).run();
  }
}

module.exports = AuthService;

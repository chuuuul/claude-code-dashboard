/**
 * Database Bootstrap - Secure Admin User Creation
 *
 * Creates initial admin user ONLY if:
 * 1. No users exist in the database
 * 2. ADMIN_PASSWORD environment variable is set
 *
 * This prevents hardcoded credentials in the schema.
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./index');

const SALT_ROUNDS = 12;

/**
 * Bootstrap the database with initial admin user if needed
 * @returns {Promise<{created: boolean, message: string}>}
 */
async function bootstrapDatabase() {
  const db = getDatabase();

  // Check if any users exist
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();

  if (existingUsers.count > 0) {
    return {
      created: false,
      message: 'Database already has users, skipping bootstrap'
    };
  }

  // Require ADMIN_PASSWORD for first-run setup
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';

  if (!adminPassword) {
    console.warn('[Bootstrap] WARNING: No users exist and ADMIN_PASSWORD is not set.');
    console.warn('[Bootstrap] Set ADMIN_PASSWORD environment variable to create initial admin user.');
    console.warn('[Bootstrap] Example: ADMIN_PASSWORD=your_secure_password npm start');
    return {
      created: false,
      message: 'ADMIN_PASSWORD required for first-run setup'
    };
  }

  // Validate password strength
  if (adminPassword.length < 12) {
    console.error('[Bootstrap] ERROR: ADMIN_PASSWORD must be at least 12 characters');
    return {
      created: false,
      message: 'ADMIN_PASSWORD too short (minimum 12 characters)'
    };
  }

  // Check for password complexity
  const hasUppercase = /[A-Z]/.test(adminPassword);
  const hasLowercase = /[a-z]/.test(adminPassword);
  const hasNumber = /[0-9]/.test(adminPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(adminPassword);

  if (!(hasUppercase && hasLowercase && hasNumber)) {
    console.warn('[Bootstrap] WARNING: Password should contain uppercase, lowercase, and numbers');
  }

  try {
    // Hash password with secure salt rounds
    const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
    const userId = uuidv4();

    // Insert admin user
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `).run(userId, adminUsername, passwordHash);

    console.log(`[Bootstrap] Created initial admin user: ${adminUsername}`);
    console.log('[Bootstrap] IMPORTANT: Change this password after first login!');

    return {
      created: true,
      message: `Admin user '${adminUsername}' created successfully`
    };
  } catch (error) {
    console.error('[Bootstrap] Failed to create admin user:', error.message);
    return {
      created: false,
      message: `Failed to create admin user: ${error.message}`
    };
  }
}

/**
 * Check if the database needs bootstrapping
 * @returns {boolean}
 */
function needsBootstrap() {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return result.count === 0;
}

module.exports = {
  bootstrapDatabase,
  needsBootstrap
};

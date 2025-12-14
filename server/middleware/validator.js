/**
 * Input validation middleware
 * Sanitizes and validates user input to prevent injection attacks
 */

const { validate: uuidValidate } = require('uuid');

/**
 * Validate session ID parameter
 */
function validateSessionId(req, res, next) {
  const sessionId = req.params.id || req.body.sessionId || req.query.sessionId;

  if (!sessionId) {
    return res.status(400).json({
      error: 'Session ID is required',
      code: 'MISSING_SESSION_ID'
    });
  }

  if (typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Session ID must be a string',
      code: 'INVALID_SESSION_ID_TYPE'
    });
  }

  if (!uuidValidate(sessionId)) {
    return res.status(400).json({
      error: 'Session ID must be a valid UUID',
      code: 'INVALID_SESSION_ID_FORMAT'
    });
  }

  // Store validated session ID
  req.validatedSessionId = sessionId;
  next();
}

/**
 * Validate path parameter
 */
function validatePath(req, res, next) {
  const path = req.body.path || req.query.path;

  if (!path) {
    return res.status(400).json({
      error: 'Path is required',
      code: 'MISSING_PATH'
    });
  }

  if (typeof path !== 'string') {
    return res.status(400).json({
      error: 'Path must be a string',
      code: 'INVALID_PATH_TYPE'
    });
  }

  // Basic path validation (actual security check is in FileExplorer)
  if (path.includes('\0')) {
    return res.status(400).json({
      error: 'Invalid path: contains null bytes',
      code: 'INVALID_PATH_CHARS'
    });
  }

  req.validatedPath = path;
  next();
}

/**
 * Validate project creation request
 */
function validateProjectCreate(req, res, next) {
  const { projectPath, projectName } = req.body;

  if (!projectPath) {
    return res.status(400).json({
      error: 'Project path is required',
      code: 'MISSING_PROJECT_PATH'
    });
  }

  if (typeof projectPath !== 'string') {
    return res.status(400).json({
      error: 'Project path must be a string',
      code: 'INVALID_PROJECT_PATH_TYPE'
    });
  }

  if (!projectName) {
    return res.status(400).json({
      error: 'Project name is required',
      code: 'MISSING_PROJECT_NAME'
    });
  }

  if (typeof projectName !== 'string') {
    return res.status(400).json({
      error: 'Project name must be a string',
      code: 'INVALID_PROJECT_NAME_TYPE'
    });
  }

  // Sanitize project name (remove dangerous characters)
  const sanitizedName = projectName
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .substring(0, 100);

  if (!sanitizedName) {
    return res.status(400).json({
      error: 'Project name contains only invalid characters',
      code: 'INVALID_PROJECT_NAME'
    });
  }

  req.validatedProjectPath = projectPath;
  req.validatedProjectName = sanitizedName;
  next();
}

/**
 * Validate login request
 */
function validateLogin(req, res, next) {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({
      error: 'Username is required',
      code: 'MISSING_USERNAME'
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      error: 'Password is required',
      code: 'MISSING_PASSWORD'
    });
  }

  // Username validation
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({
      error: 'Username must be 3-50 characters',
      code: 'INVALID_USERNAME_LENGTH'
    });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({
      error: 'Username contains invalid characters',
      code: 'INVALID_USERNAME_CHARS'
    });
  }

  // Password validation
  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters',
      code: 'INVALID_PASSWORD_LENGTH'
    });
  }

  req.validatedUsername = username;
  req.validatedPassword = password;
  next();
}

/**
 * Validate file content
 */
function validateFileContent(req, res, next) {
  const { content } = req.body;

  if (content === undefined || content === null) {
    return res.status(400).json({
      error: 'Content is required',
      code: 'MISSING_CONTENT'
    });
  }

  if (typeof content !== 'string') {
    return res.status(400).json({
      error: 'Content must be a string',
      code: 'INVALID_CONTENT_TYPE'
    });
  }

  // Size limit check (10MB)
  const size = Buffer.byteLength(content, 'utf-8');
  if (size > 10 * 1024 * 1024) {
    return res.status(400).json({
      error: 'Content too large (max 10MB)',
      code: 'CONTENT_TOO_LARGE'
    });
  }

  req.validatedContent = content;
  next();
}

/**
 * Validate user creation request
 */
function validateUserCreate(req, res, next) {
  const { username, password, role } = req.body;

  // Username validation
  if (!username || typeof username !== 'string') {
    return res.status(400).json({
      error: 'Username is required',
      code: 'MISSING_USERNAME'
    });
  }

  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({
      error: 'Username must be 3-50 characters',
      code: 'INVALID_USERNAME_LENGTH'
    });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({
      error: 'Username contains invalid characters',
      code: 'INVALID_USERNAME_CHARS'
    });
  }

  // Password validation
  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      error: 'Password is required',
      code: 'MISSING_PASSWORD'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters',
      code: 'INVALID_PASSWORD_LENGTH'
    });
  }

  // Role validation
  const validRoles = ['admin', 'user'];
  const userRole = role || 'user';

  if (!validRoles.includes(userRole)) {
    return res.status(400).json({
      error: 'Invalid role. Must be "admin" or "user"',
      code: 'INVALID_ROLE'
    });
  }

  req.validatedUsername = username;
  req.validatedPassword = password;
  req.validatedRole = userRole;
  next();
}

module.exports = {
  validateSessionId,
  validatePath,
  validateProjectCreate,
  validateLogin,
  validateFileContent,
  validateUserCreate
};

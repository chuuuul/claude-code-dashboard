/**
 * AuthService Unit Tests
 * TDD: Tests for JWT-based authentication
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

let AuthService;
let mockDb;

describe('AuthService', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn()
      })
    };

    AuthService = require('../../services/AuthService');
  });

  describe('hashPassword', () => {
    it('should hash password with bcrypt', async () => {
      const auth = new AuthService(mockDb);
      const password = 'mySecurePassword123';

      const hash = await auth.hashPassword(password);

      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
    });

    it('should generate different hashes for same password', async () => {
      const auth = new AuthService(mockDb);
      const password = 'mySecurePassword123';

      const hash1 = await auth.hashPassword(password);
      const hash2 = await auth.hashPassword(password);

      expect(hash1).not.toBe(hash2); // Different salts
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const auth = new AuthService(mockDb);
      const password = 'mySecurePassword123';
      const hash = await bcrypt.hash(password, 10);

      const result = await auth.verifyPassword(password, hash);

      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const auth = new AuthService(mockDb);
      const hash = await bcrypt.hash('correctPassword', 10);

      const result = await auth.verifyPassword('wrongPassword', hash);

      expect(result).toBe(false);
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const auth = new AuthService(mockDb);
      const userId = 'user-123';
      const username = 'testuser';
      const role = 'user';

      const tokens = auth.generateTokens(userId, username, role);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should include user info in access token payload', () => {
      const auth = new AuthService(mockDb);
      const userId = 'user-123';
      const username = 'testuser';
      const role = 'admin';

      const { accessToken } = auth.generateTokens(userId, username, role);
      const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);

      expect(decoded.userId).toBe(userId);
      expect(decoded.username).toBe(username);
      expect(decoded.role).toBe(role);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const auth = new AuthService(mockDb);
      const { accessToken } = auth.generateTokens('user-1', 'test', 'user');

      const payload = auth.verifyAccessToken(accessToken);

      expect(payload.userId).toBe('user-1');
      expect(payload.username).toBe('test');
    });

    it('should reject expired token', () => {
      const auth = new AuthService(mockDb);

      // Create expired token
      const expiredToken = jwt.sign(
        { userId: 'user-1', username: 'test', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );

      expect(() => auth.verifyAccessToken(expiredToken))
        .toThrow('jwt expired');
    });

    it('should reject tampered token', () => {
      const auth = new AuthService(mockDb);
      const { accessToken } = auth.generateTokens('user-1', 'test', 'user');

      // Tamper with token
      const tamperedToken = accessToken.slice(0, -5) + 'xxxxx';

      expect(() => auth.verifyAccessToken(tamperedToken)).toThrow();
    });

    it('should reject token with wrong secret', () => {
      const wrongToken = jwt.sign(
        { userId: 'user-1', username: 'test', role: 'user' },
        'wrong-secret',
        { expiresIn: '1h' }
      );

      const auth = new AuthService(mockDb);

      expect(() => auth.verifyAccessToken(wrongToken))
        .toThrow('invalid signature');
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const auth = new AuthService(mockDb);
      const passwordHash = await bcrypt.hash('correctPassword', 10);

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 'user-123',
          username: 'testuser',
          password_hash: passwordHash,
          role: 'user'
        }),
        run: jest.fn()
      });

      const result = await auth.login('testuser', 'correctPassword');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('testuser');
    });

    it('should reject invalid username', async () => {
      const auth = new AuthService(mockDb);

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(null)
      });

      await expect(auth.login('nonexistent', 'password'))
        .rejects.toThrow('Invalid credentials');
    });

    it('should reject invalid password', async () => {
      const auth = new AuthService(mockDb);
      const passwordHash = await bcrypt.hash('correctPassword', 10);

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 'user-123',
          username: 'testuser',
          password_hash: passwordHash,
          role: 'user'
        })
      });

      await expect(auth.login('testuser', 'wrongPassword'))
        .rejects.toThrow('Invalid credentials');
    });
  });

  describe('refreshTokens', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const auth = new AuthService(mockDb);
      const { refreshToken } = auth.generateTokens('user-1', 'test', 'user');

      // Mock refresh token storage
      const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          user_id: 'user-1',
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          revoked_at: null
        }),
        run: jest.fn()
      });

      // Mock user lookup
      const originalPrepare = mockDb.prepare;
      mockDb.prepare = jest.fn((query) => {
        if (query.includes('refresh_tokens')) {
          return {
            get: jest.fn().mockReturnValue({
              user_id: 'user-1',
              token_hash: tokenHash,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
              revoked_at: null
            }),
            run: jest.fn()
          };
        }
        return {
          get: jest.fn().mockReturnValue({
            id: 'user-1',
            username: 'test',
            role: 'user'
          })
        };
      });

      const newTokens = await auth.refreshTokens(refreshToken);

      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');
    });

    it('should reject revoked refresh token', async () => {
      const auth = new AuthService(mockDb);

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          revoked_at: new Date().toISOString()
        })
      });

      await expect(auth.refreshTokens('some-refresh-token'))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('createUser', () => {
    it('should create new user with hashed password', async () => {
      const auth = new AuthService(mockDb);
      const runMock = jest.fn();

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(null), // User doesn't exist
        run: runMock
      });

      const userId = await auth.createUser('newuser', 'password123', 'user');

      expect(typeof userId).toBe('string');
      expect(runMock).toHaveBeenCalled();
    });

    it('should reject duplicate username', async () => {
      const auth = new AuthService(mockDb);

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ id: 'existing-user' })
      });

      await expect(auth.createUser('existinguser', 'password', 'user'))
        .rejects.toThrow('Username already exists');
    });

    it('should validate role', async () => {
      const auth = new AuthService(mockDb);

      await expect(auth.createUser('user', 'pass', 'superadmin'))
        .rejects.toThrow('Invalid role');
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke specific refresh token', async () => {
      const auth = new AuthService(mockDb);
      const runMock = jest.fn();

      mockDb.prepare.mockReturnValue({ run: runMock });

      await auth.revokeRefreshToken('some-token');

      expect(runMock).toHaveBeenCalled();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for user', async () => {
      const auth = new AuthService(mockDb);
      const runMock = jest.fn();

      mockDb.prepare.mockReturnValue({ run: runMock });

      await auth.revokeAllUserTokens('user-123');

      expect(runMock).toHaveBeenCalled();
    });
  });
});

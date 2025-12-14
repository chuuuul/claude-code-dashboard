const request = require('supertest');

/**
 * Helper to bootstrap the Express app with lightweight dependency mocks.
 * We reset module state before each creation to ensure isolation.
 */
async function createTestServer({ activeSessions } = {}) {
  jest.resetModules();

  process.env.PORT = '0';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret';

  const mockDb = {
    prepare: jest.fn((sql) => {
      const stmt = {
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn()
      };

      if (sql.toLowerCase().includes('pragma table_info')) {
        stmt.all.mockReturnValue([
          { name: 'token' },
          { name: 'session_id' },
          { name: 'expires_at' }
        ]);
      }

      return stmt;
    })
  };

  const startPolling = jest.fn();

  jest.doMock('node-pty', () => ({
    spawn: jest.fn(() => ({
      onData: jest.fn(),
      onExit: jest.fn(),
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn()
    }))
  }));

  jest.doMock('../../server/db', () => ({
    getDatabase: jest.fn(() => mockDb),
    closeDatabase: jest.fn()
  }));

  jest.doMock('../../server/db/bootstrap', () => ({
    bootstrapDatabase: jest.fn(async () => ({ created: false }))
  }));

  jest.doMock('../../server/middleware/auth', () => ({
    authMiddleware: () => (req, res, next) => {
      req.user = { id: 'user-1', role: 'admin', username: 'tester' };
      next();
    },
    requireAdmin: (req, res, next) => next(),
    getClientIp: () => '127.0.0.1'
  }));

  jest.doMock('../../server/middleware/rateLimiter', () => ({
    rateLimitMiddleware: () => (req, res, next) => next()
  }));

  jest.doMock('../../server/services/AuthService', () => (
    jest.fn().mockImplementation(() => ({
      login: jest.fn(async (username) => ({
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
        user: { id: 'user-1', username }
      })),
      refreshTokens: jest.fn(async () => ({
        refreshToken: 'refresh-token-2',
        accessToken: 'access-token-2'
      })),
      verifyAccessToken: jest.fn(() => ({ userId: 'user-1' }))
    }))
  ));

  jest.doMock('../../server/services/AuditLogger', () => (
    jest.fn().mockImplementation(() => ({
      log: jest.fn(),
      logLogin: jest.fn(),
      logLoginFailed: jest.fn(),
      logTokenRefresh: jest.fn(),
      logSessionCreated: jest.fn(),
      logSessionKilled: jest.fn(),
      getRecentLogs: jest.fn(() => []),
      getDb: () => mockDb
    }))
  ));

  class SessionManagerMock {
    constructor() {
      this.activeSessions = activeSessions || new Map();
    }
    on() {}
    async recoverSessions() { return true; }
    async listSessions() { return []; }
    async createSession() { return 'session-new'; }
    getSession() { return { project_path: '/tmp/project' }; }
    async hasSession() { return true; }
    hasMaster() { return false; }
    setMaster() {}
    async killSession() { return true; }
    async sendInput() { return true; }
    async capturePane() { return 'capture'; }
  }

  jest.doMock('../../server/services/SessionManager', () => SessionManagerMock);

  jest.doMock('../../server/services/MetadataExtractor', () => (
    jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      emit: jest.fn(),
      startPolling,
      stopAll: jest.fn()
    }))
  ));

  jest.doMock('../../server/services/FileExplorer', () => (
    jest.fn().mockImplementation(() => ({ enabled: true }))
  ));

  jest.doMock('../../server/routes/files', () => (
    jest.fn().mockImplementation(() => {
      const express = require('express');
      const router = express.Router();
      router.post('/', (req, res) => res.json({ ok: true }));
      return router;
    })
  ));

  const appModule = require('../../server/app');
  const created = await appModule.createServer();

  return { ...created, mockDb, startPolling };
}

describe('app middleware & security', () => {
  test('parses JSON bodies for auth routes', async () => {
    const { app, server } = await createTestServer();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: 'access-token',
      user: { username: 'tester' }
    });

    server.close();
  });

  test('CSRF token is issued and required for session routes', async () => {
    const { app, server } = await createTestServer({
      activeSessions: new Map([
        ['123e4567-e89b-12d3-a456-426614174000', { project_path: '/tmp/project' }]
      ])
    });

    const agent = request.agent(app);

    const tokenRes = await agent.get('/api/auth/csrf-token');
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.csrfToken).toBeTruthy();

    // Missing token should be rejected
    const forbidden = await agent
      .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/share')
      .send({ expiresIn: 3600 });
    expect(forbidden.status).toBe(403);

    // With token header request should succeed
    const allowed = await agent
      .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/share')
      .set('x-csrf-token', tokenRes.body.csrfToken)
      .send({ expiresIn: 3600 });

    expect(allowed.status).toBe(200);
    expect(allowed.body.token).toBeDefined();

    server.close();
  });

  test('starts metadata polling for recovered sessions with project paths', async () => {
    const activeSessions = new Map([
      ['session-1', { project_path: '/tmp/project-a' }],
      ['session-2', { project_path: null }]
    ]);

    const { server, startPolling } = await createTestServer({ activeSessions });

    expect(startPolling).toHaveBeenCalledWith('session-1', '/tmp/project-a');
    expect(startPolling).not.toHaveBeenCalledWith('session-2', null);

    server.close();
  });
});

describe('share token persistence', () => {
  test('saves generated share token to database', async () => {
    const { app, server, mockDb } = await createTestServer({
      activeSessions: new Map([
        ['123e4567-e89b-12d3-a456-426614174000', { project_path: '/tmp/project' }]
      ])
    });

    const agent = request.agent(app);
    const tokenRes = await agent.get('/api/auth/csrf-token');

    mockDb.prepare.mockClear();

    const res = await agent
      .post('/api/sessions/123e4567-e89b-12d3-a456-426614174000/share')
      .set('x-csrf-token', tokenRes.body.csrfToken)
      .send({ expiresIn: 3600 });

    expect(res.status).toBe(200);

    const insertCall = mockDb.prepare.mock.calls.find(([sql]) => sql.includes('share_tokens'));
    expect(insertCall).toBeDefined();

    server.close();
  });
});

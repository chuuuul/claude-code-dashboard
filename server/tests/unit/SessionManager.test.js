/**
 * SessionManager Unit Tests
 * TDD: Tests written before implementation
 */

const { v4: uuidv4, validate: uuidValidate } = require('uuid');

// Mock child_process before requiring SessionManager
jest.mock('child_process', () => ({
  execFile: jest.fn(),
  spawn: jest.fn()
}));

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

// We'll require SessionManager after mocking
let SessionManager;
let mockDb;

describe('SessionManager', () => {
  beforeAll(() => {
    // Set environment variables for testing
    process.env.ALLOWED_PROJECT_ROOTS = '/projects:/home/test';
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database
    mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn()
      })
    };

    // Require SessionManager fresh for each test
    jest.resetModules();
    SessionManager = require('../../services/SessionManager');
  });

  describe('validateSessionId', () => {
    it('should accept valid UUID v4', () => {
      const sm = new SessionManager(mockDb);
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';

      expect(() => sm.validateSessionId(validUuid)).not.toThrow();
    });

    it('should accept generated UUID v4', () => {
      const sm = new SessionManager(mockDb);
      const uuid = uuidv4();

      expect(() => sm.validateSessionId(uuid)).not.toThrow();
    });

    it('should reject invalid session ID format', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.validateSessionId('invalid-id')).toThrow('must be UUID v4');
    });

    it('should reject command injection attempts', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.validateSessionId('test; rm -rf /')).toThrow();
    });

    it('should reject null session ID', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.validateSessionId(null)).toThrow('must be a string');
    });

    it('should reject undefined session ID', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.validateSessionId(undefined)).toThrow('must be a string');
    });

    it('should reject non-string session ID', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.validateSessionId(12345)).toThrow('must be a string');
    });

    it('should reject empty string session ID', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.validateSessionId('')).toThrow('must be UUID v4');
    });
  });

  describe('hasMaster', () => {
    it('should return false when no master exists', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      expect(sm.hasMaster(sessionId)).toBe(false);
    });

    it('should return true after setMaster', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.masterClients.set(sessionId, 'client-1');

      expect(sm.hasMaster(sessionId)).toBe(true);
    });

    it('should return false after releaseMaster', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.masterClients.set(sessionId, 'client-1');
      sm.releaseMaster(sessionId, 'client-1');

      expect(sm.hasMaster(sessionId)).toBe(false);
    });
  });

  describe('setMaster', () => {
    it('should set master for valid session', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();
      const clientId = 'client-123';

      sm.setMaster(sessionId, clientId);

      expect(sm.masterClients.get(sessionId)).toBe(clientId);
    });

    it('should validate session ID before setting master', () => {
      const sm = new SessionManager(mockDb);

      expect(() => sm.setMaster('invalid', 'client-1')).toThrow();
    });
  });

  describe('releaseMaster', () => {
    it('should release master when client matches', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();
      const clientId = 'client-1';

      sm.masterClients.set(sessionId, clientId);
      sm.releaseMaster(sessionId, clientId);

      expect(sm.masterClients.has(sessionId)).toBe(false);
    });

    it('should not release master when client does not match', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.masterClients.set(sessionId, 'client-1');
      sm.releaseMaster(sessionId, 'client-2');

      expect(sm.masterClients.has(sessionId)).toBe(true);
    });
  });

  describe('isMaster', () => {
    it('should return true when client is master', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();
      const clientId = 'client-1';

      sm.masterClients.set(sessionId, clientId);

      expect(sm.isMaster(sessionId, clientId)).toBe(true);
    });

    it('should return false when client is not master', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.masterClients.set(sessionId, 'client-1');

      expect(sm.isMaster(sessionId, 'client-2')).toBe(false);
    });

    it('should return false when no master exists', () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      expect(sm.isMaster(sessionId, 'client-1')).toBe(false);
    });
  });

  describe('hasSession', () => {
    it('should return true for existing session', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sm.hasSession(sessionId);

      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining(['-L', 'claude-dashboard', 'has-session', '-t', sessionId]),
        expect.any(Function)
      );
    });

    it('should return false for non-existing session', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      execFile.mockImplementation((cmd, args, callback) => {
        callback(new Error('session not found'), null);
      });

      const result = await sm.hasSession(sessionId);

      expect(result).toBe(false);
    });

    it('should validate session ID', async () => {
      const sm = new SessionManager(mockDb);

      await expect(sm.hasSession('invalid-id')).rejects.toThrow();
    });
  });

  describe('createSession', () => {
    it('should create tmux session with valid path', async () => {
      const sm = new SessionManager(mockDb);
      const projectPath = '/projects/test-project';
      const projectName = 'Test Project';

      // Mock fs.realpath
      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue(projectPath);

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const sessionId = await sm.createSession(projectPath, projectName);

      expect(uuidValidate(sessionId)).toBe(true);
      expect(execFile).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining([
          '-L', 'claude-dashboard',
          'new-session',
          '-d',
          '-s', sessionId,
          '-c', projectPath,
          'claude'
        ]),
        expect.any(Function)
      );
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should reject path outside allowed roots', async () => {
      const sm = new SessionManager(mockDb);

      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue('/etc/passwd');

      await expect(sm.createSession('/etc/passwd', 'test')).rejects.toThrow('not in allowed roots');
    });
  });

  describe('killSession', () => {
    it('should kill tmux session and update database', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.activeSessions.set(sessionId, { session_id: sessionId });
      sm.masterClients.set(sessionId, 'client-1');

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sm.killSession(sessionId);

      expect(execFile).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining(['-L', 'claude-dashboard', 'kill-session', '-t', sessionId]),
        expect.any(Function)
      );
      expect(sm.activeSessions.has(sessionId)).toBe(false);
      expect(sm.masterClients.has(sessionId)).toBe(false);
    });
  });

  describe('sendInput', () => {
    it('should send input to tmux session', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();
      const input = 'test command';
      const clientId = 'client-1';

      sm.masterClients.set(sessionId, clientId);

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sm.sendInput(sessionId, input, clientId);

      expect(execFile).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining([
          '-L', 'claude-dashboard',
          'send-keys', '-t', sessionId,
          '-l',
          input
        ]),
        expect.any(Function)
      );
    });

    it('should reject input from non-master client', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.masterClients.set(sessionId, 'client-1');

      await expect(sm.sendInput(sessionId, 'test', 'client-2')).rejects.toThrow('Only master client');
    });

    it('should reject non-string input', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();
      const clientId = 'client-1';

      sm.masterClients.set(sessionId, clientId);

      await expect(sm.sendInput(sessionId, { cmd: 'test' }, clientId)).rejects.toThrow('must be a string');
    });
  });

  describe('sendLargeInput', () => {
    it('should use spawn for large input via tmux load-buffer', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();
      const largeText = 'a'.repeat(10000);
      const clientId = 'client-1';

      sm.masterClients.set(sessionId, clientId);

      // Mock spawn for load-buffer
      const mockProc = {
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
        })
      };
      spawn.mockReturnValue(mockProc);

      // Mock execFile for paste-buffer
      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sm.sendLargeInput(sessionId, largeText, clientId);

      expect(spawn).toHaveBeenCalledWith('tmux', ['-L', 'claude-dashboard', 'load-buffer', '-']);
      expect(mockProc.stdin.write).toHaveBeenCalledWith(largeText);
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });
  });

  describe('listSessions', () => {
    it('should return list of sessions from tmux', async () => {
      const sm = new SessionManager(mockDb);
      const sessionId = uuidv4();

      sm.activeSessions.set(sessionId, {
        session_id: sessionId,
        project_name: 'Test Project'
      });

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: `${sessionId}:1702000000:1\n`, stderr: '' });
      });

      const sessions = await sm.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe(sessionId);
      expect(sessions[0].project_name).toBe('Test Project');
    });

    it('should return empty array when no tmux server', async () => {
      const sm = new SessionManager(mockDb);

      execFile.mockImplementation((cmd, args, callback) => {
        callback(new Error('no server running'), null);
      });

      const sessions = await sm.listSessions();

      expect(sessions).toEqual([]);
    });
  });

  describe('recoverSessions', () => {
    it('should recover existing tmux sessions on startup', async () => {
      const sessionId = uuidv4();

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          session_id: sessionId,
          project_name: 'Recovered Project'
        }),
        run: jest.fn()
      });

      const sm = new SessionManager(mockDb);

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: `${sessionId}\n`, stderr: '' });
      });

      await sm.recoverSessions();

      expect(sm.activeSessions.has(sessionId)).toBe(true);
    });

    it('should handle orphan sessions not in database', async () => {
      const sessionId = uuidv4();

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(null),
        run: jest.fn()
      });

      const sm = new SessionManager(mockDb);

      execFile.mockImplementation((cmd, args, callback) => {
        callback(null, { stdout: `${sessionId}\n`, stderr: '' });
      });

      await sm.recoverSessions();

      expect(sm.activeSessions.has(sessionId)).toBe(true);
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('validateProjectPath', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.ALLOWED_PROJECT_ROOTS = '/projects:/home/user/work';
    });

    it('should accept path within allowed roots', async () => {
      const sm = new SessionManager(mockDb);

      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue('/projects/my-app');

      const result = await sm.validateProjectPath('/projects/my-app');

      expect(result).toBe('/projects/my-app');
    });

    it('should reject path outside allowed roots', async () => {
      const sm = new SessionManager(mockDb);

      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue('/etc/passwd');

      await expect(sm.validateProjectPath('/etc/passwd')).rejects.toThrow('not in allowed roots');
    });

    it('should reject /projects-evil prefix attack', async () => {
      const sm = new SessionManager(mockDb);

      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue('/projects-evil/malicious');

      await expect(sm.validateProjectPath('/projects-evil/malicious')).rejects.toThrow('not in allowed roots');
    });

    it('should accept exact root path', async () => {
      const sm = new SessionManager(mockDb);

      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue('/projects');

      const result = await sm.validateProjectPath('/projects');

      expect(result).toBe('/projects');
    });

    it('should resolve symlinks before validation', async () => {
      const sm = new SessionManager(mockDb);

      // Symlink points to allowed path
      jest.spyOn(require('fs').promises, 'realpath').mockResolvedValue('/projects/real-path');

      const result = await sm.validateProjectPath('/symlink/to/project');

      expect(result).toBe('/projects/real-path');
    });

    it('should throw error when ALLOWED_PROJECT_ROOTS not configured', async () => {
      delete process.env.ALLOWED_PROJECT_ROOTS;

      jest.resetModules();
      SessionManager = require('../../services/SessionManager');

      const sm = new SessionManager(mockDb);

      await expect(sm.validateProjectPath('/projects/test')).rejects.toThrow('ALLOWED_PROJECT_ROOTS not configured');
    });
  });
});

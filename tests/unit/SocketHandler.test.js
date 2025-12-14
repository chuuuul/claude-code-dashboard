const { EventEmitter } = require('events');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({
    userId: 'user-1',
    username: 'tester',
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + 60
  }))
}));

jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const { EventEmitter } = require('events');
    const emitter = new EventEmitter();
    emitter.write = jest.fn();
    emitter.resize = jest.fn();
    emitter.kill = jest.fn();
    emitter.onData = (cb) => {
      emitter.on('data', cb);
    };
    emitter.onExit = (cb) => {
      emitter.on('exit', cb);
    };
    return emitter;
  })
}));

describe('SocketHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('joins metadata room on attach', async () => {
    const middlewares = [];
    let connectionHandler;
    const io = {
      use: (fn) => middlewares.push(fn),
      on: (event, handler) => {
        if (event === 'connection') connectionHandler = handler;
      },
      to: jest.fn(() => ({ emit: jest.fn() }))
    };

    const sessionManager = {
      validateSessionId: jest.fn(),
      hasSession: jest.fn(async () => true),
      hasMaster: jest.fn(() => false),
      setMaster: jest.fn()
    };

    const auditLogger = {
      logSessionAttached: jest.fn(),
      log: jest.fn()
    };

    const initializeSocketHandler = require('../../server/services/SocketHandler');

    initializeSocketHandler(io, sessionManager, auditLogger);

    const socket = new EventEmitter();
    socket.handshake = { auth: { token: 'valid' } };
    socket.id = 'socket-1';
    socket.join = jest.fn();
    socket.emit = jest.fn();
    socket.disconnect = jest.fn();
    socket.on = socket.addListener.bind(socket);

    // Authenticate middleware
    await new Promise((resolve) => {
      middlewares[0](socket, (err) => {
        if (err) throw err;
        resolve();
      });
    });

    // Simulate connection and attach
    connectionHandler(socket);
    const attachHandler = socket.listeners('attach')[0];
    await attachHandler({ sessionId: '123e4567-e89b-12d3-a456-426614174000', mode: 'viewer' });

    expect(socket.join).toHaveBeenCalledWith('session:123e4567-e89b-12d3-a456-426614174000');
  });
});

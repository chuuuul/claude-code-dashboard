jest.mock('fs', () => ({
  promises: {
    access: jest.fn(async () => true),
    readFile: jest.fn(async () => '{"model":"claude"}\n')
  }
}));

const watchHandlers = {};

jest.mock('chokidar', () => ({
  watch: jest.fn(() => {
    const watcher = {
      on: (event, handler) => {
        watchHandlers[event] = handler;
        return watcher;
      },
      close: jest.fn()
    };
    return watcher;
  })
}));

describe('MetadataExtractor watchers', () => {
  beforeEach(() => {
    Object.keys(watchHandlers).forEach((k) => delete watchHandlers[k]);
    jest.resetModules();
  });

  test('cleans up watcher on error', async () => {
    const MetadataExtractor = require('../../server/services/MetadataExtractor');
    const extractor = new MetadataExtractor();

    await extractor.watchSessionLogs('session-1', '/tmp/project');

    expect(extractor.watchers.has('session-1')).toBe(true);
    expect(typeof watchHandlers.error).toBe('function');

    // Simulate chokidar error
    const fakeError = new Error('watch failed');
    watchHandlers.error(fakeError);

    expect(extractor.watchers.has('session-1')).toBe(false);
  });
});

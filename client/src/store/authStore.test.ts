import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

let useAuthStore: typeof import('./authStore')['useAuthStore'];

describe('authStore persistence', () => {
  beforeEach(() => {
    const storage = createMockStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    return import('./authStore').then((module) => {
      useAuthStore = module.useAuthStore;
      useAuthStore.persist?.clearStorage?.();
      useAuthStore.setState({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not persist accessToken to storage', async () => {
    useAuthStore.setState({
      user: { id: '1', username: 'test', role: 'user' },
      accessToken: 'secret-token',
      isAuthenticated: true
    });

    await Promise.resolve();

    const persisted = localStorage.getItem('auth-storage');
    expect(persisted).toBeTruthy();

    const parsed = JSON.parse(persisted as string);
    expect(parsed.state.accessToken).toBeUndefined();
    expect(parsed.state.user).toEqual({ id: '1', username: 'test', role: 'user' });
    expect(parsed.state.isAuthenticated).toBe(true);
  });
});

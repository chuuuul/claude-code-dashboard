import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api';
import { useAuthStore } from '../store/authStore';

describe('ApiService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('fetches CSRF token and includes it in subsequent requests', async () => {
    const requests: RequestInit[] = [];

    const fetchMock = vi.fn((_, init?: RequestInit) => {
      requests.push(init || {});

      if (requests.length === 1) {
        return Promise.resolve(new Response(
          JSON.stringify({ csrfToken: 'token123' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));
      }

      return Promise.resolve(new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService();
    await service.fetchCsrfToken();
    await service.post('/api/test', { value: 'ping' });

    const headers = requests[1].headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('token123');
  });

  it('retries once after refresh token succeeds', async () => {
    const mockState: any = {
      accessToken: 'old-token',
      refreshTokens: vi.fn(),
      logout: vi.fn()
    };

    mockState.refreshTokens.mockImplementation(async () => {
      mockState.accessToken = 'new-token';
      return true;
    });

    vi.spyOn(useAuthStore, 'getState').mockImplementation(() => mockState);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ message: 'ok' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));

    vi.stubGlobal('fetch', fetchMock);

    const service = new ApiService();
    const result = await service.get<{ message: string }>('/api/protected');

    expect(result.data.message).toBe('ok');
    expect(mockState.refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(secondHeaders['Authorization']).toBe('Bearer new-token');
  });
});

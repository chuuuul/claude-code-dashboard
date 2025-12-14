/**
 * API service for HTTP requests
 * Handles authentication, CSRF tokens, error handling, and token refresh
 *
 * Security: Uses withCredentials for HttpOnly cookie support
 */

import { useAuthStore } from '../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || '';

interface ApiError extends Error {
  code?: string;
  status?: number;
}

export interface ApiResponse<T> {
  data: T;
}

export interface RequestOptions {
  withCredentials?: boolean;
  disableRetry?: boolean;
}

export class ApiService {
  private csrfToken: string | null = null;

  async fetchCsrfToken(): Promise<void> {
    try {
      const response = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
        credentials: 'include'
      });
      const data = await response.json();
      this.csrfToken = data.csrfToken;
    } catch (error) {
      console.error('[API] Failed to fetch CSRF token:', error);
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      if (response.status === 204) {
        return undefined as T;
      }
      return response.json();
    }

    const errorData = await response.json().catch(() => ({}));
    throw this.createError(
      errorData.error || `Request failed with status ${response.status}`,
      errorData.code || 'API_ERROR',
      response.status
    );
  }

  private createError(message: string, code: string, status: number): ApiError {
    const error = new Error(message) as ApiError;
    error.code = code;
    error.status = status;
    return error;
  }

  private async fetchWithRetry<T>(
    url: string,
    options: RequestInit & { disableRetry?: boolean },
    retryCount = 0
  ): Promise<ApiResponse<T>> {
    const { disableRetry, ...fetchOptions } = options;

    const response = await fetch(`${BASE_URL}${url}`, {
      ...fetchOptions,
      headers: {
        ...this.getHeaders(),
        ...(fetchOptions.headers || {})
      },
      credentials: fetchOptions.credentials ?? 'include'
    });

    if (!disableRetry && response.status === 401 && retryCount === 0) {
      const { refreshTokens, logout } = useAuthStore.getState();
      const refreshed = await refreshTokens();

      if (refreshed) {
        return this.fetchWithRetry<T>(url, options, retryCount + 1);
      }

      logout();
      throw this.createError('Session expired. Please login again.', 'SESSION_EXPIRED', 401);
    }

    const data = await this.handleResponse<T>(response);
    return { data };
  }

  async get<T = unknown>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.fetchWithRetry<T>(url, {
      method: 'GET',
      credentials: options.withCredentials ? 'include' : 'same-origin',
      disableRetry: options.disableRetry
    });
  }

  async post<T = unknown>(url: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.fetchWithRetry<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      credentials: options.withCredentials ? 'include' : 'same-origin',
      disableRetry: options.disableRetry
    });
  }

  async put<T = unknown>(url: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.fetchWithRetry<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      credentials: options.withCredentials ? 'include' : 'same-origin',
      disableRetry: options.disableRetry
    });
  }

  async delete<T = unknown>(url: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.fetchWithRetry<T>(url, {
      method: 'DELETE',
      credentials: options.withCredentials ? 'include' : 'same-origin',
      disableRetry: options.disableRetry
    });
  }
}

export const api = new ApiService();

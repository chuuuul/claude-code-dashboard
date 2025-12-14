/**
 * API service for HTTP requests
 * Handles authentication, error handling, and token refresh
 *
 * Security: Uses withCredentials for HttpOnly cookie support
 */

import { useAuthStore } from '../store/authStore';

const BASE_URL = '';

interface ApiError extends Error {
  code?: string;
  status?: number;
}

interface RequestOptions {
  withCredentials?: boolean;
}

class ApiService {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };

    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      return response.json();
    }

    // Handle specific error codes
    if (response.status === 401) {
      const { refreshTokens, logout } = useAuthStore.getState();

      // Try to refresh token
      const refreshed = await refreshTokens();

      if (!refreshed) {
        logout();
        throw this.createError('Session expired. Please login again.', 'SESSION_EXPIRED', 401);
      }

      // Retry would need to be handled by the caller
      throw this.createError('Token refreshed, please retry', 'TOKEN_REFRESHED', 401);
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

  async get<T = unknown>(url: string, options: RequestOptions = {}): Promise<{ data: T }> {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'GET',
      headers: this.getHeaders(),
      credentials: options.withCredentials ? 'include' : 'same-origin'
    });

    const data = await this.handleResponse<T>(response);
    return { data };
  }

  async post<T = unknown>(url: string, body?: unknown, options: RequestOptions = {}): Promise<{ data: T }> {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: options.withCredentials ? 'include' : 'same-origin'
    });

    const data = await this.handleResponse<T>(response);
    return { data };
  }

  async put<T = unknown>(url: string, body?: unknown, options: RequestOptions = {}): Promise<{ data: T }> {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      credentials: options.withCredentials ? 'include' : 'same-origin'
    });

    const data = await this.handleResponse<T>(response);
    return { data };
  }

  async delete<T = unknown>(url: string, options: RequestOptions = {}): Promise<{ data: T }> {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      credentials: options.withCredentials ? 'include' : 'same-origin'
    });

    const data = await this.handleResponse<T>(response);
    return { data };
  }
}

export const api = new ApiService();

/**
 * Socket.io client service
 * Handles real-time communication with the server
 */

import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useSessionStore } from '../store/sessionStore';

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    const { accessToken } = useAuthStore.getState();

    this.socket = io({
      auth: {
        token: accessToken
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.setupEventListeners();

    return this.socket;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[Socket] Connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[Socket] Max reconnection attempts reached');
      }
    });

    // Token expiration handling
    this.socket.on('token-expiring', async (data) => {
      console.log('[Socket] Token expiring:', data.message);

      // Try to refresh token
      const { refreshTokens } = useAuthStore.getState();
      const success = await refreshTokens();

      if (success) {
        // Reconnect with new token
        this.reconnect();
      }
    });

    this.socket.on('token-expired', () => {
      console.log('[Socket] Token expired, logging out');
      const { logout } = useAuthStore.getState();
      logout();
    });

    // Metadata updates
    this.socket.on('metadata-update', (data) => {
      const { updateSessionMetadata } = useSessionStore.getState();
      updateSessionMetadata(data.sessionId, data);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('[Socket] Error:', error);
    });
  }

  reconnect(): void {
    if (this.socket) {
      const { accessToken } = useAuthStore.getState();
      this.socket.auth = { token: accessToken };
      this.socket.disconnect().connect();
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Session operations
  attachSession(sessionId: string, mode: 'master' | 'viewer' = 'master'): void {
    this.socket?.emit('attach', { sessionId, mode });
  }

  detachSession(): void {
    this.socket?.emit('detach');
  }

  sendInput(data: string): void {
    this.socket?.emit('input', data);
  }

  requestMaster(): void {
    this.socket?.emit('request-master');
  }

  releaseMaster(): void {
    this.socket?.emit('release-master');
  }

  resizeTerminal(cols: number, rows: number): void {
    this.socket?.emit('resize', { cols, rows });
  }

  // Event listeners
  onOutput(callback: (data: string) => void): () => void {
    this.socket?.on('output', callback);
    return () => this.socket?.off('output', callback);
  }

  onAttached(callback: (data: { sessionId: string; mode: string }) => void): () => void {
    this.socket?.on('attached', callback);
    return () => this.socket?.off('attached', callback);
  }

  onModeChanged(callback: (data: { mode: string; reason?: string }) => void): () => void {
    this.socket?.on('mode-changed', callback);
    return () => this.socket?.off('mode-changed', callback);
  }

  onSessionEnded(callback: (data: { exitCode: number }) => void): () => void {
    this.socket?.on('session-ended', callback);
    return () => this.socket?.off('session-ended', callback);
  }

  onSessionsList(callback: (sessions: unknown[]) => void): () => void {
    this.socket?.on('sessions-list', callback);
    return () => this.socket?.off('sessions-list', callback);
  }

  onDetached(callback: () => void): () => void {
    this.socket?.on('detached', callback);
    return () => this.socket?.off('detached', callback);
  }

  onError(callback: (error: { message: string }) => void): () => void {
    this.socket?.on('error', callback);
    return () => this.socket?.off('error', callback);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();

import { create } from 'zustand';
import { api } from '../services/api';

export interface SessionMetadata {
  source: string;
  tokenUsage?: number;
  contextPercent?: number;
  costUsd?: number;
  status?: string;
  lastMessage?: string;
  timestamp?: string;
}

export interface Session {
  session_id: string;
  project_name: string;
  project_path?: string;
  status: 'active' | 'idle' | 'terminated';
  created_at?: string;
  last_activity?: string;
  attached_clients?: number;
  has_master?: boolean;
  metadata?: SessionMetadata;
}

interface SessionState {
  sessions: Session[];
  currentSessionId: string | null;
  connectionMode: 'master' | 'viewer' | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (projectPath: string, projectName: string) => Promise<string>;
  deleteSession: (sessionId: string) => Promise<void>;
  setCurrentSession: (sessionId: string | null) => void;
  setConnectionMode: (mode: 'master' | 'viewer' | null) => void;
  updateSessionMetadata: (sessionId: string, metadata: SessionMetadata) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSessionId: null,
  connectionMode: null,
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await api.get<Session[]>('/api/sessions');
      set({ sessions: response.data as Session[], isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to fetch sessions';

      set({ isLoading: false, error: message });
    }
  },

  createSession: async (projectPath: string, projectName: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await api.post<Session>('/api/sessions', {
        projectPath,
        projectName
      });

      const newSession = response.data as Session;

      set((state) => ({
        sessions: [...state.sessions, newSession],
        isLoading: false
      }));

      return newSession.session_id;
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to create session';

      set({ isLoading: false, error: message });
      throw error;
    }
  },

  deleteSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });

    try {
      await api.delete(`/api/sessions/${sessionId}`);

      set((state) => ({
        sessions: state.sessions.filter(s => s.session_id !== sessionId),
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
        isLoading: false
      }));
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to delete session';

      set({ isLoading: false, error: message });
      throw error;
    }
  },

  setCurrentSession: (sessionId: string | null) => {
    set({ currentSessionId: sessionId });
  },

  setConnectionMode: (mode: 'master' | 'viewer' | null) => {
    set({ connectionMode: mode });
  },

  updateSessionMetadata: (sessionId: string, metadata: SessionMetadata) => {
    set((state) => ({
      sessions: state.sessions.map(session =>
        session.session_id === sessionId
          ? { ...session, metadata }
          : session
      )
    }));
  },

  updateSession: (sessionId: string, updates: Partial<Session>) => {
    set((state) => ({
      sessions: state.sessions.map(session =>
        session.session_id === sessionId
          ? { ...session, ...updates }
          : session
      )
    }));
  },

  clearError: () => {
    set({ error: null });
  }
}));

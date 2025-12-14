import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../store/sessionStore';
import { socketService } from '../services/socket';
import XtermWrapper from '../components/terminal/XtermWrapper';
import TerminalControls from '../components/terminal/TerminalControls';
import MetadataDisplay from '../components/dashboard/MetadataDisplay';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Users,
  Crown,
  Eye
} from 'lucide-react';

export default function SessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { sessions, connectionMode, setCurrentSession, setConnectionMode } = useSessionStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = sessions.find((s) => s.session_id === sessionId);

  useEffect(() => {
    if (!sessionId) return;

    setCurrentSession(sessionId);

    // Setup socket listeners
    const unsubAttached = socketService.onAttached(({ mode }) => {
      setIsConnected(true);
      setConnectionMode(mode as 'master' | 'viewer');
      setError(null);
    });

    const unsubModeChanged = socketService.onModeChanged(({ mode, reason }) => {
      setConnectionMode(mode as 'master' | 'viewer');
      if (reason) {
        console.log('[Session] Mode changed:', reason);
      }
    });

    const unsubError = socketService.onError(({ message }) => {
      setError(message);
    });

    const unsubSessionEnded = socketService.onSessionEnded(() => {
      setIsConnected(false);
      setError('Session ended');
    });

    const unsubDetached = socketService.onDetached(() => {
      setIsConnected(false);
    });

    // Attach to session
    socketService.attachSession(sessionId, 'master');

    return () => {
      unsubAttached();
      unsubModeChanged();
      unsubError();
      unsubSessionEnded();
      unsubDetached();

      socketService.detachSession();
      setCurrentSession(null);
      setConnectionMode(null);
    };
  }, [sessionId, setCurrentSession, setConnectionMode]);

  const handleBack = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  const handleRequestMaster = useCallback(() => {
    socketService.requestMaster();
  }, []);

  const handleReleaseMaster = useCallback(() => {
    socketService.releaseMaster();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">No session specified</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      {!isFullscreen && (
        <header className="bg-claude-dark border-b border-gray-800">
          <div className="px-4 h-14 flex items-center justify-between">
            {/* Left side */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-claude-darker rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>

              <div>
                <h1 className="text-lg font-medium text-gray-100">
                  {session?.project_name || 'Unknown Session'}
                </h1>
                {session?.project_path && (
                  <p className="text-sm text-gray-500 truncate max-w-md">
                    {session.project_path}
                  </p>
                )}
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
              {/* Connection status */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    {connectionMode === 'master' ? (
                      <span className="flex items-center gap-1 text-green-400 text-sm">
                        <Crown className="w-4 h-4" />
                        Master
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-400 text-sm">
                        <Eye className="w-4 h-4" />
                        Viewer
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-500 text-sm">Connecting...</span>
                )}

                {session?.attached_clients && session.attached_clients > 1 && (
                  <span className="flex items-center gap-1 text-gray-400 text-sm">
                    <Users className="w-4 h-4" />
                    {session.attached_clients}
                  </span>
                )}
              </div>

              {/* Fullscreen toggle */}
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-claude-darker rounded-lg transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-gray-400" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Terminal */}
        <div className="flex-1 flex flex-col">
          {/* Error message */}
          {error && (
            <div className="px-4 py-2 bg-red-900/30 border-b border-red-700 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Terminal container */}
          <div className="flex-1 bg-black">
            <XtermWrapper
              sessionId={sessionId}
              isConnected={isConnected}
              isReadOnly={connectionMode === 'viewer'}
            />
          </div>

          {/* Terminal controls */}
          <TerminalControls
            mode={connectionMode}
            onRequestMaster={handleRequestMaster}
            onReleaseMaster={handleReleaseMaster}
          />
        </div>

        {/* Sidebar - Metadata */}
        {!isFullscreen && session?.metadata && (
          <aside className="w-80 bg-claude-dark border-l border-gray-800 p-4 hidden lg:block">
            <MetadataDisplay metadata={session.metadata} />
          </aside>
        )}
      </div>
    </div>
  );
}

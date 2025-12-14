import { Session } from '../../store/sessionStore';
import { Terminal, Clock, Users, Trash2 } from 'lucide-react';
import { useSessionStore } from '../../store/sessionStore';
import { useState } from 'react';

interface SessionCardProps {
  session: Session;
  onClick: () => void;
}

export default function SessionCard({ session, onClick }: SessionCardProps) {
  const { deleteSession } = useSessionStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to terminate "${session.project_name}"?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteSession(session.session_id);
    } catch {
      // Error handled by store
    }
    setIsDeleting(false);
  };

  const getStatusColor = () => {
    switch (session.status) {
      case 'active':
        return 'bg-green-400';
      case 'idle':
        return 'bg-yellow-400';
      case 'terminated':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getContextColor = (percent?: number) => {
    if (!percent) return 'text-gray-400';
    if (percent < 50) return 'text-green-400';
    if (percent < 75) return 'text-yellow-400';
    if (percent < 90) return 'text-orange-400';
    return 'text-red-400';
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      onClick={onClick}
      className={`card hover:border-gray-600 cursor-pointer transition-all duration-200 group ${
        session.status === 'terminated' ? 'opacity-60' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-claude-darker rounded-lg">
            <Terminal className="w-5 h-5 text-claude-orange" />
          </div>
          <div>
            <h3 className="font-medium text-gray-100 group-hover:text-primary-400 transition-colors">
              {session.project_name}
            </h3>
            <p className="text-xs text-gray-500 truncate max-w-[180px]">
              {session.project_path || session.session_id.slice(0, 8)}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          {session.status !== 'terminated' && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-900/30 rounded transition-all"
              title="Terminate session"
            >
              {isDeleting ? (
                <div className="spinner w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4 text-red-400" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      {session.metadata && (
        <div className="mb-3 space-y-2">
          {/* Context usage bar */}
          {session.metadata.contextPercent !== undefined && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400">Context</span>
                <span className={getContextColor(session.metadata.contextPercent)}>
                  {session.metadata.contextPercent}%
                </span>
              </div>
              <div className="h-1.5 bg-claude-darker rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    session.metadata.contextPercent < 50
                      ? 'bg-green-500'
                      : session.metadata.contextPercent < 75
                      ? 'bg-yellow-500'
                      : session.metadata.contextPercent < 90
                      ? 'bg-orange-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${session.metadata.contextPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Token usage */}
          {session.metadata.tokenUsage !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Tokens</span>
              <span className="text-gray-300">
                {session.metadata.tokenUsage.toLocaleString()}
              </span>
            </div>
          )}

          {/* Cost */}
          {session.metadata.costUsd !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Cost</span>
              <span className="text-gray-300">
                ${session.metadata.costUsd.toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-800">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(session.last_activity || session.created_at)}
        </div>

        {session.attached_clients !== undefined && session.attached_clients > 0 && (
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {session.attached_clients}
          </div>
        )}

        {session.has_master && (
          <span className="text-yellow-400">Master active</span>
        )}
      </div>
    </div>
  );
}

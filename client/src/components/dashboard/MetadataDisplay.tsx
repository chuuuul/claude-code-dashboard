import { SessionMetadata } from '../../store/sessionStore';
import { Activity, Cpu, DollarSign, MessageSquare, Clock } from 'lucide-react';

interface MetadataDisplayProps {
  metadata: SessionMetadata;
}

export default function MetadataDisplay({ metadata }: MetadataDisplayProps) {
  const getContextColor = (percent?: number) => {
    if (!percent) return 'text-gray-400';
    if (percent < 50) return 'text-green-400';
    if (percent < 75) return 'text-yellow-400';
    if (percent < 90) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
        Session Metadata
      </h3>

      {/* Source badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Data source:</span>
        <span className="px-2 py-0.5 text-xs bg-claude-darker rounded text-gray-400">
          {metadata.source}
        </span>
      </div>

      {/* Context usage */}
      {metadata.contextPercent !== undefined && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">Context Usage</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-claude-darker rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  metadata.contextPercent < 50
                    ? 'bg-green-500'
                    : metadata.contextPercent < 75
                    ? 'bg-yellow-500'
                    : metadata.contextPercent < 90
                    ? 'bg-orange-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${metadata.contextPercent}%` }}
              />
            </div>
            <span className={`text-lg font-medium ${getContextColor(metadata.contextPercent)}`}>
              {metadata.contextPercent}%
            </span>
          </div>
          {metadata.contextPercent >= 90 && (
            <p className="text-xs text-red-400">
              Context nearly full. Consider starting a new session.
            </p>
          )}
        </div>
      )}

      {/* Token usage */}
      {metadata.tokenUsage !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">Token Usage</span>
          </div>
          <p className="text-2xl font-light text-gray-100">
            {metadata.tokenUsage.toLocaleString()}
          </p>
        </div>
      )}

      {/* Cost */}
      {metadata.costUsd !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">Estimated Cost</span>
          </div>
          <p className="text-2xl font-light text-gray-100">
            ${metadata.costUsd.toFixed(4)}
          </p>
        </div>
      )}

      {/* Status */}
      {metadata.status && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">Status</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                metadata.status === 'thinking'
                  ? 'bg-yellow-400 animate-pulse'
                  : metadata.status === 'writing'
                  ? 'bg-blue-400 animate-pulse'
                  : metadata.status === 'reading'
                  ? 'bg-green-400'
                  : 'bg-gray-400'
              }`}
            />
            <span className="text-gray-100 capitalize">{metadata.status}</span>
          </div>
        </div>
      )}

      {/* Last message preview */}
      {metadata.lastMessage && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">Last Message</span>
          </div>
          <p className="text-sm text-gray-300 bg-claude-darker p-3 rounded-lg line-clamp-3">
            {metadata.lastMessage}
          </p>
        </div>
      )}

      {/* Timestamp */}
      {metadata.timestamp && (
        <div className="text-xs text-gray-500">
          Last updated: {new Date(metadata.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

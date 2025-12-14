import { Crown, Eye, Share2, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface TerminalControlsProps {
  mode: 'master' | 'viewer' | null;
  onRequestMaster: () => void;
  onReleaseMaster: () => void;
}

export default function TerminalControls({
  mode,
  onRequestMaster,
  onReleaseMaster
}: TerminalControlsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySessionLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <div className="bg-claude-dark border-t border-gray-800 px-4 py-2 flex items-center justify-between">
      {/* Left side - Mode controls */}
      <div className="flex items-center gap-4">
        {mode === 'master' ? (
          <>
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <Crown className="w-4 h-4" />
              <span>Master Control</span>
            </div>
            <button
              onClick={onReleaseMaster}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Release control
            </button>
          </>
        ) : mode === 'viewer' ? (
          <>
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <Eye className="w-4 h-4" />
              <span>Viewer Mode</span>
            </div>
            <button
              onClick={onRequestMaster}
              className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1 rounded transition-colors"
            >
              Request control
            </button>
          </>
        ) : (
          <div className="text-gray-500 text-sm">Connecting...</div>
        )}
      </div>

      {/* Right side - Share */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopySessionLink}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy link</span>
            </>
          )}
        </button>

        <button
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          title="Share session (coming soon)"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share</span>
        </button>
      </div>
    </div>
  );
}

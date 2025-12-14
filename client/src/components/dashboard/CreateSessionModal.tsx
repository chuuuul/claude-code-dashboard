import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';
import { X, FolderOpen } from 'lucide-react';

interface CreateSessionModalProps {
  onClose: () => void;
}

export default function CreateSessionModal({ onClose }: CreateSessionModalProps) {
  const [projectPath, setProjectPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const { createSession, isLoading, error, clearError } = useSessionStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      const sessionId = await createSession(projectPath, projectName);
      onClose();
      navigate(`/session/${sessionId}`);
    } catch {
      // Error handled by store
    }
  };

  const handlePathChange = (path: string) => {
    setProjectPath(path);

    // Auto-generate project name from path
    if (!projectName || projectName === generateNameFromPath(projectPath)) {
      setProjectName(generateNameFromPath(path));
    }
  };

  const generateNameFromPath = (path: string): string => {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-claude-dark border border-gray-800 rounded-xl w-full max-w-lg p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-claude-darker rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-claude-darker rounded-lg">
            <FolderOpen className="w-5 h-5 text-claude-orange" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100">
              Create New Session
            </h2>
            <p className="text-sm text-gray-400">
              Start a new Claude Code session for your project
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Project path */}
          <div>
            <label
              htmlFor="projectPath"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Project Path
            </label>
            <input
              id="projectPath"
              type="text"
              value={projectPath}
              onChange={(e) => handlePathChange(e.target.value)}
              className="input"
              placeholder="/path/to/your/project"
              required
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500">
              The absolute path to your project directory
            </p>
          </div>

          {/* Project name */}
          <div>
            <label
              htmlFor="projectName"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="input"
              placeholder="My Project"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              A friendly name for this session
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex items-center gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="spinner w-4 h-4" />
                  Creating...
                </>
              ) : (
                'Create Session'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

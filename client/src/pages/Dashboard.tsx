import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore, Session } from '../store/sessionStore';
import { useAuthStore } from '../store/authStore';
import SessionCard from '../components/dashboard/SessionCard';
import CreateSessionModal from '../components/dashboard/CreateSessionModal';
import {
  Terminal,
  Plus,
  RefreshCw,
  LogOut,
  Settings,
  Search
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { sessions, fetchSessions, isLoading, error } = useSessionStore();
  const { user, logout } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchSessions();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSessionClick = (session: Session) => {
    navigate(`/session/${session.session_id}`);
  };

  const filteredSessions = sessions.filter(
    (session) =>
      session.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.project_path?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSessions = filteredSessions.filter((s) => s.status === 'active');
  const idleSessions = filteredSessions.filter((s) => s.status === 'idle');
  const terminatedSessions = filteredSessions.filter((s) => s.status === 'terminated');

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-claude-dark border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-claude-darker rounded-lg">
                <Terminal className="w-6 h-6 text-claude-orange" />
              </div>
              <h1 className="text-xl font-semibold text-gray-100">
                Claude Code Dashboard
              </h1>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                {user?.username}
                {user?.role === 'admin' && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-primary-600 rounded">
                    Admin
                  </span>
                )}
              </span>

              <button
                onClick={() => {}}
                className="p-2 hover:bg-claude-darker rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5 text-gray-400" />
              </button>

              <button
                onClick={handleLogout}
                className="p-2 hover:bg-claude-darker rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchSessions()}
              disabled={isLoading}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Sessions list */}
        {isLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-16">
            <Terminal className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-gray-300 mb-2">
              {searchQuery ? 'No sessions found' : 'No sessions yet'}
            </h2>
            <p className="text-gray-500 mb-6">
              {searchQuery
                ? 'Try a different search term'
                : 'Create a new session to get started'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                Create Session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  Active Sessions ({activeSessions.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeSessions.map((session) => (
                    <SessionCard
                      key={session.session_id}
                      session={session}
                      onClick={() => handleSessionClick(session)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Idle sessions */}
            {idleSessions.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                  Idle Sessions ({idleSessions.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {idleSessions.map((session) => (
                    <SessionCard
                      key={session.session_id}
                      session={session}
                      onClick={() => handleSessionClick(session)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Terminated sessions */}
            {terminatedSessions.length > 0 && (
              <section>
                <h2 className="text-lg font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-gray-500 rounded-full" />
                  Terminated Sessions ({terminatedSessions.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                  {terminatedSessions.map((session) => (
                    <SessionCard
                      key={session.session_id}
                      session={session}
                      onClick={() => handleSessionClick(session)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Create session modal */}
      {showCreateModal && (
        <CreateSessionModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

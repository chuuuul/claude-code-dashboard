# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Session Dashboard - A web-based interface for managing and monitoring Claude Code CLI sessions. The dashboard enables real-time session monitoring across multiple projects, context usage tracking, file management, and remote access via ngrok.

**Current Status:** Planning/documentation phase. See `CLAUDE_CODE_DASHBOARD_PLAN.md` for detailed implementation specifications (v2.1).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 18+, Express, Socket.io, node-pty, tmux |
| Frontend | React 18, Tailwind CSS, xterm.js, Monaco Editor, Zustand |
| Database | SQLite (better-sqlite3) with WAL mode |
| Security | JWT auth, Helmet.js (CSP/HSTS), csurf (CSRF), rate-limiter-flexible |
| Infrastructure | Docker (required for production), ngrok (opt-in) |

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Architecture

### Backend Structure (`/server`)
- `services/SessionManager.js` - tmux session CRUD with UUID v4 IDs, master/viewer mode
- `services/MetadataExtractor.js` - Claude CLI status extraction (JSON API → log files → TUI fallback)
- `services/FileExplorer.js` - File system operations with path traversal protection
- `services/SocketHandler.js` - WebSocket terminal streaming with JWT verification
- `middleware/` - Auth (JWT), rate limiting, input validation, CSRF

### Frontend Structure (`/client/src`)
- `components/terminal/` - xterm.js wrapper and controls
- `components/editor/` - Monaco Editor integration
- `components/dashboard/` - Session cards and metadata display
- `store/` - Zustand stores (auth, session, UI)

### Key Data Flows
1. **Session creation:** API → SessionManager → `execFile('tmux', [...])` → DB
2. **Terminal I/O:** WebSocket (JWT verified) → node-pty → tmux attach
3. **Metadata:** `~/.claude/projects/<hash>/sessions.jsonl` → chokidar watch → Socket.io emit

## Security Requirements (Critical)

- **NEVER use `execSync` or shell-interpreted commands** - always use `execFile`/`spawn`
- **Session IDs must be UUID v4** - validate with `uuid.validate()`
- **Path validation:** Always use `fs.realpath()` + whitelist check with `path.sep`
- **localhost binding by default** - external access requires explicit ngrok opt-in
- **Docker deployment required for production** - non-privileged user, minimal capabilities

### Allowed Paths
Configure via environment variables:
- `ALLOWED_PROJECT_ROOTS` - Directories where sessions can be created
- `ALLOWED_FILE_ROOTS` - Directories accessible via file explorer

## tmux Integration

Uses dedicated socket: `tmux -L claude-dashboard`

Key operations:
- Create: `tmux -L claude-dashboard new-session -d -s <uuid> -c <path> claude`
- Attach: `tmux -L claude-dashboard attach-session -t <uuid> [-r]` (read-only for viewers)
- Input: `tmux -L claude-dashboard send-keys -t <uuid> -l <text>`
- Large input: `spawn('tmux', ['load-buffer', '-'])` with stdin, then `paste-buffer`

## Claude CLI Integration

Metadata extraction priority:
1. `claude --print --output-format json` (if available)
2. `~/.claude/projects/<hash>/sessions.jsonl` file watching
3. `~/.claude/statsig-cache.json` global stats
4. `tmux capture-pane` TUI scraping (fallback)

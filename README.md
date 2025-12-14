# Claude Code Session Dashboard

Claude Code CLI 세션을 웹에서 관리하고 모니터링하는 대시보드

[![CI](https://github.com/USERNAME/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USERNAME/REPO/actions/workflows/ci.yml)
[![Security](https://github.com/USERNAME/REPO/actions/workflows/security.yml/badge.svg)](https://github.com/USERNAME/REPO/actions/workflows/security.yml)
[![Docker](https://github.com/USERNAME/REPO/actions/workflows/docker.yml/badge.svg)](https://github.com/USERNAME/REPO/actions/workflows/docker.yml)

> Replace `USERNAME/REPO` with your GitHub username and repository name

## Getting Started

### Prerequisites

- **Node.js 18+**
- **tmux** installed (`brew install tmux` on macOS, `apt-get install tmux` on Ubuntu)
- **Python 3** and build tools (for node-pty compilation):
  - macOS: `xcode-select --install`
  - Ubuntu: `sudo apt-get install python3 build-essential`

### First Run Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd terminal
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

4. **⚠️ CRITICAL: Set Admin Password**
   
   Edit `.env` and set a secure admin password:
   ```bash
   ADMIN_PASSWORD=YourSecurePassword123!
   ```
   
   **This is REQUIRED for first run.** The system will create an admin user with:
   - Username: `admin`
   - Password: (your ADMIN_PASSWORD value)

5. **Configure allowed directories:**
   
   Edit `.env` and set which directories Claude can access:
   ```bash
   ALLOWED_PROJECT_ROOTS=/Users/you/projects:/home/you/work
   ALLOWED_FILE_ROOTS=/Users/you/projects:/home/you/work
   ```

6. **Start the application:**
   ```bash
   npm run dev
   ```

7. **Access the dashboard:**
   
   Open http://localhost:3000 and login with:
   - Username: `admin`
   - Password: (your ADMIN_PASSWORD)

## Features

- **실시간 세션 모니터링** - 여러 프로젝트의 Claude 세션을 동시에 관리
- **터미널 스트리밍** - xterm.js 기반 웹 터미널
- **컨텍스트 사용량 추적** - 토큰 사용량 및 비용 모니터링
- **파일 탐색기** - Monaco Editor 기반 코드 편집
- **원격 접속** - ngrok 통합 (opt-in)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 18+, Express, Socket.io, node-pty, tmux |
| Frontend | React 18, Vite, Tailwind CSS, xterm.js, Monaco Editor |
| Database | SQLite (better-sqlite3) |
| Auth | JWT + HttpOnly Cookie |

## Prerequisites

- Node.js 18+ (권장: nvm 사용)
- tmux

```bash
# macOS
brew install tmux

# nvm 설치 (Node 버전 관리)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 18
```

## Quick Start

```bash
# 1. 의존성 설치
npm install
cd client && npm install && cd ..

# 2. 환경 변수 설정
cp .env.example .env
# .env에서 ALLOWED_PROJECT_ROOTS 수정

# 3. 실행 (관리자 계정 생성 포함)
ADMIN_PASSWORD="YourSecure123!" npm run dev
```

**접속:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Scripts

```bash
npm run dev          # 개발 서버 (frontend + backend)
npm run build        # 프론트엔드 빌드
npm run start        # 프로덕션 실행
npm run test         # 테스트
npm run lint         # 린트
```

## Docker

```bash
export JWT_SECRET="your-secret-key"
export PROJECT_DIR="$HOME/Documents"

docker-compose up --build
```

### Production Deployment

For production, use Docker (see Dockerfile.production):

```bash
# Build image
docker build -f Dockerfile.production -t claude-dashboard .

# Run with environment variables
docker run -d \
  -e JWT_SECRET=$(openssl rand -base64 32) \
  -e ADMIN_PASSWORD=YourSecurePassword \
  -e ALLOWED_PROJECT_ROOTS=/projects \
  -e ALLOWED_FILE_ROOTS=/projects \
  -v /path/to/your/projects:/projects \
  -p 127.0.0.1:3000:3000 \
  claude-dashboard
```

## Security Notes

- **Access tokens** are stored in memory only (not localStorage) to prevent XSS attacks
- **Refresh tokens** use HttpOnly cookies
- **CSRF protection** is enabled for all state-changing requests
- **Default binding** is `127.0.0.1` (localhost only)
- For remote access, use ngrok (opt-in) or reverse proxy with TLS

## Troubleshooting

### node-pty build fails
Ensure Python 3 and build tools are installed:
```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install python3 build-essential
```

### "Access denied" errors on session creation
Check that `ALLOWED_PROJECT_ROOTS` includes the project directory.

### CSRF token errors
Ensure you're logged in and the frontend fetches a new CSRF token after authentication.

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:unit

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI Workflow**: Runs tests, linting, and builds on Node.js 18.x and 20.x
- **Security Workflow**: Daily security scans with CodeQL, npm audit, and Trivy
- **Docker Workflow**: Multi-platform image builds (amd64, arm64) with automatic releases

For detailed information, see:
- [Workflow Documentation](.github/workflows/README.md)
- [Quick Start Guide](.github/WORKFLOWS_GUIDE.md)

### Pull Docker Image

```bash
# Latest version
docker pull ghcr.io/USERNAME/REPO:latest

# Specific version
docker pull ghcr.io/USERNAME/REPO:1.0.0
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | 서버 포트 | 3000 |
| `JWT_SECRET` | JWT 서명 키 | (required) |
| `ADMIN_PASSWORD` | 초기 관리자 비밀번호 (12자+) | - |
| `ALLOWED_PROJECT_ROOTS` | 세션 생성 허용 경로 | - |
| `ALLOWED_FILE_ROOTS` | 파일 탐색 허용 경로 | - |
| `DB_PATH` | SQLite DB 경로 | ./data/dashboard.db |

## Project Structure

```
├── server/
│   ├── app.js              # Express 진입점
│   ├── services/
│   │   ├── SessionManager.js    # tmux 세션 관리
│   │   ├── SocketHandler.js     # WebSocket 핸들러
│   │   ├── FileExplorer.js      # 파일 시스템 작업
│   │   └── MetadataExtractor.js # Claude 메타데이터 추출
│   ├── routes/             # API 라우트
│   ├── middleware/         # Auth, Rate limiting
│   └── db/                 # SQLite 스키마
├── client/
│   ├── src/
│   │   ├── components/     # React 컴포넌트
│   │   ├── store/          # Zustand 상태관리
│   │   └── services/       # API 서비스
│   └── vite.config.ts
├── docker-compose.yml
└── Dockerfile
```

## Security

- JWT 기반 인증 (Access Token + HttpOnly Refresh Token)
- bcrypt 비밀번호 해싱 (cost 12)
- Helmet.js CSP/HSTS
- 경로 순회 방지 (realpath 검증)
- Rate limiting
- localhost 바인딩 (기본값)

## License

MIT

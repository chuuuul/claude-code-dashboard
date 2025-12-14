# Claude Code Session Dashboard

Claude Code CLI 세션을 웹에서 관리하고 모니터링하는 대시보드

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

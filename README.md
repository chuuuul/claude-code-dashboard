# Claude Code Session Dashboard

Claude Code CLI 세션 관리 웹 대시보드

## Features

- 실시간 세션 모니터링 (여러 프로젝트 동시 관리)
- 컨텍스트 사용량 추적 (Context critical 95%, Context low 10%)
- 진행률 표시
- ngrok 원격 접속 지원
- 파일 탐색기 및 에디터
- Claude에게 명령 전송

## Tech Stack

| 구분 | 기술 |
|-----|------|
| Backend | Node.js, Express, Socket.io, node-pty, tmux |
| Frontend | React, Tailwind CSS, xterm.js, Monaco Editor |
| Infra | Docker, ngrok |

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Documentation

자세한 구현 계획은 [CLAUDE_CODE_DASHBOARD_PLAN.md](./CLAUDE_CODE_DASHBOARD_PLAN.md)를 참고하세요.

## License

MIT

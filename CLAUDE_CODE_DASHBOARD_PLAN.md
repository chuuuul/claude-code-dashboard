# Claude Code 세션 관리 웹 대시보드 구현 계획서

## 1. 프로젝트 개요 (Project Overview)

### 1.1 목적
본 프로젝트는 터미널 기반의 **Claude Code CLI**를 웹 브라우저에서 시각적으로 관리하고 제어하기 위한 **통합 대시보드 시스템**을 구축하는 것을 목적으로 합니다. 로컬 환경뿐만 아니라 원격(Headless) 서버 환경에서도 `ngrok` 등을 통해 안전하게 접속하여, 다수의 프로젝트 세션을 동시에 모니터링하고 제어하며, 파일 시스템 조작까지 가능한 올인원(All-in-One) 인터페이스를 제공합니다.

### 1.2 핵심 기능 요약
1.  **세션 영속성:** 브라우저 종료 후에도 `tmux` 백엔드를 통해 Claude의 작업 상태 유지 및 재연결.
2.  **멀티 세션 대시보드:** 여러 프로젝트(Git Worktree)의 Claude 인스턴스 상태(진행률, 컨텍스트 사용량)를 한눈에 파악.
3.  **웹 터미널 및 에디터:** `xterm.js` 기반의 실시간 터미널과 `Monaco Editor` 기반의 파일 편집 기능 통합.
4.  **원격 접근성:** 클릭 한 번으로 `ngrok` 터널을 생성하여 외부에서 접속 가능.
5.  **파일 시스템 관리:** GUI 기반의 파일 탐색, 생성, 수정, 삭제 기능.

### 1.3 기술 스택
*   **Backend:** Node.js, Express, Socket.io, `node-pty`, `tmux` (OS 레벨)
*   **Frontend:** React, Tailwind CSS, `xterm.js` (터미널), `monaco-editor` (코드 편집), Lucide React (아이콘)
*   **Infrastructure:** Docker (선택), ngrok (원격 접속)

---

## 2. 시스템 아키텍처 (System Architecture)

### 2.1 전체 구조도

```mermaid
graph TD
    User[사용자 (Browser)] -- WebSocket/HTTP --> WebServer[Node.js Server]
    
    subgraph "Server Side"
        WebServer -- "Control" --> SessionManager[Session Manager]
        WebServer -- "File I/O" --> FileSystem[File System API]
        WebServer -- "Tunnel" --> Ngrok[Ngrok Service]
        
        SessionManager -- "Spawn/Attach" --> Tmux[Tmux Server]
        
        subgraph "Tmux Sessions"
            SessionA[Session A: Project Alpha] -- "Runs" --> ClaudeA[Claude CLI Process]
            SessionB[Session B: Project Beta] -- "Runs" --> ClaudeB[Claude CLI Process]
        end
    end
    
    ClaudeA -- "API Calls" --> AnthropicAPI[Anthropic API]
    ClaudeA -- "R/W" --> ProjectFiles[Git Worktrees]
```

### 2.2 컴포넌트 설명
*   **SessionManager:** `tmux` 명령어를 래핑하여 세션 생성, 종료, 상태 조회, 키 입력 전송을 담당합니다.
*   **WebSocketHandler:** 프론트엔드 터미널(`xterm.js`)과 백엔드 `pty` 프로세스 간의 양방향 실시간 데이터 스트리밍을 처리합니다.
*   **LogParser:** Claude CLI의 표준 출력(stdout)을 실시간으로 분석하여 "진행률"이나 "토큰 사용량" 같은 메타데이터를 추출합니다.

### 2.3 데이터 흐름
1.  **입력:** 사용자 웹 터미널 입력 -> Socket.io -> Server -> `tmux send-keys` -> Claude CLI
2.  **출력:** Claude CLI 출력 -> `tmux` pane -> `node-pty` -> Server -> LogParser (메타데이터 추출) -> Socket.io -> 웹 대시보드
3.  **파일:** 사용자 에디터 저장 -> HTTP API -> Server `fs` module -> 실제 파일 쓰기

---

## 3. 백엔드 설계 (Backend Design)

### 3.1 디렉토리 구조
```text
/server
├── config/           # 환경 설정 (포트, 인증키 등)
├── controllers/      # API 요청 처리
├── services/
│   ├── SessionManager.js  # tmux 제어 핵심 로직
│   ├── FileExplorer.js    # 파일 시스템 CRUD
│   ├── SocketHandler.js   # 웹소켓 이벤트 처리
│   ├── AuthManager.js     # 로그인/보안
│   └── NgrokManager.js    # 터널링 제어
├── routes/           # API 라우트 정의
├── utils/            # 파서, 헬퍼 함수
└── app.js            # 진입점
```

### 3.2 핵심 모듈 상세
*   **SessionManager:**
    *   `createSession(projectId)`: `tmux new-session` 실행.
    *   `listSessions()`: `tmux list-sessions` 결과를 파싱하여 JSON 변환.
    *   `killSession(id)`: 세션 종료.
    *   `sendContext(id, context)`: 시스템 프롬프트나 초기 컨텍스트 주입.
*   **FileExplorer:**
    *   보안을 위해 `ALLOW_DIR` 환경변수로 지정된 루트 경로 하위만 접근 허용.
    *   파일 트리를 JSON 구조로 재귀적/지연 로딩 방식으로 반환.
*   **NgrokManager:**
    *   Node.js `ngrok` 패키지를 사용하여 서버 시작 시(또는 요청 시) 터널 생성 및 URL 반환.

### 3.3 API 엔드포인트 설계
*   `GET /api/sessions`: 활성 세션 목록 조회 (상태 포함)
*   `POST /api/sessions`: 새 세션 시작
*   `GET /api/files?path=...`: 파일/폴더 목록 조회
*   `GET /api/files/content?path=...`: 파일 내용 읽기
*   `POST /api/files/save`: 파일 내용 저장
*   `POST /api/tunnel/start`: ngrok 터널링 시작

### 3.4 데이터베이스 스키마 (SQLite - `db.sqlite`)
*   **sessions**: `session_id` (PK), `project_name`, `status` (active/idle), `created_at`, `last_active`
*   **meta_logs**: `session_id`, `token_usage`, `progress_percent`, `context_status`, `timestamp`

---

## 4. 프론트엔드 설계 (Frontend Design)

### 4.1 디렉토리 구조
```text
/client
├── src/
│   ├── components/
│   │   ├── dashboard/    # 세션 카드, 상태 요약
│   │   ├── terminal/     # XtermWrapper
│   │   ├── editor/       # MonacoEditorWrapper
│   │   └── file-tree/    # FileExplorerComponent
│   ├── pages/            # MainDashboard, Login
│   ├── hooks/            # useSocket, useFileSystem
│   ├── services/         # API 호출 래퍼
│   └── store/            # 상태 관리 (Zustand/Context)
```

### 4.2 페이지/컴포넌트 구조
*   **Dashboard (Main):**
    *   **Sidebar:** 파일 탐색기 트리 뷰.
    *   **Main Area:** 탭 인터페이스 (Terminal | Editor).
    *   **Status Bar:** 세션별 "Context Usage", "Progress" 표시.
    *   **Command Input:** 하단에 전역 명령 입력창 (Chat UI 스타일).
*   **SessionCard:** "진행률 70%", "Context critical 95%" 등의 핵심 지표를 시각적(Progress Bar, Color Badge)으로 표현.

### 4.3 상태 관리
*   **Zustand**를 사용하여 전역 세션 상태, 현재 선택된 파일, 터미널 연결 상태 등을 관리.

---

## 5. Claude Code CLI 통합 (Integration Strategy)

### 5.1 세션 생성 흐름
1.  사용자가 웹에서 "새 프로젝트 시작" 클릭.
2.  백엔드가 `git worktree add`로 격리된 작업 공간 생성 (선택 사항).
3.  백엔드가 `tmux new-session -d -s <id> "cd <worktree> && claude"` 실행.
4.  생성된 세션 ID를 반환하고, 웹 터미널이 해당 세션에 `attach` 함.

### 5.2 명령 전송 흐름
*   **직접 입력:** xterm.js의 키 이벤트를 백엔드로 전송 -> `pty.write` -> tmux -> Claude.
*   **명령창 입력:** 하단 채팅 입력창에서 텍스트 전송 -> `tmux send-keys -t <id> "<text>" Enter`.

### 5.3 출력 캡처 및 파싱 (Context/Progress)
Claude Code CLI는 TUI이므로 JSON 출력이 제한적일 수 있습니다. 두 가지 전략을 혼용합니다.
1.  **화면 긁기 (Screen Scraping):** `tmux capture-pane`을 주기적으로 호출하여 현재 화면의 텍스트를 가져옵니다.
2.  **Regex 파싱:** 가져온 텍스트에서 `Context: (\d+)%` 또는 `Cost: \$([\d.]+)` 패턴을 찾아 DB/상태를 업데이트합니다.
    *   *패턴 예시:* `Context critical 95%` -> 경고 알림 발송.

### 5.4 Custom Commands/Skills/MCP 지원
*   웹 UI에 "빠른 명령(Quick Actions)" 버튼을 배치합니다.
*   버튼 클릭 시 `.claude/commands` 폴더에 있는 스크립트 내용을 `tmux send-keys`로 전송하거나 `/command_name` 형태로 입력합니다.

---

## 6. 인증 및 보안 (Security)

### 6.1 Claude Code OAuth 처리
*   **토큰 마운트:** 서버 실행 시 호스트 머신의 `~/.claude_cli` 인증 파일을 컨테이너/서버 내부로 마운트하거나 복사하여 사용합니다. (가장 안정적)
*   **환경 변수:** `ANTHROPIC_API_KEY` 사용이 가능하다면 `.env` 파일로 관리.

### 6.2 대시보드 사용자 인증
*   간단한 **Basic Auth** 또는 **토큰 기반 인증**을 구현하여, ngrok 등 외부 노출 시 아무나 접속하지 못하도록 방어합니다.

### 6.3 ngrok 보안 설정
*   `ngrok` 실행 시 `--auth` 플래그를 사용하여 ngrok 레벨에서의 접근 제어를 추가하거나, `--oauth=google` 옵션(유료 기능)을 활용합니다.

---

## 7. 구현 단계 (Implementation Phases)

### Phase 1: Core (MVP)
*   [ ] Node.js + Express 서버 구축
*   [ ] `tmux` 연동 (생성, 종료, 목록 조회) 기본 로직 구현
*   [ ] React + xterm.js로 단일 세션 웹 터미널 구현
*   [ ] 기본 파일 탐색기 (읽기 전용)

### Phase 2: Multi-Session & Monitoring
*   [ ] 다중 세션 관리 UI (사이드바/카드 뷰)
*   [ ] 로그 파싱 로직 구현 (Context, Progress 추출)
*   [ ] 세션 상태 데이터베이스(SQLite) 연동

### Phase 3: File Management & Editor
*   [ ] Monaco Editor 통합
*   [ ] 파일 생성/수정/삭제 API 및 UI 구현
*   [ ] 파일 경로 복사 등 유틸리티 기능 추가

### Phase 4: Advanced Features
*   [ ] ngrok 원격 접속 통합 (원클릭 URL 생성)
*   [ ] 휴면 세션(Idle) 감지 및 자동 재연결 로직
*   [ ] 명령 입력창(Chat UI) 및 빠른 명령 버튼

### Phase 5: Polish
*   [ ] 다크 모드 UI 최적화
*   [ ] 모바일 반응형 대응 (기본적인 모니터링 가능하도록)
*   [ ] 배포용 Dockerfile 작성

---

## 8. 핵심 구현 코드 예제

### 8.1 SessionManager 클래스 (Node.js)
```javascript
const { spawn, execSync } = require('child_process');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(id, command = 'claude') {
    // tmux 세션이 이미 있는지 확인
    try {
      execSync(`tmux has-session -t ${id} 2>/dev/null`);
      return; // 이미 존재함
    } catch (e) {
      // 새 세션 생성 (Detached)
      spawn('tmux', ['new-session', '-d', '-s', id, command]);
    }
  }

  // tmux capture-pane을 이용한 상태 파싱
  getSessionStatus(id) {
    try {
      const output = execSync(`tmux capture-pane -t ${id} -p`).toString();
      const contextMatch = output.match(/Context.*?(\d+)%/);
      const progressMatch = output.match(/Step.*?(\d+)\/(\d+)/);
      
      return {
        context: contextMatch ? parseInt(contextMatch[1]) : 0,
        progress: progressMatch ? `${progressMatch[1]}/${progressMatch[2]}` : null
      };
    } catch (e) {
      return null;
    }
  }
}
module.exports = new SessionManager();
```

### 8.2 WebSocket 핸들러 (Socket.io + node-pty)
```javascript
// server/services/SocketHandler.js
const pty = require('node-pty');

module.exports = (io) => {
  io.on('connection', (socket) => {
    let term = null;

    socket.on('attach', (sessionId) => {
      // tmux attach 프로세스를 pty로 실행
      term = pty.spawn('tmux', ['attach', '-t', sessionId], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
      });

      term.onData((data) => socket.emit('output', data));
      
      socket.on('input', (data) => term.write(data));
      socket.on('resize', (size) => term.resize(size.cols, size.rows));
      
      // 세션 종료 처리
      term.onExit(() => {
        socket.emit('session-ended');
      });
    });

    socket.on('disconnect', () => {
      if (term) term.kill(); // pty 프로세스만 종료 (tmux 세션은 유지됨)
    });
  });
};
```

---

## 9. 배포 전략 (Deployment)

### 9.1 로컬 개발 환경
*   `npm run dev` (Concurrently로 서버/클라이언트 동시 실행)

### 9.2 서버 배포 (Docker)
Docker 컨테이너 내에서 `tmux`와 `claude`를 실행하려면 TTY 권한과 볼륨 마운트가 중요합니다.

```dockerfile
FROM node:18-bullseye
RUN apt-get update && apt-get install -y tmux git curl
# Claude CLI 설치 (가정)
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server/app.js"]
```

### 9.3 ngrok 자동화
서버 시작 스크립트에 `ngrok` 터널링을 포함하여, 실행 시 콘솔에 접속 URL을 출력하도록 설정합니다.

---

## 10. 리스크 및 해결 방안

1.  **Claude CLI 출력 파싱의 취약성:** CLI 업데이트로 UI 텍스트가 변경되면 파싱이 깨질 수 있습니다.
    *   *해결:* 파싱 로직을 정규식 기반 설정 파일로 분리하여 코드 수정 없이 패턴 업데이트가 가능하도록 설계합니다.
2.  **보안 문제:** 웹 터미널은 서버 쉘에 대한 루트 권한을 가질 수 있습니다.
    *   *해결:* `tmux` 실행 계정을 권한이 제한된 사용자로 설정하고, 파일 탐색기의 접근 경로를 철저히 제한합니다 (Jail).

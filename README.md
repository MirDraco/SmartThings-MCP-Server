# SmartThings MCP Server

Samsung SmartThings 기기를 **AI 에이전트가 직접 제어**할 수 있게 해주는 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 서버입니다.

MCP를 지원하는 에이전트(예: **NanoClaw**, Claude Desktop 등)가 집안의 조명·플러그·에어컨·씬(Scene) 등을 조회하고 제어할 수 있습니다.

이 프로젝트는 미니 PC 홈서버(Ubuntu + Docker)에서 상시 구동하는 것을 전제로 설계되었습니다.

> **🔑 인증 방식 (중요)**
> SmartThings의 Personal Access Token(PAT)은 **24시간 뒤 만료**되어 무인 운영에 부적합합니다.
> 그래서 이 서버는 **공식 SmartThings CLI를 브리지(bridge)** 로 사용합니다. CLI는 OAuth
> access token과 **refresh token**을 저장하고, access token이 만료되면 **자동으로 갱신**합니다.
> 따라서 CLI를 한 번만 인증해두면 이후 **토큰 걱정 없이 무인 운영**이 됩니다.

---

## ✨ 주요 기능 (MCP Tools)

에이전트에게 노출되는 도구 목록입니다.

| 도구 | 설명 |
| --- | --- |
| `list_locations` | 계정의 모든 위치(집) 조회 |
| `list_rooms` | 특정 위치의 방 목록 조회 |
| `list_devices` | 모든 기기와 각 기기의 capability(제어 기능) 조회 — **가장 먼저 호출** |
| `get_device` | 특정 기기의 상세 메타데이터 조회 |
| `get_device_status` | 특정 기기의 현재 상태(켜짐/꺼짐, 밝기, 온도 등) 조회 |
| `execute_device_command` | 기기에 명령 전송 (켜기/끄기/밝기 조절 등) |
| `list_scenes` | 실행 가능한 씬 목록 조회 |
| `execute_scene` | 씬 실행 |

---

## 🏗️ 아키텍처

```
┌────────────────────┐   MCP (HTTP/stdio)   ┌───────────────────────┐   shell   ┌──────────────┐   HTTPS   ┌──────────────┐
│  NanoClaw 에이전트  │ ───────────────────▶ │  SmartThings MCP 서버  │ ────────▶ │ smartthings  │ ────────▶ │ SmartThings  │
│  (~/nanoclaw-v2)   │ ◀─────────────────── │   (Docker 컨테이너)     │ ◀──────── │     CLI      │ ◀──────── │   (cloud)    │
└────────────────────┘                      └───────────────────────┘           └──────────────┘           └──────────────┘
                                                                                        │
                                                                          credentials.json (OAuth,
                                                                          refresh token 자동 갱신)
```

- MCP 서버는 요청을 받으면 내부적으로 **`smartthings` CLI를 호출**합니다.
- CLI는 마운트된 `credentials.json`의 OAuth 토큰을 사용하고, 만료되면 **자동 갱신**합니다.
- **HTTP 모드**: 컨테이너로 상시 구동. NanoClaw가 네트워크로 접속. (권장, 기본값)
- **stdio 모드**: 에이전트가 프로세스를 직접 실행하는 방식. 로컬 통합용.

---

## 📋 사전 준비물

- 서버: Ubuntu (테스트 환경: Ubuntu 26.04 / N150 / 16GB RAM 미니 PC)
- Docker & Docker Compose
- SmartThings 계정 및 등록된 기기
- **브라우저가 있는 PC** (CLI 최초 인증용 — 서버에 브라우저가 없어도 됩니다)

---

## 🔑 1단계: SmartThings CLI 인증 (한 번만)

CLI는 로그인 시 OAuth access token + **refresh token**을 로컬 파일에 저장합니다.
서버(미니 PC)에는 보통 브라우저가 없으므로, **브라우저가 있는 일반 PC**에서 먼저 인증한 뒤
그 자격증명 파일을 서버로 복사합니다.

### 1-1. 일반 PC(브라우저 있음)에서 CLI 설치 & 로그인

```bash
npm install -g @smartthings/cli

# 아무 조회 명령이나 실행하면 브라우저가 열리며 로그인 진행됩니다
smartthings devices
```

브라우저에서 Samsung 계정 로그인 → 권한 허용을 마치면, 터미널에 기기 목록이 표시됩니다.

> Node 버전이 22 이상이면 CLI가 불안정할 수 있습니다. 문제가 있으면 **Node 20 LTS**를 사용하세요.

### 1-2. 자격증명 파일 위치 확인

로그인이 성공하면 아래 위치에 `credentials.json`이 생성됩니다.

| OS | 경로 |
| --- | --- |
| Linux | `~/.config/@smartthings/cli/credentials.json` |
| macOS | `~/Library/Preferences/@smartthings/cli/credentials.json` |
| Windows | `C:\Users\<사용자>\AppData\Local\@smartthings\cli\Data\credentials.json` |

파일 구조 (토큰 값은 예시):

```json
{
  "default:api.smartthings.com": {
    "accessToken": "...",
    "refreshToken": "...",
    "expires": "2026-...",
    "scope": [ "r:devices:*", "x:devices:*", "..." ]
  }
}
```

### 1-3. 서버로 자격증명 복사

서버의 **CLI 표준 경로**(`~/.config/@smartthings/cli/`)에 이 파일을 넣습니다.

```bash
# 서버에서
mkdir -p ~/.config/@smartthings/cli
nano ~/.config/@smartthings/cli/credentials.json
# 위 PC에서 복사한 JSON 내용을 붙여넣고 저장
```

> `scp`가 가능하면: `scp credentials.json user@서버IP:~/.config/@smartthings/cli/`

### 1-4. 서버에서 동작 확인 (선택)

서버에도 CLI가 설치돼 있다면:

```bash
smartthings devices     # 기기 목록이 나오면 성공
```

이제 서버 CLI가 refresh token으로 **자동 갱신**합니다. 이후 토큰 관리는 신경 쓸 필요 없습니다.

---

## 🚀 2단계: 서버에서 Docker로 실행

### 2-1. 저장소 클론

```bash
git clone https://github.com/MirDraco/Samsung-SmartThings-MCP-server-for-NanoClaw-Agent.git
cd Samsung-SmartThings-MCP-server-for-NanoClaw-Agent
```

### 2-2. 환경변수 설정

```bash
cp .env.example .env
nano .env
```

```env
# CLI 자격증명이 있는 호스트 디렉터리 (1단계에서 파일을 넣은 곳의 상위)
SMARTTHINGS_CLI_DIR=~/.config/@smartthings
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000

# 네트워크에 노출한다면 반드시 인증 토큰을 설정하세요 (아무 랜덤 문자열)
MCP_HTTP_AUTH_TOKEN=원하는-임의의-비밀키
```

> `docker-compose.yml`은 `SMARTTHINGS_CLI_DIR` 디렉터리를 컨테이너에 **읽기/쓰기**로 마운트합니다
> (CLI가 갱신된 토큰을 다시 써야 하므로 읽기 전용이면 안 됩니다).

### 2-3. 빌드 & 실행

```bash
docker compose up -d --build
```

### 2-4. 동작 확인

```bash
curl http://localhost:3000/health
# -> {"status":"ok"}

docker compose logs -f
```

정상이라면 `SmartThings MCP server running on http://0.0.0.0:3000/mcp` 로그가 보입니다.

---

## 🤖 NanoClaw 에이전트 연동

NanoClaw(`/nanoclaw-v2`)에서 MCP 서버를 등록합니다. NanoClaw는 MCP 클라이언트로 이 서버에 접속합니다.

### HTTP 방식 (권장 — 컨테이너 상시 구동)

NanoClaw의 MCP 설정 파일에 아래와 같이 추가합니다. (설정 파일 형식은 NanoClaw 버전에 따라 다를 수 있으니 아래 값을 참고해 맞추세요.)

```json
{
  "mcpServers": {
    "smartthings": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer 원하는-임의의-비밀키"
      }
    }
  }
}
```

- 같은 미니 PC에서 NanoClaw와 컨테이너가 함께 돈다면 `localhost:3000` 사용.
- NanoClaw가 다른 머신에 있다면 `http://<서버IP>:3000/mcp`.
- `Authorization` 값은 `.env`의 `MCP_HTTP_AUTH_TOKEN`과 동일해야 합니다.

### stdio 방식 (에이전트가 프로세스를 직접 실행)

컨테이너 대신 에이전트가 서버를 자식 프로세스로 띄우는 방식입니다.
이 경우 호스트에 `smartthings` CLI가 설치·인증돼 있어야 합니다.

```json
{
  "mcpServers": {
    "smartthings": {
      "command": "node",
      "args": ["/path/to/repo/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

> stdio 방식은 먼저 `npm install && npm run build`로 `dist/`를 생성해야 합니다.

---

## 🧪 로컬 개발 (컨테이너 없이)

호스트에 `smartthings` CLI가 설치·인증돼 있어야 합니다 (1단계 참고).

```bash
npm install
cp .env.example .env   # 필요 시 값 조정
npm run dev            # tsx watch 모드
# 또는
npm run build && npm start
```

### 예시: 기기 제어 흐름

에이전트는 보통 다음 순서로 동작합니다.

1. `list_devices` → 기기 ID와 capability 확인
2. `get_device_status` → 현재 상태 확인 (선택)
3. `execute_device_command` → 명령 실행

명령 예시 (`execute_device_command` 인자):

```jsonc
// 조명 켜기
{ "deviceId": "abc-123", "commands": [ { "capability": "switch", "command": "on" } ] }

// 밝기 50%로 설정
{ "deviceId": "abc-123", "commands": [ { "capability": "switchLevel", "command": "setLevel", "arguments": [50] } ] }

// 에어컨을 냉방 모드로
{ "deviceId": "ac-456", "commands": [ { "capability": "airConditionerMode", "command": "setAirConditionerMode", "arguments": ["cool"] } ] }
```

capability와 command 이름은 [SmartThings Capabilities 레퍼런스](https://developer.smartthings.com/docs/devices/capabilities/capabilities-reference)를 참고하세요.

---

## ⚙️ 환경변수 레퍼런스

| 변수 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `SMARTTHINGS_CLI_DIR` | | `~/.config/@smartthings` | 호스트의 CLI 자격증명/설정 디렉터리 (컨테이너에 마운트) |
| `SMARTTHINGS_CLI_PATH` | | `smartthings` | 컨테이너 내 CLI 실행 파일 경로 |
| `MCP_TRANSPORT` | | `stdio` | `stdio` 또는 `http` (컨테이너는 `http`) |
| `MCP_HTTP_HOST` | | `0.0.0.0` | HTTP 바인딩 호스트 |
| `MCP_HTTP_PORT` | | `3000` | HTTP 포트 |
| `MCP_HTTP_AUTH_TOKEN` | | (없음) | 설정 시 Bearer 인증 요구 |

---

## 🔒 보안 권장사항

- **네트워크에 포트를 노출한다면 반드시 `MCP_HTTP_AUTH_TOKEN`을 설정하세요.**
- 가능하면 서버를 신뢰된 LAN 내부에서만 접근 가능하게 두고, 방화벽으로 3000 포트를 제한하세요.
- `credentials.json`에는 OAuth 토큰이 들어있으니 **절대 커밋/공유하지 마세요.**
- `.env` 파일도 커밋하지 마세요 (`.gitignore`에 이미 포함됨).
- 외부 인터넷 노출이 필요하면 리버스 프록시(nginx/Caddy) + HTTPS + 인증을 앞단에 두세요.

---

## 🛠️ 문제 해결

| 증상 | 원인/해결 |
| --- | --- |
| `SmartThings CLI error ... not logged in` | 자격증명 미마운트/미인증. 1단계 다시 확인 |
| `smartthings: not found` | 컨테이너에 CLI 미설치 — `docker compose up --build`로 재빌드 |
| 기기가 안 보임 | 마운트한 계정에 기기가 없거나 scope 부족. `smartthings devices`로 확인 |
| 토큰 만료 반복 | 마운트가 **읽기 전용**이면 갱신 실패 — 볼륨이 rw인지 확인 |
| CLI가 크래시 | Node 버전 문제. 이미지가 Node 20을 쓰는지 확인 |
| NanoClaw가 접속 실패 | URL/포트/`Authorization` 헤더, 컨테이너 상태(`docker compose ps`) 확인 |

로그 확인:

```bash
docker compose logs -f smartthings-mcp
```

---

## 📁 프로젝트 구조

```
.
├── src/
│   ├── index.ts        # 진입점, stdio/HTTP 트랜스포트 설정
│   ├── server.ts       # MCP 서버 및 도구(tool) 정의
│   ├── smartthings.ts  # SmartThings CLI 브리지 클라이언트
│   └── config.ts       # 환경변수 로딩/검증
├── Dockerfile          # 멀티스테이지 빌드 (+ smartthings CLI 설치)
├── docker-compose.yml  # 상시 구동용 compose (+ credentials 볼륨 마운트)
├── .env.example        # 환경변수 템플릿
├── package.json
└── tsconfig.json
```

---

## 📜 라이선스

MIT — 자세한 내용은 [LICENSE](./LICENSE) 참고.

---

## 🙏 참고 링크

- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [SmartThings Developer Docs](https://developer.smartthings.com/docs/api/public)
- [SmartThings Capabilities Reference](https://developer.smartthings.com/docs/devices/capabilities/capabilities-reference)

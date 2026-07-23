# SmartThings MCP Server

Samsung SmartThings 기기를 **AI 에이전트가 직접 제어**할 수 있게 해주는 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 서버입니다.

SmartThings Personal Access Token(PAT) 하나만 발급받으면, MCP를 지원하는 에이전트(예: **NanoClaw**, Claude Desktop 등)가 집안의 조명·플러그·에어컨·씬(Scene) 등을 조회하고 제어할 수 있습니다.

이 프로젝트는 미니 PC 홈서버(Ubuntu + Docker)에서 상시 구동하는 것을 전제로 설계되었습니다.

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
┌────────────────────────┐        MCP (HTTP/stdio)      ┌──────────────────────┐        HTTPS        ┌───────────────────┐
│   NanoClaw 에이전트     │  ─────────────────────────▶  │ SmartThings MCP 서버  │  ───────────────▶  │  SmartThings API   │
│   (/nanoclaw-v2)       │  ◀─────────────────────────  │   (Docker 컨테이너)    │  ◀───────────────  │  (cloud)          │
└────────────────────────┘                              └──────────────────────┘                     └───────────────────┘
                                                                                                              │
                                                                                                              ▼
                                                                                                    실제 SmartThings 기기
                                                                                                  (조명, 플러그, 에어컨 등)
```

- **HTTP 모드**: 컨테이너로 상시 구동. NanoClaw가 네트워크로 접속. (권장, 기본값)
- **stdio 모드**: 에이전트가 프로세스를 직접 실행하는 방식. 로컬 통합용.

---

## 📋 사전 준비물

- 서버: Ubuntu (테스트 환경: Ubuntu 26.04 / N150 / 16GB RAM 미니 PC)
- Docker & Docker Compose
- SmartThings 계정 및 등록된 기기
- **SmartThings Personal Access Token (PAT)**

### SmartThings 토큰(PAT) 발급 방법

1. https://account.smartthings.com/tokens 접속 후 로그인
2. **Generate new token** 클릭
3. 토큰 이름 입력 (예: `mcp-server`)
4. 아래 **scope(권한)** 를 선택:
   - Devices: `List all devices`, `See all devices`, `Control all devices`
   - Locations: `See all locations`
   - Scenes: `See all scenes`, `Control all scenes`
   
   > 최소 권장 scope: `r:devices:*`, `x:devices:*`, `r:locations:*`, `r:scenes:*`, `x:scenes:*`
5. **Generate token** 클릭 → 표시된 토큰 문자열을 **즉시 복사**해 두세요. (다시 볼 수 없습니다.)

> ⚠️ 참고: SmartThings는 신규 PAT의 유효기간을 24시간으로 제한하는 방향으로 정책을 변경 중입니다. 장기 무인 운영이 필요하면 [SmartApp / OAuth 방식](https://developer.smartthings.com/docs/getting-started/authorization-and-permissions)을 고려하세요. 개인용/테스트에는 PAT로 충분합니다.

---

## 🚀 빠른 시작 (서버에서 Docker로 실행)

### 1. 저장소 클론

```bash
git clone https://github.com/MirDraco/smartthings-mcp-server.git
cd smartthings-mcp-server
```

### 2. 환경변수 설정

```bash
cp .env.example .env
nano .env
```

`.env` 파일에 발급받은 토큰을 입력합니다:

```env
SMARTTHINGS_TOKEN=발급받은-토큰-문자열
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000

# 네트워크에 노출한다면 반드시 인증 토큰을 설정하세요 (아무 랜덤 문자열)
MCP_HTTP_AUTH_TOKEN=원하는-임의의-비밀키
```

### 3. 빌드 & 실행

```bash
docker compose up -d --build
```

### 4. 동작 확인

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

```json
{
  "mcpServers": {
    "smartthings": {
      "command": "node",
      "args": ["/path/to/smartthings-mcp-server/dist/index.js"],
      "env": {
        "SMARTTHINGS_TOKEN": "발급받은-토큰",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

> stdio 방식은 먼저 `npm install && npm run build`로 `dist/`를 생성해야 합니다.

---

## 🧪 로컬 개발 (컨테이너 없이)

```bash
npm install
cp .env.example .env   # 토큰 입력
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
| `SMARTTHINGS_TOKEN` | ✅ | — | SmartThings PAT |
| `MCP_TRANSPORT` | | `stdio` | `stdio` 또는 `http` |
| `MCP_HTTP_HOST` | | `0.0.0.0` | HTTP 바인딩 호스트 |
| `MCP_HTTP_PORT` | | `3000` | HTTP 포트 |
| `MCP_HTTP_AUTH_TOKEN` | | (없음) | 설정 시 Bearer 인증 요구 |
| `SMARTTHINGS_API_BASE` | | `https://api.smartthings.com/v1` | API base URL |

---

## 🔒 보안 권장사항

- **네트워크에 포트를 노출한다면 반드시 `MCP_HTTP_AUTH_TOKEN`을 설정하세요.**
- 가능하면 서버를 신뢰된 LAN 내부에서만 접근 가능하게 두고, 방화벽으로 3000 포트를 제한하세요.
- `.env` 파일은 절대 커밋하지 마세요 (`.gitignore`에 이미 포함됨).
- 외부 인터넷 노출이 필요하면 리버스 프록시(nginx/Caddy) + HTTPS + 인증을 앞단에 두세요.

---

## 🛠️ 문제 해결

| 증상 | 원인/해결 |
| --- | --- |
| `Missing required environment variable: SMARTTHINGS_TOKEN` | `.env`에 토큰이 없음 |
| `SmartThings API error (401)` | 토큰 만료/오타 또는 scope 부족 |
| `SmartThings API error (403)` | 해당 작업 권한(scope) 부족 |
| 기기가 안 보임 | 토큰의 location/device scope 확인, `list_locations`로 위치부터 확인 |
| NanoClaw가 접속 실패 | URL/포트/`Authorization` 헤더, 컨테이너 실행 상태(`docker compose ps`) 확인 |

로그 확인:

```bash
docker compose logs -f smartthings-mcp
```

---

## 📁 프로젝트 구조

```
smartthings-mcp-server/
├── src/
│   ├── index.ts        # 진입점, stdio/HTTP 트랜스포트 설정
│   ├── server.ts       # MCP 서버 및 도구(tool) 정의
│   ├── smartthings.ts  # SmartThings REST API 클라이언트
│   └── config.ts       # 환경변수 로딩/검증
├── Dockerfile          # 멀티스테이지 빌드
├── docker-compose.yml  # 상시 구동용 compose
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

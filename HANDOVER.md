# Handover Document — JetBrains CC GUI: OpenClaude, CrewAI & 9Router Integration

**Date:** 2026-05-07
**Author:** Avi Bendetsky + Claude Opus 4.6
**Repo:** [BAS-More/jetbrains-cc-gui](https://github.com/BAS-More/jetbrains-cc-gui)
**Branch:** `main`
**Commits:** `5f9522f9`, `0990b706`, `568fa406`
**Files changed:** 36 files, +1538 / -19 lines

---

## 1. What Was Done

Three new AI providers were integrated end-to-end into the JetBrains CC GUI IntelliJ plugin:

| Provider | Purpose | Bridge Type |
|---|---|---|
| **OpenClaude (OCC)** | Open-source Claude Code CLI rebuild | `OpenClaudeSDKBridge` extends `BaseSDKBridge` |
| **CrewAI** | Multi-agent framework (Python) | `CrewAISDKBridge` extends `BaseSDKBridge` |
| **9Router** | AI proxy/router (port 20128) | `NineRouterClient` — pure Java HttpClient |

All three are now selectable in the plugin's provider dropdown and wired through the full message pipeline.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│           JetBrains IDE (IntelliJ/PyCharm)       │
│  ┌─────────────────────────────────────────────┐ │
│  │         Webview (React/TypeScript)           │ │
│  │  Provider selector → Chat UI → Tool display │ │
│  └──────────────┬──────────────────────────────┘ │
│                 │ postMessage                     │
│  ┌──────────────▼──────────────────────────────┐ │
│  │         Java Plugin Layer                    │ │
│  │  ClaudeChatWindow → ClaudeSession            │ │
│  │  SessionProviderRouter → SessionSendService  │ │
│  │  ┌────────┐ ┌────────┐ ┌──────┐ ┌────────┐  │ │
│  │  │Claude  │ │Codex   │ │OCC   │ │CrewAI  │  │ │
│  │  │SDKBrdge│ │SDKBrdge│ │Bridge│ │Bridge  │  │ │
│  │  └───┬────┘ └───┬────┘ └──┬───┘ └───┬────┘  │ │
│  └──────┼──────────┼─────────┼─────────┼───────┘ │
└─────────┼──────────┼─────────┼─────────┼─────────┘
          │          │         │         │
          ▼          ▼         ▼         ▼
      ai-bridge   ai-bridge   occ CLI   FastAPI
      (Node.js)   (Node.js)   (Node)    (Python)
                                │         │
                     ┌──────────┴─────────┘
                     ▼
              9Router (:20128)
              AI proxy / token mgmt
```

---

## 3. Files Created

### Java — Provider Bridges

| File | Description |
|---|---|
| `provider/openclaude/OpenClaudeSDKBridge.java` | Spawns `occ` CLI, parses streaming events |
| `provider/crewai/CrewAISDKBridge.java` | Connects to CrewAI FastAPI bridge |
| `provider/ninerouter/NineRouterClient.java` | Pure Java HttpClient for 9Router proxy |

### AI-Bridge — Node.js Channels

| File | Description |
|---|---|
| `ai-bridge/channels/openclaude-channel.js` | Spawns `occ`, translates events to tagged-line protocol |
| `ai-bridge/channels/crewai-channel.js` | HTTP client to CrewAI FastAPI, SSE stream parsing |
| `ai-bridge/channels/ninerouter-channel.js` | Health check & proxy routing via 9Router |
| `ai-bridge/utils/sdk-loader.js` | Dynamic SDK resolution from `~/.codemoss/dependencies/` |

---

## 4. Files Modified

### Java — Session Layer

| File | Change |
|---|---|
| `session/ClaudeSession.java` | Added nullable fields for OCC/CrewAI bridges; new 4-bridge constructor |
| `session/SessionProviderRouter.java` | Routes "openclaude"/"crewai" to correct bridge with null guards |
| `session/SessionSendService.java` | Added `sendToOpenClaude()`, `sendToCrewAI()` methods; 11-param constructor |
| `session/SessionLifecycleManager.java` | Extended `SessionHost` interface with `getOpenClaudeSDKBridge()` / `getCrewAISDKBridge()` |
| `ui/toolwindow/ClaudeChatWindow.java` | Instantiates both new bridges; passes to session; dispose() cleanup |

### Java — Supporting

| File | Change |
|---|---|
| `provider/common/BaseSDKBridge.java` | Added 4-arg `executeStreamingCommand()` convenience overload |
| `dependency/SdkDefinition.java` | Maps "openclaude"/"crewai" to `CLAUDE_SDK` |
| `handler/provider/ModelProviderHandler.java` | Gemini model context limits; skip Claude-specific resolution for non-Claude providers |
| `handler/provider/ProviderHandler.java` | Javadoc for env-var config approach |

### Webview — TypeScript/React

| File | Change |
|---|---|
| `types/aiFeatureConfig.ts` | Extended `AiFeatureProvider` union type |
| `types/promptEnhancer.ts` | Added OCC/CrewAI to defaults |
| `components/ChatInputBox/types.ts` | Added to `AVAILABLE_PROVIDERS` array |
| `components/ChatInputBox/selectors/RuntimeProviderSelect.tsx` | Extended `ProviderKind`, provider state |
| `hooks/useModelProviderState.ts` | Provider persistence and SDK mapping |
| `settings/AiFeatureProviderModelPanel/index.tsx` | Provider dropdown entries |
| 10x `i18n/locales/*.json` | Provider labels in all languages |

### Build

| File | Change |
|---|---|
| `build.gradle` | JDK 21 toolchain; `installAiBridgeDeps` task; dev bridge path fallback |
| `gradle.properties` | IPv4 preference for Gradle daemon |

---

## 5. Tagged-Line Protocol

All providers communicate via the same protocol through ai-bridge:

```
[SESSION_ID]<sessionId>          — session identifier
[MESSAGE_START]                  — begin response
[CONTENT_DELTA]<text>            — streaming text chunk
[THINKING]<text>                 — reasoning/thinking block
[MESSAGE]<json>                  — complete message object
[SEND_ERROR]<message>            — error during send
[MESSAGE_END]                    — end of response
```

---

## 6. How to Build & Run

### Prerequisites
- JDK 21 (found at `C:\Program Files\Android\openjdk\jdk-21.0.8`)
- Node.js 18+ (found at `C:\Program Files\nodejs\node.exe`, v24.14.0)
- npm (bundled with Node.js)

### Build & Launch

```powershell
cd C:\Dev\tools\jetbrains-cc-gui
$env:JAVA_HOME = "C:\Program Files\Android\openjdk\jdk-21.0.8"
.\gradlew.bat runIde
```

The build will automatically:
1. Run `installAiBridgeDeps` → installs `node_modules` in `ai-bridge/`
2. Run `buildWebview` → compiles React webview
3. Run `packageAiBridge` → creates `ai-bridge.zip`
4. Set `claude.bridge.path` → points to source `ai-bridge/` for dev
5. Launch IntelliJ IDEA sandbox with the plugin

### For Distribution

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\openjdk\jdk-21.0.8"
.\gradlew.bat buildPlugin
```

Output: `build/distributions/idea-claude-code-gui-0.4.1.zip`

---

## 7. Runtime Dependencies (External Services)

| Service | Required For | How to Start |
|---|---|---|
| **OpenClaude (occ)** | OCC provider | `npx @ruvnet/open-claude-code` or install globally |
| **CrewAI FastAPI** | CrewAI provider | `cd C:\Dev\tools\CrewAI-Studio\bridge && uvicorn api:app --port 8000` |
| **9Router** | AI proxy routing | `cd C:\Dev\tools\9router && npm start` (port 20128) |

None of these are required for the base Claude/Codex providers to work.

---

## 8. Known Issues & Remaining Work

### Resolved This Session
- [x] Compile error: `BaseSDKBridge` missing 4-arg `executeStreamingCommand` → added overload
- [x] TypeScript error: `promptEnhancer.ts` missing OCC/CrewAI entries → added
- [x] JDK 17 toolchain not found → changed to JDK 21
- [x] `ai-bridge/node_modules` missing → added `installAiBridgeDeps` Gradle task
- [x] `aiBridgeDir` forward-reference in `runIde` → use inline `file("ai-bridge")`

### Open Items
- [ ] **CrewAI FastAPI bridge does not exist yet** — `C:\Dev\tools\CrewAI-Studio\bridge\api.py` needs to be created (see integration plan Phase 2)
- [ ] **9Router not wired to providers** — providers still call AI APIs directly (Phase 1)
- [ ] **OCC binary must be in PATH** — fallback to `npx` if not found
- [ ] **No shared session state** between providers (Phase 7)
- [ ] **CLI theme** — CloudCLI-style look not yet applied (Phase 5)
- [ ] **Stack health indicator** — no unified health check (Phase 6)

### Integration Plan Reference
Full 7-phase plan at: `C:\Dev\tools\claudecodeui\plans\INTEGRATION_PLAN.md`

---

## 9. Key Design Decisions

1. **OCC and CrewAI bridges are nullable** — The plugin works fine without them. Null guards in `SessionProviderRouter` and `SessionSendService` prevent NPEs when these providers aren't available.

2. **NineRouterClient is NOT a BaseSDKBridge** — It's infrastructure (proxy), not a chat provider. Pure Java HttpClient, no Node.js dependency.

3. **SDK packages excluded from ai-bridge.zip** — `@anthropic-ai/*` and `@openai/*` are loaded at runtime from `~/.codemoss/dependencies/`, keeping the plugin package small.

4. **JDK 21 compiles to Java 17 bytecode** — `toolchain = 21`, `sourceCompatibility = 17`. This maintains compatibility with IntelliJ 2023.3+.

5. **Backward-compatible constructors** — `ClaudeSession` has a 2-bridge constructor that delegates to the 4-bridge constructor with `null, null`, so existing code doesn't break.

---

## 10. Repository & Deployment

- **Source:** https://github.com/BAS-More/jetbrains-cc-gui
- **Upstream fork:** https://github.com/zhukunpenglinyutong/jetbrains-cc-gui
- **NEVER push to:** `siteboon/claudecodeui`
- **TDD Policy:** Always RED → GREEN → REFACTOR, no exceptions

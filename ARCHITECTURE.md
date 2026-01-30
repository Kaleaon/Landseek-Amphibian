# 🏗️ Architecture: Landseek-Amphibian

## Overview

This document defines the technical architecture for embedding the OpenClaw agent runtime inside the Landseek Android application.

## 1. The Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **UI** | Kotlin + Jetpack Compose | User interface, chat rendering, voice input. |
| **Bridge** | JNI / WebSocket (Localhost) | Communication channel between Android JVM and Node.js. |
| **Protocol** | **MCP (Model Context Protocol)** | Standard for connecting the Agent to Tools (Jules, Context7, Stitch). |
| **Runtime** | Node.js (v22+ arm64) | The execution environment for OpenClaw. |

## 2. Component Diagram

```mermaid
graph TD
    User[User] --> UI[Android UI (Kotlin)]
    
    subgraph "Android APK Process"
        UI -- Intent/IPC --> Service[Amphibian Background Service]
        
        subgraph "Embedded Node Environment (MCP Host)"
            Service -- Spawns --> NodeBin[Node.js Binary]
            NodeBin --> MCPHost[MCP Host / Bridge]
            
            MCPHost -- MCP StdIO --> Jules[Google Jules (Coder)]
            MCPHost -- MCP StdIO --> Context7[Context7 (Memory)]
            MCPHost -- MCP StdIO --> Stitch[Google Stitch (UI Designer)]
            MCPHost -- Internal --> LocalTools[Android Local Tools]
        end
        
        subgraph "Inference"
            MCPHost -- HTTP --> Ollama[Ollama Server]
        end
    end
    
    Jules -- Writes --> BackendLogic[Logic Code]
    Stitch -- Generates --> FrontendUI[Compose UI Code]
    LocalTools -- Compiles --> APK[App Build]
```

## 3. Implementation Details

### A. The Embedded Node.js Runtime
To avoid requiring Termux, we will bundle a pre-compiled `node` binary for `aarch64-linux-android` inside the APK `assets/`.

**Boot Sequence:**
1.  **App Launch:** Main Activity starts.
2.  **Extraction:** Check if `node` and `openclaw.js` exist in App Private Storage (`/data/data/com.landseek/files/bin`). If not, extract them from `assets`.
3.  **Permissioning:** `chmod +x` the `node` binary.
4.  **Launch:** Start a Foreground Service that executes:
    ```bash
    ./node openclaw_entry.js --port 3000 --bridge-mode
    ```

### B. The Bridge Protocol
Communication between Kotlin (UI) and Node (Agent) happens via a simplified WebSocket protocol over `localhost`.

**Events:**
- `UI -> Agent`: `EXECUTE_TASK` (e.g., "Check my emails")
- `Agent -> UI`: `TOOL_START` (e.g., "Reading emails...")
- `Agent -> UI`: `TOOL_OUTPUT` (JSON data)
- `Agent -> UI`: `THOUGHT` (Streaming thinking process)
- `Agent -> UI`: `FINAL_RESPONSE` (Markdown text)

### C. Permission Handling
Android creates a sandbox for the app.
- **Filesystem:** The agent has full access to the App's private storage. To access shared storage (Documents/Downloads), we must request `MANAGE_EXTERNAL_STORAGE` (if targeted for power users) or use Scoped Storage via Content Providers.
- **Network:** Standard Android permissions.

## 4. Directory Structure (Proposed)

```
Landseek-Amphibian/
├── android/                 # Native Android Project
│   ├── app/src/main/
│   │   ├── java/            # Kotlin Code
│   │   ├── assets/          # Bundled payloads
│   │   │   ├── node-bin/    # The node executable
│   │   │   └── openclaw/    # The JS source code
│   │   └── res/
├── bridge/                  # The JS-side bridge code
├── openclaw-core/           # Submodule of OpenClaw
└── scripts/                 # Build scripts to package everything
```

## 5. Security Considerations
- **Localhost Binding:** The Node server must bind ONLY to `127.0.0.1` to prevent external access.
- **API Keys:** Keys stored in Android KeyStore, passed to Node process via Environment Variables on spawn.

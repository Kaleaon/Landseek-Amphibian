# 🐸 Landseek-Amphibian

**The fully-integrated, cross-platform AI Agent System with distributed inference and training.**

> "Live on the land (Android/Desktop UI) and in the water (System Shell)."

## The Vision

Landseek-Amphibian is a complete **cross-platform AI agent** that merges **Landseek** (the beautiful, TPU-optimized chat UI with 10 AI personalities) with **OpenClaw** (the powerful, tool-using agent runtime) into a **single, installable application** for Android, Windows, Linux, and macOS.

**Goal:** No complex setup. Just install the app, and you have a fully autonomous, tool-using AI agent on your device. Pool resources with other devices for distributed inference and training.

## ✨ Key Features

- **📦 Cross-Platform:** Android APK, Windows .exe, Linux binary, and macOS app
- **📱 Native UI:** 120Hz Jetpack Compose interface on Android, CLI on desktop
- **🧠 On-Device TPU AI:** Runs Gemma 3 4B locally on Pixel TPU/NPU for private, offline inference
- **🎭 10 AI Personalities:** Chat with Nova, Echo, Sage, Spark, Atlas, Luna, Cipher, Muse, Phoenix, and Zen
- **🛠️ ClawdBot Tools:** Full suite of Android-native tools (SMS, Calls, Files, Memory, etc.)
- **📄 Document Analysis:** Upload and analyze 70+ file formats (PDF, DOCX, images, code, etc.)
- **🔌 MCP Protocol:** Model Context Protocol support for external AI services (Jules, Stitch, Context7)
- **🌐 Collective Mode:** Pool resources across multiple devices for distributed inference
- **🎓 Distributed Training:** Train AI models across pooled devices
- **🔄 Memory Sync:** Sync memories and context between Amphibian devices on local network
- **🎯 Smart Routing:** Automatic task classification routes requests to the best available brain

## 🎭 AI Personalities

The chat room supports up to **10 unique AI personalities**, each with distinct characteristics:

| Name | Avatar | Style |
|------|--------|-------|
| **Nova** | 🌟 | Curious, analytical, asks probing questions |
| **Echo** | 🎭 | Creative, playful, uses metaphors |
| **Sage** | 🦉 | Wise, contemplative, philosophical |
| **Spark** | ⚡ | Energetic, enthusiastic, motivational |
| **Atlas** | 🗺️ | Practical, structured, action-oriented |
| **Luna** | 🌙 | Empathetic, nurturing, supportive |
| **Cipher** | 🔮 | Logical, precise, technical |
| **Muse** | 🎨 | Artistic, inspiring, poetic |
| **Phoenix** | 🔥 | Resilient, transformative, growth-focused |
| **Zen** | ☯️ | Calm, mindful, peaceful |

## 📋 Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/personalities` | List all AI personalities |
| `/add <id>` | Add an AI to the chat |
| `/remove <id>` | Remove an AI from the chat |
| `/rename <id> <name>` | Rename an AI personality |
| `/ask <id> <question>` | Ask a specific AI a question |
| `/private <id>` | Start private chat with an AI |
| `/endprivate` | End private chat |
| `/round <N>` | Start N exchanges between AIs |
| `/upload <path>` | Upload a document |
| `/docs` | List uploaded documents |
| `/select <name>` | Select a document as active |
| `/analyze <id> <prompt>` | Have AI analyze active document |
| `/tools` | List available tools |
| `/remember <text>` | Save to long-term memory |
| `/recall <query>` | Search memory |
| `/host [port]` | Host a P2P room |
| `/join <code>` | Join a P2P room |
| `/leave` | Leave P2P session |
| `/clear` | Clear chat history |

## 📄 Supported File Formats (70+)

### Text & Code
`.txt`, `.md`, `.json`, `.csv`, `.xml`, `.yaml`, `.py`, `.js`, `.ts`, `.java`, `.c`, `.cpp`, `.go`, `.rs`, `.rb`, `.php`, `.swift`, `.kt`, `.sql`, `.sh`

### Documents
`.pdf`, `.docx`, `.doc`, `.odt`, `.rtf`, `.epub`

### Images
`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`

### Audio & Video
`.mp3`, `.wav`, `.ogg`, `.mp4`, `.webm`, `.mkv`

### Archives
`.zip`, `.tar`, `.gz`, `.7z`

## 🦎 Adaptive Architecture (One App, Three Modes)

Landseek-Amphibian automatically detects device capabilities to choose the best operating mode:

### 1. **Host Mode** (High-End / Pixel 10)
*   **Active:** On devices with powerful NPUs/TPUs (Pixel 9/10, S25, etc.).
*   **Function:** Runs the full **Gemma 3 4B** model locally via MediaPipe LLM Inference.
*   **Role:** Acts as a P2P Server, hosting the chatroom and agents for itself and others.
*   **Privacy:** 100% offline capable.

### 2. **Client Mode** (Standard Devices)
*   **Active:** On older phones or when battery saver is on.
*   **Function:** Connects to a remote brain (Jules, Context7, or a local P2P Host).
*   **Role:** Acts as a UI/Sensor terminal. It exposes its tools (Camera, SMS) to the remote brain but doesn't do the heavy thinking.

### 3. **Collective Mode** 🆕 (Distributed AI)
*   **Active:** When multiple devices pool their resources together.
*   **Function:** Distributes AI inference across all participating devices.
*   **Role:** Each device contributes processing power to a shared "Collective Brain".
*   **Benefits:**
    - Handle larger models than any single device could run alone
    - Fault-tolerant: tasks automatically reassign if a device disconnects
    - Optimized for high-latency networks with adaptive timeouts
    - Speculative execution hides network delays

## 🌐 Collective Mode

Pool AI processing power across multiple devices to achieve more than any single device could alone. Perfect for:
- Running inference on compute-heavy tasks
- Groups of friends wanting to share AI capabilities
- Building resilient AI systems that survive device failures

### Starting a Collective Pool

```
You: /collective
🌐 Collective pool started!
   Pool: Amphibian Collective
   Port: 8766
   Share code: Y29sbGVjdGl2ZToxOTIuMTY4LjEuMTAwOjg3NjY6YWJjMTIz
   Others can join with: /pool Y29sbGVjdGl2ZToxOTIuMTY4LjEuMTAwOjg3NjY6YWJjMTIz
```

### Joining a Collective Pool

```
You: /pool Y29sbGVjdGl2ZToxOTIuMTY4LjEuMTAwOjg3NjY6YWJjMTIz
✅ Joined collective pool "Amphibian Collective"!
   Device ID: abc123def456
   Total devices: 3
   Your device is now contributing to collective inference.
```

### Collective Commands

| Command | Description |
|---------|-------------|
| `/collective [port] [name]` | Start a new collective pool |
| `/pool <share_code>` | Join an existing collective pool |
| `/unpool` | Leave the collective pool |
| `/poolstatus` | Show collective pool status |
| `/capability <level>` | Set device capability (low/medium/high/tpu) |
| `/usecollective` | Use collective brain for next inference |

### How Collective Mode Handles High Latency

Collective Mode is designed from the ground up to work even with high network latency and delays:

1. **Asynchronous Task Queuing**: Tasks are queued and distributed to available devices, not blocked waiting for responses.

2. **Adaptive Timeouts**: Timeouts automatically adjust based on historical device latency. Slow but reliable devices are given more time.

3. **Redundant Execution**: Critical tasks are sent to multiple devices. The first successful result is used, providing fault tolerance.

4. **Chunked Processing**: Long inference tasks are broken into smaller chunks that can be distributed and processed in parallel.

5. **Speculative Execution**: While waiting for responses, the system can pre-process likely follow-up requests.

6. **Partial Results**: If a task times out but has partial results, those are used rather than failing completely.

7. **Device Reliability Scoring**: Devices that frequently fail or timeout are deprioritized for future tasks.

## 🎓 Distributed Training

Pool compute resources across devices to train AI models together. Perfect for:
- Fine-tuning models on custom data
- LoRA/adapter training with limited hardware
- Collaborative learning across a team

### Starting Distributed Training

1. **Start a collective pool** (coordinator device):
```
You: /collective
🌐 Collective pool started!
   Share code: Y29sbGVjdGl2ZToxOTIuMTY4...
```

2. **Start training** (on coordinator):
```
You: /train
🎓 Distributed training started!
   Model: amphibian-lora
   Batch size: 4
   Learning rate: 0.0001
```

3. **Join training** (worker devices):
```
You: /jointrain Y29sbGVjdGl2ZToxOTIuMTY4...
🎓 Joined training as worker!
   Your device will contribute gradients to training.
```

### Training Commands

| Command | Description |
|---------|-------------|
| `/train` | Start distributed training as coordinator |
| `/jointrain <share_code>` | Join training as a worker |
| `/trainstatus` | Show training progress |
| `/stoptrain` | Stop training |

### How Distributed Training Works

1. **Coordinator** distributes training batches to workers
2. **Workers** compute gradients locally using their hardware
3. **Gradients** are submitted back to coordinator
4. **Coordinator** aggregates gradients (weighted by staleness)
5. **Updated weights** are broadcast to all workers
6. Repeat until training completes

### Training Features for High Latency

- **Stale Gradient Handling**: Gradients computed on older weights are weighted lower but still used
- **Gradient Compression**: Sparsification reduces network overhead
- **Async Updates**: Workers don't need to wait for synchronization
- **Automatic Checkpointing**: Progress is saved periodically
- **Fault Tolerance**: Training continues if workers disconnect

## 💻 Desktop Application

Amphibian Desktop brings the full Amphibian experience to Windows, Linux, and macOS.

### Quick Start (Development)

```bash
# Run directly with Node.js
./scripts/desktop/run.sh

# Or manually:
cd desktop
npm install
node main.js
```

### Building Executables

```bash
# Build for all platforms
./scripts/desktop/build_all.sh

# Or build for specific platform
cd desktop
npm run build:win    # Windows .exe
npm run build:linux  # Linux binary
npm run build:mac    # macOS binary
```

### Desktop Commands

```
🐸 Landseek-Amphibian Desktop

Collective Mode:
  /collective [port]     Start a collective pool (default port: 8766)
  /pool <share_code>     Join an existing collective pool
  /unpool               Leave the collective pool
  /poolstatus           Show collective pool status

Distributed Training:
  /train                Start distributed training as coordinator
  /jointrain            Join training as a worker
  /trainstatus          Show training progress
  /stoptrain            Stop training

General:
  /status               Show overall status
  /help                 Show this help
  /quit                 Exit the application

Chat:
  Just type any message to chat with the AI
```

## 🤖 OpenClaw - Open Computation Pool

OpenClaw is a decentralized system that allows **any ClawBot** to contribute computation to shared training and inference tasks. No authentication required - just connect and contribute!

### Key Features

- **Open Registration**: Any ClawBot can join without approval
- **Public Task Pool**: Tasks available for any capable bot to claim
- **Contribution Tracking**: Fair attribution of compute contributions
- **Reputation System**: Reliable bots get priority for tasks
- **Open Training**: Collaborative model training across all participants

### Starting an OpenClaw Pool

```bash
# From Android or Desktop
/openpool 8767 "My Open Pool"

# Output:
🌐 OpenClaw Pool started!
   Pool: My Open Pool
   Port: 8767
   Connect: ws://192.168.1.100:8767
```

### Joining as a ClawBot

```bash
# Join an open pool
/joinopen 192.168.1.100:8767 MyClawBot

# Output:
🤖 Registered as MyClawBot!
   Pool: My Open Pool
   Available tasks: 5
```

### OpenClaw Commands

| Command | Description |
|---------|-------------|
| `/openpool [port] [name]` | Start an OpenClaw open pool |
| `/joinopen <host:port> [name]` | Join a pool as a ClawBot |
| `/leaveopen` | Leave the OpenClaw pool |
| `/openstatus` | Show pool status |
| `/opentrain [model]` | Start open training |
| `/submittask <type> <payload>` | Submit a task to the pool |
| `/leaderboard` | Show contribution leaderboard |
| `/claimtask` | Claim an available task |

### Bot Capability Levels

| Level | Description | Task Types |
|-------|-------------|------------|
| `minimal` | Can only relay tasks | - |
| `basic` | Simple inference | Inference |
| `standard` | Full inference | Inference, Embedding |
| `advanced` | Training capable | All + Training |
| `gpu` | GPU acceleration | All (Priority) |
| `tpu` | TPU/NPU acceleration | All (Highest Priority) |

### How Open Training Works

1. **Pool Owner** starts open training with `/opentrain`
2. **ClawBots** automatically receive training batches
3. **Each Bot** computes gradients locally
4. **Gradients** are submitted to the pool
5. **Pool** aggregates gradients from all participants
6. **Updated weights** are broadcast to all bots
7. **Contributions** are tracked for fair attribution

### Contribution Scoring

Contributions are scored based on:
- **Inference tasks**: 1 point each
- **Training tasks**: 5 points each
- **Gradients submitted**: 2 points each
- **Validation tasks**: 1 point each

Scores decay slightly over time to reward consistent participation.

### REST API Endpoints

The OpenClaw pool exposes REST endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /status` | Pool status and statistics |
| `GET /tasks` | Available tasks |
| `GET /leaderboard` | Top contributors |

### System Requirements (Desktop)

| Platform | Requirements |
|----------|-------------|
| **Windows** | Windows 10/11, x64 |
| **Linux** | Ubuntu 18.04+, Debian 10+, or similar x64 distro |
| **macOS** | macOS 10.15+ (Catalina or later), x64 or ARM64 |
| **All** | Node.js 18+ (for development), Ollama (optional, for local inference) |

## 🛠️ Available Tools (ClawdBot)

### Communication
- `send_sms` - Send SMS messages
- `make_call` - Initiate phone calls

### File System
- `read_file` - Read files from app storage
- `write_file` - Write content to files
- `list_files` - List directory contents

### Memory (RAG)
- `remember` - Store facts in long-term memory with semantic embeddings
- `recall` - Retrieve relevant context via semantic search
- `sync_peer` - Sync memories with another Amphibian device
- `discover_peers` - Find Amphibian devices on local network

### System
- `get_location` - Get device GPS coordinates
- `open_url` - Open URLs in browser
- `get_clipboard` / `set_clipboard` - Clipboard access
- `get_notifications` / `send_notification` - Notification management

### AI
- `inference` - Run local LLM inference on TPU

## 🌐 P2P Networking

Share your LLM capabilities with others - perfect for group chats where only one device runs the AI:

```
You: /host
🌐 Room is now shared!
   Share code (LAN): MTkyLjE2OC4xLjEwMDo4NzY1OkFCQzEyMw==
   Others can join with: /join <code>

---

You: /join MTkyLjE2OC4xLjEwMDo4NzY1OkFCQzEyMw==
✅ Connected to remote room!
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Android APK Process                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │   Jetpack       │    │   Foreground Service            ││
│  │   Compose UI    │───▶│   (AmphibianCoreService)        ││
│  │   (120Hz)       │    │                                 ││
│  └─────────────────┘    │  ┌───────────────────────────┐  ││
│                         │  │  Embedded Node.js Runtime │  ││
│                         │  │  ┌─────────────────────┐  │  ││
│                         │  │  │   MCP Host          │  │  ││
│                         │  │  │   ┌─────┐ ┌──────┐  │  │  ││
│                         │  │  │   │Jules│ │Stitch│  │  │  ││
│                         │  │  │   └─────┘ └──────┘  │  │  ││
│                         │  │  │   ┌───────────────┐ │  │  ││
│                         │  │  │   │Context7/Local│ │  │  ││
│                         │  │  │   └───────────────┘ │  │  ││
│                         │  │  │   ┌───────────────┐ │  │  ││
│                         │  │  │   │ Personalities │ │  │  ││
│                         │  │  │   │  🌟🎭🦉⚡🗺️   │ │  │  ││
│                         │  │  │   └───────────────┘ │  │  ││
│                         │  │  └─────────────────────┘  │  ││
│                         │  └───────────────────────────┘  ││
│                         └─────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  MediaPipe LLM Inference (TPU/GPU)                      ││
│  │  └─ gemma-3-4b-it / gemma-2b-it                        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

### Prerequisites
- Android 10+ (API 29+)
- For TPU inference: Pixel 6+ or compatible device with NPU
- Node.js v22+ ARM64 binary (bundled in assets)

### Building

1. Clone the repository:
```bash
git clone https://github.com/your-org/Landseek-Amphibian.git
cd Landseek-Amphibian
```

2. Set up the Node.js runtime:
```bash
./scripts/setup_runtime.sh
```

3. Install bridge dependencies:
```bash
cd bridge
npm install
cd ..
```

4. Build the Android APK:
```bash
cd android
./gradlew assembleRelease
```

### Running

1. Install the APK on your device
2. Grant required permissions (SMS, Phone, Location as needed)
3. The agent automatically starts and initializes the TPU model
4. Chat with your on-device AI!

## 🔑 Environment Variables

For external brain connections, set these before building:

```bash
export JULES_API_KEY="your-jules-api-key"
export STITCH_API_KEY="your-stitch-api-key"  
export CONTEXT7_API_KEY="your-context7-api-key"
```

## 📋 Roadmap

- [x] **Phase 1: Architecture Design** - Define Node.js embedding strategy
- [x] **Phase 2: Prototype Bridge** - Connect Landseek UI to OpenClaw agent
- [x] **Phase 3: Tool Integration** - Full ClawdBot tool support
- [x] **Phase 4: TPU Inference** - MediaPipe LLM integration for on-device AI
- [x] **Phase 5: AI Personalities** - 10 unique AI personalities from Landseek
- [x] **Phase 6: Document Analysis** - 70+ file format support
- [x] **Phase 7: P2P Networking** - Host/Join rooms with share codes
- [x] **Phase 8: RAG Persistence** - Save/load memories and mind maps
- [x] **Phase 9: The Embedding** - Android build system with Gradle, Node.js bundling
- [x] **Phase 10: Release** - Build configuration and scripts ready

## 🔨 Build Instructions

### Quick Build (One Command)

```bash
./scripts/build_release.sh
```

### Manual Build

1. **Set up Node.js runtime:**
```bash
./scripts/setup_runtime.sh
```

2. **Bundle bridge code:**
```bash
./scripts/bundle_bridge.sh
```

3. **Build the APK:**
```bash
cd android
./gradlew assembleRelease
```

4. **Install on device:**
```bash
adb install app/build/outputs/apk/release/app-release.apk
```

### Build Requirements

- **JDK 17+** - Required for Gradle
- **Android SDK 34** - Target API level
- **Node.js** (host machine) - For installing bridge dependencies

### Signing for Release

To sign the APK for Play Store distribution:

1. Generate a keystore:
```bash
keytool -genkey -v -keystore amphibian.jks -keyalg RSA -keysize 2048 -validity 10000 -alias amphibian
```

2. Create `android/local.properties`:
```properties
sdk.dir=/path/to/android/sdk
storeFile=../amphibian.jks
storePassword=your_password
keyAlias=amphibian
keyPassword=your_password
```

3. Update `android/app/build.gradle` to use release signing config.

## 🔒 Security

- **Localhost Binding:** The Node server binds ONLY to `127.0.0.1` to prevent external access.
- **Token Auth:** WebSocket connections require a secret token passed from Android.
- **API Keys:** Keys stored in Android KeyStore, passed to Node process via Environment Variables.
- **Scoped Storage:** File access restricted to app sandbox by default.

## 📄 License

MIT

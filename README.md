# 🐸 Landseek-Amphibian

**The fully-integrated, APK-installable AI Agent System for Android.**

> "Live on the land (Android UI) and in the water (System Shell)."

## The Vision

Landseek-Amphibian is a project to merge **Landseek** (the beautiful, TPU-optimized chat UI) with **OpenClaw** (the powerful, tool-using agent runtime) into a **single, installable Android APK**.

**Goal:** No Termux setup. No command line. Just install the app, and you have a fully autonomous, tool-using AI agent on your phone.

## Key Features

- **📦 Single Install:** One APK contains the UI, the LLM engine (Gemma/Ollama), and the Agent Runtime (OpenClaw).
- **📱 Native UI:** 120Hz Jetpack Compose interface (from Landseek).
- **🛠️ Real Tools:** The agent can use system tools (Files, Git, Web) via an embedded Node.js bridge.
- **🧠 Local Intelligence:** Powered by Pixel TPU/NPU via Ollama or TFLite.
- **🔌 Plugin System:** Add new capabilities just by dropping in a JavaScript file.

## 🦎 Adaptive Architecture (One App, Two Modes)

Landseek-Amphibian automatically detects device capabilities to choose the best operating mode:

### 1. **Host Mode** (High-End / Pixel 10)
*   **Active:** On devices with powerful NPUs/TPUs (Pixel 9/10, S25, etc.).
*   **Function:** Runs the full **Gemma 3 4B** model locally via Ollama/TFLite.
*   **Role:** Acts as a P2P Server, hosting the chatroom and agents for itself and others.
*   **Privacy:** 100% offline capable.

### 2. **Client Mode** (Standard Devices)
*   **Active:** On older phones or when battery saver is on.
*   **Function:** Connects to a remote brain (Jules, Context7, or a local P2P Host).
*   **Role:** Acts as a UI/Sensor terminal. It exposes its tools (Camera, SMS) to the remote brain but doesn't do the heavy thinking.

## Key Features

- **📦 Single Install:** One APK for everyone.
- **📱 Native UI:** 120Hz Jetpack Compose interface.
- **🔌 MCP Native:** Uses Model Context Protocol for all tool/agent communication.
- **🧠 Hybrid Brain:** Orchestrates between Local TPU (Gemma), Coding (Jules), and Memory (Context7).
- **🐸 Amphibious:** Live in the App (UI) and the Shell (Tools).

## Roadmap

- [ ] **Phase 1: Architecture Design** (Defining the Node.js embedding strategy)
- [ ] **Phase 2: Prototype Bridge** (Connecting Landseek UI to an external OpenClaw instance)
- [ ] **Phase 3: The Embedding** (Compiling Node.js for Android and bundling it in assets)
- [ ] **Phase 4: The Installer** (App extracts and bootstraps the runtime on first launch)
- [ ] **Phase 5: Release** (First APK build)

## License

MIT

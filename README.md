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

## Architecture High-Level

The app runs as a hybrid system:

1.  **Frontend (Landseek):** Native Kotlin/Android UI. Handles user input, voice, and rendering.
2.  **Backend Service (Amphibian Core):** A background Android Service that hosts:
    *   **Node.js Runtime:** Embedded binary running OpenClaw.
    *   **The Bridge:** A local WebSocket/HTTP bridge connecting the UI to the Agent.

## Getting Started

*(Coming Soon - This project is currently in the architectural design phase)*

## Roadmap

- [ ] **Phase 1: Architecture Design** (Defining the Node.js embedding strategy)
- [ ] **Phase 2: Prototype Bridge** (Connecting Landseek UI to an external OpenClaw instance)
- [ ] **Phase 3: The Embedding** (Compiling Node.js for Android and bundling it in assets)
- [ ] **Phase 4: The Installer** (App extracts and bootstraps the runtime on first launch)
- [ ] **Phase 5: Release** (First APK build)

## License

MIT

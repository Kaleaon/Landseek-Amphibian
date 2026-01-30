# Android Native Interface for Amphibian Bridge

This document describes the interface expected by the Node.js bridge from the Android native side. The Android app must inject a global object named `androidBridgeCallback` into the Node.js runtime.

## Global Object: `androidBridgeCallback`

The `androidBridgeCallback` object exposes methods for the Node.js bridge to invoke Android native capabilities.

### 1. Local TPU Inference (Required)

The bridge relies on the Android device's NPU/TPU to run local LLMs (e.g., Gemma, MediaPipe).

**Method:** `inference(prompt, callback)`

*   **prompt** (String): The input text prompt for the model.
*   **callback** (Function): A JavaScript callback function that receives streaming chunks.
    *   Signature: `(error, chunk, done) => void`
    *   `error` (String|null): Error message if something went wrong, else null.
    *   `chunk` (String|null): A piece of generated text.
    *   `done` (Boolean): True if generation is complete.

**Example Usage (Node.js side):**
```javascript
global.androidBridgeCallback.inference("Tell me a joke", (error, chunk, done) => {
    if (error) console.error(error);
    if (chunk) process.stdout.write(chunk);
    if (done) console.log("\nDone.");
});
```

### 2. System Tools (Optional/Legacy)

The `bridge/android_mcp.js` module attempts to use `androidBridgeCallback` to execute system tools (like sending SMS).

*   **Current Implementation in `android_mcp.js`**: expects `androidBridgeCallback` to be a **function**:
    `const result = await this.bridgeCallback(name, args);`

*   **Recommended Native Implementation**:
    If the JNI object cannot be a function, `android_mcp.js` should be updated to call a specific method (e.g., `callTool`).

    If `androidBridgeCallback` is a function, it should dispatch based on the `name` argument:
    *   `send_sms`: `{ phone, message }`
    *   `make_call`: `{ phone }`
    *   `read_file`: `{ path }`

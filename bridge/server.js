/**
 * Amphibian Bridge Server (Node.js Side)
 * 
 * This runs inside the embedded Node binary on the Android device.
 * It listens on localhost for commands from the Kotlin UI and routes them
 * to the OpenClaw agent runtime.
 */

const WebSocket = require('ws');
const http = require('http');

// Configuration
const PORT = process.env.AMPHIBIAN_PORT || 3000;
const AUTH_TOKEN = process.env.AMPHIBIAN_TOKEN; // Passed from Android via Env Var

// Event Types
const EVENTS = {
    // Inbound (UI -> Agent)
    EXECUTE_TASK: 'EXECUTE_TASK',
    STOP_TASK: 'STOP_TASK',
    PROVIDE_INPUT: 'PROVIDE_INPUT',
    
    // Outbound (Agent -> UI)
    STATUS_UPDATE: 'STATUS_UPDATE',
    LOG: 'LOG',
    TOOL_USE: 'TOOL_USE',
    RESULT: 'RESULT',
    ERROR: 'ERROR'
};

// State
let activeSocket = null;
let agentBusy = false;

const AmphibianHost = require('./mcp_host');
const MultiBrain = require('./brains/router');
const TPUBrain = require('./brains/tpu_brain');
const AndroidInferenceServer = require('./mcp_servers/android_inference');

// Initialize MCP Host
const host = new AmphibianHost();

// Initialize Router & Brains
const router = new MultiBrain({});
let tpuBrain;

// Start MCP Servers (Brain Modules)
async function startBrains() {
    try {
        // 1. Local TPU (Default)
        // Wraps the Android native bridge callback
        tpuBrain = new TPUBrain(global.androidBridgeCallback);
        router.register('tpu', tpuBrain);
        console.log('🧠 Registered Local TPU Brain');

        // 2. Android Local Inference MCP (Expose TPU as tools)
        // This makes the TPU available as a tool server if we need to connect it to other agents
        const inferenceServer = new AndroidInferenceServer(tpuBrain);

        // 3. Specialized Brains (Optional / Cloud)
        if (process.env.JULES_API_KEY) {
            const client = await host.connectStdioServer('jules', 'node', ['./mcp_servers/jules_adapter.js']);
            router.register('jules', client);
        }
        if (process.env.STITCH_API_KEY) {
            const client = await host.connectStdioServer('stitch', 'node', ['./mcp_servers/stitch_adapter.js']);
            router.register('stitch', client);
        }
        if (process.env.CONTEXT7_API_KEY) {
            const client = await host.connectStdioServer('context7', 'node', ['./mcp_servers/context7_adapter.js']);
            router.register('context7', client);
        }
        
        // Connect Local Android System
        const AndroidSystemServer = require('./android_mcp');
        const androidServer = new AndroidSystemServer(global.androidBridgeCallback);
        
        console.log('🧠 All Brain Modules Connected.');
    } catch (e) {
        console.error('Failed to connect brains:', e);
    }
}

startBrains();

const agent = {
    execute: async (task, onLog) => {
        onLog('Analyzing task...', 'thought');
        
        // 1. Get Tools (Optional - mainly for introspection)
        // const tools = await host.getAllTools();
        
        // 2. Route Task
        const brain = await router.route(task);
        
        try {
            // Case A: Local TPU (Direct)
            if (brain instanceof TPUBrain) {
                onLog('Routing to: Local TPU (Gemma)', 'thought');
                // Use the TPU directly
                const response = await brain.generate(task, (chunk) => {
                    // Optional: could stream back via LOG or a specific STREAM event
                    // onLog(chunk, 'stream'); // Assuming UI handles this
                });
                return response;
            } 
            
            // Case B: Specialized MCP Agents
            // Map the brain to a specific primary tool call

            if (brain && brain === router.brains['jules']) {
                onLog('Routing to: Google Jules (Coding)', 'thought');
                const result = await host.callTool('jules', 'create_coding_session', { 
                    prompt: task, 
                    source: 'current' 
                });
                return result.content[0].text;
            }

            if (brain && brain === router.brains['stitch']) {
                onLog('Routing to: Google Stitch (UI)', 'thought');
                const result = await host.callTool('stitch', 'generate_ui', { prompt: task });
                return result.content[0].text;
            }

            if (brain && brain === router.brains['context7']) {
                 onLog('Routing to: Context7 (Retrieval)', 'thought');
                 // Assume a tool name for context7 - 'retrieve' or similar
                 // If not known, we might need to inspect tools. For now, assuming standard name.
                 const result = await host.callTool('context7', 'retrieve', { query: task });
                 return result.content[0].text;
            }

            // Case C: Android System Tools (SMS, etc) - Handled via Regex in Router?
            // Or maybe checking if the task implies a tool use.
            // For now, let's keep the simple SMS regex fallback if no brain picked it up (though Router defaults to TPU).
            // Actually, if Router defaults to TPU, we rely on TPU to handle it or say "I can't".
            // If we want SMS, we might need to add that logic to Router or here.

            if (task.toLowerCase().includes('sms') || task.toLowerCase().includes('text')) {
                 const match = task.match(/text (\d+) saying (.+)/);
                 if (match) {
                     onLog(`Routing to: Android System (SMS) -> ${match[1]}`, 'tool');
                     // This mimics the old behavior. Ideally we'd call the Android MCP tool.
                     return "SMS Sent (Simulated via Bridge)";
                 }
            }

            // Fallback
            return "I'm not sure how to handle that task locally.";
            
        } catch (err) {
            onLog(`Error executing task: ${err.message}`, 'error');
            return "Task Failed.";
        }
    }
};

// Start Server
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Amphibian Bridge Active 🐸');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    // Simple Auth Check
    const token = req.headers['sec-websocket-protocol'];
    if (AUTH_TOKEN && token !== AUTH_TOKEN) {
        console.log('Unauthorized connection attempt');
        ws.close(1008, 'Unauthorized');
        return;
    }

    console.log('Android UI connected to Bridge');
    activeSocket = ws;

    // Send Hello
    send(EVENTS.STATUS_UPDATE, { status: 'READY', message: 'Agent ready for commands.' });

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(data);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    ws.on('close', () => {
        console.log('Android UI disconnected');
        activeSocket = null;
    });
});

async function handleMessage(data) {
    switch (data.type) {
        case EVENTS.EXECUTE_TASK:
            if (agentBusy) {
                send(EVENTS.ERROR, { message: 'Agent is busy.' });
                return;
            }
            
            agentBusy = true;
            send(EVENTS.STATUS_UPDATE, { status: 'WORKING', task: data.payload.task });
            
            try {
                const result = await agent.execute(data.payload.task, (text, type) => {
                    send(EVENTS.LOG, { text, type });
                });
                send(EVENTS.RESULT, { result });
            } catch (err) {
                send(EVENTS.ERROR, { message: err.message });
            } finally {
                agentBusy = false;
                send(EVENTS.STATUS_UPDATE, { status: 'IDLE' });
            }
            break;

        case EVENTS.STOP_TASK:
            // Implement stop logic
            break;
    }
}

function send(type, payload) {
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.send(JSON.stringify({ type, payload }));
    }
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(`🐸 Amphibian Bridge listening on 127.0.0.1:${PORT}`);
});

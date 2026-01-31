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
const ConversationMemory = require('./brains/memory');
const AndroidInferenceServer = require('./mcp_servers/android_inference');
const AndroidSystemServer = require('./android_mcp');

// Initialize MCP Host
const host = new AmphibianHost();

// Initialize Memory
const memory = new ConversationMemory(20);

// Initialize Brains
let tpuBrain;
const router = new MultiBrain(null); // Will set localBrain later

// Start MCP Servers (Brain Modules)
async function startBrains() {
    try {
        // 1. Local TPU (Default)
        // Wraps the Android native bridge callback
        tpuBrain = new TPUBrain(global.androidBridgeCallback);
        // Update router with the local brain instance
        router.localBrain = tpuBrain;
        router.register('tpu', true);
        router.register('local', true); // Alias
        console.log('🧠 Registered Local TPU Brain');

        // 2. Android Local Inference MCP (Expose TPU as tools)
        // This makes the TPU available as a tool server if we need to connect it to other agents
        const inferenceServer = new AndroidInferenceServer(tpuBrain);
        // Note: To be fully usable by 'host', we'd need to bridge this server to a client or transport.
        // For now, it exists as requested.

        // 3. Specialized Brains (Optional / Cloud)
        if (process.env.JULES_API_KEY) {
            await host.connectStdioServer('jules', 'node', ['./mcp_servers/jules_adapter.js']);
            router.register('jules', true);
        }
        if (process.env.STITCH_API_KEY) {
            await host.connectStdioServer('stitch', 'node', ['./mcp_servers/stitch_adapter.js']);
            router.register('stitch', true);
        }
        if (process.env.CONTEXT7_API_KEY) {
            await host.connectStdioServer('context7', 'node', ['./mcp_servers/context7_adapter.js']);
            router.register('context7', true);
        }
        
        // Connect Local Android System
        const androidServer = new AndroidSystemServer(global.androidBridgeCallback);
        router.register('android', true);
        
        console.log('🧠 All Brain Modules Connected.');
    } catch (e) {
        console.error('Failed to connect brains:', e);
    }
}

startBrains();

const agent = {
    execute: async (task, onLog) => {
        onLog('Analyzing task...', 'thought');
        
        // 0. Update Memory
        memory.add('user', task);

        // 1. Get Tools (Informational)
        // const tools = await host.getAllTools();
        
        // 2. Intent Classification (via Router)
        const decision = await router.route(task, memory.getHistory());
        onLog(`Routing to: ${decision.toolName} (${decision.reason})`, 'thought');
        
        try {
            let resultText = "";

            // Case A: Specialized MCP Agents
            if (decision.toolName === 'jules') {
                const result = await host.callTool('jules', 'create_coding_session', { 
                    prompt: task, 
                    source: 'current' 
                });
                resultText = result.content ? result.content[0].text : JSON.stringify(result);

            } else if (decision.toolName === 'stitch') {
                const result = await host.callTool('stitch', 'generate_ui', { prompt: task });
                resultText = result.content ? result.content[0].text : JSON.stringify(result);

            } else if (decision.toolName === 'context7') {
                 // Hypothetical call
                 // const result = await host.callTool('context7', 'retrieve', { query: task });
                 // resultText = result.content[0].text;
                 resultText = "Context7 search not fully implemented yet.";

            } else if (decision.toolName === 'android') {
                 const match = task.match(/text (\d+) saying (.+)/);
                 if (match) {
                     // In real app, call android MCP
                     // await host.callTool('android', 'send_sms', { phone: match[1], message: match[2] });
                     resultText = `SMS Sent to ${match[1]}: "${match[2]}" (Simulated)`;
                 } else {
                     // Fallback to local brain
                     const messages = memory.getHistory();
                     const response = await tpuBrain.chat(messages);
                     resultText = response.content;
                 }
            } else {
                // Default: Local TPU
                const messages = memory.getHistory();
                // tpuBrain.chat uses the generate method internally
                const response = await tpuBrain.chat(messages);
                resultText = response.content;
            }

            memory.add('assistant', resultText);
            return resultText;
            
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

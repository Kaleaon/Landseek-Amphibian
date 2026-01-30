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

// Initialize MCP Host
const host = new AmphibianHost();

// Start MCP Servers (Brain Modules)
async function startBrains() {
    try {
        if (process.env.JULES_API_KEY) {
            await host.connectStdioServer('jules', 'node', ['./mcp_servers/jules_adapter.js']);
        }
        if (process.env.STITCH_API_KEY) {
            await host.connectStdioServer('stitch', 'node', ['./mcp_servers/stitch_adapter.js']);
        }
        if (process.env.CONTEXT7_API_KEY) {
            await host.connectStdioServer('context7', 'node', ['./mcp_servers/context7_adapter.js']);
        }
        
        // Connect Local Android System
        const AndroidSystemServer = require('./android_mcp');
        const androidServer = new AndroidSystemServer(global.androidBridgeCallback); // Bridge callback defined by JNI injection
        // We'll treat local system as a direct client for simplicity here
        
        console.log('🧠 All Brain Modules Connected.');
    } catch (e) {
        console.error('Failed to connect brains:', e);
    }
}

startBrains();

const agent = {
    execute: async (task, onLog) => {
        onLog('Analyzing task...', 'thought');
        
        // 1. Get Tools
        const tools = await host.getAllTools();
        const toolNames = tools.map(t => t.name).join(', ');
        onLog(`Available Tools: ${toolNames}`, 'info');
        
        // 2. Intent Classification (Simple Heuristic for Speed)
        // In a real version, we'd ask the Local LLM to pick the tool JSON.
        
        try {
            if (task.toLowerCase().includes('ui') || task.toLowerCase().includes('screen')) {
                onLog('Routing to: Google Stitch (UI)', 'thought');
                const result = await host.callTool('stitch', 'generate_ui', { prompt: task });
                return result.content[0].text;
            } 
            
            if (task.toLowerCase().includes('code') || task.toLowerCase().includes('fix')) {
                onLog('Routing to: Google Jules (Coding)', 'thought');
                const result = await host.callTool('jules', 'create_coding_session', { 
                    prompt: task, 
                    source: 'current' 
                });
                return result.content[0].text;
            }

            if (task.toLowerCase().includes('sms') || task.toLowerCase().includes('text')) {
                 // Simple regex extraction for demo
                 const match = task.match(/text (\d+) saying (.+)/);
                 if (match) {
                     onLog(`Routing to: Android System (SMS) -> ${match[1]}`, 'tool');
                     // This would call the Android MCP tool
                     // return await host.callTool('android', 'send_sms', { phone: match[1], message: match[2] });
                     return "SMS Sent (Simulated via Bridge)";
                 }
            }

            // Default: Ask the Local LLM (Gemma)
            onLog('Routing to: Local TPU (Gemma 3)', 'thought');
            // const result = await host.callTool('android', 'local_inference', { prompt: task });
            // return result.content[0].text;
            return `[Gemma 3 4B Response]: I can help with that! You asked about: "${task}"`;
            
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

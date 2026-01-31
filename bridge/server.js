/**
 * Amphibian Bridge Server (Node.js Side)
 * 
 * This runs inside the embedded Node binary on the Android device.
 * It listens on localhost for commands from the Kotlin UI and routes them
 * to the OpenClaw agent runtime.
 * 
 * Features:
 * - On-device AI via TPU/Ollama (Gemma 3 4B)
 * - Full MCP protocol support for external tools (Jules, Stitch, Context7)
 * - Android native tool integration (SMS, Calls, Files, etc.)
 * - ClawdBot tool support (all standard agent tools)
 */

const WebSocket = require('ws');
const http = require('http');

// Configuration
const PORT = process.env.AMPHIBIAN_PORT || 3000;
const AUTH_TOKEN = process.env.AMPHIBIAN_TOKEN; // Passed from Android via Env Var
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const TPU_MODEL = process.env.TPU_MODEL || 'gemma:3-4b-it'; // On-device TPU model

// Event Types
const EVENTS = {
    // Inbound (UI -> Agent)
    EXECUTE_TASK: 'EXECUTE_TASK',
    STOP_TASK: 'STOP_TASK',
    PROVIDE_INPUT: 'PROVIDE_INPUT',
    CALL_TOOL: 'CALL_TOOL',
    
    // Outbound (Agent -> UI)
    STATUS_UPDATE: 'STATUS_UPDATE',
    LOG: 'LOG',
    TOOL_USE: 'TOOL_USE',
    TOOL_RESULT: 'TOOL_RESULT',
    RESULT: 'RESULT',
    ERROR: 'ERROR',
    STREAM_CHUNK: 'STREAM_CHUNK'
};

// State
let activeSocket = null;
let agentBusy = false;
let currentTaskAborted = false;

const AmphibianHost = require('./mcp_host');
const MultiBrainRouter = require('./brains/router');
const LocalBrain = require('./brains/local_brain');
const ConversationMemory = require('./brains/memory');

// Initialize Components with TPU optimization
const host = new AmphibianHost();
const localBrain = new LocalBrain({
    baseUrl: OLLAMA_URL,
    model: TPU_MODEL
});
const router = new MultiBrainRouter(localBrain);
const memory = new ConversationMemory(50); // Extended memory for complex tasks

// Android Bridge Callback (injected via JNI in production)
let androidToolCallback = global.androidBridgeCallback || async function(toolName, args) {
    console.warn(`⚠️ Android Tool Called in SIMULATION MODE: ${toolName}`, args);
    console.warn('   Set global.androidBridgeCallback for real Android integration');
    // Simulated response for testing outside Android
    return { 
        success: true, 
        message: `${toolName} executed (simulated)`, 
        data: args,
        simulated: true  // Flag to indicate this was a simulated response
    };
};

// Start MCP Servers (Brain Modules)
async function startBrains() {
    try {
        console.log('🧠 Starting Amphibian Brain Modules...');
        
        // Register Local Brain (TPU/Ollama)
        router.register('local', true);
        console.log('✅ Local Brain (TPU) registered');
        
        // Connect Google Jules (Coding Agent)
        if (process.env.JULES_API_KEY) {
            await host.connectStdioServer('jules', 'node', ['./mcp_servers/jules_adapter.js']);
            router.register('jules', true);
            console.log('✅ Jules (Coding Agent) connected');
        }
        
        // Connect Google Stitch (UI Designer)
        if (process.env.STITCH_API_KEY) {
            await host.connectStdioServer('stitch', 'node', ['./mcp_servers/stitch_adapter.js']);
            router.register('stitch', true);
            console.log('✅ Stitch (UI Designer) connected');
        }
        
        // Connect Context7 (Memory/RAG)
        if (process.env.CONTEXT7_API_KEY) {
            await host.connectStdioServer('context7', 'node', ['./mcp_servers/context7_adapter.js']);
            router.register('context7', true);
            console.log('✅ Context7 (Memory) connected');
        }
        
        // Connect Local Android System Tools
        const AndroidSystemServer = require('./android_mcp');
        const androidServer = new AndroidSystemServer(androidToolCallback);
        router.register('android', true);
        console.log('✅ Android System Tools connected');
        
        console.log('🦎 All Brain Modules Connected! Amphibian ready.');
    } catch (e) {
        console.error('❌ Failed to connect brains:', e);
    }
}

// Set Android Bridge Callback (called from JNI)
global.setAndroidBridgeCallback = function(callback) {
    androidToolCallback = callback;
    console.log('📱 Android Bridge Callback registered');
};

startBrains();

// ClawdBot Agent - Full Tool Support
const agent = {
    /**
     * Execute a user task with full ClawdBot tool support
     * Routes to appropriate brain/tool based on intent classification
     */
    execute: async (task, onLog, options = {}) => {
        if (currentTaskAborted) {
            return "Task was aborted.";
        }
        
        onLog('🧠 Analyzing task...', 'thought');
        
        // 0. Update Memory
        memory.add('user', task);
        
        // 1. Intent Classification via Local TPU Brain (fast on-device)
        const decision = await router.route(task, memory.getHistory());
        onLog(`🎯 Routing to: ${decision.toolName} (${decision.reason})`, 'thought');
        
        try {
            let resultText = "";
            
            // Send tool use notification
            send(EVENTS.TOOL_USE, { 
                tool: decision.toolName, 
                status: 'starting',
                confidence: decision.confidence 
            });

            switch (decision.toolName) {
                case 'jules':
                    // Google Jules for coding tasks
                    onLog('🔧 Delegating to Jules (Coding Agent)...', 'info');
                    const julesResult = await host.callTool('jules', 'create_coding_session', {
                        prompt: task, 
                        source: 'current' 
                    });
                    resultText = julesResult.content ? julesResult.content[0].text : JSON.stringify(julesResult);
                    break;

                case 'stitch':
                    // Google Stitch for UI generation
                    onLog('🎨 Delegating to Stitch (UI Designer)...', 'info');
                    const stitchResult = await host.callTool('stitch', 'generate_ui', { prompt: task });
                    resultText = stitchResult.content ? stitchResult.content[0].text : JSON.stringify(stitchResult);
                    break;

                case 'context7':
                    // Context7 for memory/knowledge retrieval
                    onLog('📚 Searching knowledge base...', 'info');
                    const context7Result = await host.callTool('context7', 'recall_memories', { query: task });
                    resultText = context7Result.content ? context7Result.content[0].text : "No relevant memories found.";
                    break;

                case 'android':
                    // Android native tools (SMS, Calls, Files, etc.)
                    resultText = await executeAndroidTool(task, onLog);
                    break;

                default:
                    // Local TPU Brain for general chat/reasoning
                    onLog('💭 Thinking with local TPU...', 'info');
                    
                    // Check for streaming preference
                    if (options.stream) {
                        resultText = await streamLocalResponse(task, onLog);
                    } else {
                        const messages = memory.getHistory();
                        const response = await localBrain.chat(messages);
                        resultText = response.content || "I apologize, I couldn't generate a response.";
                    }
                    break;
            }

            // Send tool completion
            send(EVENTS.TOOL_USE, { 
                tool: decision.toolName, 
                status: 'completed' 
            });

            memory.add('assistant', resultText);
            return resultText;
            
        } catch (err) {
            onLog(`❌ Error executing task: ${err.message}`, 'error');
            send(EVENTS.TOOL_USE, { 
                tool: decision.toolName, 
                status: 'failed',
                error: err.message 
            });
            return `Task Failed: ${err.message}`;
        }
    },
    
    /**
     * Direct tool execution for explicit tool calls
     */
    callTool: async (toolServer, toolName, args, onLog) => {
        onLog(`🛠️ Calling tool: ${toolServer}/${toolName}`, 'info');
        
        try {
            const result = await host.callTool(toolServer, toolName, args);
            return result;
        } catch (err) {
            onLog(`❌ Tool call failed: ${err.message}`, 'error');
            throw err;
        }
    },
    
    /**
     * List all available tools
     */
    listTools: async () => {
        const tools = await host.getAllTools();
        return tools;
    }
};

/**
 * Execute Android-specific tools based on task intent
 */
async function executeAndroidTool(task, onLog) {
    const text = task.toLowerCase();
    
    // SMS Intent
    const smsMatch = task.match(/(?:text|sms|message)\s+(\d{10,})\s+(?:saying|with|:)?\s*(.+)/i);
    if (smsMatch) {
        onLog('📱 Sending SMS...', 'info');
        const result = await androidToolCallback('send_sms', { 
            phone: smsMatch[1], 
            message: smsMatch[2] 
        });
        return result.success ? `SMS sent to ${smsMatch[1]}: "${smsMatch[2]}"` : `Failed: ${result.message}`;
    }
    
    // Call Intent
    const callMatch = task.match(/(?:call|phone|dial)\s+(\d{10,})/i);
    if (callMatch) {
        onLog('📞 Initiating call...', 'info');
        const result = await androidToolCallback('make_call', { phone: callMatch[1] });
        return result.success ? `Calling ${callMatch[1]}...` : `Failed: ${result.message}`;
    }
    
    // Remember Intent
    const rememberMatch = task.match(/(?:remember|memorize|save)\s+(?:that\s+)?(.+)/i);
    if (rememberMatch) {
        onLog('💾 Saving to memory...', 'info');
        const result = await androidToolCallback('remember', { content: rememberMatch[1] });
        return result.success ? `Memory saved: "${rememberMatch[1].substring(0, 50)}..."` : `Failed: ${result.message}`;
    }
    
    // Recall Intent
    const recallMatch = task.match(/(?:recall|remember|what.*about)\s+(.+)/i);
    if (recallMatch) {
        onLog('🔍 Searching memory...', 'info');
        const result = await androidToolCallback('recall', { query: recallMatch[1] });
        return result.success ? result.output : `No relevant memories found for: ${recallMatch[1]}`;
    }
    
    // File Read Intent
    const readMatch = task.match(/(?:read|open|show)\s+(?:file\s+)?(.+\.(?:txt|json|md|kt|java))/i);
    if (readMatch) {
        onLog('📄 Reading file...', 'info');
        const result = await androidToolCallback('read_file', { path: readMatch[1] });
        return result.success ? result.output : `Failed: ${result.message}`;
    }
    
    // Default: Use local brain for unclear android intents
    onLog('💭 Processing with local AI...', 'info');
    const messages = memory.getHistory();
    const response = await localBrain.chat(messages);
    return response.content || "I'm not sure how to handle that request.";
}

/**
 * Stream response from local TPU brain
 */
async function streamLocalResponse(task, onLog) {
    const messages = memory.getHistory();
    let fullResponse = '';
    
    try {
        for await (const chunk of localBrain.chatStream(messages)) {
            fullResponse += chunk;
            send(EVENTS.STREAM_CHUNK, { text: chunk });
        }
    } catch (err) {
        onLog(`Stream error: ${err.message}`, 'error');
    }
    
    return fullResponse || "I apologize, I couldn't generate a response.";
}

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
                send(EVENTS.ERROR, { message: 'Agent is busy. Please wait or send STOP_TASK.' });
                return;
            }
            
            agentBusy = true;
            currentTaskAborted = false;
            send(EVENTS.STATUS_UPDATE, { status: 'WORKING', task: data.payload.task });
            
            try {
                const options = data.payload.options || {};
                const result = await agent.execute(data.payload.task, (text, type) => {
                    send(EVENTS.LOG, { text, type });
                }, options);
                send(EVENTS.RESULT, { result });
            } catch (err) {
                send(EVENTS.ERROR, { message: err.message, stack: err.stack });
            } finally {
                agentBusy = false;
                currentTaskAborted = false;
                send(EVENTS.STATUS_UPDATE, { status: 'IDLE' });
            }
            break;

        case EVENTS.STOP_TASK:
            if (agentBusy) {
                currentTaskAborted = true;
                send(EVENTS.LOG, { text: '🛑 Task abort requested...', type: 'warning' });
            }
            break;
            
        case EVENTS.CALL_TOOL:
            // Direct tool invocation
            if (agentBusy) {
                send(EVENTS.ERROR, { message: 'Agent is busy.' });
                return;
            }
            
            agentBusy = true;
            try {
                const { server, tool, args } = data.payload;
                const result = await agent.callTool(server, tool, args, (text, type) => {
                    send(EVENTS.LOG, { text, type });
                });
                send(EVENTS.TOOL_RESULT, { tool, result });
            } catch (err) {
                send(EVENTS.ERROR, { message: err.message });
            } finally {
                agentBusy = false;
            }
            break;
            
        case EVENTS.PROVIDE_INPUT:
            // Handle user input during a task (e.g., confirmations)
            if (data.payload && data.payload.input) {
                console.log(`📥 User input received: ${data.payload.input}`);
                // Could be handled by pending promises in tool execution
            }
            break;
            
        default:
            console.log(`Unknown event type: ${data.type}`);
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

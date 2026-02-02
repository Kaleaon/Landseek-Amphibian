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
 * - 10 AI Personalities (Nova, Echo, Sage, etc.)
 * - Document Upload & Analysis
 * - P2P Room Hosting/Joining
 * - Command System (/help, /tools, /upload, etc.)
 * - Collective Mode: Pool AI across multiple devices for distributed inference
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');

// Configuration
const PORT = process.env.AMPHIBIAN_PORT || 3000;
const AUTH_TOKEN = process.env.AMPHIBIAN_TOKEN; // Passed from Android via Env Var
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const TPU_MODEL = process.env.TPU_MODEL || 'gemma:3-4b-it'; // On-device TPU model
const STORAGE_PATH = process.env.ANDROID_FILES_DIR || './data';

// Event Types
const EVENTS = {
    // Inbound (UI -> Agent)
    EXECUTE_TASK: 'EXECUTE_TASK',
    STOP_TASK: 'STOP_TASK',
    PROVIDE_INPUT: 'PROVIDE_INPUT',
    CALL_TOOL: 'CALL_TOOL',
    EXECUTE_COMMAND: 'EXECUTE_COMMAND',
    
    // Outbound (Agent -> UI)
    STATUS_UPDATE: 'STATUS_UPDATE',
    LOG: 'LOG',
    TOOL_USE: 'TOOL_USE',
    TOOL_RESULT: 'TOOL_RESULT',
    RESULT: 'RESULT',
    ERROR: 'ERROR',
    STREAM_CHUNK: 'STREAM_CHUNK',
    AI_RESPONSE: 'AI_RESPONSE',
    COMMAND_RESULT: 'COMMAND_RESULT',
    P2P_STATUS: 'P2P_STATUS',
    COLLECTIVE_STATUS: 'COLLECTIVE_STATUS'
};

// State
let activeSocket = null;
let agentBusy = false;
let currentTaskAborted = false;
let privateChat = null; // { personality, history }
let p2pHost = null;
let p2pClient = null;

// Collective Mode State
let collectiveCoordinator = null;
let collectiveClient = null;
let collectiveBrain = null;
let useCollectiveForNextInference = false;

// Core Components
const AmphibianHost = require('./mcp_host');
const MultiBrainRouter = require('./brains/router');
const LocalBrain = require('./brains/local_brain');
const ConversationMemory = require('./brains/memory');

// New Landseek Features
const { PersonalityManager } = require('./personalities');
const { DocumentManager } = require('./documents');
const { CommandProcessor } = require('./commands');
const { P2PHost, P2PClient } = require('./p2p');
const ModelManager = require('./model_manager');

// Collective Mode
const { CollectiveCoordinator, CollectiveBrain, CollectiveClient } = require('./collective');

// Identity Module
const { IdentityManager } = require('./identity/manager');
const { handleIdentityRoutes } = require('./identity/routes');

// Initialize Components with TPU optimization
const host = new AmphibianHost();
const localBrain = new LocalBrain({
    baseUrl: OLLAMA_URL,
    model: TPU_MODEL
});
const router = new MultiBrainRouter(localBrain);
const memory = new ConversationMemory(50); // Extended memory for complex tasks

// Initialize Landseek Features
const personalities = new PersonalityManager(path.join(STORAGE_PATH, 'personalities.json'));
const documents = new DocumentManager(path.join(STORAGE_PATH, 'documents'));
const identityManager = new IdentityManager(path.join(STORAGE_PATH, 'identity'));

const commandProcessor = new CommandProcessor({
    personalities,
    documents,
    localBrain,
    memory,
    identityManager
});

// Load saved state
personalities.load();
documents.loadDocumentIndex();
identityManager.load();

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

// Initialize Model Manager
const modelManager = new ModelManager(async (tool, args) => {
    return androidToolCallback(tool, args);
});

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

                case 'collective':
                    // Collective distributed inference
                    if (collectiveBrain && await collectiveBrain.isAvailable()) {
                        onLog('🌐 Thinking with collective brain...', 'info');
                        if (options.stream) {
                            resultText = await streamCollectiveResponse(task, onLog);
                        } else {
                            const messages = memory.getHistory();
                            const response = await collectiveBrain.chat(messages);
                            resultText = response.content || "Collective inference failed.";
                        }
                    } else {
                        // Fallback to local
                        onLog('⚠️ Collective not available, using local brain...', 'info');
                        const messages = memory.getHistory();
                        const response = await localBrain.chat(messages);
                        resultText = response.content || "I apologize, I couldn't generate a response.";
                    }
                    break;

                default:
                    // Local TPU Brain for general chat/reasoning
                    // Check if collective should be used
                    const brain = getActiveBrain();
                    const isCollective = brain === collectiveBrain;

                    if (isCollective) {
                        onLog('🌐 Thinking with collective brain...', 'info');
                    } else {
                        onLog('💭 Thinking with local TPU...', 'info');
                    }
                    
                    // Check for streaming preference
                    if (options.stream) {
                        if (isCollective) {
                            resultText = await streamCollectiveResponse(task, onLog);
                        } else {
                            resultText = await streamLocalResponse(task, onLog);
                        }
                    } else {
                        const messages = memory.getHistory();
                        const response = await brain.chat(messages);
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

/**
 * Stream response from collective brain
 */
async function streamCollectiveResponse(task, onLog) {
    if (!collectiveBrain) {
        onLog('⚠️ Collective brain not available', 'error');
        return "Collective brain not available.";
    }

    const messages = memory.getHistory();
    let fullResponse = '';

    try {
        for await (const chunk of collectiveBrain.chatStream(messages)) {
            fullResponse += chunk;
            send(EVENTS.STREAM_CHUNK, { text: chunk, collective: true });
        }
    } catch (err) {
        onLog(`Collective stream error: ${err.message}`, 'error');
    }

    return fullResponse || "Collective inference failed.";
}

// Start Server
const server = http.createServer(async (req, res) => {
    // Try to handle identity routes first
    if (await handleIdentityRoutes(req, res, identityManager)) {
        return;
    }
    
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
        
        case EVENTS.EXECUTE_COMMAND:
            // Handle slash commands
            await handleCommand(data.payload.command);
            break;
            
        default:
            console.log(`Unknown event type: ${data.type}`);
    }
}

/**
 * Handle slash commands from UI
 */
async function handleCommand(commandText) {
    const result = await commandProcessor.execute(commandText, (msg) => {
        send(EVENTS.LOG, { text: msg, type: 'info' });
    });
    
    if (result.message) {
        send(EVENTS.COMMAND_RESULT, { message: result.message });
    }
    
    // Handle command actions
    if (result.action) {
        await handleCommandAction(result.action, result.data);
    }
}

/**
 * Handle command actions that need special processing
 */
async function handleCommandAction(action, data) {
    switch (action) {
        case 'ask_ai':
            // Ask specific AI personality
            await askPersonality(data.personality, data.question);
            break;
            
        case 'ai_round':
            // Start round of AI exchanges
            await runAIRound(data.count);
            break;
            
        case 'analyze_document':
            // Have AI analyze document
            await analyzeDocument(data.personality, data.document, data.content, data.prompt);
            break;
            
        case 'start_private':
            privateChat = {
                personality: data.personality,
                history: []
            };
            break;
            
        case 'end_private':
            privateChat = null;
            break;
            
        case 'host_p2p':
            await startP2PHost(data.port);
            break;
            
        case 'join_p2p':
            await joinP2PRoom(data.shareCode);
            break;
            
        case 'leave_p2p':
            await leaveP2P();
            break;
            
        case 'remember':
            await androidToolCallback('remember', { content: data.content });
            send(EVENTS.COMMAND_RESULT, { message: '💾 Memory saved.' });
            break;
            
        case 'recall':
            const recallResult = await androidToolCallback('recall', { query: data.query });
            send(EVENTS.COMMAND_RESULT, { message: recallResult.output || 'No memories found.' });
            break;

        case 'list_models':
            try {
                const list = await modelManager.listModels();
                let msg = "**Available Models:**\n";
                list.available.forEach(m => {
                    const status = m.installed ? "✅ Installed" : (m.isDownloading ? `⬇️ ${m.progress}%` : "☁️ Cloud");
                    const size = m.size ? formatSize(m.size) : 'Unknown size';
                    msg += `- **${m.name}** (${m.id})\n  ${status} | ${size}\n  Filename: \`${m.filename}\`\n`;
                });
                send(EVENTS.COMMAND_RESULT, { message: msg });
            } catch (e) {
                send(EVENTS.ERROR, { message: `Failed to list models: ${e.message}` });
            }
            break;
            
        case 'download_model':
            send(EVENTS.COMMAND_RESULT, { message: `⬇️ Starting download for ${data.modelId}...` });
            modelManager.downloadModel(data.modelId, (progress) => {
                 // Optional: Send progress updates if needed, but might spam
            }).then(() => {
                 send(EVENTS.COMMAND_RESULT, { message: `✅ Download complete for ${data.modelId}` });
            }).catch(e => {
                 send(EVENTS.ERROR, { message: `Download failed: ${e.message}` });
            });
            break;
            
        case 'switch_model':
            try {
                const res = await modelManager.switchModel(data.modelName);
                send(EVENTS.COMMAND_RESULT, { message: res.success ? `✅ Switched to ${data.modelName}` : `❌ Failed: ${res.output}` });
            } catch (e) {
                send(EVENTS.ERROR, { message: `Switch failed: ${e.message}` });
            }
            break;

        // ============================================
        // COLLECTIVE MODE ACTIONS
        // ============================================

        case 'start_collective':
            await startCollective(data.port, data.poolName);
            break;

        case 'join_collective':
            await joinCollective(data.shareCode);
            break;

        case 'leave_collective':
            await leaveCollective();
            break;

        case 'collective_status':
            sendCollectiveStatus();
            break;

        case 'set_capability':
            if (collectiveClient) {
                collectiveClient.updateCapability(data.capability);
            }
            break;

        case 'use_collective':
            useCollectiveForNextInference = true;
            break;
    }
}

/**
 * Ask a specific AI personality a question
 */
async function askPersonality(personality, question) {
    send(EVENTS.LOG, { text: `${personality.avatar} ${personality.name} is thinking...`, type: 'info' });
    
    const systemPrompt = personalities.buildSystemPrompt(personality, {
        otherParticipants: personalities.getActive().filter(p => p.id !== personality.id).map(p => p.name)
    });
    
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
    ];
    
    try {
        const response = await localBrain.chat(messages);
        const content = response.content || "I'm not sure how to respond to that.";
        
        send(EVENTS.AI_RESPONSE, {
            personality: { id: personality.id, name: personality.name, avatar: personality.avatar },
            content,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        send(EVENTS.ERROR, { message: `${personality.name} failed to respond: ${e.message}` });
    }
}

/**
 * Run a round of AI exchanges
 */
async function runAIRound(count) {
    const active = personalities.getActive();
    if (active.length < 2) {
        send(EVENTS.COMMAND_RESULT, { message: 'Need at least 2 active personalities for a round.' });
        return;
    }
    
    let lastMessage = "What's something interesting you'd like to discuss?";
    
    for (let i = 0; i < count && !currentTaskAborted; i++) {
        // Pick a random personality
        const personality = active[i % active.length];
        
        const systemPrompt = personalities.buildSystemPrompt(personality, {
            otherParticipants: active.filter(p => p.id !== personality.id).map(p => p.name)
        });
        
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Continue this conversation naturally. Previous message: "${lastMessage}"` }
        ];
        
        try {
            const response = await localBrain.chat(messages);
            lastMessage = response.content || "...";
            
            send(EVENTS.AI_RESPONSE, {
                personality: { id: personality.id, name: personality.name, avatar: personality.avatar },
                content: lastMessage,
                timestamp: new Date().toISOString(),
                roundIndex: i + 1
            });
            
            // Small delay between responses
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.error('AI round error:', e);
        }
    }
    
    send(EVENTS.COMMAND_RESULT, { message: `🔄 Round complete. ${count} exchanges.` });
}

/**
 * Have AI analyze a document
 */
async function analyzeDocument(personality, document, content, prompt) {
    const systemPrompt = personalities.buildSystemPrompt(personality);
    
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this document and ${prompt}:\n\n${content}` }
    ];
    
    try {
        const response = await localBrain.chat(messages);
        
        send(EVENTS.AI_RESPONSE, {
            personality: { id: personality.id, name: personality.name, avatar: personality.avatar },
            content: `📊 Analysis of ${document.filename}:\n\n${response.content}`,
            timestamp: new Date().toISOString(),
            isAnalysis: true
        });
    } catch (e) {
        send(EVENTS.ERROR, { message: `Analysis failed: ${e.message}` });
    }
}

/**
 * Start P2P hosting
 */
async function startP2PHost(port) {
    if (p2pHost) {
        await p2pHost.stop();
    }
    
    p2pHost = new P2PHost({ port });
    
    try {
        const info = await p2pHost.start();
        
        send(EVENTS.P2P_STATUS, {
            status: 'hosting',
            port: info.port,
            shareCodes: info.shareCodes,
            localIPs: info.localIPs
        });
        
        send(EVENTS.COMMAND_RESULT, { 
            message: `🌐 Room is now shared!\n   Share code (LAN): ${info.shareCodes.lan}\n   Others can join with: /join <code>` 
        });
        
        // Handle P2P events
        p2pHost.on('ai_request', async (data) => {
            // Use requested personality or default to first active
            const active = personalities.getActive();
            const personality = data.personality 
                ? personalities.get(data.personality) 
                : active[0] || personalities.get('nova');
            await askPersonality(personality, data.task);
        });
        
    } catch (e) {
        send(EVENTS.ERROR, { message: `Failed to start P2P host: ${e.message}` });
    }
}

/**
 * Join a P2P room
 */
async function joinP2PRoom(shareCode) {
    if (p2pClient) {
        p2pClient.disconnect();
    }
    
    p2pClient = new P2PClient();
    
    try {
        const info = await p2pClient.connect(shareCode, 'Amphibian User');
        
        send(EVENTS.P2P_STATUS, {
            status: 'connected',
            clientId: info.clientId,
            participants: info.participants
        });
        
        send(EVENTS.COMMAND_RESULT, { message: '✅ Connected to remote room!' });
        
        // Handle incoming messages
        p2pClient.on('message', (msg) => {
            if (msg.type === 'AI_RESPONSE') {
                send(EVENTS.AI_RESPONSE, msg);
            } else if (msg.type === 'CHAT_MESSAGE') {
                send(EVENTS.LOG, { text: `${msg.from.name}: ${msg.content}`, type: 'chat' });
            }
        });
        
    } catch (e) {
        send(EVENTS.ERROR, { message: `Failed to join room: ${e.message}` });
    }
}

/**
 * Leave P2P session
 */
async function leaveP2P() {
    if (p2pHost) {
        await p2pHost.stop();
        p2pHost = null;
    }
    if (p2pClient) {
        p2pClient.disconnect();
        p2pClient = null;
    }
    
    send(EVENTS.P2P_STATUS, { status: 'disconnected' });
}

// ============================================
// COLLECTIVE MODE FUNCTIONS
// ============================================

/**
 * Start a collective pool as coordinator
 */
async function startCollective(port, poolName) {
    // Stop existing collective if any
    await leaveCollective();

    collectiveCoordinator = new CollectiveCoordinator({ port, poolName });

    try {
        const info = await collectiveCoordinator.start();

        // Create collective brain for this coordinator
        collectiveBrain = new CollectiveBrain(collectiveCoordinator);

        // Register collective brain with router
        router.register('collective', true);

        send(EVENTS.COLLECTIVE_STATUS, {
            mode: 'coordinator',
            status: 'running',
            poolName: info.poolName,
            port: info.port,
            shareCode: info.shareCode,
            localIPs: info.localIPs,
            devices: 0
        });

        send(EVENTS.COMMAND_RESULT, {
            message: `🌐 Collective pool started!\n` +
                     `   Pool: ${info.poolName}\n` +
                     `   Port: ${info.port}\n` +
                     `   Share code: ${info.shareCode}\n` +
                     `   Others can join with: /pool ${info.shareCode}`
        });

        // Set up event handlers
        collectiveCoordinator.on('device_joined', (device) => {
            send(EVENTS.LOG, { text: `🟢 ${device.name} joined the collective (${device.capability})`, type: 'info' });
            sendCollectiveStatus();
        });

        collectiveCoordinator.on('device_left', (device) => {
            send(EVENTS.LOG, { text: `🔴 ${device.name} left the collective`, type: 'info' });
            sendCollectiveStatus();
        });

        collectiveCoordinator.on('task_completed', ({ taskId }) => {
            send(EVENTS.LOG, { text: `✅ Collective task ${taskId} completed`, type: 'info' });
        });

        collectiveCoordinator.on('task_failed', ({ taskId }) => {
            send(EVENTS.LOG, { text: `❌ Collective task ${taskId} failed`, type: 'error' });
        });

        console.log(`🌐 Collective coordinator started on port ${port}`);

    } catch (e) {
        send(EVENTS.ERROR, { message: `Failed to start collective: ${e.message}` });
    }
}

/**
 * Join an existing collective pool
 */
async function joinCollective(shareCode) {
    // Stop existing collective if any
    await leaveCollective();

    collectiveClient = new CollectiveClient({
        localBrain,
        deviceName: `Amphibian_${Math.random().toString(36).substring(2, 6)}`,
        capability: detectDeviceCapability(),
        model: TPU_MODEL
    });

    try {
        const info = await collectiveClient.connect(shareCode);

        send(EVENTS.COLLECTIVE_STATUS, {
            mode: 'worker',
            status: 'connected',
            poolName: info.poolName,
            deviceId: info.deviceId,
            totalDevices: info.totalDevices
        });

        send(EVENTS.COMMAND_RESULT, {
            message: `✅ Joined collective pool "${info.poolName}"!\n` +
                     `   Device ID: ${info.deviceId}\n` +
                     `   Total devices: ${info.totalDevices}\n` +
                     `   Your device is now contributing to collective inference.`
        });

        // Set up event handlers
        collectiveClient.on('device_joined', (device) => {
            send(EVENTS.LOG, { text: `🟢 ${device.name} joined the collective`, type: 'info' });
        });

        collectiveClient.on('device_left', ({ deviceName }) => {
            send(EVENTS.LOG, { text: `🔴 ${deviceName} left the collective`, type: 'info' });
        });

        collectiveClient.on('disconnected', () => {
            send(EVENTS.COLLECTIVE_STATUS, { mode: 'worker', status: 'disconnected' });
            send(EVENTS.LOG, { text: '🔴 Disconnected from collective pool', type: 'warning' });
        });

        console.log(`📱 Joined collective as worker: ${info.deviceId}`);

    } catch (e) {
        send(EVENTS.ERROR, { message: `Failed to join collective: ${e.message}` });
    }
}

/**
 * Leave collective pool
 */
async function leaveCollective() {
    if (collectiveCoordinator) {
        await collectiveCoordinator.stop();
        collectiveCoordinator = null;
        collectiveBrain = null;
        console.log('🛑 Collective coordinator stopped');
    }

    if (collectiveClient) {
        collectiveClient.disconnect();
        collectiveClient = null;
        console.log('👋 Left collective pool');
    }

    send(EVENTS.COLLECTIVE_STATUS, { mode: null, status: 'inactive' });
}

/**
 * Send collective status to UI
 */
function sendCollectiveStatus() {
    if (collectiveCoordinator) {
        const status = collectiveCoordinator.getStatus();
        send(EVENTS.COLLECTIVE_STATUS, {
            mode: 'coordinator',
            status: 'running',
            poolName: status.poolName,
            devices: status.devices,
            deviceList: status.deviceList,
            queuedTasks: status.queuedTasks,
            activeTasks: status.activeTasks
        });

        // Also send readable message
        const deviceInfo = status.deviceList.map(d =>
            `   • ${d.name} (${d.capability}) - ${d.completedTasks} tasks`
        ).join('\n') || '   No devices connected';

        send(EVENTS.COMMAND_RESULT, {
            message: `**🌐 Collective Status (Coordinator)**\n` +
                     `Pool: ${status.poolName}\n` +
                     `Devices: ${status.devices}\n` +
                     `Queued Tasks: ${status.queuedTasks}\n` +
                     `Active Tasks: ${status.activeTasks}\n\n` +
                     `**Connected Devices:**\n${deviceInfo}`
        });

    } else if (collectiveClient) {
        const status = collectiveClient.getStatus();
        send(EVENTS.COLLECTIVE_STATUS, {
            mode: 'worker',
            status: status.isConnected ? 'connected' : 'disconnected',
            deviceId: status.deviceId,
            deviceName: status.deviceName,
            capability: status.capability,
            activeTasks: status.activeTasks,
            coordinator: status.coordinator
        });

        send(EVENTS.COMMAND_RESULT, {
            message: `**📱 Collective Status (Worker)**\n` +
                     `Pool: ${status.coordinator?.poolName || 'Unknown'}\n` +
                     `Device: ${status.deviceName} (${status.capability})\n` +
                     `Status: ${status.isConnected ? '🟢 Connected' : '🔴 Disconnected'}\n` +
                     `Active Tasks: ${status.activeTasks}`
        });

    } else {
        send(EVENTS.COLLECTIVE_STATUS, { mode: null, status: 'inactive' });
        send(EVENTS.COMMAND_RESULT, {
            message: `**Collective Mode Inactive**\n\n` +
                     `Use \`/collective\` to start a pool, or \`/pool <code>\` to join one.`
        });
    }
}

/**
 * Detect device capability based on environment
 */
function detectDeviceCapability() {
    // In production, this would detect TPU/NPU availability
    // For now, return medium as default
    if (process.env.TPU_AVAILABLE === 'true') {
        return 'tpu';
    }
    if (process.env.DEVICE_CAPABILITY) {
        return process.env.DEVICE_CAPABILITY;
    }
    return 'medium';
}

/**
 * Get the active brain (collective or local)
 */
function getActiveBrain() {
    if (useCollectiveForNextInference && collectiveBrain) {
        useCollectiveForNextInference = false; // Reset after use
        return collectiveBrain;
    }
    return localBrain;
}

function send(type, payload) {
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.send(JSON.stringify({ type, payload }));
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

server.listen(PORT, '127.0.0.1', () => {
    console.log(`🐸 Amphibian Bridge listening on 127.0.0.1:${PORT}`);
    console.log(`🎭 ${personalities.getActive().length} AI personalities active`);
});

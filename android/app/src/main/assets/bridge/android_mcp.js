/**
 * Android Local System MCP Server
 * 
 * Exposes the Android device capabilities (SMS, Files, etc.) as MCP tools.
 * Implements the full ClawdBot tool interface for on-device operations.
 * Sends commands up the WebSocket to the Android Kotlin app.
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// Tool Definitions - Complete ClawdBot Tool Set
const ANDROID_TOOLS = [
    // Communication Tools
    {
        name: "send_sms",
        description: "Send an SMS message to a phone number. Requires SEND_SMS permission.",
        inputSchema: {
            type: "object",
            properties: {
                phone: { type: "string", description: "Phone number to send SMS to" },
                message: { type: "string", description: "Message content" }
            },
            required: ["phone", "message"]
        }
    },
    {
        name: "make_call",
        description: "Initiate a phone call. Requires CALL_PHONE permission.",
        inputSchema: {
            type: "object",
            properties: {
                phone: { type: "string", description: "Phone number to call" }
            },
            required: ["phone"]
        }
    },
    
    // File System Tools
    {
        name: "read_file",
        description: "Read a file from app storage. Path is relative to app data directory.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path relative to app storage" }
            },
            required: ["path"]
        }
    },
    {
        name: "write_file",
        description: "Write content to a file in app storage.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path relative to app storage" },
                content: { type: "string", description: "Content to write" }
            },
            required: ["path", "content"]
        }
    },
    {
        name: "list_files",
        description: "List files in a directory within app storage.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Directory path (default: root)", default: "/" }
            }
        }
    },
    
    // Memory/RAG Tools
    {
        name: "remember",
        description: "Store a fact or concept in local long-term memory (RAG). Supports semantic search later.",
        inputSchema: {
            type: "object",
            properties: {
                content: { type: "string", description: "The text to remember" },
                tags: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Optional tags for categorization"
                }
            },
            required: ["content"]
        }
    },
    {
        name: "recall",
        description: "Retrieve relevant context from local memory using semantic search.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "What to search for" },
                limit: { type: "number", description: "Max results to return (default: 5)", default: 5 }
            },
            required: ["query"]
        }
    },
    
    // System Tools
    {
        name: "get_location",
        description: "Get the device's current GPS location. Requires location permission.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "open_url",
        description: "Open a URL in the default browser.",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "URL to open" }
            },
            required: ["url"]
        }
    },
    {
        name: "get_clipboard",
        description: "Get current clipboard contents.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "set_clipboard",
        description: "Set clipboard contents.",
        inputSchema: {
            type: "object",
            properties: {
                text: { type: "string", description: "Text to copy to clipboard" }
            },
            required: ["text"]
        }
    },
    
    // Local AI Tools
    {
        name: "inference",
        description: "Run local LLM inference using on-device TPU/GPU (Gemma model).",
        inputSchema: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "The prompt for inference" },
                max_tokens: { type: "number", description: "Maximum tokens to generate (default: 512)", default: 512 }
            },
            required: ["prompt"]
        }
    },
    
    // P2P Sync Tools
    {
        name: "sync_peer",
        description: "Sync memories with another Amphibian device on the same network.",
        inputSchema: {
            type: "object",
            properties: {
                ip: { type: "string", description: "IP address of peer device" }
            },
            required: ["ip"]
        }
    },
    {
        name: "discover_peers",
        description: "Discover other Amphibian devices on the local network.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    
    // App Control Tools
    {
        name: "get_notifications",
        description: "Get recent notifications (requires notification access permission).",
        inputSchema: {
            type: "object",
            properties: {
                limit: { type: "number", description: "Max notifications to return", default: 10 }
            }
        }
    },
    {
        name: "send_notification",
        description: "Send a local notification to the user.",
        inputSchema: {
            type: "object",
            properties: {
                title: { type: "string", description: "Notification title" },
                message: { type: "string", description: "Notification body" }
            },
            required: ["title", "message"]
        }
    }
];

class AndroidSystemServer {
    constructor(bridgeCallback) {
        this.bridgeCallback = bridgeCallback || this.defaultCallback;
        this.server = new Server(
            {
                name: "android-system",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
        console.log('📱 Android System MCP Server initialized with', ANDROID_TOOLS.length, 'tools');
    }
    
    // Default callback for testing outside Android
    defaultCallback = async (name, args) => {
        console.log(`📱 Android Tool (Simulated): ${name}`, args);
        return { 
            success: true, 
            message: `${name} executed (simulation mode)`,
            data: args 
        };
    };

    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return { tools: ANDROID_TOOLS };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            console.log(`📱 Android Tool Requested: ${name}`, args);
            
            try {
                // Validate tool exists
                const toolDef = ANDROID_TOOLS.find(t => t.name === name);
                if (!toolDef) {
                    throw new Error(`Unknown tool: ${name}`);
                }
                
                // Forward to Android Kotlin via Bridge Callback
                const result = await this.bridgeCallback(name, args || {});
                
                return {
                    content: [{
                        type: "text",
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                    }]
                };
            } catch (error) {
                console.error(`❌ Android Tool Error (${name}):`, error.message);
                return {
                    content: [{
                        type: "text",
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    async connect(transport) {
        await this.server.connect(transport);
    }
    
    // Get list of available tools (for external use)
    getTools() {
        return ANDROID_TOOLS;
    }
}

module.exports = AndroidSystemServer;

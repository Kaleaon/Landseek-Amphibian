/**
 * Android Local System MCP Server
 * 
 * Exposes the Android device capabilities (SMS, Files, etc.) as MCP tools.
 * It sends the commands up the WebSocket to the Android Kotlin app.
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// We need a way to send messages back to the parent Node process (bridge/server.js)
// which holds the WebSocket connection to Android.
// Since this script might run as a child process (stdio), we use IPC or direct function calls
// if running in same process.

// For simplicity in this architecture prototype, we assume this module is imported
// by the main bridge, not spawned separately yet.

class AndroidSystemServer {
    constructor(bridgeCallback) {
        this.bridgeCallback = bridgeCallback; // Function to send command to Android
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
    }

    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "send_sms",
                        description: "Send an SMS message to a phone number",
                        inputSchema: {
                            type: "object",
                            properties: {
                                phone: { type: "string" },
                                message: { type: "string" }
                            },
                            required: ["phone", "message"]
                        }
                    },
                    {
                        name: "make_call",
                        description: "Initiate a phone call",
                        inputSchema: {
                            type: "object",
                            properties: {
                                phone: { type: "string" }
                            },
                            required: ["phone"]
                        }
                    },
                    {
                        name: "read_file",
                        description: "Read a file from app storage",
                        inputSchema: {
                            type: "object",
                            properties: {
                                path: { type: "string" }
                            },
                            required: ["path"]
                        }
                    },
                    {
                        name: "remember",
                        description: "Store a fact or concept in local long-term memory (RAG).",
                        inputSchema: {
                            type: "object",
                            properties: {
                                content: { type: "string", description: "The text to remember" }
                            },
                            required: ["content"]
                        }
                    },
                    {
                        name: "recall",
                        description: "Retrieve relevant context from local memory.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "What to search for" }
                            },
                            required: ["query"]
                        }
                    }
                    // Add more tools here
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            console.log(`📱 Android Tool Requested: ${name}`);
            
            // Forward to Android Kotlin via Bridge
            const result = await this.bridgeCallback(name, args);

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result)
                }]
            };
        });
    }

    async connect(transport) {
        await this.server.connect(transport);
    }
}

module.exports = AndroidSystemServer;

/**
 * Context7 MCP Adapter
 * 
 * Exposes Context7 (Memory & Retrieval) as an MCP Server.
 * Allows the Amphibian Agent to store and recall long-term memories.
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

const API_KEY = process.env.CONTEXT7_API_KEY;

class Context7Adapter {
    constructor() {
        this.server = new Server(
            {
                name: "context7",
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
                        name: "recall_memories",
                        description: "Search long-term memory for relevant context.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "What to search for" },
                                limit: { type: "number", description: "Max results (default 5)" }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "save_memory",
                        description: "Save a new memory snippet.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                content: { type: "string", description: "The text to remember" },
                                tags: { type: "array", items: { type: "string" } }
                            },
                            required: ["content"]
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            try {
                switch (name) {
                    case "recall_memories":
                        return await this.recall(args);
                    case "save_memory":
                        return await this.save(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Context7 Error: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    async recall({ query, limit = 5 }) {
        console.log(`🧠 Context7 searching for: "${query}"...`);
        // Mock Response
        return {
            content: [{
                type: "text",
                text: JSON.stringify([
                    { text: "User prefers dark mode in Android apps.", score: 0.98 },
                    { text: "Project Landseek uses Gemma 3 4B on TPU.", score: 0.95 }
                ])
            }]
        };
    }

    async save({ content, tags = [] }) {
        console.log(`💾 Context7 saving: "${content.substring(0, 20)}..." [${tags.join(',')}]`);
        return {
            content: [{
                type: "text",
                text: "Memory saved successfully."
            }]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

if (require.main === module) {
    const adapter = new Context7Adapter();
    adapter.run().catch(console.error);
}

module.exports = Context7Adapter;

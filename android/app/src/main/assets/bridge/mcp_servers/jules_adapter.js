/**
 * Google Jules MCP Adapter
 * 
 * Exposes Google Jules (Coding Agent) as an MCP Server.
 * Allows the Amphibian Agent to delegate coding tasks to Jules.
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const axios = require('axios');

const API_KEY = process.env.JULES_API_KEY;
const BASE_URL = 'https://jules.googleapis.com/v1alpha';

class JulesAdapter {
    constructor() {
        this.server = new Server(
            {
                name: "google-jules",
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
                        name: "create_coding_session",
                        description: "Start a new coding session with Jules to modify code.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: { type: "string", description: "What code changes to make" },
                                source: { type: "string", description: "Source ID (e.g., github/user/repo)" },
                                branch: { type: "string", description: "Target branch (default: main)" }
                            },
                            required: ["prompt", "source"]
                        }
                    },
                    {
                        name: "list_sources",
                        description: "List available code repositories connected to Jules.",
                        inputSchema: {
                            type: "object",
                            properties: {}
                        }
                    },
                    {
                        name: "get_activity",
                        description: "Get the status/output of a Jules session.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                sessionId: { type: "string" }
                            },
                            required: ["sessionId"]
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            try {
                switch (name) {
                    case "create_coding_session":
                        return await this.createSession(args);
                    case "list_sources":
                        return await this.listSources();
                    case "get_activity":
                        return await this.getActivity(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Jules API Error: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    // --- Jules API Wrappers ---

    async listSources() {
        const response = await axios.get(`${BASE_URL}/sources`, {
            headers: { 'X-Goog-Api-Key': API_KEY }
        });
        return {
            content: [{
                type: "text",
                text: JSON.stringify(response.data)
            }]
        };
    }

    async createSession({ prompt, source, branch = 'main' }) {
        const payload = {
            prompt,
            sourceContext: {
                source,
                githubRepoContext: { startingBranch: branch }
            }
        };

        const response = await axios.post(`${BASE_URL}/sessions`, payload, {
            headers: { 
                'X-Goog-Api-Key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        return {
            content: [{
                type: "text",
                text: JSON.stringify(response.data)
            }]
        };
    }

    async getActivity({ sessionId }) {
        const response = await axios.get(`${BASE_URL}/${sessionId}/activities`, {
            headers: { 'X-Goog-Api-Key': API_KEY }
        });
        return {
            content: [{
                type: "text",
                text: JSON.stringify(response.data)
            }]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

// Start the server if running directly
if (require.main === module) {
    const adapter = new JulesAdapter();
    adapter.run().catch(console.error);
}

module.exports = JulesAdapter;

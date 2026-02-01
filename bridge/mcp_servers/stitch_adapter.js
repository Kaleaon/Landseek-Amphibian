/**
 * Google Stitch MCP Adapter
 * 
 * Exposes Google Stitch (UI Generation) as an MCP Server.
 * Allows the Amphibian Agent to generate Jetpack Compose UI code.
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const axios = require('axios');

const API_KEY = process.env.STITCH_API_KEY;
const BASE_URL = 'https://stitch.googleapis.com/v1beta'; // Assumed endpoint based on standard Google APIs

class StitchAdapter {
    constructor() {
        this.server = new Server(
            {
                name: "google-stitch",
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
                        name: "generate_ui",
                        description: "Generate Android UI (Jetpack Compose) from a text description.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: { type: "string", description: "Description of the UI screen (e.g. 'Login screen with biometric auth')" },
                                style: { type: "string", description: "Design system style (default: 'Material3')" }
                            },
                            required: ["prompt"]
                        }
                    },
                    {
                        name: "list_projects",
                        description: "List available UI projects.",
                        inputSchema: {
                            type: "object",
                            properties: {}
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            try {
                switch (name) {
                    case "generate_ui":
                        return await this.generateUI(args);
                    case "list_projects":
                        return await this.listProjects();
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Stitch API Error: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    // --- Stitch API Wrappers ---

    async listProjects() {
        // Mock implementation until live endpoint is confirmed
        return {
            content: [{
                type: "text",
                text: JSON.stringify({ projects: ["landseek-ui", "amphibian-dash"] })
            }]
        };
    }

    async generateUI({ prompt, style = 'Material3' }) {
        // Mocking the generation for prototype stability
        // In prod: await axios.post(`${BASE_URL}/generate`, ...)
        
        console.log(`🎨 Stitch Generating UI for: "${prompt}" in ${style}...`);
        
        // Simulating a generated Compose file
        const code = `
@Composable
fun GeneratedScreen() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(text = "${prompt}", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = { /* TODO */ }) {
            Text("Action")
        }
    }
}
        `;

        return {
            content: [{
                type: "text",
                text: code
            }]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

if (require.main === module) {
    const adapter = new StitchAdapter();
    adapter.run().catch(console.error);
}

module.exports = StitchAdapter;

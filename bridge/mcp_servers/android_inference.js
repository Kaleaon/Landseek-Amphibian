/**
 * Android Local Inference MCP Server
 *
 * Exposes the local TPU capabilities as MCP tools.
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

class AndroidInferenceServer {
    constructor(tpuBrain) {
        this.tpuBrain = tpuBrain;
        this.server = new Server(
            {
                name: "android-inference",
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
                        name: "local_inference",
                        description: "Run text generation on the local Android TPU (Gemma)",
                        inputSchema: {
                            type: "object",
                            properties: {
                                prompt: { type: "string" }
                            },
                            required: ["prompt"]
                        }
                    },
                    {
                        name: "local_classify",
                        description: "Classify text using the local model.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                text: { type: "string" },
                                categories: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "List of categories to choose from"
                                }
                            },
                            required: ["text", "categories"]
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            if (name === "local_inference") {
                try {
                    // We can handle streaming here if the MCP SDK supports it via notifications,
                    // but for a simple tool call, we'll return the full result.
                    const result = await this.tpuBrain.generate(args.prompt);
                    return {
                        content: [{ type: "text", text: result }]
                    };
                } catch (e) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Inference Failed: ${e.message}` }]
                    };
                }
            }

            if (name === "local_classify") {
                try {
                    // Construct a classification prompt
                    const prompt = `Classify the following text into one of these categories: ${args.categories.join(', ')}.\nText: "${args.text}"\nCategory:`;
                    const result = await this.tpuBrain.generate(prompt);
                    // Simple cleaning of the result
                    const category = result.trim().split('\n')[0];
                    return {
                        content: [{ type: "text", text: category }]
                    };
                } catch (e) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Classification Failed: ${e.message}` }]
                    };
                }
            }

            throw new Error(`Unknown tool: ${name}`);
        });
    }

    async connect(transport) {
        await this.server.connect(transport);
    }
}

module.exports = AndroidInferenceServer;

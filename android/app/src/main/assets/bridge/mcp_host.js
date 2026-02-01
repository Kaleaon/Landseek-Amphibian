/**
 * Amphibian MCP Host
 * 
 * Uses the Model Context Protocol SDK to connect the local agent
 * to external services (Jules, Context7, Stitch).
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

class AmphibianHost {
    constructor() {
        this.clients = new Map();
    }

    /**
     * Connect to a stdio-based MCP server
     */
    async connectStdioServer(name, command, args = [], env = {}) {
        console.log(`🔌 Connecting to MCP Server: ${name}...`);
        
        const transport = new StdioClientTransport({
            command: command,
            args: args,
            env: { ...process.env, ...env }
        });

        const client = new Client({
            name: "AmphibianHost",
            version: "1.0.0",
        }, {
            capabilities: {
                prompts: {},
                resources: {},
                tools: {},
            },
        });

        await client.connect(transport);
        this.clients.set(name, client);
        
        console.log(`✅ Connected to ${name}`);
        return client;
    }

    /**
     * Aggregate all tools from all connected MCP servers
     */
    async getAllTools() {
        let allTools = [];
        
        for (const [name, client] of this.clients) {
            try {
                const result = await client.listTools();
                // Prefix tool names to avoid collisions? e.g. "jules_create_session"
                const tools = result.tools.map(t => ({
                    ...t,
                    name: `${name}_${t.name}`, 
                    server: name
                }));
                allTools = allTools.concat(tools);
            } catch (e) {
                console.error(`Failed to list tools for ${name}:`, e);
            }
        }
        
        return allTools;
    }

    /**
     * Execute a tool on the appropriate server
     */
    async callTool(serverName, toolName, args) {
        try {
            const client = this.clients.get(serverName);
            if (!client) throw new Error(`Unknown MCP server: ${serverName}`);

            // Strip prefix if we added one
            const realToolName = toolName.replace(`${serverName}_`, '');

            console.log(`🛠️ Calling tool ${realToolName} on ${serverName}...`);
            const result = await client.callTool({
                name: realToolName,
                arguments: args
            });
            return result;
        } catch (error) {
            console.error(`❌ MCP Tool Call Error (${serverName}:${toolName}):`, error);
            // Return a standard error response so the agent sees the failure
            return {
                content: [{
                    type: "text",
                    text: `Tool execution failed: ${error.message}`
                }],
                isError: true
            };
        }
    }
}

module.exports = AmphibianHost;

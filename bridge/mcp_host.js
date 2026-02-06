/**
 * Amphibian MCP Host
 *
 * Uses the Model Context Protocol SDK to connect the local agent
 * to external MCP servers. Loads server configuration from mcp.json.
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const fs = require('fs');
const path = require('path');

class AmphibianHost {
    constructor() {
        this.clients = new Map();
        this.serverInfo = new Map(); // name -> { description, tools }
    }

    /**
     * Load MCP server configuration from mcp.json
     * Searches: ./mcp.json, ../mcp.json, ~/.amphibian/mcp.json
     */
    loadConfig() {
        const searchPaths = [
            path.join(process.cwd(), 'mcp.json'),
            path.join(require('os').homedir(), '.amphibian', 'mcp.json'),
            path.join(__dirname, '..', 'mcp.json')
        ];

        for (const configPath of searchPaths) {
            try {
                if (fs.existsSync(configPath)) {
                    const raw = fs.readFileSync(configPath, 'utf8');
                    const config = JSON.parse(raw);
                    console.log(`📄 Loaded MCP config from ${configPath}`);
                    return config;
                }
            } catch (e) {
                console.warn(`⚠️ Failed to parse ${configPath}: ${e.message}`);
            }
        }

        console.log('📄 No mcp.json found, running without MCP servers');
        return { mcpServers: {} };
    }

    /**
     * Connect all enabled MCP servers from config
     */
    async connectFromConfig() {
        const config = this.loadConfig();
        const servers = config.mcpServers || {};
        let connected = 0;
        let failed = 0;

        for (const [name, serverConfig] of Object.entries(servers)) {
            // Skip disabled servers
            if (serverConfig.enabled === false) continue;
            // Skip entries that are clearly documentation
            if (!serverConfig.command) continue;

            try {
                await this.connectStdioServer(
                    name,
                    serverConfig.command,
                    serverConfig.args || [],
                    serverConfig.env || {}
                );
                this.serverInfo.set(name, {
                    description: serverConfig.description || name,
                    command: serverConfig.command
                });
                connected++;
            } catch (e) {
                console.warn(`⚠️ Failed to connect MCP server "${name}": ${e.message}`);
                failed++;
            }
        }

        if (connected > 0 || failed > 0) {
            console.log(`🔌 MCP: ${connected} connected, ${failed} failed`);
        }

        return { connected, failed };
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

        // Discover and cache tools
        try {
            const result = await client.listTools();
            const info = this.serverInfo.get(name) || {};
            info.tools = result.tools || [];
            this.serverInfo.set(name, info);
            console.log(`✅ Connected to ${name} (${info.tools.length} tools)`);
        } catch (e) {
            console.log(`✅ Connected to ${name}`);
        }

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
                const tools = result.tools.map(t => ({
                    ...t,
                    name: `${name}_${t.name}`,
                    server: name
                }));
                allTools = allTools.concat(tools);
            } catch (e) {
                console.error(`Failed to list tools for ${name}:`, e.message);
            }
        }

        return allTools;
    }

    /**
     * Get connected server summary for display
     */
    getServerSummary() {
        const summary = [];
        for (const [name, info] of this.serverInfo) {
            const toolCount = info.tools ? info.tools.length : '?';
            summary.push({
                name,
                description: info.description || name,
                tools: toolCount,
                connected: this.clients.has(name)
            });
        }
        return summary;
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
            console.error(`❌ MCP Tool Call Error (${serverName}:${toolName}):`, error.message);
            return {
                content: [{
                    type: "text",
                    text: `Tool execution failed: ${error.message}`
                }],
                isError: true
            };
        }
    }

    /**
     * Disconnect all MCP servers
     */
    async disconnectAll() {
        for (const [name, client] of this.clients) {
            try {
                await client.close();
                console.log(`🔌 Disconnected from ${name}`);
            } catch (e) {
                // Ignore close errors
            }
        }
        this.clients.clear();
    }
}

module.exports = AmphibianHost;

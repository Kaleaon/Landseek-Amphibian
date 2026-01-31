/**
 * Command System
 * 
 * Handles slash commands in the chat like Landseek.
 * Commands: /tools, /upload, /analyze, /private, /round, etc.
 */

class CommandProcessor {
    constructor(context) {
        // Context contains references to services
        this.personalities = context.personalities;
        this.documents = context.documents;
        this.p2p = context.p2p;
        this.localBrain = context.localBrain;
        this.memory = context.memory;
        
        // Command handlers
        this.commands = new Map();
        this.registerDefaultCommands();
    }

    /**
     * Check if text is a command
     */
    isCommand(text) {
        return text.trim().startsWith('/');
    }

    /**
     * Parse command and arguments
     */
    parseCommand(text) {
        const trimmed = text.trim();
        if (!trimmed.startsWith('/')) return null;

        const parts = trimmed.slice(1).split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        const argsString = args.join(' ');

        return { command, args, argsString };
    }

    /**
     * Execute a command
     */
    async execute(text, onOutput) {
        const parsed = this.parseCommand(text);
        if (!parsed) {
            return { success: false, message: 'Not a command' };
        }

        const handler = this.commands.get(parsed.command);
        if (!handler) {
            return { 
                success: false, 
                message: `Unknown command: /${parsed.command}\nType /help for available commands.` 
            };
        }

        try {
            const result = await handler.execute(parsed.args, parsed.argsString, onOutput);
            return { success: true, ...result };
        } catch (e) {
            return { success: false, message: `Error: ${e.message}` };
        }
    }

    /**
     * Register a command
     */
    register(name, description, execute, usage = '') {
        this.commands.set(name.toLowerCase(), { name, description, execute, usage });
    }

    /**
     * Register all default commands
     */
    registerDefaultCommands() {
        // Help command
        this.register('help', 'Show available commands', async () => {
            const lines = ['**📋 Available Commands:**\n'];
            
            for (const [name, cmd] of this.commands) {
                lines.push(`\`/${name}\` - ${cmd.description}`);
                if (cmd.usage) {
                    lines.push(`   Usage: ${cmd.usage}`);
                }
            }
            
            return { message: lines.join('\n') };
        });

        // Quit/exit
        this.register('quit', 'Exit the chat', async () => {
            return { message: '👋 Goodbye!', action: 'quit' };
        });

        // Clear chat history
        this.register('clear', 'Clear chat history', async () => {
            if (this.memory) {
                this.memory.clear();
            }
            return { message: '🗑️ Chat history cleared.', action: 'clear' };
        });

        // List tools
        this.register('tools', 'List available tools', async () => {
            const tools = [
                '**📁 MATH**',
                '  • `calculate(expression)` - Evaluate math',
                '  • `unit_convert(value, from, to)` - Convert units',
                '',
                '**📁 DATETIME**',
                '  • `get_current_time()` - Get current time',
                '',
                '**📁 TEXT**',
                '  • `word_count(text)` - Count words',
                '  • `search_text(text, pattern)` - Search text',
                '',
                '**📁 ANDROID**',
                '  • `send_sms(phone, message)` - Send SMS',
                '  • `make_call(phone)` - Make call',
                '  • `read_file(path)` - Read file',
                '  • `remember(content)` - Save to memory',
                '  • `recall(query)` - Search memory',
            ];
            return { message: tools.join('\n') };
        }, '/tools');

        // AI Personalities
        this.register('personalities', 'List AI personalities', async () => {
            if (!this.personalities) {
                return { message: 'Personality system not initialized.' };
            }
            return { message: this.personalities.listFormatted() };
        });

        // Add AI to chat
        this.register('add', 'Add an AI to the chat', async (args) => {
            if (!this.personalities || args.length === 0) {
                return { message: 'Usage: /add <personality_id>' };
            }
            
            const id = args[0].toLowerCase();
            const result = this.personalities.activate(id);
            
            if (result) {
                const p = this.personalities.get(id);
                return { message: `➕ ${p.avatar} ${p.name} joined the chat!` };
            }
            return { message: `Unknown personality: ${id}` };
        }, '/add <nova|echo|sage|...>');

        // Remove AI from chat
        this.register('remove', 'Remove an AI from the chat', async (args) => {
            if (!this.personalities || args.length === 0) {
                return { message: 'Usage: /remove <personality_id>' };
            }
            
            const id = args[0].toLowerCase();
            const p = this.personalities.get(id);
            
            if (p && this.personalities.deactivate(id)) {
                return { message: `➖ ${p.avatar} ${p.name} left the chat.` };
            }
            return { message: `Unknown personality: ${id}` };
        }, '/remove <personality_id>');

        // Rename AI
        this.register('rename', 'Rename an AI personality', async (args) => {
            if (!this.personalities || args.length < 2) {
                return { message: 'Usage: /rename <personality_id> <new_name>' };
            }
            
            const id = args[0].toLowerCase();
            const newName = args.slice(1).join(' ');
            const result = this.personalities.rename(id, newName);
            
            if (result) {
                return { message: `✏️ ${result.oldName} is now known as ${result.newName}` };
            }
            return { message: `Unknown personality: ${id}` };
        }, '/rename <personality_id> <new_name>');

        // Ask specific AI
        this.register('ask', 'Ask a specific AI a question', async (args, argsString, onOutput) => {
            if (!this.personalities || args.length < 2) {
                return { message: 'Usage: /ask <personality_id> <question>' };
            }
            
            const id = args[0].toLowerCase();
            const question = args.slice(1).join(' ');
            const personality = this.personalities.get(id);
            
            if (!personality) {
                return { message: `Unknown personality: ${id}` };
            }
            
            // This would trigger AI response - return action for main handler
            return { 
                message: null, 
                action: 'ask_ai',
                data: { personality, question }
            };
        }, '/ask <personality_id> <question>');

        // Round of AI exchanges
        this.register('round', 'Start N exchanges between AIs', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /round <number>' };
            }
            
            const count = parseInt(args[0]);
            if (isNaN(count) || count < 1 || count > 10) {
                return { message: 'Please specify a number between 1 and 10.' };
            }
            
            return { 
                message: `🔄 Starting ${count} AI exchanges...`,
                action: 'ai_round',
                data: { count }
            };
        }, '/round <1-10>');

        // Upload document
        this.register('upload', 'Upload a document', async (args) => {
            if (!this.documents || args.length === 0) {
                return { message: 'Usage: /upload <file_path>' };
            }
            
            const filePath = args.join(' ');
            
            try {
                const result = await this.documents.upload(filePath);
                const previewText = result.preview ? result.preview.slice(0, 100) : '';
                return { 
                    message: `✅ Document uploaded: 📄 ${result.filename} (${result.size})\n   Preview: ${previewText}...`
                };
            } catch (e) {
                return { message: `❌ Upload failed: ${e.message}` };
            }
        }, '/upload <file_path>');

        // List documents
        this.register('docs', 'List uploaded documents', async () => {
            if (!this.documents) {
                return { message: 'Document system not initialized.' };
            }
            
            const docs = this.documents.list();
            if (docs.length === 0) {
                return { message: 'No documents uploaded. Use /upload <path> to add one.' };
            }
            
            const lines = ['**📄 Uploaded Documents:**\n'];
            const activeId = this.documents.activeDocument;
            
            for (const doc of docs) {
                const active = doc.id === activeId ? '▶️' : '  ';
                lines.push(`${active} ${doc.filename} (${doc.size}) - ${doc.category}`);
            }
            
            return { message: lines.join('\n') };
        });

        // Select document
        this.register('select', 'Select a document as active', async (args) => {
            if (!this.documents || args.length === 0) {
                return { message: 'Usage: /select <filename>' };
            }
            
            const filename = args.join(' ');
            const doc = this.documents.getByName(filename);
            
            if (doc && this.documents.select(doc.id)) {
                return { message: `📄 Selected: ${doc.filename}` };
            }
            return { message: `Document not found: ${filename}` };
        }, '/select <filename>');

        // Analyze document
        this.register('analyze', 'Have an AI analyze the active document', async (args, argsString) => {
            if (!this.documents || !this.personalities) {
                return { message: 'Document or personality system not initialized.' };
            }
            
            if (args.length < 2) {
                return { message: 'Usage: /analyze <personality_id> <prompt>' };
            }
            
            const activeDoc = this.documents.getActive();
            if (!activeDoc) {
                return { message: 'No document selected. Use /select <filename> first.' };
            }
            
            const personalityId = args[0].toLowerCase();
            const prompt = args.slice(1).join(' ');
            const personality = this.personalities.get(personalityId);
            
            if (!personality) {
                return { message: `Unknown personality: ${personalityId}` };
            }
            
            const content = this.documents.getContentForAnalysis(activeDoc.id);
            
            return {
                message: `🔍 ${personality.name} is analyzing ${activeDoc.filename}...`,
                action: 'analyze_document',
                data: { personality, document: activeDoc, content, prompt }
            };
        }, '/analyze <personality_id> <prompt>');

        // Private chat
        this.register('private', 'Start private chat with an AI', async (args) => {
            if (!this.personalities || args.length === 0) {
                return { message: 'Usage: /private <personality_id>' };
            }
            
            const id = args[0].toLowerCase();
            const personality = this.personalities.get(id);
            
            if (!personality) {
                return { message: `Unknown personality: ${id}` };
            }
            
            return {
                message: `🔒 Started private chat with ${personality.avatar} ${personality.name}`,
                action: 'start_private',
                data: { personality }
            };
        }, '/private <personality_id>');

        // End private chat
        this.register('endprivate', 'End private chat', async () => {
            return {
                message: '🔓 Private conversation ended',
                action: 'end_private'
            };
        });

        // Host P2P room
        this.register('host', 'Host a P2P room', async (args) => {
            const port = args.length > 0 ? parseInt(args[0]) : 8765;
            
            return {
                message: `🌐 Starting P2P host on port ${port}...`,
                action: 'host_p2p',
                data: { port }
            };
        }, '/host [port]');

        // Join P2P room
        this.register('join', 'Join a P2P room', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /join <share_code>' };
            }
            
            return {
                message: '🔌 Connecting to P2P room...',
                action: 'join_p2p',
                data: { shareCode: args[0] }
            };
        }, '/join <share_code>');

        // Leave P2P room
        this.register('leave', 'Leave the P2P room', async () => {
            return {
                message: '👋 Leaving P2P room...',
                action: 'leave_p2p'
            };
        });

        // Remember
        this.register('remember', 'Save something to memory', async (args, argsString) => {
            if (args.length === 0) {
                return { message: 'Usage: /remember <text to remember>' };
            }
            
            return {
                action: 'remember',
                data: { content: argsString },
                message: `💾 Saving to memory: "${argsString.substring(0, 50)}..."`
            };
        }, '/remember <text>');

        // Recall
        this.register('recall', 'Search memory', async (args, argsString) => {
            if (args.length === 0) {
                return { message: 'Usage: /recall <search query>' };
            }
            
            return {
                action: 'recall',
                data: { query: argsString },
                message: `🔍 Searching memory for: "${argsString}"`
            };
        }, '/recall <query>');

        // Supported formats
        this.register('formats', 'List supported file formats', async () => {
            if (!this.documents) {
                return { message: 'Document system not initialized.' };
            }
            return { message: this.documents.listSupportedFormats() };
        });
    }

    /**
     * Get list of commands for help
     */
    getCommandList() {
        return Array.from(this.commands.entries()).map(([name, cmd]) => ({
            name,
            description: cmd.description,
            usage: cmd.usage
        }));
    }
}

module.exports = { CommandProcessor };

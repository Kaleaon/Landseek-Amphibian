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

        // List models
        this.register('models', 'List available AI models', async () => {
            return {
                message: '📋 Fetching model list...',
                action: 'list_models'
            };
        });

        // Download model
        this.register('download', 'Download an AI model', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /download <model_id>' };
            }
            return {
                message: null,
                action: 'download_model',
                data: { modelId: args[0] }
            };
        }, '/download <model_id>');

        // Switch model
        this.register('switch', 'Switch active AI model', async (args) => {
             if (args.length === 0) {
                return { message: 'Usage: /switch <model_filename>' };
            }
            return {
                message: null,
                action: 'switch_model',
                data: { modelName: args[0] }
            };
        }, '/switch <model_filename>');

        // Supported formats
        this.register('formats', 'List supported file formats', async () => {
            if (!this.documents) {
                return { message: 'Document system not initialized.' };
            }
            return { message: this.documents.listSupportedFormats() };
        });

        // ============================================
        // COLLECTIVE MODE COMMANDS
        // ============================================

        // Start collective pool
        this.register('collective', 'Start a new collective pool', async (args) => {
            const port = args.length > 0 ? parseInt(args[0]) : 8766;
            const poolName = args.length > 1 ? args.slice(1).join(' ') : 'Amphibian Collective';
            
            return {
                message: `🌐 Starting Collective pool "${poolName}" on port ${port}...`,
                action: 'start_collective',
                data: { port, poolName }
            };
        }, '/collective [port] [pool_name]');

        // Join collective pool
        this.register('pool', 'Join an existing collective pool', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /pool <share_code>' };
            }
            
            return {
                message: '🔌 Joining collective pool...',
                action: 'join_collective',
                data: { shareCode: args[0] }
            };
        }, '/pool <share_code>');

        // Leave collective
        this.register('unpool', 'Leave the collective pool', async () => {
            return {
                message: '👋 Leaving collective pool...',
                action: 'leave_collective'
            };
        });

        // Collective status
        this.register('poolstatus', 'Show collective pool status', async () => {
            return {
                action: 'collective_status',
                message: null
            };
        });

        // Set device capability for collective
        this.register('capability', 'Set device capability for collective', async (args) => {
            if (args.length === 0) {
                return { 
                    message: '**Device Capability Levels:**\n' +
                             '• `low` - Small chunks (1-2 tokens)\n' +
                             '• `medium` - Moderate chunks (8-16 tokens)\n' +
                             '• `high` - Large chunks (32+ tokens)\n' +
                             '• `tpu` - TPU/NPU acceleration\n\n' +
                             'Usage: /capability <level>'
                };
            }
            
            const capability = args[0].toLowerCase();
            const valid = ['low', 'medium', 'high', 'tpu'];
            
            if (!valid.includes(capability)) {
                return { message: `Invalid capability. Choose from: ${valid.join(', ')}` };
            }
            
            return {
                action: 'set_capability',
                data: { capability },
                message: `📊 Device capability set to: ${capability}`
            };
        }, '/capability <low|medium|high|tpu>');

        // Use collective brain for next inference
        this.register('usecollective', 'Use collective brain for inference', async () => {
            return {
                action: 'use_collective',
                message: '🧠 Next inference will use the collective pool.'
            };
        });

        // ============================================
        // OPENCLAW OPEN POOL COMMANDS
        // ============================================

        // Start open pool
        this.register('openpool', 'Start an OpenClaw open pool for any ClawBot', async (args) => {
            const port = args.length > 0 ? parseInt(args[0]) : 8767;
            const poolName = args.length > 1 ? args.slice(1).join(' ') : 'OpenClaw Public Pool';
            
            return {
                message: `🌐 Starting OpenClaw pool "${poolName}" on port ${port}...`,
                action: 'start_openpool',
                data: { port, poolName }
            };
        }, '/openpool [port] [pool_name]');

        // Join open pool as ClawBot
        this.register('joinopen', 'Join an OpenClaw open pool as a ClawBot', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /joinopen <host:port> [bot_name]' };
            }
            
            const [host, port] = args[0].includes(':') ? args[0].split(':') : [args[0], '8767'];
            const botName = args.length > 1 ? args.slice(1).join(' ') : null;
            
            return {
                message: '🤖 Joining OpenClaw pool...',
                action: 'join_openpool',
                data: { host, port: parseInt(port), botName }
            };
        }, '/joinopen <host:port> [bot_name]');

        // Leave open pool
        this.register('leaveopen', 'Leave the OpenClaw pool', async () => {
            return {
                message: '👋 Leaving OpenClaw pool...',
                action: 'leave_openpool'
            };
        });

        // Open pool status
        this.register('openstatus', 'Show OpenClaw pool status', async () => {
            return {
                action: 'openpool_status',
                message: null
            };
        });

        // Start open training
        this.register('opentrain', 'Start open training on the pool', async (args) => {
            const modelName = args.length > 0 ? args[0] : 'amphibian-lora';
            
            return {
                message: `🎓 Starting open training for ${modelName}...`,
                action: 'start_open_training',
                data: { modelName }
            };
        }, '/opentrain [model_name]');

        // Submit task to open pool
        this.register('submittask', 'Submit a task to the OpenClaw pool', async (args, argsString) => {
            if (args.length < 2) {
                return { message: 'Usage: /submittask <type> <payload>\nTypes: inference, training, validation' };
            }
            
            const taskType = args[0];
            const payload = args.slice(1).join(' ');
            
            return {
                message: `📤 Submitting ${taskType} task...`,
                action: 'submit_open_task',
                data: { taskType, payload }
            };
        }, '/submittask <type> <payload>');

        // Show contribution leaderboard
        this.register('leaderboard', 'Show OpenClaw contribution leaderboard', async () => {
            return {
                action: 'show_leaderboard',
                message: null
            };
        });

        // Claim available task
        this.register('claimtask', 'Claim an available task from the pool', async () => {
            return {
                action: 'claim_task',
                message: '🎯 Looking for available tasks...'
            };
        });

        // ============================================
        // UNIVERSAL DEVICE HOST COMMANDS
        // ============================================

        // Start device as a universal host
        this.register('hostdevice', 'Start this device as a universal host for ClawBots', async (args) => {
            const port = args.length > 0 ? parseInt(args[0]) : 8768;
            const deviceType = args.length > 1 ? args[1] : 'auto';
            
            return {
                message: `🏠 Starting Universal Host on port ${port}...`,
                action: 'start_device_host',
                data: { port, deviceType }
            };
        }, '/hostdevice [port] [device_type]');

        // Stop device hosting
        this.register('stophost', 'Stop hosting ClawBots on this device', async () => {
            return {
                message: '🛑 Stopping device host...',
                action: 'stop_device_host'
            };
        });

        // Show host status
        this.register('hoststatus', 'Show universal host status', async () => {
            return {
                action: 'device_host_status',
                message: null
            };
        });

        // Discover other hosts on network
        this.register('discover', 'Discover other Amphibian hosts on the network', async () => {
            return {
                message: '🔍 Scanning for hosts...',
                action: 'discover_hosts'
            };
        });

        // Connect to a discovered host
        this.register('connecthost', 'Connect to a discovered host', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /connecthost <host:port> [bot_name]' };
            }
            
            const [host, port] = args[0].includes(':') ? args[0].split(':') : [args[0], '8768'];
            const botName = args.length > 1 ? args.slice(1).join(' ') : null;
            
            return {
                message: '🔌 Connecting to host...',
                action: 'connect_to_host',
                data: { host, port: parseInt(port), botName }
            };
        }, '/connecthost <host:port> [bot_name]');

        // Set device type profile
        this.register('devicetype', 'Set or show device type profile', async (args) => {
            if (args.length === 0) {
                return {
                    action: 'show_device_types',
                    message: null
                };
            }
            
            const deviceType = args[0].toLowerCase();
            
            return {
                message: `📱 Setting device type to: ${deviceType}`,
                action: 'set_device_type',
                data: { deviceType }
            };
        }, '/devicetype [type]');

        // Set power mode
        this.register('powermode', 'Set device power mode', async (args) => {
            const validModes = ['performance', 'balanced', 'power_save', 'ultra_low'];
            
            if (args.length === 0 || !validModes.includes(args[0].toLowerCase())) {
                return { message: `Usage: /powermode <${validModes.join('|')}>` };
            }
            
            const mode = args[0].toLowerCase();
            
            return {
                message: `⚡ Setting power mode to: ${mode}`,
                action: 'set_power_mode',
                data: { mode }
            };
        }, '/powermode <performance|balanced|power_save|ultra_low>');

        // List supported device types
        this.register('devicetypes', 'List all supported device types', async () => {
            return {
                action: 'list_device_types',
                message: null
            };
        });

        // ============================================
        // ETHICS AND SECURITY COMMANDS
        // ============================================

        // Show ethics guidelines
        this.register('ethics', 'Show ethics guidelines for the open pool', async () => {
            return {
                action: 'show_ethics_guidelines',
                message: null
            };
        });

        // Review a task manually
        this.register('reviewtask', 'Manually review a task for ethics compliance', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /reviewtask <task_id>' };
            }
            
            return {
                message: '🔍 Reviewing task for ethics compliance...',
                action: 'review_task_ethics',
                data: { taskId: args[0] }
            };
        }, '/reviewtask <task_id>');

        // Show ethics statistics
        this.register('ethicsstats', 'Show ethics review statistics', async () => {
            return {
                action: 'show_ethics_stats',
                message: null
            };
        });

        // Report a violation
        this.register('reportviolation', 'Report an ethics violation', async (args, argsString) => {
            if (args.length < 2) {
                return { message: 'Usage: /reportviolation <task_id|extension_name> <reason>' };
            }
            
            const target = args[0];
            const reason = args.slice(1).join(' ');
            
            return {
                message: '📝 Submitting violation report...',
                action: 'report_violation',
                data: { target, reason }
            };
        }, '/reportviolation <target> <reason>');

        // Scan an extension
        this.register('scanext', 'Scan a ClawBot extension for security threats', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /scanext <extension_name_or_url>' };
            }
            
            return {
                message: '🔒 Scanning extension for security threats...',
                action: 'scan_extension',
                data: { extension: args[0] }
            };
        }, '/scanext <extension_name_or_url>');

        // Show blocked extensions
        this.register('blockedext', 'Show list of blocked/hazardous extensions', async () => {
            return {
                action: 'show_blocked_extensions',
                message: null
            };
        });

        // Report malicious extension
        this.register('reportext', 'Report a malicious extension', async (args, argsString) => {
            if (args.length < 2) {
                return { message: 'Usage: /reportext <extension_name> <reason>' };
            }
            
            const extensionName = args[0];
            const reason = args.slice(1).join(' ');
            
            return {
                message: '⚠️ Reporting extension to security board...',
                action: 'report_extension',
                data: { extensionName, reason }
            };
        }, '/reportext <extension_name> <reason>');

        // Check extension status
        this.register('extstat', 'Check security status of an extension', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /extstat <extension_name>' };
            }
            
            return {
                action: 'check_extension_status',
                data: { extensionName: args[0] },
                message: null
            };
        }, '/extstat <extension_name>');

        // ============================================
        // GLOBAL DISCOVERY COMMANDS
        // ============================================

        // Start global directory server
        this.register('directory', 'Start a global directory server', async (args) => {
            const port = args.length > 0 ? parseInt(args[0]) : 8770;
            const region = args.length > 1 ? args[1] : 'local';
            
            return {
                message: `🌐 Starting global directory server on port ${port}...`,
                action: 'start_directory_server',
                data: { port, region }
            };
        }, '/directory [port] [region]');

        // Connect to global directory
        this.register('global', 'Connect to global device directory', async (args) => {
            const directoryUrl = args.length > 0 ? args[0] : null;
            
            return {
                message: '🌍 Connecting to global directory...',
                action: 'connect_global_directory',
                data: { directoryUrl }
            };
        }, '/global [directory_url]');

        // Search for devices globally
        this.register('globalsearch', 'Search for devices globally', async (args) => {
            const query = args.join(' ') || '';
            
            return {
                message: '🔍 Searching global directory...',
                action: 'search_global_devices',
                data: { query }
            };
        }, '/globalsearch [query]');

        // Search for pools globally
        this.register('findpools', 'Find public pools globally', async (args) => {
            const region = args.length > 0 ? args[0] : null;
            
            return {
                message: '🏊 Searching for public pools...',
                action: 'search_global_pools',
                data: { region }
            };
        }, '/findpools [region]');

        // Connect to a remote device
        this.register('connectglobal', 'Connect to a remote device via global directory', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /connectglobal <device_id>' };
            }
            
            return {
                message: '🔌 Connecting to remote device...',
                action: 'connect_global_device',
                data: { deviceId: args[0] }
            };
        }, '/connectglobal <device_id>');

        // Show global connection status
        this.register('globalstatus', 'Show global directory connection status', async () => {
            return {
                action: 'show_global_status',
                message: null
            };
        });

        // ============================================
        // HUMANITY GUARDIAN COMMANDS
        // ============================================

        // Show Guardian principles
        this.register('guardian', 'Show Humanity Guardian principles and status', async () => {
            return {
                action: 'show_guardian_principles',
                message: null
            };
        });

        // Report a threat
        this.register('reportthreat', 'Report a threat to the Humanity Guardian', async (args, argsString) => {
            if (args.length < 2) {
                return { message: 'Usage: /reportthreat <type> <target> [description]\n\nThreat types: malware, phishing, ransomware, fraud, harassment, exploitation' };
            }
            
            const type = args[0];
            const target = args[1];
            const description = args.slice(2).join(' ');
            
            return {
                message: '🚨 Reporting threat to Humanity Guardian Council...',
                action: 'report_threat',
                data: { type, target, description }
            };
        }, '/reportthreat <type> <target> [description]');

        // View active threats
        this.register('threats', 'View active threats being monitored', async () => {
            return {
                action: 'show_active_threats',
                message: null
            };
        });

        // Get threat details
        this.register('threat', 'Get details about a specific threat', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /threat <threat_id>' };
            }
            
            return {
                action: 'get_threat_details',
                data: { threatId: args[0] },
                message: null
            };
        }, '/threat <threat_id>');

        // Request protective action
        this.register('protect', 'Request protective action against a threat', async (args) => {
            if (args.length < 2) {
                return { message: 'Usage: /protect <threat_id> <action>\n\nActions: alert_users, alert_authorities, block_access, quarantine' };
            }
            
            const threatId = args[0];
            const action = args[1];
            
            return {
                message: '⚡ Requesting protective action (requires consensus)...',
                action: 'request_protective_action',
                data: { threatId, action }
            };
        }, '/protect <threat_id> <action>');

        // Approve pending action (requires authorization)
        this.register('approveaction', 'Approve a pending protective action (authorized users only)', async (args) => {
            if (args.length === 0) {
                return { message: 'Usage: /approveaction <approval_id>' };
            }
            
            return {
                message: '✅ Processing action approval...',
                action: 'approve_protective_action',
                data: { approvalId: args[0] }
            };
        }, '/approveaction <approval_id>');

        // View pending approvals
        this.register('pendingactions', 'View actions pending human approval', async () => {
            return {
                action: 'show_pending_actions',
                message: null
            };
        });

        // View Guardian action log
        this.register('guardianlog', 'View Humanity Guardian action log', async (args) => {
            const limit = args.length > 0 ? parseInt(args[0]) : 20;
            
            return {
                action: 'show_guardian_log',
                data: { limit },
                message: null
            };
        }, '/guardianlog [limit]');

        // Guardian statistics
        this.register('guardianstats', 'View Humanity Guardian statistics', async () => {
            return {
                action: 'show_guardian_stats',
                message: null
            };
        });

        // Add evidence to a threat
        this.register('addevidence', 'Add evidence to an existing threat report', async (args, argsString) => {
            if (args.length < 3) {
                return { message: 'Usage: /addevidence <threat_id> <type> <description>\n\nTypes: screenshot, logs, network, document, witness' };
            }
            
            const threatId = args[0];
            const evidenceType = args[1];
            const description = args.slice(2).join(' ');
            
            return {
                message: '📎 Adding evidence to threat report...',
                action: 'add_threat_evidence',
                data: { threatId, evidenceType, description }
            };
        }, '/addevidence <threat_id> <type> <description>');
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

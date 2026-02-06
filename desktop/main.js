#!/usr/bin/env node
/**
 * Amphibian Desktop Client
 *
 * Cross-platform desktop application for Landseek-Amphibian.
 * Supports Windows (.exe), Linux, and macOS.
 *
 * Features:
 * - Chat with local AI models via Ollama
 * - 10 AI personalities (Nova, Echo, Sage, etc.)
 * - MCP protocol support for extensible tools
 * - Join collective pools for distributed AI inference
 * - Participate in distributed AI training
 * - Contribute compute resources to the network
 */

const { program } = require('commander');
const readline = require('readline');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Import bridge modules (static paths for pkg bundling)
const { CollectiveCoordinator, DeviceCapability } = require('../bridge/collective/coordinator');
const { CollectiveBrain } = require('../bridge/collective/brain');
const { CollectiveClient } = require('../bridge/collective/client');
const LocalBrain = require('../bridge/brains/local_brain');
const AmphibianHost = require('../bridge/mcp_host');
const { PersonalityManager } = require('../bridge/personalities');
const ConversationMemory = require('../bridge/brains/memory');

// Import training modules
const { TrainingCoordinator } = require('./training/coordinator');
const { TrainingWorker } = require('./training/worker');

// Try to use chalk for colors, fall back to plain text
let chalk;
try {
    chalk = require('chalk');
} catch (e) {
    chalk = {
        green: (s) => s,
        red: (s) => s,
        yellow: (s) => s,
        blue: (s) => s,
        cyan: (s) => s,
        magenta: (s) => s,
        bold: (s) => s,
        gray: (s) => s
    };
}

// Global state
let collectiveCoordinator = null;
let collectiveClient = null;
let collectiveBrain = null;
let trainingCoordinator = null;
let trainingWorker = null;
let localBrain = null;
let mcpHost = null;
let personalities = null;
let memory = null;
let activePersonality = null;

// Configuration
const config = {
    deviceName: `${os.hostname()}_${process.platform}`,
    capability: DeviceCapability.MEDIUM,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || process.env.TPU_MODEL || 'gemma3:1b'
};

/**
 * Print banner
 */
function printBanner() {
    console.log(chalk.green(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   Landseek-Amphibian Desktop                              ║
    ║                                                           ║
    ║   Cross-platform AI Agent with MCP + Collective Mode      ║
    ║   - Local AI via Ollama                                   ║
    ║   - Extensible abilities via MCP                          ║
    ║   - 10 AI Personalities                                   ║
    ║   - Distributed Inference & Training                      ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    `));

    console.log(chalk.cyan(`Platform: ${process.platform} | Node: ${process.version}`));
    console.log(chalk.cyan(`Device: ${config.deviceName}`));
    console.log('');
}

/**
 * Check if Ollama is installed and running
 */
async function checkOllama() {
    // Check if ollama binary exists
    let ollamaInstalled = false;
    try {
        execSync(process.platform === 'win32' ? 'where ollama' : 'which ollama', { stdio: 'pipe' });
        ollamaInstalled = true;
    } catch (e) {
        // Not installed
    }

    // Check if Ollama API is reachable
    let ollamaRunning = false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            ollamaRunning = true;
            const data = await res.json();
            return { installed: true, running: true, models: data.models || [] };
        }
    } catch (e) {
        // Not running
    }

    return { installed: ollamaInstalled, running: ollamaRunning, models: [] };
}

/**
 * Display Ollama setup instructions
 */
function showOllamaSetup(status) {
    if (!status.installed) {
        console.log(chalk.yellow(`
  Ollama is not installed. To use local AI models:

  1. Install Ollama:
     - Linux/WSL: curl -fsSL https://ollama.com/install.sh | sh
     - macOS:     brew install ollama
     - Windows:   Download from https://ollama.com/download

  2. Start Ollama:
     ollama serve

  3. Pull a model:
     ollama pull gemma3:1b       (small, fast - recommended to start)
     ollama pull gemma3:4b       (better quality, needs more RAM)
     ollama pull llama3.2:3b     (good all-around)
     ollama pull qwen2.5:3b      (strong multilingual)

  4. Restart this app
`));
    } else if (!status.running) {
        console.log(chalk.yellow(`
  Ollama is installed but not running. Start it with:
    ollama serve

  Then restart this app.
`));
    } else if (status.models.length === 0) {
        console.log(chalk.yellow(`
  Ollama is running but no models are installed. Pull one:
    ollama pull gemma3:1b       (small, fast)
    ollama pull gemma3:4b       (better quality)
    ollama pull llama3.2:3b     (good all-around)
`));
    }
}

/**
 * Initialize local brain
 */
async function initLocalBrain() {
    const ollamaStatus = await checkOllama();

    if (!ollamaStatus.running) {
        console.log(chalk.yellow('  Ollama is not running.'));
        showOllamaSetup(ollamaStatus);
        return false;
    }

    // Auto-detect best available model
    if (ollamaStatus.models.length > 0) {
        const modelNames = ollamaStatus.models.map(m => m.name);
        console.log(chalk.cyan(`  Available models: ${modelNames.join(', ')}`));

        // Use configured model if available, otherwise pick the first available
        const preferredModels = [config.model, 'gemma3:1b', 'gemma3:4b', 'gemma2:2b', 'llama3.2:3b', 'qwen2.5:3b'];
        let selectedModel = modelNames[0]; // fallback to first

        for (const pref of preferredModels) {
            if (modelNames.some(m => m === pref || m.startsWith(pref.split(':')[0]))) {
                selectedModel = modelNames.find(m => m === pref || m.startsWith(pref.split(':')[0]));
                break;
            }
        }

        config.model = selectedModel;
        console.log(chalk.green(`  Using model: ${config.model}`));
    } else {
        showOllamaSetup(ollamaStatus);
        return false;
    }

    localBrain = new LocalBrain({
        baseUrl: config.ollamaUrl,
        model: config.model
    });

    const available = await localBrain.isAvailable();
    if (available) {
        console.log(chalk.green('  Local brain connected (Ollama)'));
        config.capability = DeviceCapability.HIGH;
    } else {
        console.log(chalk.yellow('  Local brain not available. Will use collective only.'));
    }

    return available;
}

/**
 * Initialize MCP host
 */
async function initMCP() {
    mcpHost = new AmphibianHost();
    try {
        const result = await mcpHost.connectFromConfig();
        if (result.connected > 0) {
            console.log(chalk.green(`  MCP: ${result.connected} server(s) connected`));
        }
    } catch (e) {
        console.log(chalk.yellow(`  MCP: No servers configured (edit mcp.json to add)`));
    }
}

/**
 * Initialize personality system
 */
function initPersonalities() {
    const storagePath = path.join(os.homedir(), '.amphibian', 'personalities.json');
    personalities = new PersonalityManager(storagePath);
    personalities.load();
    memory = new ConversationMemory(50);

    // Default to Nova
    activePersonality = personalities.get('nova');
}

/**
 * Start a collective pool as coordinator
 */
async function startCollective(port = 8766, poolName = 'Amphibian Desktop Collective') {
    if (collectiveCoordinator) {
        console.log(chalk.yellow('  Collective already running. Stop it first with /stopcollective'));
        return;
    }

    collectiveCoordinator = new CollectiveCoordinator({ port, poolName });

    try {
        const info = await collectiveCoordinator.start();
        collectiveBrain = new CollectiveBrain(collectiveCoordinator);

        console.log(chalk.green(`\n  Collective pool started!`));
        console.log(chalk.cyan(`   Pool: ${info.poolName}`));
        console.log(chalk.cyan(`   Port: ${info.port}`));
        console.log(chalk.cyan(`   Share code: ${info.shareCode}`));
        console.log(chalk.cyan(`   Others can join with: /pool ${info.shareCode}\n`));

        collectiveCoordinator.on('device_joined', (device) => {
            console.log(chalk.green(`\n  ${device.name} joined (${device.capability})`));
        });

        collectiveCoordinator.on('device_left', (device) => {
            console.log(chalk.red(`\n  ${device.name} left`));
        });

        return info;
    } catch (e) {
        console.log(chalk.red(`  Failed to start collective: ${e.message}`));
        collectiveCoordinator = null;
    }
}

/**
 * Join a collective pool
 */
async function joinCollective(shareCode) {
    if (collectiveClient) {
        console.log(chalk.yellow('  Already in a collective. Leave first with /unpool'));
        return;
    }

    collectiveClient = new CollectiveClient({
        localBrain,
        deviceName: config.deviceName,
        capability: config.capability,
        model: config.model
    });

    try {
        const info = await collectiveClient.connect(shareCode);

        console.log(chalk.green(`\n  Joined collective "${info.poolName}"!`));
        console.log(chalk.cyan(`   Device ID: ${info.deviceId}`));
        console.log(chalk.cyan(`   Total devices: ${info.totalDevices}\n`));

        collectiveClient.on('device_joined', (device) => {
            console.log(chalk.green(`\n  ${device.name} joined`));
        });

        collectiveClient.on('device_left', (data) => {
            console.log(chalk.red(`\n  ${data.deviceName} left`));
        });

        collectiveClient.on('disconnected', () => {
            console.log(chalk.yellow('\n  Disconnected from collective'));
        });

        return info;
    } catch (e) {
        console.log(chalk.red(`  Failed to join collective: ${e.message}`));
        collectiveClient = null;
    }
}

/**
 * Leave collective pool
 */
async function leaveCollective() {
    if (collectiveCoordinator) {
        await collectiveCoordinator.stop();
        collectiveCoordinator = null;
        collectiveBrain = null;
        console.log(chalk.yellow('  Collective coordinator stopped'));
    }

    if (collectiveClient) {
        collectiveClient.disconnect();
        collectiveClient = null;
        console.log(chalk.yellow('  Left collective pool'));
    }
}

/**
 * Show collective status
 */
function showCollectiveStatus() {
    if (collectiveCoordinator) {
        const status = collectiveCoordinator.getStatus();
        console.log(chalk.blue('\n  Collective Status (Coordinator)'));
        console.log(chalk.cyan(`   Pool: ${status.poolName}`));
        console.log(chalk.cyan(`   Devices: ${status.devices}`));
        console.log(chalk.cyan(`   Queued Tasks: ${status.queuedTasks}`));
        console.log(chalk.cyan(`   Active Tasks: ${status.activeTasks}`));

        if (status.deviceList && status.deviceList.length > 0) {
            console.log(chalk.blue('\n   Connected Devices:'));
            for (const d of status.deviceList) {
                console.log(chalk.cyan(`   - ${d.name} (${d.capability}) - ${d.completedTasks} tasks`));
            }
        }
        console.log('');
    } else if (collectiveClient) {
        const status = collectiveClient.getStatus();
        console.log(chalk.blue('\n  Collective Status (Worker)'));
        console.log(chalk.cyan(`   Pool: ${status.coordinator?.poolName || 'Unknown'}`));
        console.log(chalk.cyan(`   Device: ${status.deviceName} (${status.capability})`));
        console.log(chalk.cyan(`   Status: ${status.isConnected ? 'Connected' : 'Disconnected'}`));
        console.log(chalk.cyan(`   Active Tasks: ${status.activeTasks}\n`));
    } else {
        console.log(chalk.yellow('\n  Not connected to any collective. Use /collective or /pool\n'));
    }
}

/**
 * Start distributed training
 */
async function startTraining(options = {}) {
    if (trainingCoordinator) {
        console.log(chalk.yellow('  Training already in progress'));
        return;
    }

    if (!collectiveCoordinator) {
        console.log(chalk.yellow('  Start a collective first with /collective'));
        return;
    }

    trainingCoordinator = new TrainingCoordinator(collectiveCoordinator, {
        modelName: options.model || 'amphibian-lora',
        batchSize: options.batchSize || 4,
        learningRate: options.learningRate || 0.0001,
        epochs: options.epochs || 1
    });

    try {
        await trainingCoordinator.start();
        console.log(chalk.green('\n  Distributed training started!'));
        console.log(chalk.cyan(`   Model: ${options.model || 'amphibian-lora'}`));
        console.log(chalk.cyan(`   Batch size: ${options.batchSize || 4}\n`));
    } catch (e) {
        console.log(chalk.red(`  Failed to start training: ${e.message}`));
        trainingCoordinator = null;
    }
}

/**
 * Join training as worker
 */
async function joinTraining(shareCode) {
    if (trainingWorker) {
        console.log(chalk.yellow('  Already participating in training'));
        return;
    }

    if (!collectiveClient) {
        await joinCollective(shareCode);
        if (!collectiveClient) return;
    }

    trainingWorker = new TrainingWorker(collectiveClient, {
        deviceName: config.deviceName,
        localBrain
    });

    try {
        await trainingWorker.start();
        console.log(chalk.green('\n  Joined training as worker!\n'));
    } catch (e) {
        console.log(chalk.red(`  Failed to join training: ${e.message}`));
        trainingWorker = null;
    }
}

/**
 * Show training status
 */
function showTrainingStatus() {
    if (trainingCoordinator) {
        const status = trainingCoordinator.getStatus();
        console.log(chalk.blue('\n  Training Status (Coordinator)'));
        console.log(chalk.cyan(`   Model: ${status.modelName}`));
        console.log(chalk.cyan(`   Epoch: ${status.currentEpoch}/${status.totalEpochs}`));
        console.log(chalk.cyan(`   Progress: ${(status.progress * 100).toFixed(1)}%`));
        console.log(chalk.cyan(`   Workers: ${status.activeWorkers}`));
        console.log(chalk.cyan(`   Loss: ${status.currentLoss?.toFixed(4) || 'N/A'}\n`));
    } else if (trainingWorker) {
        const status = trainingWorker.getStatus();
        console.log(chalk.blue('\n  Training Status (Worker)'));
        console.log(chalk.cyan(`   Status: ${status.isTraining ? 'Training' : 'Idle'}`));
        console.log(chalk.cyan(`   Batches processed: ${status.batchesProcessed}`));
        console.log(chalk.cyan(`   Gradients submitted: ${status.gradientsSubmitted}\n`));
    } else {
        console.log(chalk.yellow('\n  No training in progress\n'));
    }
}

/**
 * Stop training
 */
async function stopTraining() {
    if (trainingCoordinator) {
        await trainingCoordinator.stop();
        trainingCoordinator = null;
        console.log(chalk.yellow('  Training stopped'));
    }

    if (trainingWorker) {
        trainingWorker.stop();
        trainingWorker = null;
        console.log(chalk.yellow('  Left training'));
    }
}

/**
 * Send a chat message
 */
async function chat(message) {
    // Determine which brain to use
    let brain = null;
    let source = '';

    if (collectiveBrain && await collectiveBrain.isAvailable()) {
        brain = collectiveBrain;
        source = 'collective';
    } else if (localBrain && await localBrain.isAvailable()) {
        brain = localBrain;
        source = 'local';
    } else {
        console.log(chalk.red('\n  No brain available. Ensure Ollama is running, or join a collective.\n'));
        return;
    }

    // Build messages with personality system prompt
    const messages = [];
    if (activePersonality) {
        messages.push({
            role: 'system',
            content: personalities.buildSystemPrompt(activePersonality)
        });
    }

    // Add conversation history
    const history = memory.getHistory();
    for (const msg of history) {
        messages.push(msg);
    }

    messages.push({ role: 'user', content: message });
    memory.add('user', message);

    const pName = activePersonality ? `${activePersonality.avatar} ${activePersonality.name}` : 'Assistant';
    process.stdout.write(chalk.gray(`  [${source}] `));
    process.stdout.write(chalk.green(`${pName}: `));

    try {
        let fullResponse = '';
        for await (const chunk of brain.chatStream(messages)) {
            process.stdout.write(chunk);
            fullResponse += chunk;
        }
        console.log('\n');
        memory.add('assistant', fullResponse);
    } catch (e) {
        // Fallback to non-streaming
        try {
            const response = await brain.chat(messages);
            console.log(response.content);
            console.log('');
            memory.add('assistant', response.content);
        } catch (e2) {
            console.log(chalk.red(`\n  Chat failed: ${e2.message}\n`));
        }
    }
}

/**
 * Call an MCP tool directly
 */
async function callMCPTool(serverName, toolName, argsJson) {
    if (!mcpHost || !mcpHost.clients.has(serverName)) {
        console.log(chalk.red(`  MCP server "${serverName}" not connected`));
        return;
    }

    let args = {};
    if (argsJson) {
        try {
            args = JSON.parse(argsJson);
        } catch (e) {
            console.log(chalk.red(`  Invalid JSON args: ${e.message}`));
            return;
        }
    }

    try {
        const result = await mcpHost.callTool(serverName, toolName, args);
        if (result.content) {
            for (const item of result.content) {
                if (item.type === 'text') {
                    console.log(chalk.cyan(`\n  ${item.text}\n`));
                } else {
                    console.log(chalk.cyan(`\n  [${item.type}]: ${JSON.stringify(item).substring(0, 200)}\n`));
                }
            }
        } else {
            console.log(chalk.cyan(`\n  ${JSON.stringify(result, null, 2)}\n`));
        }
    } catch (e) {
        console.log(chalk.red(`  Tool call failed: ${e.message}`));
    }
}

/**
 * Print help
 */
function printHelp() {
    console.log(chalk.blue(`
  Commands:

${chalk.bold('  Chat:')}
    Just type any message to chat with the AI

${chalk.bold('  Personalities:')}
    /personality           Show current personality
    /personalities         List all personalities
    /use <id>              Switch to a personality (nova, echo, sage, etc.)

${chalk.bold('  MCP Tools:')}
    /mcp                   List connected MCP servers and tools
    /tool <server> <tool> [json_args]   Call an MCP tool directly

${chalk.bold('  Model:')}
    /model                 Show current model info
    /models                List available Ollama models
    /switch <name>         Switch to a different model

${chalk.bold('  Collective Mode:')}
    /collective [port]     Start a collective pool (default port: 8766)
    /pool <share_code>     Join an existing collective pool
    /unpool                Leave the collective pool
    /poolstatus            Show collective pool status

${chalk.bold('  Distributed Training:')}
    /train                 Start distributed training
    /jointrain <code>      Join training as a worker
    /trainstatus           Show training progress
    /stoptrain             Stop training

${chalk.bold('  General:')}
    /clear                 Clear conversation history
    /status                Show overall status
    /help                  Show this help
    /quit                  Exit
`));
}

/**
 * Process command
 */
async function processCommand(input) {
    const trimmed = input.trim();

    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
        const parts = trimmed.slice(1).split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            // === Personality commands ===
            case 'personality':
                if (activePersonality) {
                    console.log(chalk.cyan(`\n  Current: ${activePersonality.avatar} ${activePersonality.name} - ${activePersonality.style}\n`));
                } else {
                    console.log(chalk.yellow('\n  No personality active\n'));
                }
                break;

            case 'personalities':
                if (personalities) {
                    console.log(chalk.blue('\n  AI Personalities:\n'));
                    for (const p of personalities.getAll()) {
                        const active = p.id === activePersonality?.id ? ' (active)' : '';
                        console.log(chalk.cyan(`    ${p.avatar} ${p.name}${active} - ${p.style}`));
                    }
                    console.log(chalk.gray('\n  Use /use <id> to switch (e.g. /use sage)\n'));
                }
                break;

            case 'use':
                if (args.length === 0) {
                    console.log(chalk.yellow('  Usage: /use <personality_id>'));
                } else {
                    const p = personalities.get(args[0].toLowerCase());
                    if (p) {
                        activePersonality = p;
                        console.log(chalk.green(`\n  Switched to ${p.avatar} ${p.name}\n`));
                    } else {
                        console.log(chalk.red(`  Unknown personality: ${args[0]}. Use /personalities to see options.`));
                    }
                }
                break;

            // === MCP commands ===
            case 'mcp':
                if (!mcpHost || mcpHost.clients.size === 0) {
                    console.log(chalk.yellow('\n  No MCP servers connected. Edit mcp.json to configure.\n'));
                } else {
                    console.log(chalk.blue('\n  MCP Servers:\n'));
                    try {
                        const tools = await mcpHost.getAllTools();
                        const byServer = {};
                        for (const t of tools) {
                            if (!byServer[t.server]) byServer[t.server] = [];
                            byServer[t.server].push(t);
                        }
                        for (const [server, serverTools] of Object.entries(byServer)) {
                            const info = mcpHost.serverInfo.get(server);
                            console.log(chalk.cyan(`  ${server} - ${info?.description || ''}`));
                            for (const t of serverTools) {
                                const realName = t.name.replace(`${server}_`, '');
                                console.log(chalk.gray(`    - ${realName}: ${t.description || ''}`));
                            }
                        }
                    } catch (e) {
                        for (const [name] of mcpHost.clients) {
                            console.log(chalk.cyan(`  ${name} (connected)`));
                        }
                    }
                    console.log(chalk.gray('\n  Use /tool <server> <tool> [json_args] to call a tool\n'));
                }
                break;

            case 'tool':
                if (args.length < 2) {
                    console.log(chalk.yellow('  Usage: /tool <server> <tool_name> [json_args]'));
                } else {
                    await callMCPTool(args[0], args[1], args.slice(2).join(' ') || null);
                }
                break;

            // === Model commands ===
            case 'model':
                console.log(chalk.cyan(`\n  Current model: ${config.model}`));
                console.log(chalk.cyan(`  Ollama URL: ${config.ollamaUrl}\n`));
                break;

            case 'models':
                try {
                    const res = await fetch(`${config.ollamaUrl}/api/tags`);
                    if (res.ok) {
                        const data = await res.json();
                        console.log(chalk.blue('\n  Available Models:\n'));
                        for (const m of (data.models || [])) {
                            const active = m.name === config.model ? ' (active)' : '';
                            const size = m.size ? `${(m.size / 1e9).toFixed(1)}GB` : '';
                            console.log(chalk.cyan(`    ${m.name}${active} ${size}`));
                        }
                        console.log(chalk.gray('\n  Use /switch <name> to change model\n'));
                    } else {
                        console.log(chalk.red('  Failed to list models. Is Ollama running?'));
                    }
                } catch (e) {
                    console.log(chalk.red('  Ollama not reachable. Is it running?'));
                }
                break;

            case 'switch':
                if (args.length === 0) {
                    console.log(chalk.yellow('  Usage: /switch <model_name>'));
                } else {
                    config.model = args[0];
                    localBrain = new LocalBrain({
                        baseUrl: config.ollamaUrl,
                        model: config.model
                    });
                    console.log(chalk.green(`\n  Switched to model: ${config.model}\n`));
                }
                break;

            // === Collective commands ===
            case 'collective':
                await startCollective(args[0] ? parseInt(args[0]) : 8766, args.slice(1).join(' ') || undefined);
                break;

            case 'pool':
                if (args.length === 0) {
                    console.log(chalk.yellow('  Usage: /pool <share_code>'));
                } else {
                    await joinCollective(args[0]);
                }
                break;

            case 'unpool':
                await leaveCollective();
                break;

            case 'poolstatus':
                showCollectiveStatus();
                break;

            // === Training commands ===
            case 'train':
                await startTraining();
                break;

            case 'jointrain':
                if (args.length === 0) {
                    console.log(chalk.yellow('  Usage: /jointrain <share_code>'));
                } else {
                    await joinTraining(args[0]);
                }
                break;

            case 'trainstatus':
                showTrainingStatus();
                break;

            case 'stoptrain':
                await stopTraining();
                break;

            // === General commands ===
            case 'clear':
                if (memory) memory.clear();
                console.log(chalk.green('  Conversation cleared.\n'));
                break;

            case 'status':
                console.log(chalk.blue('\n  Status:'));
                console.log(chalk.cyan(`  Model: ${config.model}`));
                console.log(chalk.cyan(`  Brain: ${localBrain && await localBrain.isAvailable() ? 'Connected' : 'Disconnected'}`));
                console.log(chalk.cyan(`  Personality: ${activePersonality ? `${activePersonality.avatar} ${activePersonality.name}` : 'None'}`));
                console.log(chalk.cyan(`  MCP Servers: ${mcpHost ? mcpHost.clients.size : 0}`));
                showCollectiveStatus();
                break;

            case 'help':
                printHelp();
                break;

            case 'quit':
            case 'exit':
                await cleanup();
                process.exit(0);
                break;

            default:
                console.log(chalk.yellow(`  Unknown command: /${cmd}. Type /help for available commands.`));
        }
    } else {
        // Regular chat message
        await chat(trimmed);
    }
}

/**
 * Cleanup before exit
 */
async function cleanup() {
    console.log(chalk.yellow('\n  Shutting down...'));

    await stopTraining();
    await leaveCollective();

    if (mcpHost) {
        await mcpHost.disconnectAll();
    }

    console.log(chalk.green('  Goodbye!\n'));
}

/**
 * Main interactive loop
 */
async function runInteractive() {
    printBanner();

    console.log(chalk.blue('  Initializing...\n'));

    // Initialize systems in parallel
    initPersonalities();
    const [brainReady] = await Promise.all([
        initLocalBrain(),
        initMCP()
    ]);

    console.log('');

    if (!brainReady) {
        console.log(chalk.yellow('  Running without local AI. Chat requires Ollama or a collective.\n'));
    }

    printHelp();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = () => {
        const pIcon = activePersonality ? activePersonality.avatar : '>';
        rl.question(chalk.cyan(`  ${pIcon} `), async (input) => {
            await processCommand(input);
            prompt();
        });
    };

    // Handle Ctrl+C
    rl.on('close', async () => {
        await cleanup();
        process.exit(0);
    });

    prompt();
}

// CLI setup
program
    .name('amphibian')
    .description('Landseek-Amphibian Desktop - Cross-platform AI agent with MCP and collective capabilities')
    .version('1.0.0');

program
    .command('start')
    .description('Start interactive mode')
    .action(runInteractive);

program
    .command('collective')
    .description('Start a collective pool')
    .option('-p, --port <port>', 'Port to listen on', '8766')
    .option('-n, --name <name>', 'Pool name', 'Amphibian Collective')
    .action(async (options) => {
        printBanner();
        await initLocalBrain();
        await startCollective(parseInt(options.port), options.name);

        console.log(chalk.cyan('\n  Collective running. Press Ctrl+C to stop.\n'));

        process.on('SIGINT', async () => {
            await cleanup();
            process.exit(0);
        });
    });

program
    .command('join <shareCode>')
    .description('Join a collective pool')
    .action(async (shareCode) => {
        printBanner();
        await initLocalBrain();
        await joinCollective(shareCode);

        console.log(chalk.cyan('\n  Worker running. Press Ctrl+C to stop.\n'));

        process.on('SIGINT', async () => {
            await cleanup();
            process.exit(0);
        });
    });

// Default to interactive mode if no command specified
if (process.argv.length <= 2) {
    runInteractive();
} else {
    program.parse();
}

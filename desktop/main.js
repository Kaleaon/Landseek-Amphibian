#!/usr/bin/env node
/**
 * Amphibian Desktop Client
 * 
 * Cross-platform desktop application for Landseek-Amphibian.
 * Supports Windows (.exe), Linux, and macOS.
 * 
 * Features:
 * - Join collective pools for distributed AI inference
 * - Participate in distributed AI training
 * - Contribute compute resources to the network
 * - Run standalone AI inference locally
 */

const { program } = require('commander');
const readline = require('readline');
const path = require('path');
const os = require('os');

// Import bridge modules
const bridgePath = path.join(__dirname, '..', 'bridge');
const { CollectiveCoordinator, DeviceCapability } = require(path.join(bridgePath, 'collective', 'coordinator'));
const { CollectiveBrain } = require(path.join(bridgePath, 'collective', 'brain'));
const { CollectiveClient } = require(path.join(bridgePath, 'collective', 'client'));
const LocalBrain = require(path.join(bridgePath, 'brains', 'local_brain'));

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

// Configuration
const config = {
    deviceName: `${os.hostname()}_${process.platform}`,
    capability: DeviceCapability.MEDIUM,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.TPU_MODEL || 'gemma:2b'
};

/**
 * Print banner
 */
function printBanner() {
    console.log(chalk.green(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🐸 Landseek-Amphibian Desktop                          ║
    ║                                                           ║
    ║   Cross-platform AI Agent with Collective Mode           ║
    ║   • Distributed Inference                                ║
    ║   • Distributed Training                                 ║
    ║   • Resource Pooling                                     ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    `));
    
    console.log(chalk.cyan(`Platform: ${process.platform} | Node: ${process.version}`));
    console.log(chalk.cyan(`Device: ${config.deviceName}`));
    console.log('');
}

/**
 * Initialize local brain
 */
async function initLocalBrain() {
    localBrain = new LocalBrain({
        baseUrl: config.ollamaUrl,
        model: config.model
    });
    
    const available = await localBrain.isAvailable();
    if (available) {
        console.log(chalk.green('✅ Local brain connected (Ollama)'));
        config.capability = DeviceCapability.HIGH;
    } else {
        console.log(chalk.yellow('⚠️ Local brain not available. Will use collective only.'));
    }
    
    return available;
}

/**
 * Start a collective pool as coordinator
 */
async function startCollective(port = 8766, poolName = 'Amphibian Desktop Collective') {
    if (collectiveCoordinator) {
        console.log(chalk.yellow('⚠️ Collective already running. Stop it first with /stopcollective'));
        return;
    }
    
    collectiveCoordinator = new CollectiveCoordinator({ port, poolName });
    
    try {
        const info = await collectiveCoordinator.start();
        collectiveBrain = new CollectiveBrain(collectiveCoordinator);
        
        console.log(chalk.green(`\n🌐 Collective pool started!`));
        console.log(chalk.cyan(`   Pool: ${info.poolName}`));
        console.log(chalk.cyan(`   Port: ${info.port}`));
        console.log(chalk.cyan(`   Share code: ${info.shareCode}`));
        console.log(chalk.cyan(`   Others can join with: /pool ${info.shareCode}\n`));
        
        // Set up event handlers
        collectiveCoordinator.on('device_joined', (device) => {
            console.log(chalk.green(`\n🟢 ${device.name} joined (${device.capability})`));
        });
        
        collectiveCoordinator.on('device_left', (device) => {
            console.log(chalk.red(`\n🔴 ${device.name} left`));
        });
        
        return info;
    } catch (e) {
        console.log(chalk.red(`❌ Failed to start collective: ${e.message}`));
        collectiveCoordinator = null;
    }
}

/**
 * Join a collective pool
 */
async function joinCollective(shareCode) {
    if (collectiveClient) {
        console.log(chalk.yellow('⚠️ Already in a collective. Leave first with /unpool'));
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
        
        console.log(chalk.green(`\n✅ Joined collective "${info.poolName}"!`));
        console.log(chalk.cyan(`   Device ID: ${info.deviceId}`));
        console.log(chalk.cyan(`   Total devices: ${info.totalDevices}`));
        console.log(chalk.cyan(`   Your device is now contributing to the collective.\n`));
        
        // Set up event handlers
        collectiveClient.on('device_joined', (device) => {
            console.log(chalk.green(`\n🟢 ${device.name} joined`));
        });
        
        collectiveClient.on('device_left', (data) => {
            console.log(chalk.red(`\n🔴 ${data.deviceName} left`));
        });
        
        collectiveClient.on('disconnected', () => {
            console.log(chalk.yellow('\n🔴 Disconnected from collective'));
        });
        
        return info;
    } catch (e) {
        console.log(chalk.red(`❌ Failed to join collective: ${e.message}`));
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
        console.log(chalk.yellow('🛑 Collective coordinator stopped'));
    }
    
    if (collectiveClient) {
        collectiveClient.disconnect();
        collectiveClient = null;
        console.log(chalk.yellow('👋 Left collective pool'));
    }
}

/**
 * Show collective status
 */
function showCollectiveStatus() {
    if (collectiveCoordinator) {
        const status = collectiveCoordinator.getStatus();
        console.log(chalk.blue('\n📊 Collective Status (Coordinator)'));
        console.log(chalk.cyan(`   Pool: ${status.poolName}`));
        console.log(chalk.cyan(`   Devices: ${status.devices}`));
        console.log(chalk.cyan(`   Queued Tasks: ${status.queuedTasks}`));
        console.log(chalk.cyan(`   Active Tasks: ${status.activeTasks}`));
        
        if (status.deviceList && status.deviceList.length > 0) {
            console.log(chalk.blue('\n   Connected Devices:'));
            for (const d of status.deviceList) {
                console.log(chalk.cyan(`   • ${d.name} (${d.capability}) - ${d.completedTasks} tasks`));
            }
        }
        console.log('');
    } else if (collectiveClient) {
        const status = collectiveClient.getStatus();
        console.log(chalk.blue('\n📊 Collective Status (Worker)'));
        console.log(chalk.cyan(`   Pool: ${status.coordinator?.poolName || 'Unknown'}`));
        console.log(chalk.cyan(`   Device: ${status.deviceName} (${status.capability})`));
        console.log(chalk.cyan(`   Status: ${status.isConnected ? '🟢 Connected' : '🔴 Disconnected'}`));
        console.log(chalk.cyan(`   Active Tasks: ${status.activeTasks}\n`));
    } else {
        console.log(chalk.yellow('\n⚠️ Not connected to any collective. Use /collective or /pool\n'));
    }
}

/**
 * Start distributed training
 */
async function startTraining(options = {}) {
    if (trainingCoordinator) {
        console.log(chalk.yellow('⚠️ Training already in progress'));
        return;
    }
    
    if (!collectiveCoordinator) {
        console.log(chalk.yellow('⚠️ Start a collective first with /collective'));
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
        console.log(chalk.green('\n🎓 Distributed training started!'));
        console.log(chalk.cyan(`   Model: ${options.model || 'amphibian-lora'}`));
        console.log(chalk.cyan(`   Batch size: ${options.batchSize || 4}`));
        console.log(chalk.cyan(`   Learning rate: ${options.learningRate || 0.0001}\n`));
    } catch (e) {
        console.log(chalk.red(`❌ Failed to start training: ${e.message}`));
        trainingCoordinator = null;
    }
}

/**
 * Join training as worker
 */
async function joinTraining(shareCode) {
    if (trainingWorker) {
        console.log(chalk.yellow('⚠️ Already participating in training'));
        return;
    }
    
    if (!collectiveClient) {
        // Need to join the collective first
        await joinCollective(shareCode);
        if (!collectiveClient) return;
    }
    
    trainingWorker = new TrainingWorker(collectiveClient, {
        deviceName: config.deviceName,
        localBrain
    });
    
    try {
        await trainingWorker.start();
        console.log(chalk.green('\n🎓 Joined training as worker!'));
        console.log(chalk.cyan(`   Your device will contribute gradients to training.\n`));
    } catch (e) {
        console.log(chalk.red(`❌ Failed to join training: ${e.message}`));
        trainingWorker = null;
    }
}

/**
 * Show training status
 */
function showTrainingStatus() {
    if (trainingCoordinator) {
        const status = trainingCoordinator.getStatus();
        console.log(chalk.blue('\n🎓 Training Status (Coordinator)'));
        console.log(chalk.cyan(`   Model: ${status.modelName}`));
        console.log(chalk.cyan(`   Epoch: ${status.currentEpoch}/${status.totalEpochs}`));
        console.log(chalk.cyan(`   Progress: ${(status.progress * 100).toFixed(1)}%`));
        console.log(chalk.cyan(`   Workers: ${status.activeWorkers}`));
        console.log(chalk.cyan(`   Loss: ${status.currentLoss?.toFixed(4) || 'N/A'}\n`));
    } else if (trainingWorker) {
        const status = trainingWorker.getStatus();
        console.log(chalk.blue('\n🎓 Training Status (Worker)'));
        console.log(chalk.cyan(`   Status: ${status.isTraining ? '🟢 Training' : '⏸️ Idle'}`));
        console.log(chalk.cyan(`   Batches processed: ${status.batchesProcessed}`));
        console.log(chalk.cyan(`   Gradients submitted: ${status.gradientsSubmitted}\n`));
    } else {
        console.log(chalk.yellow('\n⚠️ No training in progress\n'));
    }
}

/**
 * Stop training
 */
async function stopTraining() {
    if (trainingCoordinator) {
        await trainingCoordinator.stop();
        trainingCoordinator = null;
        console.log(chalk.yellow('🛑 Training stopped'));
    }
    
    if (trainingWorker) {
        trainingWorker.stop();
        trainingWorker = null;
        console.log(chalk.yellow('👋 Left training'));
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
        console.log(chalk.red('❌ No brain available. Start a collective or ensure Ollama is running.'));
        return;
    }
    
    console.log(chalk.gray(`\n[Using ${source} brain]`));
    
    try {
        const response = await brain.chat([{ role: 'user', content: message }]);
        console.log(chalk.green(`\n🤖 Assistant: ${response.content}\n`));
    } catch (e) {
        console.log(chalk.red(`❌ Chat failed: ${e.message}`));
    }
}

/**
 * Print help
 */
function printHelp() {
    console.log(chalk.blue(`
📋 Available Commands:

${chalk.bold('Collective Mode:')}
  /collective [port]     Start a collective pool (default port: 8766)
  /pool <share_code>     Join an existing collective pool
  /unpool               Leave the collective pool
  /poolstatus           Show collective pool status

${chalk.bold('Distributed Training:')}
  /train                Start distributed training as coordinator
  /jointrain            Join training as a worker
  /trainstatus          Show training progress
  /stoptrain            Stop training

${chalk.bold('General:')}
  /status               Show overall status
  /help                 Show this help
  /quit                 Exit the application

${chalk.bold('Chat:')}
  Just type any message to chat with the AI
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
            case 'collective':
                await startCollective(args[0] ? parseInt(args[0]) : 8766, args.slice(1).join(' ') || undefined);
                break;
                
            case 'pool':
                if (args.length === 0) {
                    console.log(chalk.yellow('Usage: /pool <share_code>'));
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
                
            case 'train':
                await startTraining();
                break;
                
            case 'jointrain':
                if (args.length === 0) {
                    console.log(chalk.yellow('Usage: /jointrain <share_code>'));
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
                
            case 'status':
                showCollectiveStatus();
                showTrainingStatus();
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
                console.log(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
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
    console.log(chalk.yellow('\n👋 Shutting down...'));
    
    await stopTraining();
    await leaveCollective();
    
    console.log(chalk.green('Goodbye! 🐸\n'));
}

/**
 * Main interactive loop
 */
async function runInteractive() {
    printBanner();
    
    // Initialize local brain
    await initLocalBrain();
    
    printHelp();
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const prompt = () => {
        rl.question(chalk.cyan('🐸 > '), async (input) => {
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
    .description('Landseek-Amphibian Desktop - Cross-platform AI agent with collective capabilities')
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
        
        // Keep running
        console.log(chalk.cyan('\nCollective running. Press Ctrl+C to stop.\n'));
        
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
        
        // Keep running
        console.log(chalk.cyan('\nWorker running. Press Ctrl+C to stop.\n'));
        
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

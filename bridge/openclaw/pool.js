/**
 * OpenClaw Pool
 * 
 * Open task pool where any registered ClawBot can pick up and
 * complete tasks. Supports both inference and training tasks.
 * 
 * Features:
 * - Public task queue
 * - Task claiming with timeouts
 * - Automatic reassignment on failure
 * - Support for open training tasks
 * - Fair distribution based on capability
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const { OpenRegistry, BotCapability, BotStatus } = require('./registry');
const { ContributionTracker } = require('./contributions');

/**
 * Task types
 */
const OpenTaskType = {
    INFERENCE: 'inference',
    TRAINING_BATCH: 'training_batch',
    GRADIENT_COMPUTE: 'gradient_compute',
    VALIDATION: 'validation',
    EMBEDDING: 'embedding',
    CUSTOM: 'custom'
};

/**
 * Task status
 */
const OpenTaskStatus = {
    AVAILABLE: 'available',
    CLAIMED: 'claimed',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXPIRED: 'expired'
};

/**
 * Get local IP addresses
 */
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    
    return ips;
}

class OpenPool {
    constructor(options = {}) {
        this.port = options.port || 8767;
        this.poolName = options.poolName || 'OpenClaw Public Pool';
        
        // Components
        this.registry = new OpenRegistry(options.registryOptions);
        this.contributions = new ContributionTracker(options.contributionOptions);
        
        // Task management
        this.taskQueue = []; // Available tasks
        this.activeTasks = new Map(); // taskId -> TaskInfo
        this.completedTasks = new Map(); // taskId -> Result (LRU)
        this.taskIdCounter = 0;
        
        // Training state (for open training)
        this.openTraining = null; // Current open training session
        
        // Configuration
        this.config = {
            maxTaskAge: options.maxTaskAge || 300000, // 5 minutes
            claimTimeout: options.claimTimeout || 60000, // 1 minute to start
            maxRetries: options.maxRetries || 3,
            maxCompletedCache: options.maxCompletedCache || 100,
            requireCapability: options.requireCapability !== false
        };
        
        // Networking
        this.server = null;
        this.wss = null;
        this.isRunning = false;
        
        // Event handlers
        this.eventHandlers = [];
        
        // Set up registry events
        this.setupRegistryEvents();
    }

    /**
     * Set up registry event handlers
     */
    setupRegistryEvents() {
        this.registry.on('bot_registered', (bot) => {
            this.emit('bot_joined', bot);
        });
        
        this.registry.on('bot_unregistered', (bot) => {
            // Reassign any tasks claimed by this bot
            this.reassignBotTasks(bot.id);
            this.emit('bot_left', bot);
        });
    }

    /**
     * Start the open pool server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer((req, res) => {
                    // Simple REST API for pool status
                    if (req.url === '/status') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(this.getStatus()));
                    } else if (req.url === '/tasks') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(this.getAvailableTasks()));
                    } else if (req.url === '/leaderboard') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(this.registry.getLeaderboard()));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            name: this.poolName,
                            type: 'OpenClaw Pool',
                            endpoints: ['/status', '/tasks', '/leaderboard']
                        }));
                    }
                });

                this.wss = new WebSocket.Server({ server: this.server });

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.server.listen(this.port, '0.0.0.0', () => {
                    this.isRunning = true;
                    
                    const localIPs = getLocalIPs();
                    
                    console.log(`🌐 OpenClaw Pool started on port ${this.port}`);
                    console.log(`📋 Pool: ${this.poolName}`);
                    console.log(`🔗 Connect: ws://${localIPs[0] || 'localhost'}:${this.port}`);
                    
                    resolve({
                        port: this.port,
                        localIPs,
                        poolName: this.poolName
                    });
                });

                this.server.on('error', reject);
                
                // Start task processor
                this.startTaskProcessor();
                
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        let botId = null;
        
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data);
                
                switch (msg.type) {
                    case 'REGISTER':
                        // Open registration - any ClawBot can join
                        const result = this.registry.register({
                            ...msg,
                            ws,
                            endpoint: req.socket.remoteAddress
                        });
                        
                        botId = result.botId;
                        
                        ws.send(JSON.stringify({
                            type: 'REGISTERED',
                            ...result,
                            poolName: this.poolName,
                            availableTasks: this.taskQueue.length
                        }));
                        break;
                        
                    case 'HEARTBEAT':
                        if (botId) {
                            this.registry.updateStatus(botId, BotStatus.ONLINE);
                            ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
                        }
                        break;
                        
                    case 'GET_TASKS':
                        // Return available tasks for this bot's capability
                        const tasks = this.getTasksForBot(botId);
                        ws.send(JSON.stringify({
                            type: 'AVAILABLE_TASKS',
                            tasks
                        }));
                        break;
                        
                    case 'CLAIM_TASK':
                        await this.handleTaskClaim(botId, msg.taskId, ws);
                        break;
                        
                    case 'TASK_RESULT':
                        await this.handleTaskResult(botId, msg);
                        break;
                        
                    case 'TASK_FAILED':
                        await this.handleTaskFailed(botId, msg);
                        break;
                        
                    case 'TASK_PROGRESS':
                        this.handleTaskProgress(botId, msg);
                        break;
                        
                    case 'SUBMIT_TASK':
                        // Any bot can submit tasks
                        const taskId = await this.submitTask(msg.taskType, msg.payload, msg.options);
                        ws.send(JSON.stringify({
                            type: 'TASK_SUBMITTED',
                            taskId
                        }));
                        break;
                        
                    case 'JOIN_OPEN_TRAINING':
                        await this.handleJoinOpenTraining(botId, ws);
                        break;
                        
                    case 'GRADIENT_SUBMIT':
                        await this.handleGradientSubmit(botId, msg);
                        break;
                        
                    case 'UPDATE_CAPABILITY':
                        this.registry.updateCapability(botId, msg.capability);
                        break;
                        
                    default:
                        this.emit('message', { botId, msg });
                }
            } catch (e) {
                console.error('Error handling message:', e);
                ws.send(JSON.stringify({
                    type: 'ERROR',
                    message: e.message
                }));
            }
        });
        
        ws.on('close', () => {
            if (botId) {
                this.registry.markOffline(botId);
                this.reassignBotTasks(botId);
            }
        });
        
        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
        });
        
        // Welcome message
        ws.send(JSON.stringify({
            type: 'WELCOME',
            poolName: this.poolName,
            message: 'Welcome to OpenClaw! Send REGISTER to join the pool.'
        }));
    }

    /**
     * Submit a task to the open pool
     */
    async submitTask(taskType, payload, options = {}) {
        const taskId = `open_${++this.taskIdCounter}_${Date.now()}`;
        
        const task = {
            id: taskId,
            type: taskType,
            payload,
            status: OpenTaskStatus.AVAILABLE,
            priority: options.priority || 1,
            requiredCapability: options.requiredCapability || BotCapability.BASIC,
            maxRetries: options.maxRetries || this.config.maxRetries,
            timeout: options.timeout || this.config.claimTimeout,
            
            // Tracking
            createdAt: Date.now(),
            claimedAt: null,
            claimedBy: null,
            startedAt: null,
            completedAt: null,
            retries: 0,
            
            // Results
            result: null,
            error: null
        };
        
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => b.priority - a.priority);
        
        console.log(`📋 Task submitted: ${taskId} (${taskType})`);
        
        // Notify all connected bots
        this.broadcastToCapable(task.requiredCapability, {
            type: 'NEW_TASK',
            task: this.sanitizeTask(task)
        });
        
        this.emit('task_submitted', task);
        
        return taskId;
    }

    /**
     * Get tasks available for a specific bot
     */
    getTasksForBot(botId) {
        const bot = this.registry.getBot(botId);
        if (!bot) return [];
        
        const capabilityLevel = this.getCapabilityLevel(bot.capability);
        
        return this.taskQueue
            .filter(t => {
                const requiredLevel = this.getCapabilityLevel(t.requiredCapability);
                return capabilityLevel >= requiredLevel;
            })
            .map(t => this.sanitizeTask(t));
    }

    /**
     * Get capability level (for comparison)
     */
    getCapabilityLevel(capability) {
        const levels = {
            [BotCapability.MINIMAL]: 1,
            [BotCapability.BASIC]: 2,
            [BotCapability.STANDARD]: 3,
            [BotCapability.ADVANCED]: 4,
            [BotCapability.GPU]: 5,
            [BotCapability.TPU]: 6
        };
        return levels[capability] || 2;
    }

    /**
     * Sanitize task for sending to bots (remove internal fields)
     */
    sanitizeTask(task) {
        return {
            id: task.id,
            type: task.type,
            payload: task.payload,
            priority: task.priority,
            requiredCapability: task.requiredCapability,
            timeout: task.timeout,
            createdAt: task.createdAt
        };
    }

    /**
     * Handle task claim
     */
    async handleTaskClaim(botId, taskId, ws) {
        const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
        
        if (taskIndex === -1) {
            ws.send(JSON.stringify({
                type: 'CLAIM_FAILED',
                taskId,
                reason: 'Task not available'
            }));
            return;
        }
        
        const task = this.taskQueue[taskIndex];
        const bot = this.registry.getBot(botId);
        
        // Check capability
        if (this.config.requireCapability) {
            const botLevel = this.getCapabilityLevel(bot?.capability);
            const requiredLevel = this.getCapabilityLevel(task.requiredCapability);
            
            if (botLevel < requiredLevel) {
                ws.send(JSON.stringify({
                    type: 'CLAIM_FAILED',
                    taskId,
                    reason: 'Insufficient capability'
                }));
                return;
            }
        }
        
        // Claim the task
        this.taskQueue.splice(taskIndex, 1);
        task.status = OpenTaskStatus.CLAIMED;
        task.claimedAt = Date.now();
        task.claimedBy = botId;
        
        this.activeTasks.set(taskId, task);
        this.registry.updateStatus(botId, BotStatus.BUSY);
        
        ws.send(JSON.stringify({
            type: 'TASK_CLAIMED',
            task: this.sanitizeTask(task)
        }));
        
        console.log(`🎯 Task ${taskId} claimed by ${bot?.name || botId}`);
        
        // Set claim timeout
        setTimeout(() => this.checkTaskTimeout(taskId), task.timeout);
        
        this.emit('task_claimed', { task, botId });
    }

    /**
     * Handle task result
     */
    async handleTaskResult(botId, msg) {
        const { taskId, result, computeTime } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (!task || task.claimedBy !== botId) return;
        
        task.status = OpenTaskStatus.COMPLETED;
        task.completedAt = Date.now();
        task.result = result;
        
        this.activeTasks.delete(taskId);
        
        // Cache result
        this.completedTasks.set(taskId, task);
        if (this.completedTasks.size > this.config.maxCompletedCache) {
            const oldest = this.completedTasks.keys().next().value;
            this.completedTasks.delete(oldest);
        }
        
        // Record contribution
        this.registry.recordTaskCompletion(botId, task.type, computeTime || 0, true);
        this.contributions.recordContribution(botId, task.type, {
            taskId,
            computeTime,
            resultSize: JSON.stringify(result).length
        });
        
        this.registry.updateStatus(botId, BotStatus.IDLE);
        
        console.log(`✅ Task ${taskId} completed by ${botId}`);
        
        this.emit('task_completed', { task, botId, result });
    }

    /**
     * Handle task failure
     */
    async handleTaskFailed(botId, msg) {
        const { taskId, error } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (!task || task.claimedBy !== botId) return;
        
        task.retries++;
        task.error = error;
        
        this.registry.recordTaskCompletion(botId, task.type, 0, false);
        this.registry.updateStatus(botId, BotStatus.IDLE);
        
        console.log(`❌ Task ${taskId} failed (retry ${task.retries}/${task.maxRetries})`);
        
        if (task.retries < task.maxRetries) {
            // Put back in queue
            task.status = OpenTaskStatus.AVAILABLE;
            task.claimedBy = null;
            task.claimedAt = null;
            this.activeTasks.delete(taskId);
            this.taskQueue.push(task);
        } else {
            // Mark as failed
            task.status = OpenTaskStatus.FAILED;
            this.activeTasks.delete(taskId);
            this.emit('task_failed', { task, error });
        }
    }

    /**
     * Handle task progress
     */
    handleTaskProgress(botId, msg) {
        const { taskId, progress, partial } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (task && task.claimedBy === botId) {
            task.progress = progress;
            if (partial) {
                task.partialResult = partial;
            }
            
            this.emit('task_progress', { taskId, progress, partial });
        }
    }

    /**
     * Check task timeout
     */
    checkTaskTimeout(taskId) {
        const task = this.activeTasks.get(taskId);
        
        if (!task) return;
        if (task.status === OpenTaskStatus.COMPLETED) return;
        
        if (task.status === OpenTaskStatus.CLAIMED && !task.startedAt) {
            // Never started - return to queue
            console.log(`⏰ Task ${taskId} claim timeout`);
            
            this.registry.updateStatus(task.claimedBy, BotStatus.IDLE);
            task.status = OpenTaskStatus.AVAILABLE;
            task.claimedBy = null;
            task.claimedAt = null;
            task.retries++;
            
            this.activeTasks.delete(taskId);
            
            if (task.retries < task.maxRetries) {
                this.taskQueue.push(task);
            } else {
                task.status = OpenTaskStatus.EXPIRED;
                this.emit('task_expired', { task });
            }
        }
    }

    /**
     * Reassign tasks from a disconnected bot
     */
    reassignBotTasks(botId) {
        for (const [taskId, task] of this.activeTasks) {
            if (task.claimedBy === botId) {
                task.status = OpenTaskStatus.AVAILABLE;
                task.claimedBy = null;
                task.claimedAt = null;
                task.retries++;
                
                this.activeTasks.delete(taskId);
                
                if (task.retries < task.maxRetries) {
                    this.taskQueue.push(task);
                    console.log(`🔄 Task ${taskId} returned to queue`);
                }
            }
        }
    }

    /**
     * Start open training session
     */
    async startOpenTraining(trainingConfig) {
        if (this.openTraining) {
            throw new Error('Open training already in progress');
        }
        
        this.openTraining = {
            id: `training_${Date.now()}`,
            config: trainingConfig,
            status: 'active',
            participants: new Set(),
            currentStep: 0,
            gradients: [],
            startedAt: Date.now()
        };
        
        // Broadcast to training-capable bots
        this.broadcastToCapable(BotCapability.ADVANCED, {
            type: 'OPEN_TRAINING_STARTED',
            training: {
                id: this.openTraining.id,
                config: trainingConfig
            }
        });
        
        console.log(`🎓 Open training started: ${this.openTraining.id}`);
        
        this.emit('open_training_started', this.openTraining);
        
        return this.openTraining.id;
    }

    /**
     * Handle join open training
     */
    async handleJoinOpenTraining(botId, ws) {
        if (!this.openTraining) {
            ws.send(JSON.stringify({
                type: 'JOIN_TRAINING_FAILED',
                reason: 'No open training session'
            }));
            return;
        }
        
        this.openTraining.participants.add(botId);
        
        ws.send(JSON.stringify({
            type: 'TRAINING_JOINED',
            training: {
                id: this.openTraining.id,
                config: this.openTraining.config,
                currentStep: this.openTraining.currentStep
            }
        }));
        
        console.log(`🎓 Bot ${botId} joined open training`);
    }

    /**
     * Handle gradient submission
     */
    async handleGradientSubmit(botId, msg) {
        if (!this.openTraining) return;
        
        const { gradients, step, loss } = msg;
        
        this.openTraining.gradients.push({
            botId,
            gradients,
            step,
            loss,
            timestamp: Date.now()
        });
        
        // Record contribution
        this.contributions.recordContribution(botId, 'gradient', {
            step,
            loss
        });
        
        this.registry.recordTaskCompletion(botId, 'gradient', 0, true);
        
        // Check if we have enough gradients for aggregation
        if (this.openTraining.gradients.length >= this.openTraining.participants.size) {
            await this.aggregateGradients();
        }
        
        this.emit('gradient_received', { botId, step, loss });
    }

    /**
     * Aggregate gradients for open training
     */
    async aggregateGradients() {
        if (!this.openTraining || this.openTraining.gradients.length === 0) return;
        
        // Simple averaging (in production, would do proper gradient aggregation)
        console.log(`📊 Aggregating ${this.openTraining.gradients.length} gradients`);
        
        this.openTraining.currentStep++;
        this.openTraining.gradients = [];
        
        // Broadcast weight update
        this.broadcast({
            type: 'TRAINING_STEP_COMPLETE',
            step: this.openTraining.currentStep
        });
    }

    /**
     * Stop open training
     */
    async stopOpenTraining() {
        if (!this.openTraining) return;
        
        this.broadcast({
            type: 'OPEN_TRAINING_STOPPED',
            trainingId: this.openTraining.id
        });
        
        this.emit('open_training_stopped', this.openTraining);
        
        this.openTraining = null;
    }

    /**
     * Broadcast to all capable bots
     */
    broadcastToCapable(minCapability, msg) {
        const data = JSON.stringify(msg);
        const minLevel = this.getCapabilityLevel(minCapability);
        
        for (const bot of this.registry.bots.values()) {
            if (bot.ws && 
                bot.ws.readyState === WebSocket.OPEN &&
                this.getCapabilityLevel(bot.capability) >= minLevel) {
                bot.ws.send(data);
            }
        }
    }

    /**
     * Broadcast to all bots
     */
    broadcast(msg) {
        const data = JSON.stringify(msg);
        
        for (const bot of this.registry.bots.values()) {
            if (bot.ws && bot.ws.readyState === WebSocket.OPEN) {
                bot.ws.send(data);
            }
        }
    }

    /**
     * Start background task processor
     */
    startTaskProcessor() {
        // Clean up expired tasks
        setInterval(() => {
            const now = Date.now();
            
            this.taskQueue = this.taskQueue.filter(task => {
                if (now - task.createdAt > this.config.maxTaskAge) {
                    task.status = OpenTaskStatus.EXPIRED;
                    this.emit('task_expired', { task });
                    return false;
                }
                return true;
            });
        }, 60000);
    }

    /**
     * Get available tasks
     */
    getAvailableTasks() {
        return this.taskQueue.map(t => this.sanitizeTask(t));
    }

    /**
     * Get pool status
     */
    getStatus() {
        return {
            poolName: this.poolName,
            isRunning: this.isRunning,
            registry: this.registry.getStats(),
            tasks: {
                available: this.taskQueue.length,
                active: this.activeTasks.size,
                completed: this.completedTasks.size
            },
            openTraining: this.openTraining ? {
                id: this.openTraining.id,
                status: this.openTraining.status,
                participants: this.openTraining.participants.size,
                currentStep: this.openTraining.currentStep
            } : null
        };
    }

    /**
     * Register event handler
     */
    on(event, handler) {
        this.eventHandlers.push({ event, handler });
    }

    /**
     * Emit event
     */
    emit(event, data) {
        for (const h of this.eventHandlers) {
            if (h.event === event) {
                try {
                    h.handler(data);
                } catch (e) {
                    console.error(`Event handler error (${event}):`, e);
                }
            }
        }
    }

    /**
     * Stop the pool
     */
    async stop() {
        return new Promise((resolve) => {
            // Stop open training
            this.stopOpenTraining();
            
            // Shutdown registry
            this.registry.shutdown();
            
            if (this.wss) {
                this.wss.close();
            }
            
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    console.log('🛑 OpenClaw Pool stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = { OpenPool, OpenTaskType, OpenTaskStatus };

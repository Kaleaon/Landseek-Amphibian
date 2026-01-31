/**
 * Universal Device Host
 * 
 * Allows any device to host distributed processing for ClawBots.
 * Automatically adapts to device capabilities and resource constraints.
 * 
 * Supports:
 * - Smartphones (Android, iOS)
 * - Smart Home devices (speakers, displays, TVs)
 * - IoT devices (Raspberry Pi, ESP32, etc.)
 * - Desktop computers and servers
 * - Cloud instances
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const os = require('os');
const { DeviceType, PowerMode, getProfile, detectDeviceType, createCustomProfile } = require('./profiles');

/**
 * Host status
 */
const HostStatus = {
    INITIALIZING: 'initializing',
    READY: 'ready',
    BUSY: 'busy',
    THROTTLED: 'throttled',
    LOW_POWER: 'low_power',
    OFFLINE: 'offline'
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

class UniversalHost {
    constructor(options = {}) {
        this.port = options.port || 8768;
        this.hostName = options.hostName || `Host_${os.hostname()}`;
        
        // Device profile
        this.deviceType = options.deviceType || this.detectDeviceType();
        this.profile = options.customProfile || getProfile(this.deviceType);
        
        // Override profile settings if provided
        if (options.capabilities) {
            Object.assign(this.profile.capabilities, options.capabilities);
        }
        if (options.resources) {
            Object.assign(this.profile.resources, options.resources);
        }
        
        // State
        this.status = HostStatus.INITIALIZING;
        this.powerMode = options.powerMode || this.profile.power.defaultMode;
        this.batteryLevel = 100;
        this.temperature = 25;
        
        // Connected ClawBots
        this.clawBots = new Map(); // botId -> BotConnection
        
        // Task management
        this.taskQueue = [];
        this.activeTasks = new Map();
        this.completedTasks = 0;
        
        // Resource monitoring
        this.resourceMonitor = {
            memoryUsage: 0,
            cpuUsage: 0,
            networkUsage: 0,
            lastUpdate: Date.now()
        };
        
        // Local processing (if available)
        this.localBrain = options.localBrain || null;
        
        // Networking
        this.server = null;
        this.wss = null;
        this.isRunning = false;
        
        // Event handlers
        this.eventHandlers = [];
        
        // Configuration
        this.config = {
            maxClawBots: options.maxClawBots || 10,
            taskTimeout: options.taskTimeout || 60000,
            heartbeatInterval: options.heartbeatInterval || 30000,
            resourceCheckInterval: options.resourceCheckInterval || 5000,
            enableRelay: options.enableRelay !== false,
            enableLocalProcessing: options.enableLocalProcessing !== false,
            advertiseMdns: options.advertiseMdns !== false
        };
    }

    /**
     * Detect device type from system
     */
    detectDeviceType() {
        const systemInfo = {
            platform: process.platform,
            arch: process.arch,
            totalMemory: os.totalmem(),
            cpuModel: os.cpus()[0]?.model || '',
            hasGPU: false,
            gpuModel: null
        };
        
        return detectDeviceType(systemInfo);
    }

    /**
     * Start the universal host
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`🏠 Starting Universal Host: ${this.hostName}`);
                console.log(`📱 Device Type: ${this.profile.name}`);
                console.log(`⚡ Power Mode: ${this.powerMode}`);
                
                this.server = http.createServer((req, res) => {
                    this.handleHttpRequest(req, res);
                });

                this.wss = new WebSocket.Server({ server: this.server });

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.server.listen(this.port, '0.0.0.0', () => {
                    this.isRunning = true;
                    this.status = HostStatus.READY;
                    
                    const localIPs = getLocalIPs();
                    
                    console.log(`✅ Universal Host started on port ${this.port}`);
                    console.log(`🔗 Connect: ws://${localIPs[0] || 'localhost'}:${this.port}`);
                    console.log(`📊 Capabilities:`, this.profile.capabilities);
                    
                    // Start background tasks
                    this.startBackgroundTasks();
                    
                    resolve({
                        port: this.port,
                        hostName: this.hostName,
                        deviceType: this.deviceType,
                        profile: this.profile,
                        localIPs,
                        capabilities: this.profile.capabilities
                    });
                });

                this.server.on('error', reject);
                
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Handle HTTP requests (REST API)
     */
    handleHttpRequest(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url === '/status') {
            res.writeHead(200);
            res.end(JSON.stringify(this.getStatus()));
        } else if (req.url === '/capabilities') {
            res.writeHead(200);
            res.end(JSON.stringify(this.profile.capabilities));
        } else if (req.url === '/resources') {
            res.writeHead(200);
            res.end(JSON.stringify(this.getResourceStatus()));
        } else if (req.url === '/bots') {
            res.writeHead(200);
            res.end(JSON.stringify(this.getConnectedBots()));
        } else {
            res.writeHead(200);
            res.end(JSON.stringify({
                name: this.hostName,
                type: 'UniversalHost',
                deviceType: this.deviceType,
                status: this.status,
                endpoints: ['/status', '/capabilities', '/resources', '/bots']
            }));
        }
    }

    /**
     * Handle WebSocket connection
     */
    handleConnection(ws, req) {
        const connectionId = crypto.randomBytes(8).toString('hex');
        let botId = null;
        
        console.log(`🔌 New connection: ${connectionId}`);
        
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data);
                await this.handleMessage(ws, connectionId, msg, (id) => { botId = id; });
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
                this.handleBotDisconnect(botId);
            }
            console.log(`🔌 Connection closed: ${connectionId}`);
        });
        
        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
        });
        
        // Send welcome with host capabilities
        ws.send(JSON.stringify({
            type: 'HOST_INFO',
            hostName: this.hostName,
            deviceType: this.deviceType,
            capabilities: this.profile.capabilities,
            resources: this.profile.resources,
            status: this.status
        }));
    }

    /**
     * Handle incoming message
     */
    async handleMessage(ws, connectionId, msg, setBotId) {
        switch (msg.type) {
            case 'REGISTER_BOT':
                await this.handleBotRegister(ws, msg, setBotId);
                break;
                
            case 'SUBMIT_TASK':
                await this.handleTaskSubmit(ws, msg);
                break;
                
            case 'TASK_RESULT':
                await this.handleTaskResult(msg);
                break;
                
            case 'TASK_FAILED':
                await this.handleTaskFailed(msg);
                break;
                
            case 'GET_TASKS':
                this.sendAvailableTasks(ws);
                break;
                
            case 'CLAIM_TASK':
                await this.handleTaskClaim(ws, msg);
                break;
                
            case 'HEARTBEAT':
                ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
                break;
                
            case 'UPDATE_POWER_MODE':
                this.setPowerMode(msg.powerMode);
                break;
                
            case 'UPDATE_BATTERY':
                this.updateBatteryLevel(msg.level);
                break;
                
            default:
                this.emit('message', { connectionId, msg });
        }
    }

    /**
     * Handle ClawBot registration
     */
    async handleBotRegister(ws, msg, setBotId) {
        if (this.clawBots.size >= this.config.maxClawBots) {
            ws.send(JSON.stringify({
                type: 'REGISTER_FAILED',
                reason: 'Host at capacity'
            }));
            return;
        }
        
        const botId = msg.botId || `bot_${crypto.randomBytes(4).toString('hex')}`;
        
        const bot = {
            id: botId,
            name: msg.name || botId,
            ws,
            capability: msg.capability || 'basic',
            registeredAt: Date.now(),
            lastSeen: Date.now(),
            tasksCompleted: 0,
            tasksFailed: 0
        };
        
        this.clawBots.set(botId, bot);
        setBotId(botId);
        
        ws.send(JSON.stringify({
            type: 'REGISTERED',
            botId,
            hostName: this.hostName,
            hostCapabilities: this.profile.capabilities
        }));
        
        console.log(`🤖 ClawBot registered: ${bot.name}`);
        
        this.emit('bot_registered', bot);
    }

    /**
     * Handle bot disconnect
     */
    handleBotDisconnect(botId) {
        const bot = this.clawBots.get(botId);
        if (bot) {
            this.clawBots.delete(botId);
            console.log(`👋 ClawBot disconnected: ${bot.name}`);
            this.emit('bot_disconnected', bot);
        }
    }

    /**
     * Handle task submission
     */
    async handleTaskSubmit(ws, msg) {
        const { taskType, payload, options } = msg;
        
        // Check if we can handle this task
        if (!this.canHandleTask(taskType)) {
            // Try to relay to another device if enabled
            if (this.config.enableRelay) {
                await this.relayTask(msg);
                ws.send(JSON.stringify({
                    type: 'TASK_RELAYED',
                    message: 'Task relayed to capable device'
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'TASK_REJECTED',
                    reason: 'Host cannot handle this task type'
                }));
            }
            return;
        }
        
        const taskId = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        const task = {
            id: taskId,
            type: taskType,
            payload,
            options: options || {},
            status: 'pending',
            createdAt: Date.now(),
            submittedBy: msg.botId
        };
        
        this.taskQueue.push(task);
        
        ws.send(JSON.stringify({
            type: 'TASK_ACCEPTED',
            taskId
        }));
        
        // Try to process immediately if we can
        if (this.config.enableLocalProcessing && this.canProcessLocally(taskType)) {
            this.processTaskLocally(task);
        }
        
        this.emit('task_submitted', task);
    }

    /**
     * Check if host can handle task type
     */
    canHandleTask(taskType) {
        const caps = this.profile.capabilities;
        
        switch (taskType) {
            case 'inference':
                return caps.canInference;
            case 'training':
            case 'gradient':
                return caps.canTrain;
            case 'embed':
                return caps.canEmbed;
            case 'relay':
                return caps.canRelay;
            default:
                return true; // Accept unknown types
        }
    }

    /**
     * Check if we can process locally
     */
    canProcessLocally(taskType) {
        if (!this.localBrain) return false;
        if (this.status === HostStatus.THROTTLED) return false;
        if (this.status === HostStatus.LOW_POWER) return false;
        
        return this.canHandleTask(taskType);
    }

    /**
     * Process task locally
     */
    async processTaskLocally(task) {
        if (!this.localBrain) return;
        
        task.status = 'processing';
        this.activeTasks.set(task.id, task);
        
        try {
            let result;
            
            switch (task.type) {
                case 'inference':
                    const response = await this.localBrain.chat([
                        { role: 'user', content: task.payload.prompt }
                    ], task.payload.options);
                    result = response.content;
                    break;
                    
                case 'embed':
                    if (this.localBrain.embed) {
                        result = await this.localBrain.embed(task.payload.text);
                    }
                    break;
                    
                default:
                    result = null;
            }
            
            task.status = 'completed';
            task.result = result;
            task.completedAt = Date.now();
            
            this.activeTasks.delete(task.id);
            this.completedTasks++;
            
            // Notify submitter
            this.notifyTaskComplete(task);
            
            this.emit('task_completed', task);
            
        } catch (e) {
            task.status = 'failed';
            task.error = e.message;
            this.activeTasks.delete(task.id);
            
            this.emit('task_failed', task);
        }
    }

    /**
     * Relay task to another device
     */
    async relayTask(msg) {
        // Broadcast to connected bots to find one that can handle it
        for (const [botId, bot] of this.clawBots) {
            if (bot.ws.readyState === WebSocket.OPEN) {
                bot.ws.send(JSON.stringify({
                    type: 'RELAY_TASK',
                    ...msg
                }));
            }
        }
    }

    /**
     * Handle task claim from a bot
     */
    async handleTaskClaim(ws, msg) {
        const { taskId, botId } = msg;
        
        const taskIndex = this.taskQueue.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            ws.send(JSON.stringify({
                type: 'CLAIM_FAILED',
                taskId,
                reason: 'Task not available'
            }));
            return;
        }
        
        const task = this.taskQueue.splice(taskIndex, 1)[0];
        task.status = 'claimed';
        task.claimedBy = botId;
        task.claimedAt = Date.now();
        
        this.activeTasks.set(taskId, task);
        
        ws.send(JSON.stringify({
            type: 'TASK_CLAIMED',
            task
        }));
        
        // Set timeout
        setTimeout(() => this.checkTaskTimeout(taskId), this.config.taskTimeout);
    }

    /**
     * Handle task result
     */
    async handleTaskResult(msg) {
        const { taskId, result, botId } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (!task) return;
        
        task.status = 'completed';
        task.result = result;
        task.completedAt = Date.now();
        
        this.activeTasks.delete(taskId);
        this.completedTasks++;
        
        // Update bot stats
        const bot = this.clawBots.get(botId);
        if (bot) {
            bot.tasksCompleted++;
            bot.lastSeen = Date.now();
        }
        
        // Notify submitter
        this.notifyTaskComplete(task);
        
        this.emit('task_completed', task);
    }

    /**
     * Handle task failure
     */
    async handleTaskFailed(msg) {
        const { taskId, error, botId } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (!task) return;
        
        task.status = 'failed';
        task.error = error;
        
        this.activeTasks.delete(taskId);
        
        // Update bot stats
        const bot = this.clawBots.get(botId);
        if (bot) {
            bot.tasksFailed++;
        }
        
        this.emit('task_failed', task);
    }

    /**
     * Check task timeout
     */
    checkTaskTimeout(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task || task.status === 'completed') return;
        
        // Return to queue or mark as failed
        task.status = 'timeout';
        this.activeTasks.delete(taskId);
        
        // Put back in queue
        task.status = 'pending';
        task.claimedBy = null;
        this.taskQueue.push(task);
        
        console.log(`⏰ Task ${taskId} timed out, returned to queue`);
    }

    /**
     * Notify task submitter of completion
     */
    notifyTaskComplete(task) {
        if (task.submittedBy) {
            const bot = this.clawBots.get(task.submittedBy);
            if (bot && bot.ws.readyState === WebSocket.OPEN) {
                bot.ws.send(JSON.stringify({
                    type: 'TASK_COMPLETE',
                    taskId: task.id,
                    result: task.result
                }));
            }
        }
    }

    /**
     * Send available tasks to bot
     */
    sendAvailableTasks(ws) {
        ws.send(JSON.stringify({
            type: 'AVAILABLE_TASKS',
            tasks: this.taskQueue.map(t => ({
                id: t.id,
                type: t.type,
                createdAt: t.createdAt
            }))
        }));
    }

    /**
     * Set power mode
     */
    setPowerMode(mode) {
        this.powerMode = mode;
        
        // Adjust behavior based on power mode
        switch (mode) {
            case PowerMode.PERFORMANCE:
                this.status = HostStatus.READY;
                break;
            case PowerMode.POWER_SAVE:
            case PowerMode.ULTRA_LOW:
                if (this.activeTasks.size === 0) {
                    this.status = HostStatus.LOW_POWER;
                }
                break;
        }
        
        console.log(`⚡ Power mode changed to: ${mode}`);
        this.emit('power_mode_changed', mode);
    }

    /**
     * Update battery level
     */
    updateBatteryLevel(level) {
        this.batteryLevel = level;
        
        // Auto-switch to power save if battery low
        if (level < this.profile.power.batteryThreshold && 
            this.powerMode !== PowerMode.POWER_SAVE) {
            this.setPowerMode(PowerMode.POWER_SAVE);
        }
        
        this.emit('battery_updated', level);
    }

    /**
     * Start background tasks
     */
    startBackgroundTasks() {
        // Resource monitoring
        this.resourceInterval = setInterval(() => {
            this.updateResourceUsage();
        }, this.config.resourceCheckInterval);
        
        // Heartbeat to bots
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeats();
        }, this.config.heartbeatInterval);
    }

    /**
     * Update resource usage
     */
    updateResourceUsage() {
        const memUsage = process.memoryUsage();
        const totalMem = os.totalmem();
        
        this.resourceMonitor = {
            memoryUsage: memUsage.heapUsed / totalMem,
            cpuUsage: os.loadavg()[0] / os.cpus().length,
            networkUsage: 0, // Would need external monitoring
            lastUpdate: Date.now()
        };
        
        // Check for thermal throttling
        if (this.temperature > this.profile.power.thermalThrottleTemp) {
            this.status = HostStatus.THROTTLED;
        } else if (this.status === HostStatus.THROTTLED) {
            this.status = HostStatus.READY;
        }
        
        // Check memory pressure
        if (this.resourceMonitor.memoryUsage > 0.9) {
            this.status = HostStatus.THROTTLED;
        }
    }

    /**
     * Send heartbeats to connected bots
     */
    sendHeartbeats() {
        const status = this.getStatus();
        
        for (const [botId, bot] of this.clawBots) {
            if (bot.ws.readyState === WebSocket.OPEN) {
                bot.ws.send(JSON.stringify({
                    type: 'HOST_STATUS',
                    ...status
                }));
            }
        }
    }

    /**
     * Get host status
     */
    getStatus() {
        return {
            hostName: this.hostName,
            deviceType: this.deviceType,
            status: this.status,
            powerMode: this.powerMode,
            batteryLevel: this.batteryLevel,
            connectedBots: this.clawBots.size,
            pendingTasks: this.taskQueue.length,
            activeTasks: this.activeTasks.size,
            completedTasks: this.completedTasks,
            capabilities: this.profile.capabilities,
            resources: this.getResourceStatus()
        };
    }

    /**
     * Get resource status
     */
    getResourceStatus() {
        return {
            ...this.resourceMonitor,
            maxMemoryMB: this.profile.resources.maxMemoryMB,
            maxConcurrentTasks: this.profile.resources.maxConcurrentTasks
        };
    }

    /**
     * Get connected bots
     */
    getConnectedBots() {
        return Array.from(this.clawBots.values()).map(b => ({
            id: b.id,
            name: b.name,
            capability: b.capability,
            tasksCompleted: b.tasksCompleted,
            lastSeen: b.lastSeen
        }));
    }

    /**
     * Broadcast to all bots
     */
    broadcast(msg) {
        const data = JSON.stringify(msg);
        
        for (const bot of this.clawBots.values()) {
            if (bot.ws.readyState === WebSocket.OPEN) {
                bot.ws.send(data);
            }
        }
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
     * Stop the host
     */
    async stop() {
        return new Promise((resolve) => {
            // Clear intervals
            if (this.resourceInterval) clearInterval(this.resourceInterval);
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            
            // Notify bots
            this.broadcast({
                type: 'HOST_SHUTDOWN',
                message: 'Host is shutting down'
            });
            
            // Close connections
            for (const bot of this.clawBots.values()) {
                bot.ws.close(1001, 'Host shutdown');
            }
            this.clawBots.clear();
            
            if (this.wss) {
                this.wss.close();
            }
            
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    this.status = HostStatus.OFFLINE;
                    console.log('🛑 Universal Host stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = { UniversalHost, HostStatus };

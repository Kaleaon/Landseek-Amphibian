/**
 * Collective Coordinator
 * 
 * Manages a pool of devices for distributed AI inference.
 * Handles device registration, task distribution, and result aggregation.
 * 
 * Design for High Latency:
 * - Asynchronous task queues with priorities
 * - Speculative execution (pre-process likely next tokens)
 * - Chunk-based work distribution with overlap
 * - Redundant execution for fault tolerance
 * - Adaptive timeout based on historical latency
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const os = require('os');

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

/**
 * Device capability levels
 */
const DeviceCapability = {
    LOW: 'low',       // Can handle small chunks (1-2 tokens at a time)
    MEDIUM: 'medium', // Can handle moderate chunks (8-16 tokens)
    HIGH: 'high',     // Can handle large chunks (32+ tokens)
    TPU: 'tpu'        // Has TPU/NPU acceleration
};

/**
 * Task status
 */
const TaskStatus = {
    PENDING: 'pending',
    ASSIGNED: 'assigned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    TIMEOUT: 'timeout'
};

class CollectiveCoordinator {
    constructor(options = {}) {
        this.port = options.port || 8766;
        this.secret = options.secret || crypto.randomBytes(8).toString('hex');
        this.poolName = options.poolName || 'Amphibian Collective';
        
        // Device pool
        this.devices = new Map(); // deviceId -> DeviceInfo
        this.devicesByCapability = {
            [DeviceCapability.LOW]: [],
            [DeviceCapability.MEDIUM]: [],
            [DeviceCapability.HIGH]: [],
            [DeviceCapability.TPU]: []
        };
        
        // Task management
        this.taskQueue = [];
        this.activeTasks = new Map(); // taskId -> TaskInfo
        this.completedTasks = new Map(); // taskId -> Result (LRU, max 100)
        this.taskIdCounter = 0;
        
        // Performance tracking
        this.latencyHistory = new Map(); // deviceId -> [latencies]
        this.deviceReliability = new Map(); // deviceId -> successRate
        
        // Configuration for high-latency tolerance
        this.config = {
            baseTimeout: options.baseTimeout || 30000, // 30 seconds base
            maxTimeout: options.maxTimeout || 120000,  // 2 minutes max
            redundancyFactor: options.redundancyFactor || 1.5, // Send to 1.5x devices needed
            chunkOverlap: options.chunkOverlap || 2, // Overlap tokens between chunks
            minDevicesForInference: options.minDevicesForInference || 1,
            speculativeExecution: options.speculativeExecution !== false,
            adaptiveTimeout: options.adaptiveTimeout !== false,
            // Tunable constants
            maxConcurrentTasksPerDevice: options.maxConcurrentTasksPerDevice || 3,
            latencyTimeoutMultiplier: options.latencyTimeoutMultiplier || 3, // Timeout = avg latency * this
            defaultUnknownLatency: options.defaultUnknownLatency || 5000, // 5s default for new devices
            maxCompletedTaskCache: options.maxCompletedTaskCache || 100, // LRU cache size
            heartbeatTimeout: options.heartbeatTimeout || 60000, // 60 seconds
            heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
            reconnectDelay: options.reconnectDelay || 2000 // Base reconnect delay
        };
        
        // Networking
        this.server = null;
        this.wss = null;
        this.isRunning = false;
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Start the collective coordinator
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer((req, res) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'ok',
                        pool: this.poolName,
                        devices: this.devices.size,
                        queuedTasks: this.taskQueue.length
                    }));
                });

                this.wss = new WebSocket.Server({ server: this.server });

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.server.listen(this.port, '0.0.0.0', () => {
                    this.isRunning = true;
                    
                    const localIPs = getLocalIPs();
                    const shareCode = this.generateShareCode(localIPs[0] || '127.0.0.1');
                    
                    console.log(`🌐 Collective Coordinator started on port ${this.port}`);
                    console.log(`📋 Pool: ${this.poolName}`);
                    console.log(`🔗 Share code: ${shareCode}`);
                    
                    resolve({
                        port: this.port,
                        secret: this.secret,
                        localIPs,
                        shareCode,
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
     * Generate share code for the collective
     */
    generateShareCode(host) {
        const data = `collective:${host}:${this.port}:${this.secret}`;
        return Buffer.from(data).toString('base64');
    }

    /**
     * Parse a collective share code
     */
    static parseShareCode(code) {
        try {
            const data = Buffer.from(code, 'base64').toString('utf8');
            if (!data.startsWith('collective:')) return null;
            
            const parts = data.slice(11).split(':');
            return { host: parts[0], port: parseInt(parts[1]), secret: parts[2] };
        } catch (e) {
            return null;
        }
    }

    /**
     * Handle new device connection
     */
    handleConnection(ws, req) {
        const deviceId = crypto.randomBytes(8).toString('hex');
        
        // Auth handshake
        ws.once('message', (data) => {
            try {
                const msg = JSON.parse(data);
                
                if (msg.type === 'JOIN_COLLECTIVE' && msg.secret === this.secret) {
                    // Register device
                    const device = {
                        id: deviceId,
                        ws,
                        name: msg.deviceName || `Device_${deviceId.substring(0, 4)}`,
                        capability: msg.capability || DeviceCapability.MEDIUM,
                        model: msg.model || 'unknown',
                        joinedAt: Date.now(),
                        lastHeartbeat: Date.now(),
                        activeTasks: new Set(),
                        completedTasks: 0,
                        failedTasks: 0
                    };
                    
                    this.devices.set(deviceId, device);
                    this.devicesByCapability[device.capability].push(deviceId);
                    this.latencyHistory.set(deviceId, []);
                    this.deviceReliability.set(deviceId, 1.0);
                    
                    ws.send(JSON.stringify({
                        type: 'COLLECTIVE_JOINED',
                        deviceId,
                        poolName: this.poolName,
                        totalDevices: this.devices.size,
                        config: this.config
                    }));
                    
                    // Notify others
                    this.broadcast({
                        type: 'DEVICE_JOINED',
                        device: { id: deviceId, name: device.name, capability: device.capability }
                    }, deviceId);
                    
                    // Set up message handler
                    ws.on('message', (data) => this.handleMessage(deviceId, data));
                    ws.on('close', () => this.handleDisconnect(deviceId));
                    ws.on('pong', () => this.handlePong(deviceId));
                    
                    console.log(`🟢 Device joined collective: ${device.name} (${device.capability})`);
                    
                    this.emit('device_joined', device);
                } else {
                    ws.close(4001, 'Invalid secret');
                }
            } catch (e) {
                ws.close(4000, 'Invalid message format');
            }
        });
        
        // Request auth
        ws.send(JSON.stringify({ type: 'AUTH_REQUIRED', poolName: this.poolName }));
    }

    /**
     * Handle messages from devices
     */
    handleMessage(deviceId, data) {
        try {
            const msg = JSON.parse(data);
            const device = this.devices.get(deviceId);
            
            if (!device) return;
            
            device.lastHeartbeat = Date.now();

            switch (msg.type) {
                case 'TASK_RESULT':
                    this.handleTaskResult(deviceId, msg);
                    break;
                    
                case 'TASK_PROGRESS':
                    this.handleTaskProgress(deviceId, msg);
                    break;
                    
                case 'TASK_FAILED':
                    this.handleTaskFailed(deviceId, msg);
                    break;
                    
                case 'CAPABILITY_UPDATE':
                    this.updateDeviceCapability(deviceId, msg.capability);
                    break;
                    
                case 'HEARTBEAT':
                    this.sendTo(deviceId, { type: 'HEARTBEAT_ACK' });
                    break;
                    
                default:
                    this.emit('message', { deviceId, msg });
            }
        } catch (e) {
            console.error('Error handling collective message:', e);
        }
    }

    /**
     * Handle task completion from a device
     */
    handleTaskResult(deviceId, msg) {
        const { taskId, result, latency } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (!task) return;
        
        const device = this.devices.get(deviceId);
        if (device) {
            device.activeTasks.delete(taskId);
            device.completedTasks++;
            
            // Update latency history
            const history = this.latencyHistory.get(deviceId) || [];
            history.push(latency || Date.now() - task.startTime);
            if (history.length > 20) history.shift();
            this.latencyHistory.set(deviceId, history);
        }
        
        // Store result
        task.results.push({ deviceId, result, latency });
        
        // Check if we have enough results (for redundant execution)
        if (task.results.length >= task.requiredResults) {
            this.completeTask(taskId);
        }
    }

    /**
     * Handle task progress updates
     */
    handleTaskProgress(deviceId, msg) {
        const { taskId, progress, partial } = msg;
        const task = this.activeTasks.get(taskId);
        
        if (task) {
            task.progress = Math.max(task.progress || 0, progress);
            if (partial) {
                task.partialResults = task.partialResults || [];
                task.partialResults.push({ deviceId, partial, timestamp: Date.now() });
            }
            
            this.emit('task_progress', { taskId, progress, partial });
        }
    }

    /**
     * Handle task failure
     */
    handleTaskFailed(deviceId, msg) {
        const { taskId, error } = msg;
        const task = this.activeTasks.get(taskId);
        const device = this.devices.get(deviceId);
        
        if (device) {
            device.activeTasks.delete(taskId);
            device.failedTasks++;
            
            // Update reliability score
            const total = device.completedTasks + device.failedTasks;
            this.deviceReliability.set(deviceId, device.completedTasks / total);
        }
        
        if (task) {
            task.failures.push({ deviceId, error, timestamp: Date.now() });
            
            // Reassign if we have other devices
            if (task.assignedDevices.size < this.devices.size) {
                this.reassignTask(taskId);
            } else if (task.failures.length >= task.assignedDevices.size) {
                // All assigned devices failed
                task.status = TaskStatus.FAILED;
                this.emit('task_failed', { taskId, errors: task.failures });
            }
        }
    }

    /**
     * Handle device disconnect
     */
    handleDisconnect(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) return;
        
        console.log(`🔴 Device left collective: ${device.name}`);
        
        // Reassign active tasks
        for (const taskId of device.activeTasks) {
            this.reassignTask(taskId);
        }
        
        // Remove from pool
        this.devices.delete(deviceId);
        const capabilityList = this.devicesByCapability[device.capability];
        const idx = capabilityList.indexOf(deviceId);
        if (idx !== -1) capabilityList.splice(idx, 1);
        
        this.latencyHistory.delete(deviceId);
        this.deviceReliability.delete(deviceId);
        
        // Notify others
        this.broadcast({
            type: 'DEVICE_LEFT',
            deviceId,
            deviceName: device.name
        });
        
        this.emit('device_left', device);
    }

    /**
     * Handle pong (heartbeat response)
     */
    handlePong(deviceId) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.lastHeartbeat = Date.now();
        }
    }

    /**
     * Submit a task to the collective
     */
    async submitTask(taskType, payload, options = {}) {
        const taskId = `task_${++this.taskIdCounter}_${Date.now()}`;
        
        const task = {
            id: taskId,
            type: taskType,
            payload,
            status: TaskStatus.PENDING,
            priority: options.priority || 1,
            requiredResults: options.requiredResults || 1,
            timeout: this.calculateTimeout(options.timeout),
            createdAt: Date.now(),
            startTime: null,
            assignedDevices: new Set(),
            results: [],
            failures: [],
            partialResults: [],
            progress: 0,
            resolve: null,
            reject: null
        };
        
        // Create promise for result
        const promise = new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;
        });
        
        // Add to queue
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => b.priority - a.priority);
        
        console.log(`📋 Task queued: ${taskId} (${taskType})`);
        
        // Immediately try to process if devices available
        this.processNextTask();
        
        return { taskId, promise };
    }

    /**
     * Calculate adaptive timeout based on historical latency
     */
    calculateTimeout(requestedTimeout) {
        if (requestedTimeout) return requestedTimeout;
        if (!this.config.adaptiveTimeout) return this.config.baseTimeout;
        
        // Calculate average latency across all devices
        let totalLatency = 0;
        let count = 0;
        
        for (const [deviceId, history] of this.latencyHistory) {
            if (history.length > 0) {
                const avgLatency = history.reduce((a, b) => a + b, 0) / history.length;
                totalLatency += avgLatency;
                count++;
            }
        }
        
        if (count === 0) return this.config.baseTimeout;
        
        // Use configurable multiplier for average latency as timeout, capped at max
        const avgLatency = totalLatency / count;
        return Math.min(avgLatency * this.config.latencyTimeoutMultiplier, this.config.maxTimeout);
    }

    /**
     * Select devices for a task
     */
    selectDevicesForTask(task) {
        const candidates = [];
        
        // Get all available devices sorted by reliability
        for (const [deviceId, device] of this.devices) {
            if (device.activeTasks.size < this.config.maxConcurrentTasksPerDevice) {
                const reliability = this.deviceReliability.get(deviceId) || 1.0;
                const avgLatency = this.getAverageLatency(deviceId);
                
                candidates.push({
                    deviceId,
                    device,
                    reliability,
                    avgLatency,
                    score: reliability / (1 + avgLatency / 10000) // Higher is better
                });
            }
        }
        
        // Sort by score
        candidates.sort((a, b) => b.score - a.score);
        
        // Select enough devices with redundancy
        const needed = Math.ceil(task.requiredResults * this.config.redundancyFactor);
        return candidates.slice(0, needed).map(c => c.deviceId);
    }

    /**
     * Get average latency for a device
     */
    getAverageLatency(deviceId) {
        const history = this.latencyHistory.get(deviceId) || [];
        if (history.length === 0) return this.config.defaultUnknownLatency;
        return history.reduce((a, b) => a + b, 0) / history.length;
    }

    /**
     * Process tasks from the queue
     */
    processNextTask() {
        if (this.taskQueue.length === 0) return;
        if (this.devices.size < this.config.minDevicesForInference) return;
        
        const task = this.taskQueue.shift();
        if (!task) return;
        
        // Select devices
        const deviceIds = this.selectDevicesForTask(task);
        
        if (deviceIds.length === 0) {
            // No devices available, re-queue
            this.taskQueue.unshift(task);
            return;
        }
        
        // Assign task
        task.status = TaskStatus.ASSIGNED;
        task.startTime = Date.now();
        task.assignedDevices = new Set(deviceIds);
        this.activeTasks.set(task.id, task);
        
        // Send to devices
        for (const deviceId of deviceIds) {
            const device = this.devices.get(deviceId);
            if (device) {
                device.activeTasks.add(task.id);
                this.sendTo(deviceId, {
                    type: 'TASK_ASSIGNMENT',
                    task: {
                        id: task.id,
                        type: task.type,
                        payload: task.payload,
                        timeout: task.timeout
                    }
                });
            }
        }
        
        console.log(`📤 Task ${task.id} assigned to ${deviceIds.length} devices`);
        
        // Set timeout
        setTimeout(() => this.checkTaskTimeout(task.id), task.timeout);
    }

    /**
     * Check if a task has timed out
     */
    checkTaskTimeout(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task || task.status === TaskStatus.COMPLETED) return;
        
        // Check if we have partial results we can use
        if (task.partialResults && task.partialResults.length > 0) {
            // Use best partial result
            const bestPartial = task.partialResults.sort((a, b) => 
                b.partial.length - a.partial.length
            )[0];
            
            task.status = TaskStatus.COMPLETED;
            this.activeTasks.delete(taskId);
            
            if (task.resolve) {
                task.resolve({
                    partial: true,
                    result: bestPartial.partial,
                    completedBy: [bestPartial.deviceId]
                });
            }
            
            this.emit('task_partial', { taskId, result: bestPartial.partial });
        } else {
            // Mark as timeout
            task.status = TaskStatus.TIMEOUT;
            this.activeTasks.delete(taskId);
            
            if (task.reject) {
                task.reject(new Error(`Task ${taskId} timed out`));
            }
            
            this.emit('task_timeout', { taskId });
        }
    }

    /**
     * Reassign a task to different devices
     */
    reassignTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task || task.status === TaskStatus.COMPLETED) return;
        
        // Find devices not already assigned
        const availableDevices = [];
        for (const [deviceId, device] of this.devices) {
            if (!task.assignedDevices.has(deviceId) && device.activeTasks.size < 3) {
                availableDevices.push(deviceId);
            }
        }
        
        if (availableDevices.length === 0) {
            console.log(`⚠️ No devices available to reassign task ${taskId}`);
            return;
        }
        
        // Reassign to first available
        const newDeviceId = availableDevices[0];
        const device = this.devices.get(newDeviceId);
        
        task.assignedDevices.add(newDeviceId);
        device.activeTasks.add(taskId);
        
        this.sendTo(newDeviceId, {
            type: 'TASK_ASSIGNMENT',
            task: {
                id: task.id,
                type: task.type,
                payload: task.payload,
                timeout: task.timeout - (Date.now() - task.startTime)
            }
        });
        
        console.log(`🔄 Task ${taskId} reassigned to ${device.name}`);
    }

    /**
     * Complete a task with aggregated results
     */
    completeTask(taskId) {
        const task = this.activeTasks.get(taskId);
        if (!task) return;
        
        task.status = TaskStatus.COMPLETED;
        this.activeTasks.delete(taskId);
        
        // Aggregate results - use the most common result or first
        const result = this.aggregateResults(task.results);
        
        // Store in completed (simple FIFO cache - first key deleted when limit reached)
        // Note: This is not a true LRU implementation, but sufficient for this use case
        this.completedTasks.set(taskId, result);
        if (this.completedTasks.size > this.config.maxCompletedTaskCache) {
            const oldest = this.completedTasks.keys().next().value;
            this.completedTasks.delete(oldest);
        }
        
        // Resolve promise
        if (task.resolve) {
            task.resolve({
                partial: false,
                result: result.result,
                completedBy: task.results.map(r => r.deviceId),
                latency: Date.now() - task.startTime
            });
        }
        
        console.log(`✅ Task ${taskId} completed`);
        this.emit('task_completed', { taskId, result });
        
        // Process next task
        this.processNextTask();
    }

    /**
     * Aggregate results from multiple devices
     */
    aggregateResults(results) {
        if (results.length === 0) return null;
        if (results.length === 1) return results[0];
        
        // For text results, use the longest one (most complete)
        // For structured data, could implement voting/consensus
        let best = results[0];
        for (const r of results) {
            if (typeof r.result === 'string' && typeof best.result === 'string') {
                if (r.result.length > best.result.length) {
                    best = r;
                }
            }
        }
        
        return best;
    }

    /**
     * Start the background task processor
     */
    startTaskProcessor() {
        // Heartbeat/ping devices
        setInterval(() => {
            for (const [deviceId, device] of this.devices) {
                // Check for stale devices
                if (Date.now() - device.lastHeartbeat > this.config.heartbeatTimeout) {
                    console.log(`⚠️ Device ${device.name} heartbeat timeout`);
                    device.ws.close(4002, 'Heartbeat timeout');
                } else {
                    device.ws.ping();
                }
            }
        }, this.config.heartbeatInterval);
        
        // Process queued tasks periodically
        setInterval(() => {
            if (this.taskQueue.length > 0 && this.devices.size > 0) {
                this.processNextTask();
            }
        }, 1000);
    }

    /**
     * Send message to a specific device
     */
    sendTo(deviceId, msg) {
        const device = this.devices.get(deviceId);
        if (device && device.ws.readyState === WebSocket.OPEN) {
            device.ws.send(JSON.stringify(msg));
        }
    }

    /**
     * Broadcast to all devices
     */
    broadcast(msg, excludeDeviceId = null) {
        const data = JSON.stringify(msg);
        for (const [id, device] of this.devices) {
            if (id !== excludeDeviceId && device.ws.readyState === WebSocket.OPEN) {
                device.ws.send(data);
            }
        }
    }

    /**
     * Update device capability
     */
    updateDeviceCapability(deviceId, newCapability) {
        const device = this.devices.get(deviceId);
        if (!device) return;
        
        // Remove from old capability list
        const oldList = this.devicesByCapability[device.capability];
        const idx = oldList.indexOf(deviceId);
        if (idx !== -1) oldList.splice(idx, 1);
        
        // Add to new
        device.capability = newCapability;
        this.devicesByCapability[newCapability].push(deviceId);
    }

    /**
     * Get pool status
     */
    getStatus() {
        return {
            poolName: this.poolName,
            isRunning: this.isRunning,
            devices: this.devices.size,
            deviceList: Array.from(this.devices.values()).map(d => ({
                id: d.id,
                name: d.name,
                capability: d.capability,
                activeTasks: d.activeTasks.size,
                completedTasks: d.completedTasks,
                reliability: this.deviceReliability.get(d.id)
            })),
            queuedTasks: this.taskQueue.length,
            activeTasks: this.activeTasks.size,
            completedTasks: this.completedTasks.size
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
     * Stop the coordinator
     */
    async stop() {
        return new Promise((resolve) => {
            // Cancel pending tasks
            for (const task of this.taskQueue) {
                if (task.reject) {
                    task.reject(new Error('Coordinator shutting down'));
                }
            }
            this.taskQueue = [];
            
            // Close all device connections
            for (const device of this.devices.values()) {
                device.ws.close(1001, 'Coordinator shutting down');
            }
            this.devices.clear();
            
            if (this.wss) {
                this.wss.close();
            }
            
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    console.log('🛑 Collective Coordinator stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = { CollectiveCoordinator, DeviceCapability, TaskStatus };

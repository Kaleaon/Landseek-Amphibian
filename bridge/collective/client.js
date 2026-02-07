/**
 * Collective Client
 * 
 * Joins a collective pool and contributes processing power.
 * Handles tasks from the coordinator and executes them using the local brain.
 */

const WebSocket = require('ws');
const { CollectiveCoordinator, DeviceCapability } = require('./coordinator');

class CollectiveClient {
    constructor(options = {}) {
        this.localBrain = options.localBrain; // LocalBrain instance for actual inference
        this.deviceName = options.deviceName || `Device_${Math.random().toString(36).substring(2, 6)}`;
        this.capability = options.capability || DeviceCapability.MEDIUM;
        this.model = options.model || 'gemma:2b';
        
        this.ws = null;
        this.deviceId = null;
        this.isConnected = false;
        this.coordinator = null; // Coordinator info
        
        // Task execution
        this.activeTasks = new Map();
        this.maxConcurrentTasks = options.maxConcurrentTasks || 2;
        
        // Event handlers
        this.eventHandlers = [];
        
        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.shouldReconnect = true;
        this.connectionInfo = null;
        
        // Connection timing configuration
        this.config = {
            baseReconnectDelay: options.baseReconnectDelay || 2000, // 2 seconds base
            connectionTimeout: options.connectionTimeout || 15000   // 15 seconds timeout
        };
    }

    /**
     * Connect to a collective using share code
     */
    async connect(shareCode) {
        const details = CollectiveCoordinator.parseShareCode(shareCode);
        if (!details) {
            throw new Error('Invalid collective share code');
        }
        
        return this.connectDirect(details.host, details.port, details.secret);
    }

    /**
     * Connect directly to a collective
     */
    async connectDirect(host, port, secret) {
        this.connectionInfo = { host, port, secret };
        
        return new Promise((resolve, reject) => {
            try {
                const url = `ws://${host}:${port}`;
                console.log(`🔌 Connecting to collective at ${url}...`);
                
                this.ws = new WebSocket(url);

                this.ws.on('open', () => {
                    console.log(`✅ Connected to collective coordinator`);
                });

                this.ws.on('message', (data) => {
                    try {
                        const msg = JSON.parse(data);
                        this.handleMessage(msg, resolve, reject);
                    } catch (e) {
                        console.error('Error parsing collective message:', e);
                    }
                });

                this.ws.on('close', (code, reason) => {
                    console.log(`🔴 Disconnected from collective: ${reason}`);
                    this.isConnected = false;
                    this.emit('disconnected', { code, reason: reason.toString() });
                    
                    // Auto-reconnect with exponential backoff
                    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = this.config.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
                        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
                        setTimeout(() => {
                            this.connectDirect(host, port, secret).catch(e => {
                                console.error('Reconnection failed:', e.message);
                            });
                        }, delay);
                    }
                });

                this.ws.on('error', (err) => {
                    console.error('Collective connection error:', err.message);
                    if (!this.isConnected) {
                        reject(err);
                    }
                    this.emit('error', err);
                });

                // Connection timeout
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, this.config.connectionTimeout);

            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Handle incoming messages
     */
    handleMessage(msg, resolve, reject) {
        switch (msg.type) {
            case 'AUTH_REQUIRED':
                // Send join request
                this.send({
                    type: 'JOIN_COLLECTIVE',
                    secret: this.connectionInfo.secret,
                    deviceName: this.deviceName,
                    capability: this.capability,
                    model: this.model
                });
                break;

            case 'COLLECTIVE_JOINED':
                this.deviceId = msg.deviceId;
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.coordinator = {
                    poolName: msg.poolName,
                    totalDevices: msg.totalDevices,
                    config: msg.config
                };
                
                console.log(`🎉 Joined collective "${msg.poolName}" as ${this.deviceName}`);
                console.log(`   Device ID: ${this.deviceId}`);
                console.log(`   Total devices: ${msg.totalDevices}`);
                
                if (resolve) {
                    resolve({
                        deviceId: this.deviceId,
                        poolName: msg.poolName,
                        totalDevices: msg.totalDevices
                    });
                }
                
                this.emit('joined', { deviceId: this.deviceId, poolName: msg.poolName });
                break;

            case 'TASK_ASSIGNMENT':
                this.handleTaskAssignment(msg.task);
                break;

            case 'DEVICE_JOINED':
                this.emit('device_joined', msg.device);
                break;

            case 'DEVICE_LEFT':
                this.emit('device_left', { deviceId: msg.deviceId, deviceName: msg.deviceName });
                break;

            case 'HEARTBEAT_ACK':
                // Heartbeat acknowledged
                break;

            default:
                this.emit('message', msg);
        }
    }

    /**
     * Handle task assignment from coordinator
     */
    async handleTaskAssignment(task) {
        if (this.activeTasks.size >= this.maxConcurrentTasks) {
            // Reject if at capacity
            this.send({
                type: 'TASK_FAILED',
                taskId: task.id,
                error: 'Device at capacity'
            });
            return;
        }
        
        console.log(`📥 Received task: ${task.id} (${task.type})`);
        
        this.activeTasks.set(task.id, {
            ...task,
            startTime: Date.now()
        });
        
        try {
            const result = await this.executeTask(task);
            
            const latency = Date.now() - this.activeTasks.get(task.id).startTime;
            
            this.send({
                type: 'TASK_RESULT',
                taskId: task.id,
                result,
                latency
            });
            
            console.log(`✅ Task ${task.id} completed (${latency}ms)`);
            
        } catch (error) {
            console.error(`❌ Task ${task.id} failed:`, error.message);
            
            this.send({
                type: 'TASK_FAILED',
                taskId: task.id,
                error: error.message
            });
        } finally {
            this.activeTasks.delete(task.id);
        }
    }

    /**
     * Execute a task using the local brain
     */
    async executeTask(task) {
        if (!this.localBrain) {
            throw new Error('No local brain configured');
        }
        
        const { type, payload } = task;
        
        switch (type) {
            case 'inference':
            case 'generate_chunk':
                return this.executeInferenceTask(payload);
                
            case 'route':
                return this.executeRouteTask(payload);
                
            case 'embed':
                return this.executeEmbedTask(payload);
                
            case 'tokenize':
                return this.executeTokenizeTask(payload);
                
            default:
                throw new Error(`Unknown task type: ${type}`);
        }
    }

    /**
     * Execute inference task
     */
    async executeInferenceTask(payload) {
        const { prompt, maxTokens, temperature, topK, topP, stopSequences } = payload;
        
        // Report progress periodically
        const progressInterval = setInterval(() => {
            // Could implement actual progress tracking if the local brain supports it
        }, 5000);
        
        try {
            const messages = [{ role: 'user', content: prompt }];
            
            const response = await this.localBrain.chat(messages, {
                maxTokens: maxTokens || 1024,
                temperature: temperature || 0.7,
                topK: topK || 40,
                topP: topP || 0.9
            });
            
            let content = response.content || '';
            
            // Apply stop sequences
            if (stopSequences) {
                for (const stop of stopSequences) {
                    const idx = content.indexOf(stop);
                    if (idx !== -1) {
                        content = content.substring(0, idx);
                    }
                }
            }
            
            return content;
            
        } finally {
            clearInterval(progressInterval);
        }
    }

    /**
     * Execute routing/classification task
     */
    async executeRouteTask(payload) {
        const { prompt, maxTokens } = payload;
        
        const response = await this.localBrain.quickInfer(prompt, {
            maxTokens: maxTokens || 256
        });
        
        return response.content || '';
    }

    /**
     * Execute embedding task
     */
    async executeEmbedTask(payload) {
        const { text } = payload;
        
        // If local brain supports embeddings, use it
        if (this.localBrain.embed) {
            return await this.localBrain.embed(text);
        }
        
        // Otherwise, return placeholder
        throw new Error('Local brain does not support embeddings');
    }

    /**
     * Execute tokenize task
     */
    async executeTokenizeTask(payload) {
        const { text } = payload;
        
        // Use local brain tokenizer if available
        if (this.localBrain && this.localBrain.tokenize) {
            return await this.localBrain.tokenize(text);
        }
        
        // Word-piece style tokenization fallback:
        // Split on whitespace and punctuation boundaries, preserve subword tokens
        const tokens = [];
        const words = text.split(/(\s+|[.,!?;:'"(){}\[\]])/);
        for (const word of words) {
            if (word.trim().length > 0) {
                tokens.push(word.trim());
            }
        }
        return tokens;
    }

    /**
     * Send message to coordinator
     */
    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    /**
     * Send heartbeat
     */
    sendHeartbeat() {
        this.send({ type: 'HEARTBEAT' });
    }

    /**
     * Update reported capability
     */
    updateCapability(newCapability) {
        this.capability = newCapability;
        this.send({
            type: 'CAPABILITY_UPDATE',
            capability: newCapability
        });
    }

    /**
     * Get client status
     */
    getStatus() {
        return {
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            isConnected: this.isConnected,
            capability: this.capability,
            activeTasks: this.activeTasks.size,
            coordinator: this.coordinator
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
     * Disconnect from collective
     */
    disconnect() {
        this.shouldReconnect = false;
        
        if (this.ws) {
            this.ws.close(1000, 'Client disconnecting');
        }
        
        this.isConnected = false;
        this.deviceId = null;
        this.activeTasks.clear();
        
        console.log('👋 Disconnected from collective');
    }
}

module.exports = { CollectiveClient };

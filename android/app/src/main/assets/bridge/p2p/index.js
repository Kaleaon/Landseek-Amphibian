/**
 * P2P Chat Room System
 * 
 * Enables peer-to-peer networking for sharing LLM capabilities.
 * Based on Landseek's P2P networking feature.
 * 
 * Features:
 * - Host a room and generate share codes
 * - Join remote rooms via share codes
 * - Bidirectional message and memory sync
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const os = require('os');

/**
 * Generate a share code from connection details
 */
function generateShareCode(host, port, secret) {
    const data = `${host}:${port}:${secret}`;
    return Buffer.from(data).toString('base64');
}

/**
 * Parse a share code to get connection details
 */
function parseShareCode(code) {
    try {
        const data = Buffer.from(code, 'base64').toString('utf8');
        const [host, port, secret] = data.split(':');
        return { host, port: parseInt(port), secret };
    } catch (e) {
        return null;
    }
}

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

class P2PHost {
    constructor(options = {}) {
        this.port = options.port || 8765;
        this.secret = options.secret || crypto.randomBytes(6).toString('hex');
        this.server = null;
        this.wss = null;
        this.clients = new Map(); // clientId -> { ws, name, joinedAt }
        this.messageHandlers = [];
        this.isRunning = false;
    }

    /**
     * Start hosting a P2P room
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer((req, res) => {
                    res.writeHead(200);
                    res.end('Amphibian P2P Room 🐸');
                });

                this.wss = new WebSocket.Server({ server: this.server });

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.server.listen(this.port, '0.0.0.0', () => {
                    this.isRunning = true;
                    
                    const localIPs = getLocalIPs();
                    const lanCode = localIPs.length > 0 
                        ? generateShareCode(localIPs[0], this.port, this.secret)
                        : null;
                    
                    resolve({
                        port: this.port,
                        secret: this.secret,
                        localIPs,
                        shareCodes: {
                            lan: lanCode,
                            localhost: generateShareCode('127.0.0.1', this.port, this.secret)
                        }
                    });
                });

                this.server.on('error', reject);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Handle new client connection
     */
    handleConnection(ws, req) {
        const clientId = crypto.randomBytes(8).toString('hex');
        
        // Auth handshake
        ws.once('message', (data) => {
            try {
                const msg = JSON.parse(data);
                
                if (msg.type === 'AUTH' && msg.secret === this.secret) {
                    // Auth successful
                    const client = {
                        ws,
                        id: clientId,
                        name: msg.name || `Guest_${clientId.substring(0, 4)}`,
                        joinedAt: new Date().toISOString()
                    };
                    
                    this.clients.set(clientId, client);
                    
                    ws.send(JSON.stringify({
                        type: 'AUTH_SUCCESS',
                        clientId,
                        participants: this.getParticipantList()
                    }));
                    
                    // Notify others
                    this.broadcast({
                        type: 'PARTICIPANT_JOINED',
                        participant: { id: clientId, name: client.name }
                    }, clientId);
                    
                    // Set up message handler
                    ws.on('message', (data) => this.handleMessage(clientId, data));
                    ws.on('close', () => this.handleDisconnect(clientId));
                    
                    console.log(`🟢 P2P Client joined: ${client.name} (${clientId})`);
                } else {
                    ws.close(4001, 'Invalid secret');
                }
            } catch (e) {
                ws.close(4000, 'Invalid message format');
            }
        });
        
        // Send auth request
        ws.send(JSON.stringify({ type: 'AUTH_REQUIRED' }));
    }

    /**
     * Handle incoming message from client
     */
    handleMessage(clientId, data) {
        try {
            const msg = JSON.parse(data);
            const client = this.clients.get(clientId);
            
            if (!client) return;

            switch (msg.type) {
                case 'CHAT_MESSAGE':
                    // Broadcast chat to all clients
                    this.broadcast({
                        type: 'CHAT_MESSAGE',
                        from: { id: clientId, name: client.name },
                        content: msg.content,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'AI_REQUEST':
                    // Forward AI request to host for processing
                    this.emit('ai_request', {
                        clientId,
                        clientName: client.name,
                        task: msg.task,
                        personality: msg.personality
                    });
                    break;

                case 'MEMORY_SYNC':
                    // Handle memory synchronization
                    this.emit('memory_sync', {
                        clientId,
                        memories: msg.memories
                    });
                    break;

                default:
                    // Forward to handlers
                    this.emit('message', { clientId, msg });
            }
        } catch (e) {
            console.error('P2P Message error:', e);
        }
    }

    /**
     * Handle client disconnect
     */
    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            this.clients.delete(clientId);
            
            this.broadcast({
                type: 'PARTICIPANT_LEFT',
                participant: { id: clientId, name: client.name }
            });
            
            console.log(`🔴 P2P Client left: ${client.name}`);
        }
    }

    /**
     * Broadcast message to all clients (optionally excluding one)
     */
    broadcast(msg, excludeClientId = null) {
        const data = JSON.stringify(msg);
        
        for (const [id, client] of this.clients) {
            if (id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }

    /**
     * Send message to specific client
     */
    sendTo(clientId, msg) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(msg));
        }
    }

    /**
     * Send AI response to client
     */
    sendAIResponse(clientId, response, personality) {
        this.sendTo(clientId, {
            type: 'AI_RESPONSE',
            content: response,
            personality,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get list of participants
     */
    getParticipantList() {
        return Array.from(this.clients.values()).map(c => ({
            id: c.id,
            name: c.name,
            joinedAt: c.joinedAt
        }));
    }

    /**
     * Register event handler
     */
    on(event, handler) {
        this.messageHandlers.push({ event, handler });
    }

    /**
     * Emit event to handlers
     */
    emit(event, data) {
        for (const h of this.messageHandlers) {
            if (h.event === event) {
                h.handler(data);
            }
        }
    }

    /**
     * Stop hosting
     */
    stop() {
        return new Promise((resolve) => {
            // Close all client connections
            for (const client of this.clients.values()) {
                client.ws.close(1001, 'Server shutting down');
            }
            this.clients.clear();

            if (this.wss) {
                this.wss.close();
            }

            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

class P2PClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.isConnected = false;
        this.messageHandlers = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.shouldReconnect = true; // Flag to control reconnection behavior
    }

    /**
     * Connect to a P2P room using share code
     */
    async connect(shareCode, name = 'Guest') {
        const details = parseShareCode(shareCode);
        if (!details) {
            throw new Error('Invalid share code');
        }

        return this.connectDirect(details.host, details.port, details.secret, name);
    }

    /**
     * Connect directly with host details
     */
    async connectDirect(host, port, secret, name) {
        return new Promise((resolve, reject) => {
            try {
                const url = `ws://${host}:${port}`;
                this.ws = new WebSocket(url);

                this.ws.on('open', () => {
                    console.log(`🔌 Connected to P2P room at ${host}:${port}`);
                });

                this.ws.on('message', (data) => {
                    try {
                        const msg = JSON.parse(data);
                        
                        if (msg.type === 'AUTH_REQUIRED') {
                            // Send auth
                            this.ws.send(JSON.stringify({
                                type: 'AUTH',
                                secret,
                                name
                            }));
                        } else if (msg.type === 'AUTH_SUCCESS') {
                            this.clientId = msg.clientId;
                            this.isConnected = true;
                            this.reconnectAttempts = 0;
                            resolve({
                                clientId: msg.clientId,
                                participants: msg.participants
                            });
                        } else {
                            // Handle other messages
                            this.emit('message', msg);
                        }
                    } catch (e) {
                        console.error('P2P Client message error:', e);
                    }
                });

                this.ws.on('close', (code, reason) => {
                    this.isConnected = false;
                    this.emit('disconnected', { code, reason: reason.toString() });
                    
                    // Auto-reconnect logic (only if explicitly allowed)
                    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        setTimeout(() => {
                            this.connectDirect(host, port, secret, name);
                        }, 2000 * this.reconnectAttempts);
                    }
                });

                this.ws.on('error', (err) => {
                    if (!this.isConnected) {
                        reject(err);
                    }
                    this.emit('error', err);
                });

                // Timeout for connection
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);

            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Send chat message
     */
    sendMessage(content) {
        if (!this.isConnected) return false;
        
        this.ws.send(JSON.stringify({
            type: 'CHAT_MESSAGE',
            content
        }));
        return true;
    }

    /**
     * Request AI processing
     */
    requestAI(task, personality = null) {
        if (!this.isConnected) return false;
        
        this.ws.send(JSON.stringify({
            type: 'AI_REQUEST',
            task,
            personality
        }));
        return true;
    }

    /**
     * Sync memories with host
     */
    syncMemories(memories) {
        if (!this.isConnected) return false;
        
        this.ws.send(JSON.stringify({
            type: 'MEMORY_SYNC',
            memories
        }));
        return true;
    }

    /**
     * Register event handler
     */
    on(event, handler) {
        this.messageHandlers.push({ event, handler });
    }

    /**
     * Emit event to handlers
     */
    emit(event, data) {
        for (const h of this.messageHandlers) {
            if (h.event === event) {
                h.handler(data);
            }
        }
    }

    /**
     * Disconnect from room
     */
    disconnect() {
        this.shouldReconnect = false; // Prevent auto-reconnect
        if (this.ws) {
            this.ws.close(1000, 'User disconnected');
        }
        this.isConnected = false;
    }
}

module.exports = { 
    P2PHost, 
    P2PClient, 
    generateShareCode, 
    parseShareCode,
    getLocalIPs 
};

/**
 * Global Discovery Module
 * 
 * Enables discovery and connection of devices across the internet,
 * not just local networks. Supports:
 * - Public directory servers for device registration
 * - NAT traversal using STUN/TURN
 * - WebSocket relay for firewall bypass
 * - Peer-to-peer connections when possible
 */

const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

/**
 * Connection methods
 */
const ConnectionMethod = {
    DIRECT: 'direct',           // Direct IP connection
    RELAY: 'relay',             // Through relay server
    HOLE_PUNCH: 'hole_punch',   // NAT hole punching
    TURN: 'turn'                // TURN server relay
};

/**
 * Directory server status
 */
const DirectoryStatus = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    MAINTENANCE: 'maintenance'
};

/**
 * Default public directory servers
 * In production, these would be actual servers
 */
const DefaultDirectoryServers = [
    {
        name: 'Primary Amphibian Directory',
        url: 'wss://directory.amphibian.network',
        region: 'global',
        priority: 1
    },
    {
        name: 'US West Directory',
        url: 'wss://us-west.directory.amphibian.network',
        region: 'us-west',
        priority: 2
    },
    {
        name: 'EU Directory',
        url: 'wss://eu.directory.amphibian.network',
        region: 'eu',
        priority: 2
    },
    {
        name: 'Asia Pacific Directory',
        url: 'wss://apac.directory.amphibian.network',
        region: 'apac',
        priority: 2
    }
];

/**
 * Global Device Registry Entry
 */
class GlobalDeviceEntry {
    constructor(options = {}) {
        this.id = options.id || crypto.randomBytes(16).toString('hex');
        this.name = options.name || 'Anonymous Device';
        this.publicKey = options.publicKey || null;
        
        // Connection info
        this.endpoints = options.endpoints || [];
        this.preferredMethod = options.preferredMethod || ConnectionMethod.RELAY;
        
        // Capabilities
        this.capabilities = options.capabilities || {};
        this.deviceType = options.deviceType || 'unknown';
        
        // Location (optional, privacy-respecting)
        this.region = options.region || 'unknown';
        this.timezone = options.timezone || null;
        
        // Status
        this.status = options.status || 'online';
        this.lastSeen = Date.now();
        this.registeredAt = options.registeredAt || Date.now();
        
        // Pool membership
        this.pools = options.pools || [];
        this.isPublic = options.isPublic !== false; // Visible in public directory
        
        // Trust metrics
        this.trustScore = options.trustScore || 1.0;
        this.completedTasks = options.completedTasks || 0;
        this.reputation = options.reputation || 1.0;
    }

    toPublic() {
        // Return only publicly safe information
        return {
            id: this.id,
            name: this.name,
            capabilities: this.capabilities,
            deviceType: this.deviceType,
            region: this.region,
            status: this.status,
            trustScore: this.trustScore,
            completedTasks: this.completedTasks,
            isPublic: this.isPublic
        };
    }
}

/**
 * Global Discovery Client
 * 
 * Connects to directory servers to register and discover devices.
 */
class GlobalDiscoveryClient {
    constructor(options = {}) {
        this.deviceId = options.deviceId || crypto.randomBytes(16).toString('hex');
        this.deviceName = options.deviceName || 'Amphibian Device';
        
        // Directory servers to use
        this.directoryServers = options.directoryServers || DefaultDirectoryServers;
        
        // Connected directory
        this.connectedDirectory = null;
        this.directoryWs = null;
        
        // Our registration
        this.registration = null;
        
        // Discovered devices
        this.devices = new Map(); // deviceId -> GlobalDeviceEntry
        
        // Pending connections
        this.pendingConnections = new Map(); // connectionId -> ConnectionState
        
        // Configuration
        this.config = {
            heartbeatInterval: options.heartbeatInterval || 30000,
            discoveryRefreshInterval: options.discoveryRefreshInterval || 60000,
            connectionTimeout: options.connectionTimeout || 10000,
            maxRetries: options.maxRetries || 3,
            enableRelay: options.enableRelay !== false,
            preferDirect: options.preferDirect !== false
        };
        
        // Relay connections for NAT traversal
        this.relayConnections = new Map();
        
        // Event handlers
        this.eventHandlers = [];
        
        // Intervals
        this.heartbeatTimer = null;
        this.discoveryTimer = null;
    }

    /**
     * Connect to directory server
     */
    async connect() {
        // Try directory servers in priority order
        const sortedServers = [...this.directoryServers]
            .sort((a, b) => a.priority - b.priority);
        
        for (const server of sortedServers) {
            try {
                await this.connectToDirectory(server);
                console.log(`🌐 Connected to global directory: ${server.name}`);
                return true;
            } catch (e) {
                console.warn(`⚠️ Failed to connect to ${server.name}: ${e.message}`);
            }
        }
        
        // If all directory servers fail, operate in local-only mode
        console.warn('⚠️ Could not connect to any directory server. Operating in local mode.');
        return false;
    }

    /**
     * Connect to a specific directory server
     */
    async connectToDirectory(server) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, this.config.connectionTimeout);
            
            try {
                // Build WebSocket options - always use secure connections
                // For local development, use ws:// URLs or set up proper certificates
                const wsOptions = {
                    // Always validate certificates in production
                    // For local development, use ws:// instead of wss://
                };
                
                const ws = new WebSocket(server.url, wsOptions);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    this.directoryWs = ws;
                    this.connectedDirectory = server;
                    this.setupDirectoryHandlers(ws);
                    this.startHeartbeat();
                    resolve();
                });
                
                ws.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
                
            } catch (e) {
                clearTimeout(timeout);
                reject(e);
            }
        });
    }

    /**
     * Set up directory WebSocket handlers
     */
    setupDirectoryHandlers(ws) {
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleDirectoryMessage(msg);
            } catch (e) {
                console.error('Error parsing directory message:', e);
            }
        });
        
        ws.on('close', () => {
            console.log('🔌 Disconnected from directory server');
            this.connectedDirectory = null;
            this.directoryWs = null;
            this.stopHeartbeat();
            
            // Try to reconnect
            setTimeout(() => this.connect(), 5000);
        });
        
        ws.on('error', (err) => {
            console.error('Directory WebSocket error:', err);
        });
    }

    /**
     * Handle messages from directory server
     */
    handleDirectoryMessage(msg) {
        switch (msg.type) {
            case 'REGISTERED':
                this.registration = msg.registration;
                console.log(`✅ Registered with directory as ${this.registration.id}`);
                this.emit('registered', this.registration);
                break;
                
            case 'DEVICE_LIST':
                this.updateDeviceList(msg.devices);
                break;
                
            case 'DEVICE_JOINED':
                this.addDevice(msg.device);
                this.emit('device_discovered', msg.device);
                break;
                
            case 'DEVICE_LEFT':
                this.removeDevice(msg.deviceId);
                this.emit('device_left', msg.deviceId);
                break;
                
            case 'CONNECTION_REQUEST':
                this.handleConnectionRequest(msg);
                break;
                
            case 'CONNECTION_RESPONSE':
                this.handleConnectionResponse(msg);
                break;
                
            case 'RELAY_DATA':
                this.handleRelayData(msg);
                break;
                
            case 'POOL_DISCOVERED':
                this.emit('pool_discovered', msg.pool);
                break;
                
            case 'ERROR':
                console.error('Directory error:', msg.message);
                this.emit('error', msg);
                break;
        }
    }

    /**
     * Register this device with the directory
     */
    async register(deviceInfo = {}) {
        if (!this.directoryWs || this.directoryWs.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to directory server');
        }
        
        const registration = {
            id: this.deviceId,
            name: this.deviceName,
            capabilities: deviceInfo.capabilities || {},
            deviceType: deviceInfo.deviceType || 'unknown',
            region: deviceInfo.region || 'unknown',
            isPublic: deviceInfo.isPublic !== false,
            endpoints: deviceInfo.endpoints || [],
            pools: deviceInfo.pools || []
        };
        
        this.directoryWs.send(JSON.stringify({
            type: 'REGISTER',
            device: registration
        }));
    }

    /**
     * Search for devices globally
     */
    async searchDevices(query = {}) {
        if (!this.directoryWs || this.directoryWs.readyState !== WebSocket.OPEN) {
            return Array.from(this.devices.values());
        }
        
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomBytes(8).toString('hex');
            
            const timeout = setTimeout(() => {
                reject(new Error('Search timeout'));
            }, this.config.connectionTimeout);
            
            const handler = (event, data) => {
                if (event === 'search_results' && data.requestId === requestId) {
                    clearTimeout(timeout);
                    resolve(data.devices);
                }
            };
            
            this.on('search_results', handler);
            
            this.directoryWs.send(JSON.stringify({
                type: 'SEARCH',
                requestId,
                query: {
                    capabilities: query.capabilities,
                    deviceType: query.deviceType,
                    region: query.region,
                    minTrustScore: query.minTrustScore || 0.5,
                    limit: query.limit || 100
                }
            }));
        });
    }

    /**
     * Search for public pools
     */
    async searchPools(query = {}) {
        if (!this.directoryWs || this.directoryWs.readyState !== WebSocket.OPEN) {
            return [];
        }
        
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomBytes(8).toString('hex');
            
            const timeout = setTimeout(() => {
                reject(new Error('Search timeout'));
            }, this.config.connectionTimeout);
            
            const handler = (event, data) => {
                if (event === 'pool_search_results' && data.requestId === requestId) {
                    clearTimeout(timeout);
                    resolve(data.pools);
                }
            };
            
            this.on('pool_search_results', handler);
            
            this.directoryWs.send(JSON.stringify({
                type: 'SEARCH_POOLS',
                requestId,
                query: {
                    region: query.region,
                    minDevices: query.minDevices || 1,
                    capabilities: query.capabilities,
                    limit: query.limit || 50
                }
            }));
        });
    }

    /**
     * Connect to a remote device
     */
    async connectToDevice(deviceId, options = {}) {
        const device = this.devices.get(deviceId);
        
        if (!device) {
            throw new Error('Device not found');
        }
        
        // Generate connection ID
        const connectionId = crypto.randomBytes(8).toString('hex');
        
        // Determine best connection method
        const method = this.selectConnectionMethod(device, options);
        
        // Create pending connection
        this.pendingConnections.set(connectionId, {
            deviceId,
            method,
            status: 'pending',
            startedAt: Date.now()
        });
        
        // Request connection through directory
        this.directoryWs.send(JSON.stringify({
            type: 'CONNECTION_REQUEST',
            connectionId,
            targetDeviceId: deviceId,
            method,
            myEndpoints: options.endpoints || []
        }));
        
        // Wait for response
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingConnections.delete(connectionId);
                reject(new Error('Connection timeout'));
            }, this.config.connectionTimeout);
            
            const handler = (event, data) => {
                if (event === 'connection_established' && data.connectionId === connectionId) {
                    clearTimeout(timeout);
                    resolve(data.connection);
                } else if (event === 'connection_failed' && data.connectionId === connectionId) {
                    clearTimeout(timeout);
                    reject(new Error(data.reason));
                }
            };
            
            this.on('connection_established', handler);
            this.on('connection_failed', handler);
        });
    }

    /**
     * Select best connection method
     */
    selectConnectionMethod(device, options) {
        // Prefer direct if both have public endpoints
        if (this.config.preferDirect && device.endpoints?.length > 0) {
            return ConnectionMethod.DIRECT;
        }
        
        // Try hole punching if supported
        if (device.preferredMethod === ConnectionMethod.HOLE_PUNCH) {
            return ConnectionMethod.HOLE_PUNCH;
        }
        
        // Fall back to relay
        if (this.config.enableRelay) {
            return ConnectionMethod.RELAY;
        }
        
        return ConnectionMethod.DIRECT;
    }

    /**
     * Handle incoming connection request
     */
    handleConnectionRequest(msg) {
        const { connectionId, fromDeviceId, method, theirEndpoints } = msg;
        
        console.log(`📥 Connection request from ${fromDeviceId} via ${method}`);
        
        // Accept the connection (could add approval logic here)
        this.directoryWs.send(JSON.stringify({
            type: 'CONNECTION_ACCEPT',
            connectionId,
            myEndpoints: []
        }));
        
        this.emit('connection_request', { connectionId, fromDeviceId, method });
    }

    /**
     * Handle connection response
     */
    handleConnectionResponse(msg) {
        const { connectionId, accepted, theirEndpoints, relayEndpoint } = msg;
        
        const pending = this.pendingConnections.get(connectionId);
        if (!pending) return;
        
        if (accepted) {
            pending.status = 'accepted';
            pending.theirEndpoints = theirEndpoints;
            pending.relayEndpoint = relayEndpoint;
            
            // Establish the actual connection
            this.establishConnection(connectionId, pending);
        } else {
            pending.status = 'rejected';
            this.emit('connection_failed', { connectionId, reason: 'Rejected by target device' });
        }
    }

    /**
     * Establish actual connection after handshake
     */
    async establishConnection(connectionId, connectionInfo) {
        try {
            let connection;
            
            switch (connectionInfo.method) {
                case ConnectionMethod.DIRECT:
                    connection = await this.establishDirectConnection(connectionInfo);
                    break;
                    
                case ConnectionMethod.RELAY:
                    connection = await this.establishRelayConnection(connectionId, connectionInfo);
                    break;
                    
                default:
                    connection = await this.establishRelayConnection(connectionId, connectionInfo);
            }
            
            this.pendingConnections.delete(connectionId);
            this.emit('connection_established', { connectionId, connection });
            
        } catch (e) {
            this.pendingConnections.delete(connectionId);
            this.emit('connection_failed', { connectionId, reason: e.message });
        }
    }

    /**
     * Establish direct connection
     */
    async establishDirectConnection(connectionInfo) {
        const endpoint = connectionInfo.theirEndpoints[0];
        
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(endpoint);
            
            ws.on('open', () => {
                resolve({
                    type: 'direct',
                    ws,
                    endpoint
                });
            });
            
            ws.on('error', reject);
        });
    }

    /**
     * Establish relay connection
     */
    async establishRelayConnection(connectionId, connectionInfo) {
        // Use the relay endpoint from the directory server
        const relayEndpoint = connectionInfo.relayEndpoint || this.connectedDirectory?.url;
        
        return {
            type: 'relay',
            connectionId,
            relayEndpoint,
            send: (data) => this.sendViaRelay(connectionId, data),
            close: () => this.closeRelayConnection(connectionId)
        };
    }

    /**
     * Send data via relay
     */
    sendViaRelay(connectionId, data) {
        if (!this.directoryWs || this.directoryWs.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to relay');
        }
        
        this.directoryWs.send(JSON.stringify({
            type: 'RELAY_DATA',
            connectionId,
            data
        }));
    }

    /**
     * Handle relayed data
     */
    handleRelayData(msg) {
        const { connectionId, fromDeviceId, data } = msg;
        
        this.emit('relay_data', { connectionId, fromDeviceId, data });
    }

    /**
     * Close relay connection
     */
    closeRelayConnection(connectionId) {
        if (this.directoryWs && this.directoryWs.readyState === WebSocket.OPEN) {
            this.directoryWs.send(JSON.stringify({
                type: 'RELAY_CLOSE',
                connectionId
            }));
        }
        
        this.relayConnections.delete(connectionId);
    }

    /**
     * Update device list from directory
     */
    updateDeviceList(devices) {
        this.devices.clear();
        
        for (const device of devices) {
            this.devices.set(device.id, new GlobalDeviceEntry(device));
        }
        
        console.log(`📋 Updated device list: ${this.devices.size} devices`);
        this.emit('devices_updated', Array.from(this.devices.values()));
    }

    /**
     * Add a device
     */
    addDevice(deviceInfo) {
        const device = new GlobalDeviceEntry(deviceInfo);
        this.devices.set(device.id, device);
        return device;
    }

    /**
     * Remove a device
     */
    removeDevice(deviceId) {
        this.devices.delete(deviceId);
    }

    /**
     * Get all discovered devices
     */
    getDevices() {
        return Array.from(this.devices.values());
    }

    /**
     * Start heartbeat to directory
     */
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.directoryWs && this.directoryWs.readyState === WebSocket.OPEN) {
                this.directoryWs.send(JSON.stringify({
                    type: 'HEARTBEAT',
                    deviceId: this.deviceId
                }));
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
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
     * Disconnect from directory
     */
    disconnect() {
        this.stopHeartbeat();
        
        if (this.directoryWs) {
            this.directoryWs.send(JSON.stringify({
                type: 'UNREGISTER',
                deviceId: this.deviceId
            }));
            this.directoryWs.close();
            this.directoryWs = null;
        }
        
        this.connectedDirectory = null;
        this.registration = null;
    }
}

/**
 * Global Directory Server
 * 
 * A directory server that devices can connect to for global discovery.
 * Can be self-hosted or use public servers.
 */
class GlobalDirectoryServer {
    constructor(options = {}) {
        this.port = options.port || 8770;
        this.name = options.name || 'Amphibian Directory Server';
        this.region = options.region || 'local';
        
        // Registered devices
        this.devices = new Map(); // deviceId -> DeviceConnection
        
        // Public pools
        this.pools = new Map(); // poolId -> PoolInfo
        
        // Relay connections
        this.relays = new Map(); // connectionId -> RelayInfo
        
        // Server
        this.server = null;
        this.wss = null;
        this.isRunning = false;
        
        // Configuration
        this.config = {
            maxDevices: options.maxDevices || 10000,
            deviceTimeout: options.deviceTimeout || 120000,
            cleanupInterval: options.cleanupInterval || 60000,
            enableRelay: options.enableRelay !== false,
            maxRelayConnections: options.maxRelayConnections || 1000
        };
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Start the directory server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer((req, res) => {
                    this.handleHttpRequest(req, res);
                });

                this.wss = new WebSocket.Server({ server: this.server });

                this.wss.on('connection', (ws, req) => {
                    this.handleConnection(ws, req);
                });

                this.server.listen(this.port, '0.0.0.0', () => {
                    this.isRunning = true;
                    console.log(`🌐 Global Directory Server started on port ${this.port}`);
                    console.log(`   Region: ${this.region}`);
                    
                    // Start cleanup timer
                    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval);
                    
                    resolve({
                        port: this.port,
                        name: this.name,
                        region: this.region
                    });
                });

                this.server.on('error', reject);
                
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Handle HTTP requests
     */
    handleHttpRequest(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url === '/status') {
            res.writeHead(200);
            res.end(JSON.stringify(this.getStatus()));
        } else if (req.url === '/devices') {
            res.writeHead(200);
            res.end(JSON.stringify(this.getPublicDevices()));
        } else if (req.url === '/pools') {
            res.writeHead(200);
            res.end(JSON.stringify(Array.from(this.pools.values())));
        } else {
            res.writeHead(200);
            res.end(JSON.stringify({
                name: this.name,
                type: 'GlobalDirectoryServer',
                region: this.region,
                devices: this.devices.size,
                endpoints: ['/status', '/devices', '/pools']
            }));
        }
    }

    /**
     * Handle WebSocket connection
     */
    handleConnection(ws, req) {
        let deviceId = null;
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(ws, msg, (id) => { deviceId = id; });
            } catch (e) {
                ws.send(JSON.stringify({
                    type: 'ERROR',
                    message: e.message
                }));
            }
        });
        
        ws.on('close', () => {
            if (deviceId) {
                this.handleDeviceDisconnect(deviceId);
            }
        });
        
        ws.on('error', (err) => {
            console.error('Directory WebSocket error:', err);
        });
    }

    /**
     * Handle incoming message
     */
    handleMessage(ws, msg, setDeviceId) {
        switch (msg.type) {
            case 'REGISTER':
                this.handleRegister(ws, msg.device, setDeviceId);
                break;
                
            case 'UNREGISTER':
                this.handleUnregister(msg.deviceId);
                break;
                
            case 'HEARTBEAT':
                this.handleHeartbeat(msg.deviceId);
                break;
                
            case 'SEARCH':
                this.handleSearch(ws, msg);
                break;
                
            case 'SEARCH_POOLS':
                this.handleSearchPools(ws, msg);
                break;
                
            case 'CONNECTION_REQUEST':
                this.handleConnectionRequest(ws, msg);
                break;
                
            case 'CONNECTION_ACCEPT':
                this.handleConnectionAccept(ws, msg);
                break;
                
            case 'CONNECTION_REJECT':
                this.handleConnectionReject(ws, msg);
                break;
                
            case 'RELAY_DATA':
                this.handleRelayData(ws, msg);
                break;
                
            case 'RELAY_CLOSE':
                this.handleRelayClose(msg);
                break;
                
            case 'REGISTER_POOL':
                this.handleRegisterPool(ws, msg);
                break;
        }
    }

    /**
     * Handle device registration
     */
    handleRegister(ws, deviceInfo, setDeviceId) {
        if (this.devices.size >= this.config.maxDevices) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Directory at capacity'
            }));
            return;
        }
        
        const device = {
            ...deviceInfo,
            ws,
            connectedAt: Date.now(),
            lastSeen: Date.now()
        };
        
        this.devices.set(device.id, device);
        setDeviceId(device.id);
        
        // Send registration confirmation
        ws.send(JSON.stringify({
            type: 'REGISTERED',
            registration: {
                id: device.id,
                name: device.name,
                region: this.region
            }
        }));
        
        // Send current device list
        ws.send(JSON.stringify({
            type: 'DEVICE_LIST',
            devices: this.getPublicDevices()
        }));
        
        // Broadcast new device to others
        this.broadcast({
            type: 'DEVICE_JOINED',
            device: this.deviceToPublic(device)
        }, device.id);
        
        console.log(`📱 Device registered: ${device.name} (${device.id})`);
        this.emit('device_registered', device);
    }

    /**
     * Handle device unregistration
     */
    handleUnregister(deviceId) {
        this.handleDeviceDisconnect(deviceId);
    }

    /**
     * Handle device disconnect
     */
    handleDeviceDisconnect(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) return;
        
        this.devices.delete(deviceId);
        
        // Broadcast departure
        this.broadcast({
            type: 'DEVICE_LEFT',
            deviceId
        });
        
        console.log(`👋 Device disconnected: ${device.name}`);
        this.emit('device_disconnected', device);
    }

    /**
     * Handle heartbeat
     */
    handleHeartbeat(deviceId) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.lastSeen = Date.now();
        }
    }

    /**
     * Handle device search
     */
    handleSearch(ws, msg) {
        const { requestId, query } = msg;
        
        let results = Array.from(this.devices.values())
            .filter(d => d.isPublic !== false)
            .map(d => this.deviceToPublic(d));
        
        // Apply filters
        if (query.capabilities) {
            results = results.filter(d => {
                for (const [cap, required] of Object.entries(query.capabilities)) {
                    if (required && !d.capabilities[cap]) return false;
                }
                return true;
            });
        }
        
        if (query.deviceType) {
            results = results.filter(d => d.deviceType === query.deviceType);
        }
        
        if (query.region) {
            results = results.filter(d => d.region === query.region);
        }
        
        if (query.minTrustScore) {
            results = results.filter(d => d.trustScore >= query.minTrustScore);
        }
        
        // Apply limit
        if (query.limit) {
            results = results.slice(0, query.limit);
        }
        
        ws.send(JSON.stringify({
            type: 'SEARCH_RESULTS',
            requestId,
            devices: results
        }));
    }

    /**
     * Handle pool search
     */
    handleSearchPools(ws, msg) {
        const { requestId, query } = msg;
        
        let results = Array.from(this.pools.values());
        
        // Apply filters
        if (query.region) {
            results = results.filter(p => p.region === query.region);
        }
        
        if (query.minDevices) {
            results = results.filter(p => p.deviceCount >= query.minDevices);
        }
        
        if (query.limit) {
            results = results.slice(0, query.limit);
        }
        
        ws.send(JSON.stringify({
            type: 'POOL_SEARCH_RESULTS',
            requestId,
            pools: results
        }));
    }

    /**
     * Handle connection request
     */
    handleConnectionRequest(ws, msg) {
        const { connectionId, targetDeviceId, method, myEndpoints } = msg;
        const fromDevice = this.findDeviceByWs(ws);
        
        if (!fromDevice) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'Not registered'
            }));
            return;
        }
        
        const targetDevice = this.devices.get(targetDeviceId);
        
        if (!targetDevice) {
            ws.send(JSON.stringify({
                type: 'CONNECTION_RESPONSE',
                connectionId,
                accepted: false,
                reason: 'Target device not found'
            }));
            return;
        }
        
        // Forward request to target
        targetDevice.ws.send(JSON.stringify({
            type: 'CONNECTION_REQUEST',
            connectionId,
            fromDeviceId: fromDevice.id,
            method,
            theirEndpoints: myEndpoints
        }));
        
        // Store pending relay
        if (this.config.enableRelay) {
            this.relays.set(connectionId, {
                from: fromDevice.id,
                to: targetDeviceId,
                createdAt: Date.now()
            });
        }
    }

    /**
     * Handle connection accept
     */
    handleConnectionAccept(ws, msg) {
        const { connectionId, myEndpoints } = msg;
        const relay = this.relays.get(connectionId);
        
        if (!relay) return;
        
        const fromDevice = this.devices.get(relay.from);
        
        if (fromDevice) {
            fromDevice.ws.send(JSON.stringify({
                type: 'CONNECTION_RESPONSE',
                connectionId,
                accepted: true,
                theirEndpoints: myEndpoints,
                relayEndpoint: this.config.enableRelay ? `ws://localhost:${this.port}` : null
            }));
        }
    }

    /**
     * Handle connection reject
     */
    handleConnectionReject(ws, msg) {
        const { connectionId, reason } = msg;
        const relay = this.relays.get(connectionId);
        
        if (!relay) return;
        
        const fromDevice = this.devices.get(relay.from);
        
        if (fromDevice) {
            fromDevice.ws.send(JSON.stringify({
                type: 'CONNECTION_RESPONSE',
                connectionId,
                accepted: false,
                reason
            }));
        }
        
        this.relays.delete(connectionId);
    }

    /**
     * Handle relay data
     */
    handleRelayData(ws, msg) {
        const { connectionId, data } = msg;
        const relay = this.relays.get(connectionId);
        
        if (!relay) return;
        
        // Determine recipient
        const fromDevice = this.findDeviceByWs(ws);
        if (!fromDevice) return;
        
        const targetId = fromDevice.id === relay.from ? relay.to : relay.from;
        const targetDevice = this.devices.get(targetId);
        
        if (targetDevice) {
            targetDevice.ws.send(JSON.stringify({
                type: 'RELAY_DATA',
                connectionId,
                fromDeviceId: fromDevice.id,
                data
            }));
        }
    }

    /**
     * Handle relay close
     */
    handleRelayClose(msg) {
        this.relays.delete(msg.connectionId);
    }

    /**
     * Handle pool registration
     */
    handleRegisterPool(ws, msg) {
        const pool = {
            id: msg.pool.id,
            name: msg.pool.name,
            region: msg.pool.region || this.region,
            deviceCount: msg.pool.deviceCount || 1,
            capabilities: msg.pool.capabilities || {},
            endpoint: msg.pool.endpoint,
            registeredAt: Date.now()
        };
        
        this.pools.set(pool.id, pool);
        
        // Broadcast new pool
        this.broadcast({
            type: 'POOL_DISCOVERED',
            pool
        });
        
        console.log(`🏊 Pool registered: ${pool.name}`);
    }

    /**
     * Find device by WebSocket
     */
    findDeviceByWs(ws) {
        for (const device of this.devices.values()) {
            if (device.ws === ws) return device;
        }
        return null;
    }

    /**
     * Convert device to public format
     */
    deviceToPublic(device) {
        return {
            id: device.id,
            name: device.name,
            capabilities: device.capabilities,
            deviceType: device.deviceType,
            region: device.region,
            status: 'online',
            trustScore: device.trustScore || 1.0
        };
    }

    /**
     * Get public devices list
     */
    getPublicDevices() {
        return Array.from(this.devices.values())
            .filter(d => d.isPublic !== false)
            .map(d => this.deviceToPublic(d));
    }

    /**
     * Broadcast message to all devices
     */
    broadcast(msg, excludeId = null) {
        const data = JSON.stringify(msg);
        
        for (const device of this.devices.values()) {
            if (device.id !== excludeId && device.ws.readyState === WebSocket.OPEN) {
                device.ws.send(data);
            }
        }
    }

    /**
     * Cleanup stale connections
     */
    cleanup() {
        const now = Date.now();
        
        // Cleanup stale devices
        for (const [deviceId, device] of this.devices) {
            if (now - device.lastSeen > this.config.deviceTimeout) {
                this.handleDeviceDisconnect(deviceId);
            }
        }
        
        // Cleanup stale relays
        for (const [connectionId, relay] of this.relays) {
            if (now - relay.createdAt > 300000) { // 5 minutes
                this.relays.delete(connectionId);
            }
        }
    }

    /**
     * Get server status
     */
    getStatus() {
        return {
            name: this.name,
            region: this.region,
            isRunning: this.isRunning,
            devices: this.devices.size,
            pools: this.pools.size,
            relays: this.relays.size
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
     * Stop the server
     */
    async stop() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        // Notify all devices
        this.broadcast({
            type: 'SERVER_SHUTDOWN',
            message: 'Directory server is shutting down'
        });
        
        return new Promise((resolve) => {
            if (this.wss) {
                this.wss.close();
            }
            
            if (this.server) {
                this.server.close(() => {
                    this.isRunning = false;
                    console.log('🛑 Global Directory Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = {
    ConnectionMethod,
    DirectoryStatus,
    DefaultDirectoryServers,
    GlobalDeviceEntry,
    GlobalDiscoveryClient,
    GlobalDirectoryServer
};

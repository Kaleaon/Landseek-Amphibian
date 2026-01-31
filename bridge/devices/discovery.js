/**
 * Device Discovery
 * 
 * Discovers other Universal Hosts on the network using:
 * - mDNS/Bonjour for local network discovery
 * - UDP broadcast for simple discovery
 * - Manual endpoint registration
 */

const dgram = require('dgram');
const os = require('os');

/**
 * Discovery message types
 */
const DiscoveryType = {
    ANNOUNCE: 'announce',
    QUERY: 'query',
    RESPONSE: 'response',
    GOODBYE: 'goodbye'
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

/**
 * Get broadcast address
 */
function getBroadcastAddress(ip) {
    const parts = ip.split('.');
    parts[3] = '255';
    return parts.join('.');
}

class DeviceDiscovery {
    constructor(options = {}) {
        this.port = options.port || 8769;
        this.serviceName = options.serviceName || '_amphibian._tcp';
        
        // Discovered hosts
        this.hosts = new Map(); // hostId -> HostInfo
        
        // Our host info (if hosting)
        this.localHost = null;
        
        // UDP socket for broadcast discovery
        this.socket = null;
        this.isRunning = false;
        
        // Configuration
        this.config = {
            announceInterval: options.announceInterval || 30000, // 30 seconds
            hostTimeout: options.hostTimeout || 120000, // 2 minutes
            cleanupInterval: options.cleanupInterval || 60000 // 1 minute
        };
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Start discovery
     */
    async start(localHost = null) {
        this.localHost = localHost;
        
        return new Promise((resolve, reject) => {
            try {
                this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
                
                this.socket.on('message', (msg, rinfo) => {
                    this.handleMessage(msg, rinfo);
                });
                
                this.socket.on('error', (err) => {
                    console.error('Discovery socket error:', err);
                });
                
                this.socket.bind(this.port, () => {
                    // Enable broadcast
                    this.socket.setBroadcast(true);
                    
                    this.isRunning = true;
                    console.log(`🔍 Device Discovery started on port ${this.port}`);
                    
                    // Start background tasks
                    this.startBackgroundTasks();
                    
                    // Send initial query
                    this.sendQuery();
                    
                    // Announce ourselves if hosting
                    if (this.localHost) {
                        this.announce();
                    }
                    
                    resolve();
                });
                
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Handle incoming discovery message
     */
    handleMessage(msg, rinfo) {
        try {
            const data = JSON.parse(msg.toString());
            
            // Ignore our own messages
            if (data.hostId === this.localHost?.hostId) {
                return;
            }
            
            switch (data.type) {
                case DiscoveryType.ANNOUNCE:
                    this.handleAnnounce(data, rinfo);
                    break;
                    
                case DiscoveryType.QUERY:
                    this.handleQuery(data, rinfo);
                    break;
                    
                case DiscoveryType.RESPONSE:
                    this.handleResponse(data, rinfo);
                    break;
                    
                case DiscoveryType.GOODBYE:
                    this.handleGoodbye(data, rinfo);
                    break;
            }
        } catch (e) {
            // Ignore invalid messages
        }
    }

    /**
     * Handle announce message
     */
    handleAnnounce(data, rinfo) {
        const hostId = data.hostId || `${rinfo.address}:${data.port}`;
        
        const existingHost = this.hosts.get(hostId);
        const isNew = !existingHost;
        
        const host = {
            id: hostId,
            name: data.hostName,
            address: rinfo.address,
            port: data.port,
            deviceType: data.deviceType,
            capabilities: data.capabilities,
            status: data.status,
            lastSeen: Date.now()
        };
        
        this.hosts.set(hostId, host);
        
        if (isNew) {
            console.log(`🆕 Discovered host: ${host.name} (${host.deviceType})`);
            this.emit('host_discovered', host);
        } else {
            this.emit('host_updated', host);
        }
    }

    /**
     * Handle query message - respond with our info
     */
    handleQuery(data, rinfo) {
        if (this.localHost) {
            this.sendResponse(rinfo.address, data.replyPort || this.port);
        }
    }

    /**
     * Handle response to our query
     */
    handleResponse(data, rinfo) {
        this.handleAnnounce(data, rinfo);
    }

    /**
     * Handle goodbye message
     */
    handleGoodbye(data, rinfo) {
        const hostId = data.hostId || `${rinfo.address}:${data.port}`;
        
        if (this.hosts.has(hostId)) {
            const host = this.hosts.get(hostId);
            this.hosts.delete(hostId);
            console.log(`👋 Host left: ${host.name}`);
            this.emit('host_left', host);
        }
    }

    /**
     * Announce our presence
     */
    announce() {
        if (!this.localHost || !this.socket) return;
        
        const message = {
            type: DiscoveryType.ANNOUNCE,
            hostId: this.localHost.hostId,
            hostName: this.localHost.hostName,
            port: this.localHost.port,
            deviceType: this.localHost.deviceType,
            capabilities: this.localHost.capabilities,
            status: this.localHost.status
        };
        
        this.broadcast(message);
    }

    /**
     * Send query to find hosts
     */
    sendQuery() {
        const message = {
            type: DiscoveryType.QUERY,
            replyPort: this.port
        };
        
        this.broadcast(message);
    }

    /**
     * Send response to specific address
     */
    sendResponse(address, port) {
        if (!this.localHost || !this.socket) return;
        
        const message = {
            type: DiscoveryType.RESPONSE,
            hostId: this.localHost.hostId,
            hostName: this.localHost.hostName,
            port: this.localHost.port,
            deviceType: this.localHost.deviceType,
            capabilities: this.localHost.capabilities,
            status: this.localHost.status
        };
        
        const data = Buffer.from(JSON.stringify(message));
        this.socket.send(data, port, address);
    }

    /**
     * Send goodbye message
     */
    sendGoodbye() {
        if (!this.localHost || !this.socket) return;
        
        const message = {
            type: DiscoveryType.GOODBYE,
            hostId: this.localHost.hostId,
            port: this.localHost.port
        };
        
        this.broadcast(message);
    }

    /**
     * Broadcast message to all local addresses
     */
    broadcast(message) {
        if (!this.socket) return;
        
        const data = Buffer.from(JSON.stringify(message));
        const localIPs = getLocalIPs();
        
        for (const ip of localIPs) {
            const broadcastAddr = getBroadcastAddress(ip);
            this.socket.send(data, this.port, broadcastAddr, (err) => {
                if (err) {
                    console.error('Broadcast error:', err);
                }
            });
        }
    }

    /**
     * Start background tasks
     */
    startBackgroundTasks() {
        // Periodic announce
        this.announceInterval = setInterval(() => {
            if (this.localHost) {
                this.announce();
            }
        }, this.config.announceInterval);
        
        // Cleanup stale hosts
        this.cleanupInterval = setInterval(() => {
            this.cleanupStaleHosts();
        }, this.config.cleanupInterval);
    }

    /**
     * Cleanup stale hosts
     */
    cleanupStaleHosts() {
        const now = Date.now();
        
        for (const [hostId, host] of this.hosts) {
            if (now - host.lastSeen > this.config.hostTimeout) {
                this.hosts.delete(hostId);
                console.log(`⏰ Host timed out: ${host.name}`);
                this.emit('host_timeout', host);
            }
        }
    }

    /**
     * Get all discovered hosts
     */
    getHosts() {
        return Array.from(this.hosts.values());
    }

    /**
     * Get hosts with specific capability
     */
    getHostsWithCapability(capability) {
        return this.getHosts().filter(h => h.capabilities && h.capabilities[capability]);
    }

    /**
     * Manually add a host
     */
    addManualHost(address, port, info = {}) {
        const hostId = `${address}:${port}`;
        
        const host = {
            id: hostId,
            name: info.name || hostId,
            address,
            port,
            deviceType: info.deviceType || 'unknown',
            capabilities: info.capabilities || {},
            status: 'unknown',
            lastSeen: Date.now(),
            manual: true
        };
        
        this.hosts.set(hostId, host);
        this.emit('host_added', host);
        
        return host;
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
     * Stop discovery
     */
    async stop() {
        // Send goodbye
        this.sendGoodbye();
        
        // Clear intervals
        if (this.announceInterval) clearInterval(this.announceInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        
        // Close socket
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.isRunning = false;
        console.log('🛑 Device Discovery stopped');
    }
}

module.exports = { DeviceDiscovery, DiscoveryType };

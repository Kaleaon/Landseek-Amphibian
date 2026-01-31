/**
 * Adaptive Scheduler
 * 
 * Intelligently schedules tasks across available hosts based on:
 * - Device capabilities
 * - Current resource usage
 * - Power mode and battery level
 * - Network conditions
 * - Task requirements
 */

const { DeviceType, PowerMode } = require('./profiles');

/**
 * Scheduling strategies
 */
const SchedulingStrategy = {
    ROUND_ROBIN: 'round_robin',           // Distribute evenly
    CAPABILITY_MATCH: 'capability_match', // Best match for task
    LOAD_BALANCE: 'load_balance',         // Least loaded device
    POWER_AWARE: 'power_aware',           // Prefer plugged-in devices
    LATENCY_OPTIMIZED: 'latency_optimized', // Fastest response
    COST_OPTIMIZED: 'cost_optimized'      // Minimize resource usage
};

class AdaptiveScheduler {
    constructor(options = {}) {
        // Available hosts
        this.hosts = new Map(); // hostId -> HostInfo with stats
        
        // Scheduling configuration
        this.strategy = options.strategy || SchedulingStrategy.CAPABILITY_MATCH;
        
        // Performance tracking
        this.taskHistory = []; // Recent task completions for learning
        this.maxHistorySize = options.maxHistorySize || 1000;
        
        // Configuration
        this.config = {
            preferPluggedIn: options.preferPluggedIn !== false,
            minBatteryForTask: options.minBatteryForTask || 20,
            maxTasksPerHost: options.maxTasksPerHost || 5,
            loadBalanceThreshold: options.loadBalanceThreshold || 0.8, // 80% load
            latencyWeight: options.latencyWeight || 0.3,
            capabilityWeight: options.capabilityWeight || 0.4,
            availabilityWeight: options.availabilityWeight || 0.3
        };
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Register a host with the scheduler
     */
    registerHost(hostInfo) {
        const hostId = hostInfo.id || `${hostInfo.address}:${hostInfo.port}`;
        
        this.hosts.set(hostId, {
            ...hostInfo,
            id: hostId,
            stats: {
                tasksAssigned: 0,
                tasksCompleted: 0,
                tasksFailed: 0,
                avgLatency: 0,
                totalLatency: 0,
                currentLoad: 0,
                lastTaskTime: null,
                reliability: 1.0
            }
        });
        
        console.log(`📊 Host registered with scheduler: ${hostInfo.name || hostId}`);
    }

    /**
     * Update host info
     */
    updateHost(hostId, updates) {
        const host = this.hosts.get(hostId);
        if (host) {
            Object.assign(host, updates);
        }
    }

    /**
     * Remove host
     */
    removeHost(hostId) {
        this.hosts.delete(hostId);
    }

    /**
     * Schedule a task to the best available host
     */
    scheduleTask(task) {
        const eligibleHosts = this.getEligibleHosts(task);
        
        if (eligibleHosts.length === 0) {
            return null;
        }
        
        let selectedHost;
        
        switch (this.strategy) {
            case SchedulingStrategy.ROUND_ROBIN:
                selectedHost = this.selectRoundRobin(eligibleHosts);
                break;
                
            case SchedulingStrategy.CAPABILITY_MATCH:
                selectedHost = this.selectByCapability(eligibleHosts, task);
                break;
                
            case SchedulingStrategy.LOAD_BALANCE:
                selectedHost = this.selectByLoad(eligibleHosts);
                break;
                
            case SchedulingStrategy.POWER_AWARE:
                selectedHost = this.selectByPower(eligibleHosts);
                break;
                
            case SchedulingStrategy.LATENCY_OPTIMIZED:
                selectedHost = this.selectByLatency(eligibleHosts);
                break;
                
            case SchedulingStrategy.COST_OPTIMIZED:
                selectedHost = this.selectByCost(eligibleHosts, task);
                break;
                
            default:
                selectedHost = this.selectByScore(eligibleHosts, task);
        }
        
        if (selectedHost) {
            selectedHost.stats.tasksAssigned++;
            selectedHost.stats.currentLoad++;
            selectedHost.stats.lastTaskTime = Date.now();
            
            this.emit('task_scheduled', { task, host: selectedHost });
        }
        
        return selectedHost;
    }

    /**
     * Get hosts eligible for a task
     */
    getEligibleHosts(task) {
        const eligible = [];
        
        for (const host of this.hosts.values()) {
            // Check capability
            if (!this.hasCapabilityForTask(host, task)) {
                continue;
            }
            
            // Check status
            if (host.status === 'offline' || host.status === 'throttled') {
                continue;
            }
            
            // Check load
            if (host.stats.currentLoad >= this.config.maxTasksPerHost) {
                continue;
            }
            
            // Check battery
            if (host.batteryLevel !== undefined && 
                host.batteryLevel < this.config.minBatteryForTask &&
                host.powerMode !== PowerMode.PLUGGED_IN) {
                continue;
            }
            
            eligible.push(host);
        }
        
        return eligible;
    }

    /**
     * Check if host has capability for task
     */
    hasCapabilityForTask(host, task) {
        const caps = host.capabilities || {};
        
        switch (task.type) {
            case 'inference':
                return caps.canInference === true;
            case 'training':
            case 'gradient':
                return caps.canTrain === true;
            case 'embed':
                return caps.canEmbed === true;
            case 'relay':
                return caps.canRelay === true;
            default:
                return true;
        }
    }

    /**
     * Round robin selection
     */
    selectRoundRobin(hosts) {
        // Sort by last task time, select least recently used
        return hosts.sort((a, b) => {
            const aTime = a.stats.lastTaskTime || 0;
            const bTime = b.stats.lastTaskTime || 0;
            return aTime - bTime;
        })[0];
    }

    /**
     * Select by capability match
     */
    selectByCapability(hosts, task) {
        // Score hosts by how well they match task requirements
        const scored = hosts.map(host => ({
            host,
            score: this.calculateCapabilityScore(host, task)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.host;
    }

    /**
     * Calculate capability score
     */
    calculateCapabilityScore(host, task) {
        let score = 0;
        const caps = host.capabilities || {};
        const resources = host.resources || {};
        
        // Accelerator bonus
        if (caps.hasAccelerator) {
            score += 50;
            if (caps.acceleratorType === 'cuda') score += 20;
            if (caps.acceleratorType === 'tpu' || caps.acceleratorType === 'npu') score += 30;
        }
        
        // Resource capacity
        score += Math.min(resources.maxConcurrentTasks || 1, 10) * 5;
        score += Math.min((resources.maxMemoryMB || 256) / 1024, 10) * 3;
        
        // Task-specific scoring
        if (task.type === 'inference') {
            score += (resources.maxTokens || 64) / 100;
        }
        if (task.type === 'training') {
            score += (resources.maxBatchSize || 1) * 5;
        }
        
        // Reliability bonus
        score += (host.stats.reliability || 1) * 20;
        
        return score;
    }

    /**
     * Select by load (least loaded)
     */
    selectByLoad(hosts) {
        return hosts.sort((a, b) => {
            const aLoad = a.stats.currentLoad / (a.resources?.maxConcurrentTasks || 1);
            const bLoad = b.stats.currentLoad / (b.resources?.maxConcurrentTasks || 1);
            return aLoad - bLoad;
        })[0];
    }

    /**
     * Select by power (prefer plugged-in)
     */
    selectByPower(hosts) {
        // Sort: plugged-in first, then by battery level
        return hosts.sort((a, b) => {
            const aPlugged = a.powerMode === PowerMode.PLUGGED_IN ? 1 : 0;
            const bPlugged = b.powerMode === PowerMode.PLUGGED_IN ? 1 : 0;
            
            if (aPlugged !== bPlugged) {
                return bPlugged - aPlugged;
            }
            
            return (b.batteryLevel || 100) - (a.batteryLevel || 100);
        })[0];
    }

    /**
     * Select by latency (fastest)
     */
    selectByLatency(hosts) {
        return hosts.sort((a, b) => {
            const aLatency = a.stats.avgLatency || Infinity;
            const bLatency = b.stats.avgLatency || Infinity;
            return aLatency - bLatency;
        })[0];
    }

    /**
     * Select by cost (minimize resource usage)
     */
    selectByCost(hosts, task) {
        // Prefer devices with just enough capability
        const scored = hosts.map(host => ({
            host,
            score: this.calculateCostScore(host, task)
        }));
        
        scored.sort((a, b) => a.score - b.score); // Lower is better
        return scored[0]?.host;
    }

    /**
     * Calculate cost score (lower is better)
     */
    calculateCostScore(host, task) {
        const resources = host.resources || {};
        
        // Base cost on resource usage
        let cost = 0;
        
        // Memory cost
        cost += (resources.maxMemoryMB || 256) / 1024;
        
        // Battery cost (if on battery)
        if (host.powerMode !== PowerMode.PLUGGED_IN) {
            cost += 10;
            cost += (100 - (host.batteryLevel || 100)) / 10;
        }
        
        // Accelerator cost (GPU/TPU use more power)
        if (host.capabilities?.hasAccelerator) {
            cost += 5;
        }
        
        return cost;
    }

    /**
     * Select by combined score (default)
     */
    selectByScore(hosts, task) {
        const scored = hosts.map(host => ({
            host,
            score: this.calculateCombinedScore(host, task)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.host;
    }

    /**
     * Calculate combined score
     */
    calculateCombinedScore(host, task) {
        const { latencyWeight, capabilityWeight, availabilityWeight } = this.config;
        
        // Capability score (0-100)
        const capScore = this.calculateCapabilityScore(host, task);
        
        // Latency score (0-100, lower latency = higher score)
        const avgLatency = host.stats.avgLatency || 5000;
        const latencyScore = Math.max(0, 100 - (avgLatency / 100));
        
        // Availability score (0-100, lower load = higher score)
        const maxTasks = host.resources?.maxConcurrentTasks || 1;
        const loadRatio = host.stats.currentLoad / maxTasks;
        const availScore = (1 - loadRatio) * 100;
        
        // Combined weighted score
        return (
            capScore * capabilityWeight +
            latencyScore * latencyWeight +
            availScore * availabilityWeight
        );
    }

    /**
     * Record task completion
     */
    recordTaskCompletion(hostId, taskId, latency, success = true) {
        const host = this.hosts.get(hostId);
        if (!host) return;
        
        host.stats.currentLoad = Math.max(0, host.stats.currentLoad - 1);
        
        if (success) {
            host.stats.tasksCompleted++;
            host.stats.totalLatency += latency;
            host.stats.avgLatency = host.stats.totalLatency / host.stats.tasksCompleted;
        } else {
            host.stats.tasksFailed++;
        }
        
        // Update reliability
        const total = host.stats.tasksCompleted + host.stats.tasksFailed;
        host.stats.reliability = total > 0 ? host.stats.tasksCompleted / total : 1.0;
        
        // Record in history
        this.taskHistory.push({
            hostId,
            taskId,
            latency,
            success,
            timestamp: Date.now()
        });
        
        // Trim history
        if (this.taskHistory.length > this.maxHistorySize) {
            this.taskHistory.shift();
        }
        
        this.emit('task_completed', { hostId, taskId, latency, success });
    }

    /**
     * Get scheduling statistics
     */
    getStats() {
        const stats = {
            totalHosts: this.hosts.size,
            availableHosts: 0,
            totalTasksScheduled: 0,
            totalTasksCompleted: 0,
            avgLatency: 0,
            avgReliability: 0,
            hostStats: []
        };
        
        let totalLatency = 0;
        let latencyCount = 0;
        let totalReliability = 0;
        
        for (const host of this.hosts.values()) {
            if (host.status !== 'offline') {
                stats.availableHosts++;
            }
            
            stats.totalTasksScheduled += host.stats.tasksAssigned;
            stats.totalTasksCompleted += host.stats.tasksCompleted;
            
            if (host.stats.avgLatency > 0) {
                totalLatency += host.stats.avgLatency;
                latencyCount++;
            }
            
            totalReliability += host.stats.reliability;
            
            stats.hostStats.push({
                id: host.id,
                name: host.name,
                deviceType: host.deviceType,
                tasksAssigned: host.stats.tasksAssigned,
                tasksCompleted: host.stats.tasksCompleted,
                avgLatency: host.stats.avgLatency,
                reliability: host.stats.reliability,
                currentLoad: host.stats.currentLoad
            });
        }
        
        stats.avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
        stats.avgReliability = this.hosts.size > 0 ? totalReliability / this.hosts.size : 1;
        
        return stats;
    }

    /**
     * Set scheduling strategy
     */
    setStrategy(strategy) {
        if (Object.values(SchedulingStrategy).includes(strategy)) {
            this.strategy = strategy;
            console.log(`📊 Scheduling strategy changed to: ${strategy}`);
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
}

module.exports = { AdaptiveScheduler, SchedulingStrategy };

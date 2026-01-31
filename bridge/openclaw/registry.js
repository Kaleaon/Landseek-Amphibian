/**
 * OpenClaw Registry
 * 
 * Manages open registration of ClawBots that want to contribute
 * computation to the network. No authentication required - any
 * ClawBot can join and contribute.
 * 
 * Features:
 * - Open registration (no approval needed)
 * - Capability discovery
 * - Reputation tracking
 * - Automatic cleanup of inactive bots
 */

const crypto = require('crypto');

/**
 * ClawBot capability levels
 */
const BotCapability = {
    MINIMAL: 'minimal',   // Can only relay tasks
    BASIC: 'basic',       // Can run simple inference
    STANDARD: 'standard', // Can run full inference
    ADVANCED: 'advanced', // Can run training tasks
    GPU: 'gpu',           // Has GPU acceleration
    TPU: 'tpu'            // Has TPU/NPU acceleration
};

/**
 * Bot status
 */
const BotStatus = {
    ONLINE: 'online',
    BUSY: 'busy',
    IDLE: 'idle',
    OFFLINE: 'offline'
};

class OpenRegistry {
    constructor(options = {}) {
        // Registry storage
        this.bots = new Map(); // botId -> BotInfo
        this.botsByCapability = new Map(); // capability -> Set<botId>
        
        // Configuration
        this.config = {
            maxInactiveDuration: options.maxInactiveDuration || 300000, // 5 minutes
            cleanupInterval: options.cleanupInterval || 60000, // 1 minute
            minReputationForTraining: options.minReputationForTraining || 0.5
        };
        
        // Initialize capability sets
        for (const cap of Object.values(BotCapability)) {
            this.botsByCapability.set(cap, new Set());
        }
        
        // Event handlers
        this.eventHandlers = [];
        
        // Start cleanup timer
        this.cleanupTimer = setInterval(() => this.cleanupInactive(), this.config.cleanupInterval);
    }

    /**
     * Register a new ClawBot (open registration)
     * @param {Object} botInfo - Bot information
     * @returns {Object} Registration result with assigned botId
     */
    register(botInfo) {
        const botId = botInfo.botId || this.generateBotId();
        
        const bot = {
            id: botId,
            name: botInfo.name || `ClawBot_${botId.substring(0, 6)}`,
            capability: botInfo.capability || BotCapability.BASIC,
            status: BotStatus.ONLINE,
            version: botInfo.version || '1.0.0',
            platform: botInfo.platform || 'unknown',
            
            // Connection info
            endpoint: botInfo.endpoint || null,
            ws: botInfo.ws || null,
            
            // Stats
            registeredAt: Date.now(),
            lastSeen: Date.now(),
            tasksCompleted: 0,
            tasksFailed: 0,
            totalComputeTime: 0,
            
            // Reputation (starts at 1.0, decreases with failures)
            reputation: 1.0,
            
            // Contribution tracking
            contributions: {
                inference: 0,
                training: 0,
                gradients: 0,
                validations: 0
            },
            
            // Metadata
            metadata: botInfo.metadata || {}
        };
        
        this.bots.set(botId, bot);
        this.botsByCapability.get(bot.capability).add(botId);
        
        console.log(`🤖 ClawBot registered: ${bot.name} (${bot.capability})`);
        
        this.emit('bot_registered', bot);
        
        return {
            botId,
            name: bot.name,
            registeredAt: bot.registeredAt
        };
    }

    /**
     * Generate unique bot ID
     */
    generateBotId() {
        return `claw_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Update bot status
     */
    updateStatus(botId, status, metadata = {}) {
        const bot = this.bots.get(botId);
        if (!bot) return false;
        
        bot.status = status;
        bot.lastSeen = Date.now();
        
        if (metadata) {
            Object.assign(bot.metadata, metadata);
        }
        
        return true;
    }

    /**
     * Update bot capability
     */
    updateCapability(botId, newCapability) {
        const bot = this.bots.get(botId);
        if (!bot) return false;
        
        // Remove from old capability set
        this.botsByCapability.get(bot.capability).delete(botId);
        
        // Add to new capability set
        bot.capability = newCapability;
        this.botsByCapability.get(newCapability).add(botId);
        
        return true;
    }

    /**
     * Record task completion
     */
    recordTaskCompletion(botId, taskType, computeTime, success = true) {
        const bot = this.bots.get(botId);
        if (!bot) return;
        
        bot.lastSeen = Date.now();
        
        if (success) {
            bot.tasksCompleted++;
            bot.totalComputeTime += computeTime;
            
            // Update contributions
            switch (taskType) {
                case 'inference':
                    bot.contributions.inference++;
                    break;
                case 'training':
                case 'gradient':
                    bot.contributions.training++;
                    bot.contributions.gradients++;
                    break;
                case 'validation':
                    bot.contributions.validations++;
                    break;
            }
            
            // Improve reputation
            bot.reputation = Math.min(1.0, bot.reputation + 0.01);
        } else {
            bot.tasksFailed++;
            
            // Decrease reputation
            bot.reputation = Math.max(0.1, bot.reputation - 0.05);
        }
        
        this.emit('task_recorded', { botId, taskType, success });
    }

    /**
     * Get bot by ID
     */
    getBot(botId) {
        return this.bots.get(botId);
    }

    /**
     * Get all bots with specific capability
     */
    getBotsByCapability(capability) {
        const botIds = this.botsByCapability.get(capability) || new Set();
        return Array.from(botIds).map(id => this.bots.get(id)).filter(b => b);
    }

    /**
     * Get all online bots
     */
    getOnlineBots() {
        return Array.from(this.bots.values()).filter(
            b => b.status === BotStatus.ONLINE || b.status === BotStatus.IDLE
        );
    }

    /**
     * Get bots available for training
     */
    getTrainingCapableBots() {
        const capable = [];
        
        for (const bot of this.bots.values()) {
            if (bot.status !== BotStatus.OFFLINE &&
                bot.reputation >= this.config.minReputationForTraining &&
                (bot.capability === BotCapability.ADVANCED ||
                 bot.capability === BotCapability.GPU ||
                 bot.capability === BotCapability.TPU)) {
                capable.push(bot);
            }
        }
        
        return capable.sort((a, b) => b.reputation - a.reputation);
    }

    /**
     * Get bots available for inference
     */
    getInferenceCapableBots() {
        const capable = [];
        
        for (const bot of this.bots.values()) {
            if (bot.status !== BotStatus.OFFLINE && bot.status !== BotStatus.BUSY) {
                capable.push(bot);
            }
        }
        
        return capable.sort((a, b) => b.reputation - a.reputation);
    }

    /**
     * Unregister a bot
     */
    unregister(botId) {
        const bot = this.bots.get(botId);
        if (!bot) return false;
        
        this.botsByCapability.get(bot.capability).delete(botId);
        this.bots.delete(botId);
        
        console.log(`👋 ClawBot unregistered: ${bot.name}`);
        
        this.emit('bot_unregistered', bot);
        
        return true;
    }

    /**
     * Mark bot as offline
     */
    markOffline(botId) {
        const bot = this.bots.get(botId);
        if (bot) {
            bot.status = BotStatus.OFFLINE;
            this.emit('bot_offline', bot);
        }
    }

    /**
     * Cleanup inactive bots
     */
    cleanupInactive() {
        const now = Date.now();
        const toRemove = [];
        
        for (const [botId, bot] of this.bots) {
            if (now - bot.lastSeen > this.config.maxInactiveDuration) {
                toRemove.push(botId);
            }
        }
        
        for (const botId of toRemove) {
            this.markOffline(botId);
        }
    }

    /**
     * Get registry statistics
     */
    getStats() {
        const stats = {
            totalBots: this.bots.size,
            onlineBots: 0,
            byCapability: {},
            totalTasksCompleted: 0,
            totalComputeTime: 0
        };
        
        for (const [cap, botIds] of this.botsByCapability) {
            stats.byCapability[cap] = botIds.size;
        }
        
        for (const bot of this.bots.values()) {
            if (bot.status !== BotStatus.OFFLINE) {
                stats.onlineBots++;
            }
            stats.totalTasksCompleted += bot.tasksCompleted;
            stats.totalComputeTime += bot.totalComputeTime;
        }
        
        return stats;
    }

    /**
     * Get leaderboard of top contributors
     */
    getLeaderboard(limit = 10) {
        const bots = Array.from(this.bots.values());
        
        return bots
            .sort((a, b) => {
                const aScore = a.contributions.inference + a.contributions.training * 5;
                const bScore = b.contributions.inference + b.contributions.training * 5;
                return bScore - aScore;
            })
            .slice(0, limit)
            .map(b => ({
                name: b.name,
                id: b.id,
                contributions: b.contributions,
                reputation: b.reputation,
                tasksCompleted: b.tasksCompleted
            }));
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
     * Shutdown registry
     */
    shutdown() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        // Notify all bots
        for (const bot of this.bots.values()) {
            this.emit('registry_shutdown', bot);
        }
        
        this.bots.clear();
    }
}

module.exports = { OpenRegistry, BotCapability, BotStatus };

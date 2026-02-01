/**
 * Contribution Tracker
 * 
 * Tracks contributions from ClawBots to the open pool.
 * Records compute time, tasks completed, and calculates
 * contribution scores for fair attribution.
 */

class ContributionTracker {
    constructor(options = {}) {
        // Contribution records by bot
        this.contributions = new Map(); // botId -> ContributionRecord
        
        // Global stats
        this.globalStats = {
            totalInferenceTasks: 0,
            totalTrainingTasks: 0,
            totalGradients: 0,
            totalComputeTime: 0,
            totalParticipants: 0
        };
        
        // Configuration
        this.config = {
            // Weights for different contribution types
            weights: {
                inference: options.inferenceWeight || 1,
                training: options.trainingWeight || 5,
                gradient: options.gradientWeight || 2,
                validation: options.validationWeight || 1
            },
            // Decay factor for older contributions
            decayRate: options.decayRate || 0.001, // Per hour
            // Snapshot interval
            snapshotInterval: options.snapshotInterval || 3600000 // 1 hour
        };
        
        // Event handlers
        this.eventHandlers = [];
        
        // Start snapshot timer
        this.snapshotTimer = setInterval(() => this.takeSnapshot(), this.config.snapshotInterval);
    }

    /**
     * Record a contribution
     */
    recordContribution(botId, type, details = {}) {
        let record = this.contributions.get(botId);
        
        if (!record) {
            record = this.createNewRecord(botId);
            this.contributions.set(botId, record);
            this.globalStats.totalParticipants++;
        }
        
        const now = Date.now();
        record.lastContribution = now;
        
        const contribution = {
            type,
            timestamp: now,
            details
        };
        
        record.history.push(contribution);
        
        // Update type-specific counts
        switch (type) {
            case 'inference':
                record.inference.count++;
                record.inference.totalTime += details.computeTime || 0;
                this.globalStats.totalInferenceTasks++;
                break;
                
            case 'training':
                record.training.count++;
                record.training.totalTime += details.computeTime || 0;
                this.globalStats.totalTrainingTasks++;
                break;
                
            case 'gradient':
                record.gradients.count++;
                if (details.loss !== undefined) {
                    record.gradients.losses.push(details.loss);
                }
                this.globalStats.totalGradients++;
                break;
                
            case 'validation':
                record.validation.count++;
                break;
        }
        
        // Recalculate score
        record.score = this.calculateScore(record);
        
        this.emit('contribution_recorded', { botId, type, details });
        
        return record.score;
    }

    /**
     * Create new contribution record
     */
    createNewRecord(botId) {
        return {
            botId,
            joinedAt: Date.now(),
            lastContribution: Date.now(),
            
            inference: {
                count: 0,
                totalTime: 0
            },
            
            training: {
                count: 0,
                totalTime: 0
            },
            
            gradients: {
                count: 0,
                losses: []
            },
            
            validation: {
                count: 0
            },
            
            history: [],
            snapshots: [],
            score: 0
        };
    }

    /**
     * Calculate contribution score
     */
    calculateScore(record) {
        const { weights, decayRate } = this.config;
        const now = Date.now();
        
        let score = 0;
        
        // Calculate base score from contributions
        score += record.inference.count * weights.inference;
        score += record.training.count * weights.training;
        score += record.gradients.count * weights.gradient;
        score += record.validation.count * weights.validation;
        
        // Apply time decay (contributions from longer ago worth less)
        const hoursSinceJoin = (now - record.joinedAt) / 3600000;
        const decayFactor = Math.exp(-decayRate * hoursSinceJoin);
        
        // But don't decay too much - floor at 50%
        const adjustedDecay = 0.5 + 0.5 * decayFactor;
        
        return score * adjustedDecay;
    }

    /**
     * Get bot contribution record
     */
    getContribution(botId) {
        return this.contributions.get(botId);
    }

    /**
     * Get all contributions
     */
    getAllContributions() {
        return Array.from(this.contributions.values());
    }

    /**
     * Get contribution leaderboard
     */
    getLeaderboard(limit = 10) {
        return Array.from(this.contributions.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => ({
                botId: r.botId,
                score: r.score,
                inference: r.inference.count,
                training: r.training.count,
                gradients: r.gradients.count,
                lastContribution: r.lastContribution
            }));
    }

    /**
     * Get contribution share (percentage of total)
     */
    getContributionShare(botId) {
        const record = this.contributions.get(botId);
        if (!record) return 0;
        
        const totalScore = Array.from(this.contributions.values())
            .reduce((sum, r) => sum + r.score, 0);
        
        if (totalScore === 0) return 0;
        
        return record.score / totalScore;
    }

    /**
     * Take a snapshot of current contributions
     */
    takeSnapshot() {
        const snapshot = {
            timestamp: Date.now(),
            globalStats: { ...this.globalStats },
            topContributors: this.getLeaderboard(10)
        };
        
        // Store snapshot in each record
        for (const record of this.contributions.values()) {
            record.snapshots.push({
                timestamp: snapshot.timestamp,
                score: record.score
            });
            
            // Keep only last 24 snapshots
            if (record.snapshots.length > 24) {
                record.snapshots.shift();
            }
        }
        
        this.emit('snapshot_taken', snapshot);
        
        return snapshot;
    }

    /**
     * Get contribution statistics
     */
    getStats() {
        const contributions = Array.from(this.contributions.values());
        
        return {
            ...this.globalStats,
            activeContributors: contributions.filter(
                r => Date.now() - r.lastContribution < 3600000
            ).length,
            totalScore: contributions.reduce((sum, r) => sum + r.score, 0),
            averageScore: contributions.length > 0
                ? contributions.reduce((sum, r) => sum + r.score, 0) / contributions.length
                : 0
        };
    }

    /**
     * Reset contributions for a bot
     */
    resetContributions(botId) {
        this.contributions.delete(botId);
    }

    /**
     * Export contributions as JSON
     */
    export() {
        return {
            exportedAt: Date.now(),
            globalStats: this.globalStats,
            contributions: Array.from(this.contributions.entries()).map(([id, record]) => ({
                botId: id,
                ...record,
                history: record.history.slice(-100) // Only last 100 entries
            }))
        };
    }

    /**
     * Import contributions from JSON
     */
    import(data) {
        if (data.globalStats) {
            Object.assign(this.globalStats, data.globalStats);
        }
        
        if (data.contributions) {
            for (const record of data.contributions) {
                this.contributions.set(record.botId, record);
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
     * Shutdown tracker
     */
    shutdown() {
        if (this.snapshotTimer) {
            clearInterval(this.snapshotTimer);
        }
    }
}

module.exports = { ContributionTracker };

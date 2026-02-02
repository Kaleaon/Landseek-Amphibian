/**
 * Co-occurrence Tracking System
 * 
 * Implements SpindriftMend's "Living Memory" logic (v3.0) with edge provenance.
 * Tracks memory recalls within sessions and automatically builds associative links.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { CONNECTION_TYPES } = require('./models');

// Configuration
const CONFIG = {
    LINK_THRESHOLD: 3.0,
    PAIR_DECAY_RATE: 0.5,
    OBSERVATION_MAX_AGE_DAYS: 30,
    TRUST_TIERS: {
        'self': 1.0,
        'verified_agent': 0.8,
        'platform': 0.6,
        'unknown': 0.3
    }
};

/**
 * Represents a single observation of two memories co-occurring
 */
class Observation {
    constructor({
        id = randomUUID(),
        observedAt = new Date().toISOString(),
        source = { type: 'session_recall', agent: 'Amphibian' },
        weight = 1.0,
        trustTier = 'self'
    }) {
        this.id = id;
        this.observedAt = observedAt;
        this.source = source;
        this.weight = weight;
        this.trustTier = trustTier;
    }
}

/**
 * Manages co-occurrence logic and persistence
 */
class CooccurrenceTracker {
    constructor(memoryGraph, storagePath) {
        this.graph = memoryGraph;
        this.storagePath = storagePath;
        this.provenanceFile = path.join(storagePath, 'cooccurrence_provenance.json');
        
        // In-memory state
        this.sessionRecalls = new Map(); // id -> count
        this.edges = new Map(); // "id1|id2" -> { observations: [], belief: 0.0, lastUpdated: ... }
        
        this.loadProvenance();
    }

    /**
     * Track a memory being recalled in the current session
     * @param {string} memoryId 
     */
    trackRecall(memoryId) {
        const count = this.sessionRecalls.get(memoryId) || 0;
        this.sessionRecalls.set(memoryId, count + 1);
    }

    /**
     * End the current session, processing all co-occurrences
     * @param {Object} sessionMetadata 
     * @returns {Array<string>} List of newly linked pairs
     */
    async endSession(sessionMetadata = {}) {
        const ids = Array.from(this.sessionRecalls.keys());
        const newLinks = [];
        const processedPairs = new Set();
        const now = new Date().toISOString();

        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const id1 = ids[i];
                const id2 = ids[j];
                const pairKey = [id1, id2].sort().join('|');

                // Prevent double processing
                if (processedPairs.has(pairKey)) continue;
                processedPairs.add(pairKey);

                // Calculate weight (diminishing returns for multiple recalls in one session)
                const count1 = this.sessionRecalls.get(id1);
                const count2 = this.sessionRecalls.get(id2);
                const weight = Math.sqrt(Math.min(count1, count2));

                // Create observation
                const observation = new Observation({
                    weight,
                    trustTier: 'self',
                    source: {
                        type: 'session_recall',
                        agent: 'Amphibian',
                        sessionId: sessionMetadata.sessionId
                    }
                });

                // Update Edge
                let edge = this.edges.get(pairKey);
                if (!edge) {
                    edge = { observations: [], belief: 0.0, lastUpdated: now };
                    this.edges.set(pairKey, edge);
                }
                
                edge.observations.push(observation);
                edge.lastUpdated = now;
                
                // Update belief
                const oldBelief = edge.belief;
                edge.belief = this.calculateBelief(edge.observations);

                // Check Threshold
                if (oldBelief < CONFIG.LINK_THRESHOLD && edge.belief >= CONFIG.LINK_THRESHOLD) {
                    // Create Link in Graph
                    this.graph.linkMemories(id1, id2, CONNECTION_TYPES.ASSOCIATIVE, this.normalizeBelief(edge.belief));
                    newLinks.push(pairKey);
                } else if (edge.belief >= CONFIG.LINK_THRESHOLD) {
                    // Update existing link weight
                    this.graph.linkMemories(id1, id2, CONNECTION_TYPES.ASSOCIATIVE, this.normalizeBelief(edge.belief));
                }
            }
        }

        // Apply decay to pairs NOT in this session
        this.decayEdges(processedPairs);

        // Persist
        await this.saveProvenance();
        this.sessionRecalls.clear();

        return newLinks;
    }

    /**
     * Calculate aggregate belief from observations
     * @param {Array<Observation>} observations 
     */
    calculateBelief(observations) {
        let total = 0.0;
        const now = new Date();
        const sourceCounts = new Map(); // rate limiting per source

        for (const obs of observations) {
            const obsTime = new Date(obs.observedAt);
            const ageDays = (now - obsTime) / (1000 * 60 * 60 * 24);

            // Time decay
            const timeMult = Math.max(0.1, 1.0 - (ageDays / CONFIG.OBSERVATION_MAX_AGE_DAYS) * 0.1);
            
            // Trust tier
            const trustMult = CONFIG.TRUST_TIERS[obs.trustTier] || 0.3;

            // Source rate limiting
            const sourceKey = `${obs.source.type}:${obs.source.agent}`;
            const count = (sourceCounts.get(sourceKey) || 0) + 1;
            sourceCounts.set(sourceKey, count);
            
            const sourceMult = count <= 3 ? 1.0 : 1.0 / Math.sqrt(count - 2);

            total += obs.weight * trustMult * timeMult * sourceMult;
        }

        return parseFloat(total.toFixed(3));
    }

    /**
     * Decay edges not reinforced in the current session
     * @param {Set<string>} reinforcedPairs 
     */
    decayEdges(reinforcedPairs) {
        for (const [pairKey, edge] of this.edges) {
            if (reinforcedPairs.has(pairKey)) continue;

            // Decay belief
            let newBelief = edge.belief - CONFIG.PAIR_DECAY_RATE;
            
            if (newBelief <= 0) {
                newBelief = 0;
                // We don't delete observations (audit trail), but belief is 0
                // We might want to remove the link from the graph if it drops below threshold?
                // SpindriftMend logic: "mark inactive".
            }

            edge.belief = Math.max(0, parseFloat(newBelief.toFixed(3)));
            
            // Update Graph
            if (edge.belief < CONFIG.LINK_THRESHOLD) {
                // If it dropped below threshold, we should ideally remove the link or lower weight
                // The MemoryGraph doesn't have explicit "unlink", but setting low weight works.
                // Or we can leave it. For now, let's just update weight if it's still > 0
                const [id1, id2] = pairKey.split('|');
                // Check if link exists in graph? graph.linkMemories updates if exists.
                // If belief is 0, maybe we should remove? 
                // MemoryGraph doesn't expose unlink easily without instance access.
            } else {
                 const [id1, id2] = pairKey.split('|');
                 this.graph.linkMemories(id1, id2, CONNECTION_TYPES.ASSOCIATIVE, this.normalizeBelief(edge.belief));
            }
        }
    }

    /**
     * Normalize belief score (e.g. 0-10) to 0-1 weight
     */
    normalizeBelief(belief) {
        // Simple sigmoid or clamping. 
        // 3.0 threshold -> ~0.5 weight?
        // Let's just clamp 0-1 for now, assuming belief is roughly comparable to weight
        // but Spindrift belief goes higher.
        // Sigmoid: 1 / (1 + exp(-belief + offset))
        return Math.min(1.0, belief / 10.0); // Rough scaling
    }

    loadProvenance() {
        try {
            if (fs.existsSync(this.provenanceFile)) {
                const data = JSON.parse(fs.readFileSync(this.provenanceFile, 'utf8'));
                this.edges = new Map(Object.entries(data));
            }
        } catch (e) {
            console.error('Failed to load provenance:', e);
        }
    }

    async saveProvenance() {
        try {
            const data = Object.fromEntries(this.edges);
            await fs.promises.mkdir(this.storagePath, { recursive: true });
            await fs.promises.writeFile(this.provenanceFile, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save provenance:', e);
        }
    }
}

module.exports = CooccurrenceTracker;

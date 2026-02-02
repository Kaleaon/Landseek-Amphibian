/**
 * Memory Data Models
 *
 * Defines the structured memory format for the AI Agent.
 */

const { randomUUID } = require('crypto');

/**
 * Types of connections between memories
 */
const CONNECTION_TYPES = {
    TEMPORAL: 'temporal',       // Before, after, during
    CAUSAL: 'causal',           // Caused, enabled
    ASSOCIATIVE: 'associative', // Semantic similarity
    ENTITY: 'entity',           // People, places, things
    SPATIAL: 'spatial'          // Physical context
};

/**
 * Represents a connection between two memory nodes
 */
class MemoryLink {
    /**
     * @param {string} targetId - UUID of the target memory
     * @param {string} type - Connection type (from CONNECTION_TYPES)
     * @param {number} weight - Strength of connection (0.0 to 1.0)
     * @param {Object} metadata - Optional additional details
     */
    constructor(targetId, type, weight = 1.0, metadata = {}) {
        this.targetId = targetId;
        this.type = type;
        this.weight = weight;
        this.metadata = metadata;
    }

    toJSON() {
        return {
            targetId: this.targetId,
            type: this.type,
            weight: this.weight,
            metadata: this.metadata
        };
    }
}

/**
 * Represents a single unit of memory
 */
class MemoryNode {
    /**
     * @param {Object} params
     * @param {string} [params.id] - UUID (generated if not provided)
     * @param {string} params.content - The text content of the memory
     * @param {Array<number>} [params.embedding] - Vector embedding (e.g. 384 dimensions)
     * @param {number} [params.salience] - Importance score (0.0 to 1.0)
     * @param {number} [params.createdAt] - Timestamp in ms
     * @param {number} [params.lastAccessed] - Timestamp in ms
     * @param {Array<MemoryLink>} [params.connections] - List of connections
     */
    constructor({
        id = randomUUID(),
        content,
        embedding = [],
        salience = 1.0,
        createdAt = Date.now(),
        lastAccessed = Date.now(),
        connections = []
    }) {
        this.id = id;
        this.content = content;
        this.embedding = embedding;
        this.salience = salience;
        this.createdAt = createdAt;
        this.lastAccessed = lastAccessed;
        this.connections = connections.map(c =>
            c instanceof MemoryLink ? c : new MemoryLink(c.targetId, c.type, c.weight, c.metadata)
        );
    }

    /**
     * Add a connection to another memory
     * @param {string} targetId
     * @param {string} type
     * @param {number} weight
     * @param {Object} metadata
     */
    addConnection(targetId, type, weight = 1.0, metadata = {}) {
        // Check if connection already exists
        const existing = this.connections.find(c => c.targetId === targetId && c.type === type);
        if (existing) {
            existing.weight = weight; // Update weight
            existing.metadata = { ...existing.metadata, ...metadata };
        } else {
            this.connections.push(new MemoryLink(targetId, type, weight, metadata));
        }
    }

    /**
     * Update access timestamp
     */
    touch() {
        this.lastAccessed = Date.now();
    }

    toJSON() {
        return {
            id: this.id,
            content: this.content,
            embedding: this.embedding,
            salience: this.salience,
            createdAt: this.createdAt,
            lastAccessed: this.lastAccessed,
            connections: this.connections.map(c => c.toJSON())
        };
    }

    static fromJSON(json) {
        return new MemoryNode(json);
    }
}

module.exports = {
    CONNECTION_TYPES,
    MemoryLink,
    MemoryNode
};

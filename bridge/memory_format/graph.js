/**
 * Memory Graph Manager
 *
 * Manages the collection of memories and their relationships.
 */

const { MemoryNode, CONNECTION_TYPES } = require('./models');

class MemoryGraph {
    constructor() {
        this.nodes = new Map(); // Map<UUID, MemoryNode>
    }

    /**
     * Add a new memory to the graph
     * @param {string} content
     * @param {Array<number>} embedding
     * @param {Object} options
     * @returns {MemoryNode}
     */
    addMemory(content, embedding = [], options = {}) {
        const node = new MemoryNode({
            content,
            embedding,
            ...options
        });
        this.nodes.set(node.id, node);
        return node;
    }

    /**
     * Get a memory by ID
     * @param {string} id
     * @returns {MemoryNode|undefined}
     */
    getMemory(id) {
        const node = this.nodes.get(id);
        if (node) {
            node.touch();
        }
        return node;
    }

    /**
     * Update a memory
     * @param {string} id
     * @param {Object} updates
     * @returns {boolean} True if updated
     */
    updateMemory(id, updates) {
        const node = this.nodes.get(id);
        if (!node) return false;

        if (updates.content !== undefined) node.content = updates.content;
        if (updates.embedding !== undefined) node.embedding = updates.embedding;
        if (updates.salience !== undefined) node.salience = updates.salience;

        node.touch();
        return true;
    }

    /**
     * Delete a memory and remove links pointing to it
     * @param {string} id
     * @returns {boolean}
     */
    deleteMemory(id) {
        if (!this.nodes.has(id)) return false;

        this.nodes.delete(id);

        // Clean up connections pointing to this node
        for (const node of this.nodes.values()) {
            node.connections = node.connections.filter(c => c.targetId !== id);
        }

        return true;
    }

    /**
     * Create a directed link between two memories
     * @param {string} sourceId
     * @param {string} targetId
     * @param {string} type
     * @param {number} weight
     * @param {Object} metadata
     * @returns {boolean}
     */
    linkMemories(sourceId, targetId, type, weight = 1.0, metadata = {}) {
        const source = this.nodes.get(sourceId);
        const target = this.nodes.get(targetId);

        if (!source || !target) return false;

        source.addConnection(targetId, type, weight, metadata);
        return true;
    }

    /**
     * Traverse the graph from a start node
     * @param {string} startId
     * @param {Array<string>} [linkTypes] - Filter by link types (optional)
     * @param {number} [maxDepth] - Maximum traversal depth
     * @returns {Array<MemoryNode>} List of visited nodes (excluding start node)
     */
    traverse(startId, linkTypes = null, maxDepth = 1) {
        const visited = new Set();
        const results = [];
        const queue = [{ id: startId, depth: 0 }];

        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift();

            if (current.depth >= maxDepth) continue;

            const node = this.nodes.get(current.id);
            if (!node) continue;

            for (const conn of node.connections) {
                // Filter by type if specified
                if (linkTypes && !linkTypes.includes(conn.type)) continue;

                if (!visited.has(conn.targetId)) {
                    visited.add(conn.targetId);
                    const targetNode = this.nodes.get(conn.targetId);
                    if (targetNode) {
                        results.push(targetNode);
                        queue.push({ id: conn.targetId, depth: current.depth + 1 });
                    }
                }
            }
        }

        return results;
    }

    /**
     * Serialize the entire graph to JSON
     * @returns {string}
     */
    serialize() {
        const data = Array.from(this.nodes.values()).map(node => node.toJSON());
        return JSON.stringify(data, null, 2);
    }

    /**
     * Reconstruct graph from JSON
     * @param {string} json
     */
    deserialize(json) {
        const data = JSON.parse(json);
        this.nodes.clear();
        for (const item of data) {
            const node = MemoryNode.fromJSON(item);
            this.nodes.set(node.id, node);
        }
    }
}

module.exports = MemoryGraph;

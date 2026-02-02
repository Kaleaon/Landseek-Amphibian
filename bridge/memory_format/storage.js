/**
 * Memory Persistence
 *
 * Handles saving and loading the memory graph to/from disk.
 */

const fs = require('fs');
const path = require('path');
const MemoryGraph = require('./graph');

class MemoryStorage {
    constructor(filePath) {
        this.filePath = filePath;
    }

    /**
     * Save the memory graph to disk
     * @param {MemoryGraph} graph
     */
    async save(graph) {
        try {
            const json = graph.serialize();
            await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
            await fs.promises.writeFile(this.filePath, json, 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save memory graph:', error);
            return false;
        }
    }

    /**
     * Load the memory graph from disk
     * @returns {Promise<MemoryGraph>}
     */
    async load() {
        const graph = new MemoryGraph();
        try {
            if (fs.existsSync(this.filePath)) {
                const json = await fs.promises.readFile(this.filePath, 'utf8');
                graph.deserialize(json);
            }
        } catch (error) {
            console.error('Failed to load memory graph:', error);
        }
        return graph;
    }
}

module.exports = MemoryStorage;

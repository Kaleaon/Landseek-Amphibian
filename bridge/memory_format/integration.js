/**
 * RAG Integration Helpers
 *
 * Utilities to convert between the structured memory format and
 * the flat RAG chunk format used by the Android LocalRAGService.
 */

const { MemoryNode } = require('./models');

class RAGIntegration {
    /**
     * Convert a MemoryNode to a RAG Service compatible object
     * @param {MemoryNode} node
     * @returns {Object} { id, text, embedding, timestamp }
     */
    static toRAGChunk(node) {
        return {
            id: node.id,
            text: node.content,
            embedding: node.embedding,
            timestamp: node.createdAt
        };
    }

    /**
     * Create a MemoryNode from a RAG Service chunk
     * @param {Object} chunk { id, text, embedding, timestamp }
     * @returns {MemoryNode}
     */
    static fromRAGChunk(chunk) {
        return new MemoryNode({
            id: chunk.id,
            content: chunk.text,
            embedding: chunk.embedding,
            createdAt: chunk.timestamp,
            lastAccessed: chunk.timestamp
        });
    }

    /**
     * Batch convert MemoryNodes to RAG chunks
     * @param {Array<MemoryNode>} nodes
     * @returns {Array<Object>}
     */
    static toRAGChunks(nodes) {
        return nodes.map(node => this.toRAGChunk(node));
    }
}

module.exports = RAGIntegration;

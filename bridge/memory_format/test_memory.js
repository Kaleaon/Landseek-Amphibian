const { MemoryGraph, MemoryStorage, CONNECTION_TYPES, RAGIntegration } = require('./index');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

async function runTests() {
    console.log('🧪 Starting Memory Format Tests...');

    // 1. Initialize Graph
    const graph = new MemoryGraph();
    console.log('✅ Graph initialized');

    // 2. Add Memories
    const mem1 = graph.addMemory("First memory", [0.1, 0.2, 0.3]);
    const mem2 = graph.addMemory("Second memory caused by first", [0.1, 0.2, 0.4]);
    const mem3 = graph.addMemory("Unrelated memory", [0.9, 0.9, 0.9]);

    if (graph.nodes.size !== 3) throw new Error('Failed to add memories');
    console.log('✅ Added 3 memories');

    // 3. Link Memories
    graph.linkMemories(mem1.id, mem2.id, CONNECTION_TYPES.CAUSAL);

    const m1 = graph.getMemory(mem1.id);
    if (m1.connections.length !== 1 || m1.connections[0].targetId !== mem2.id) {
        throw new Error('Failed to link memories');
    }
    console.log('✅ Linked memories');

    // 4. Traversal
    const results = graph.traverse(mem1.id);
    if (results.length !== 1 || results[0].id !== mem2.id) {
        throw new Error('Traversal failed');
    }
    console.log('✅ Traversal working');

    // 5. RAG Integration
    const chunk = RAGIntegration.toRAGChunk(mem1);
    if (chunk.id !== mem1.id || chunk.text !== mem1.content) {
        throw new Error('RAG export failed');
    }
    const memFromChunk = RAGIntegration.fromRAGChunk(chunk);
    if (memFromChunk.id !== mem1.id) {
        throw new Error('RAG import failed');
    }
    console.log('✅ RAG Integration working');

    // 6. Persistence
    const testFile = path.join(__dirname, 'test_graph.json');
    const storage = new MemoryStorage(testFile);

    await storage.save(graph);

    if (!fs.existsSync(testFile)) throw new Error('File not saved');

    const loadedGraph = await storage.load();
    if (loadedGraph.nodes.size !== 3) throw new Error('Failed to load graph nodes');

    const loadedMem1 = loadedGraph.getMemory(mem1.id);
    if (loadedMem1.connections.length !== 1) throw new Error('Failed to load connections');

    console.log('✅ Persistence working');

    // Cleanup
    fs.unlinkSync(testFile);
    console.log('🧹 Cleanup done');

    console.log('🎉 All tests passed!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});

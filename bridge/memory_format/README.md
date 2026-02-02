# Memory Format Module

This module implements a structured memory format for AI agent persistence. It goes beyond simple text logs by supporting vector embeddings, salience scores, and typed relationships between memories (temporal, causal, associative, etc.).

## Features

- **Structured Memory Nodes**: Each memory has a unique ID, content, timestamp, embedding vector, and salience score.
- **Typed Connections**: Link memories with semantic relationships:
    - `TEMPORAL`: Before, after, or during other events.
    - `CAUSAL`: Cause and effect relationships.
    - `ASSOCIATIVE`: Semantic similarity.
    - `ENTITY`: Related people, places, or things.
    - `SPATIAL`: Physical context location.
- **Graph Traversal**: Explore connected memories starting from a specific node.
- **Persistence**: Save and load the entire memory graph to a JSON file.
- **RAG Integration**: Helpers to convert between this rich format and the simpler format used by `LocalRAGService` on Android.

## Usage

### Basic Operations

```javascript
const { MemoryGraph, CONNECTION_TYPES } = require('./index');

const graph = new MemoryGraph();

// Add memories
const memory1 = graph.addMemory("User asked about the weather", [0.1, 0.2, ...]);
const memory2 = graph.addMemory("Weather API returned 'Sunny'", [0.1, 0.3, ...]);

// Link them
graph.linkMemories(memory1.id, memory2.id, CONNECTION_TYPES.CAUSAL);

// Retrieve
const mem = graph.getMemory(memory1.id);
console.log(mem.content);

// Traverse
const related = graph.traverse(memory1.id, [CONNECTION_TYPES.CAUSAL]);
console.log(related[0].content); // "Weather API returned 'Sunny'"
```

### Persistence

```javascript
const { MemoryStorage } = require('./index');

const storage = new MemoryStorage('./data/memory_graph.json');

// Save
await storage.save(graph);

// Load
const loadedGraph = await storage.load();
```

### RAG Integration

```javascript
const { RAGIntegration } = require('./index');

// Convert to RAG chunk for Android service
const ragChunk = RAGIntegration.toRAGChunk(memory1);
// { id, text, embedding, timestamp }
```

## Data Models

### MemoryNode

- `id`: UUID (v4)
- `content`: String
- `embedding`: Array<number>
- `salience`: Number (0.0 - 1.0)
- `createdAt`: Timestamp
- `lastAccessed`: Timestamp
- `connections`: Array<MemoryLink>

### MemoryLink

- `targetId`: UUID of target memory
- `type`: Connection type
- `weight`: Connection strength (0.0 - 1.0)
- `metadata`: Optional extra data

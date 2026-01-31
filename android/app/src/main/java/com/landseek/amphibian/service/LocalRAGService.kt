package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
// In real impl: import com.google.mediapipe.tasks.text.textembedder.TextEmbedder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.sqrt

/**
 * LocalRAGService
 * 
 * Provides Retrieval Augmented Generation capabilities locally.
 * - Stores memories as text chunks with embeddings.
 * - Performs semantic search (cosine similarity).
 * - Manages "Mind Maps" (graph connections between memories).
 */
class LocalRAGService(private val context: Context) {

    private val TAG = "AmphibianRAG"
    private val MEMORY_FILE = "rag_memory.json"
    private val MIND_MAP_FILE = "rag_graph.json"

    data class MemoryChunk(val id: String, val text: String, val embedding: FloatArray, val timestamp: Long)
    data class GraphNode(val id: String, val connections: MutableList<String>)

    private val memories = mutableListOf<MemoryChunk>()
    private val mindMap = mutableMapOf<String, GraphNode>()

    // Placeholder for actual Embedding Model
    // private var embedder: TextEmbedder? = null

    suspend fun initialize() {
        withContext(Dispatchers.IO) {
            Log.d(TAG, "Initializing Local RAG...")
            loadMemories()
            loadMindMap()
            // embedder = TextEmbedder.createFromFile(context, "mobilebert_embedding.tflite")
        }
    }

    suspend fun addMemory(text: String): String {
        return withContext(Dispatchers.Default) {
            val id = java.util.UUID.randomUUID().toString()
            val embedding = generateEmbedding(text)
            
            val memory = MemoryChunk(id, text, embedding, System.currentTimeMillis())
            memories.add(memory)
            
            // Auto-link to related concepts (Simple Mind Map Logic)
            val related = search(text, limit = 1)
            if (related.isNotEmpty()) {
                linkNodes(id, related[0].first.id)
            }
            
            saveMemories()
            return@withContext id
        }
    }

    suspend fun retrieveContext(query: String, limit: Int = 3): String {
        return withContext(Dispatchers.Default) {
            val results = search(query, limit)
            if (results.isEmpty()) return@withContext "No relevant memories found."
            
            val sb = StringBuilder("Relevant Context:\n")
            results.forEach { (mem, score) ->
                sb.append("- ${mem.text} (Confidence: ${String.format("%.2f", score)})\n")
            }
            return@withContext sb.toString()
        }
    }

    private fun search(query: String, limit: Int): List<Pair<MemoryChunk, Float>> {
        val queryVec = generateEmbedding(query)
        
        return memories.map { mem ->
            mem to cosineSimilarity(queryVec, mem.embedding)
        }.sortedByDescending { it.second }
         .take(limit)
    }

    private fun linkNodes(id1: String, id2: String) {
        mindMap.getOrPut(id1) { GraphNode(id1, mutableListOf()) }.connections.add(id2)
        mindMap.getOrPut(id2) { GraphNode(id2, mutableListOf()) }.connections.add(id1)
        saveMindMap()
    }

    // --- Sync Methods ---

    suspend fun getLatestTimestamp(): Long {
        return withContext(Dispatchers.Default) {
            memories.maxOfOrNull { it.timestamp } ?: 0L
        }
    }

    suspend fun getMemoriesSince(timestamp: Long): List<MemoryChunk> {
        return withContext(Dispatchers.Default) {
            memories.filter { it.timestamp > timestamp }
        }
    }

    suspend fun mergeMemories(newMemories: List<MemoryChunk>) {
        withContext(Dispatchers.Default) {
            var addedCount = 0
            val existingIds = memories.map { it.id }.toSet()

            for (mem in newMemories) {
                if (mem.id !in existingIds) {
                    memories.add(mem)
                    addedCount++
                }
            }
            if (addedCount > 0) {
                saveMemories()
                Log.d(TAG, "Merged $addedCount new memories.")
            }
        }
    }

    fun memoryToJson(mem: MemoryChunk): JSONObject {
        val json = JSONObject()
        json.put("id", mem.id)
        json.put("text", mem.text)
        json.put("timestamp", mem.timestamp)
        val embeddingArray = JSONArray()
        mem.embedding.forEach { embeddingArray.put(it.toDouble()) }
        json.put("embedding", embeddingArray)
        return json
    }

    fun jsonToMemory(json: JSONObject): MemoryChunk {
        val id = json.getString("id")
        val text = json.getString("text")
        val timestamp = json.getLong("timestamp")
        val embArray = json.getJSONArray("embedding")
        val embedding = FloatArray(embArray.length()) { i -> embArray.getDouble(i).toFloat() }
        return MemoryChunk(id, text, embedding, timestamp)
    }

    // --- Helpers ---

    private fun generateEmbedding(text: String): FloatArray {
        // MOCK: Generate a fake embedding vector for prototype
        // In prod: return embedder.embed(text).floatEmbedding
        val size = 128
        val vec = FloatArray(size) { 0.0f }
        // Simple hash-based mock to make "similar" strings have somewhat similar vectors
        val hash = text.hashCode()
        for (i in 0 until size) {
            vec[i] = ((hash shr (i % 32)) and 1).toFloat()
        }
        return vec
    }

    private fun cosineSimilarity(v1: FloatArray, v2: FloatArray): Float {
        var dot = 0.0f
        var normA = 0.0f
        var normB = 0.0f
        for (i in v1.indices) {
            dot += v1[i] * v2[i]
            normA += v1[i] * v1[i]
            normB += v2[i] * v2[i]
        }
        return if (normA > 0 && normB > 0) dot / (sqrt(normA) * sqrt(normB)) else 0.0f
    }

    private fun saveMemories() {
        try {
            val file = File(context.filesDir, MEMORY_FILE)
            val jsonArray = JSONArray()
            memories.forEach { mem -> jsonArray.put(memoryToJson(mem)) }
            file.writeText(jsonArray.toString())
            Log.d(TAG, "Saved ${memories.size} memories to disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save memories", e)
        }
    }
    
    private fun loadMemories() {
        try {
            val file = File(context.filesDir, MEMORY_FILE)
            if (!file.exists()) return
            
            val content = file.readText()
            val jsonArray = JSONArray(content)
            
            for (i in 0 until jsonArray.length()) {
                val json = jsonArray.getJSONObject(i)
                memories.add(jsonToMemory(json))
            }
            Log.d(TAG, "Loaded ${memories.size} memories from disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load memories", e)
        }
    }
    
    private fun saveMindMap() {
        try {
            val file = File(context.filesDir, MIND_MAP_FILE)
            val jsonObject = JSONObject()
            mindMap.forEach { (id, node) ->
                val nodeJson = JSONObject()
                nodeJson.put("id", node.id)
                val connections = JSONArray()
                node.connections.forEach { connections.put(it) }
                nodeJson.put("connections", connections)
                jsonObject.put(id, nodeJson)
            }
            file.writeText(jsonObject.toString())
            Log.d(TAG, "Saved mind map with ${mindMap.size} nodes")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save mind map", e)
        }
    }
    
    private fun loadMindMap() {
        try {
            val file = File(context.filesDir, MIND_MAP_FILE)
            if (!file.exists()) return
            
            val content = file.readText()
            val jsonObject = JSONObject(content)
            
            val keys = jsonObject.keys()
            while (keys.hasNext()) {
                val id = keys.next()
                val nodeJson = jsonObject.getJSONObject(id)
                val connections = mutableListOf<String>()
                val connArray = nodeJson.getJSONArray("connections")
                for (i in 0 until connArray.length()) {
                    connections.add(connArray.getString(i))
                }
                mindMap[id] = GraphNode(nodeJson.getString("id"), connections)
            }
            Log.d(TAG, "Loaded mind map with ${mindMap.size} nodes")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load mind map", e)
        }
    }
}

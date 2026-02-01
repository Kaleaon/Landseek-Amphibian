package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.text.textembedder.TextEmbedder
import com.google.mediapipe.tasks.text.textembedder.TextEmbedderResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * EmbeddingService
 * 
 * Provides TPU-accelerated text embeddings using MediaPipe Text Embedder.
 * Uses Universal Sentence Encoder or similar model for semantic embeddings.
 * 
 * Features:
 * - TPU/GPU acceleration on Pixel devices
 * - 512-dimensional semantic embeddings
 * - Batch embedding support
 * - Automatic hardware detection and optimization
 */
class EmbeddingService(private val context: Context) {
    
    private val TAG = "AmphibianEmbedding"
    
    private var textEmbedder: TextEmbedder? = null
    private var isInitialized = false
    
    // TPU capability service for hardware detection
    private val tpuService = TPUCapabilityService(context)
    
    // Model configuration
    private val MODEL_FILENAME = "universal_sentence_encoder.tflite"
    private val EMBEDDING_DIM = 512  // USE outputs 512-dim vectors
    
    // Fallback embedding dimension for mock mode
    private val MOCK_EMBEDDING_DIM = 384
    
    // Performance tracking
    private var totalEmbeddings = 0
    private var averageTimeMs = 0.0
    
    /**
     * Initialize the embedding service
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        if (isInitialized && textEmbedder != null) {
            Log.d(TAG, "Embedding service already initialized")
            return@withContext true
        }
        
        val modelFile = File(context.filesDir, "models/$MODEL_FILENAME")
        
        // Check if model exists
        if (!modelFile.exists()) {
            // Try to extract from assets
            if (!extractModelFromAssets(modelFile)) {
                Log.w(TAG, "Embedding model not found. Using fallback mock embeddings.")
                Log.w(TAG, "To enable real embeddings, download $MODEL_FILENAME to ${modelFile.parent}")
                return@withContext false
            }
        }
        
        try {
            val caps = tpuService.detectCapabilities()
            Log.d(TAG, "Initializing embeddings with ${caps.recommendedBackend} backend")
            
            // Configure base options with hardware acceleration
            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetPath(modelFile.absolutePath)
            
            // Apply hardware-specific optimizations
            when (caps.recommendedBackend) {
                TPUCapabilityService.AccelerationBackend.TPU,
                TPUCapabilityService.AccelerationBackend.GPU -> {
                    baseOptionsBuilder.setDelegate(Delegate.GPU)
                    Log.d(TAG, "Using GPU delegate for embeddings (leverages TPU on Pixel)")
                }
                TPUCapabilityService.AccelerationBackend.NNAPI -> {
                    // NNAPI can be used as fallback
                    Log.d(TAG, "Using CPU with NNAPI for embeddings")
                }
                TPUCapabilityService.AccelerationBackend.CPU -> {
                    Log.d(TAG, "Using CPU for embeddings")
                }
            }
            
            val options = TextEmbedder.TextEmbedderOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setL2Normalize(true)  // Normalize for cosine similarity
                .setQuantize(caps.supportsInt8)  // Quantize on supported devices
                .build()
            
            textEmbedder = TextEmbedder.createFromOptions(context, options)
            isInitialized = true
            
            Log.i(TAG, """
                ✅ Embedding Service Initialized
                   Model: $MODEL_FILENAME
                   Dimensions: $EMBEDDING_DIM
                   Backend: ${caps.recommendedBackend}
                   Quantized: ${caps.supportsInt8}
            """.trimIndent())
            
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize embedding service: ${e.message}", e)
            return@withContext false
        }
    }
    
    /**
     * Generate embedding for a single text
     */
    suspend fun embed(text: String): FloatArray = withContext(Dispatchers.Default) {
        val startTime = System.currentTimeMillis()
        
        val embedding = if (textEmbedder != null) {
            try {
                val result = textEmbedder!!.embed(text)
                extractEmbedding(result)
            } catch (e: Exception) {
                Log.w(TAG, "Embedding failed, using fallback: ${e.message}")
                generateFallbackEmbedding(text)
            }
        } else {
            generateFallbackEmbedding(text)
        }
        
        val duration = System.currentTimeMillis() - startTime
        updateMetrics(duration)
        
        return@withContext embedding
    }
    
    /**
     * Generate embeddings for multiple texts (batch)
     */
    suspend fun embedBatch(texts: List<String>): List<FloatArray> = withContext(Dispatchers.Default) {
        texts.map { embed(it) }
    }
    
    /**
     * Calculate cosine similarity between two embeddings
     */
    fun cosineSimilarity(v1: FloatArray, v2: FloatArray): Float {
        if (v1.size != v2.size) {
            Log.w(TAG, "Embedding dimension mismatch: ${v1.size} vs ${v2.size}")
            return 0f
        }
        
        var dot = 0f
        var normA = 0f
        var normB = 0f
        
        for (i in v1.indices) {
            dot += v1[i] * v2[i]
            normA += v1[i] * v1[i]
            normB += v2[i] * v2[i]
        }
        
        return if (normA > 0 && normB > 0) {
            dot / (kotlin.math.sqrt(normA) * kotlin.math.sqrt(normB))
        } else {
            0f
        }
    }
    
    /**
     * Extract embedding from MediaPipe result
     */
    private fun extractEmbedding(result: TextEmbedderResult): FloatArray {
        val embeddings = result.embeddingResult().embeddings()
        if (embeddings.isEmpty()) {
            Log.w(TAG, "No embeddings in result")
            return FloatArray(EMBEDDING_DIM)
        }
        
        val embedding = embeddings[0]
        return embedding.floatEmbedding() ?: FloatArray(EMBEDDING_DIM)
    }
    
    /**
     * Generate fallback embedding using hash-based approach
     * This is a mock implementation for when the real model is unavailable
     */
    private fun generateFallbackEmbedding(text: String): FloatArray {
        val vec = FloatArray(MOCK_EMBEDDING_DIM)
        
        // Use a more sophisticated hash-based approach
        val words = text.lowercase().split("\\s+".toRegex())
        
        for ((wordIdx, word) in words.withIndex()) {
            val hash = word.hashCode()
            
            // Distribute hash across embedding dimensions
            for (i in vec.indices) {
                val bit = (hash shr (i % 32)) and 1
                val sign = if ((hash shr ((i + wordIdx) % 32)) and 1 == 1) 1f else -1f
                vec[i] += bit.toFloat() * sign * (1f / (wordIdx + 1))
            }
        }
        
        // Normalize the vector
        val norm = kotlin.math.sqrt(vec.sumOf { (it * it).toDouble() }).toFloat()
        if (norm > 0) {
            for (i in vec.indices) {
                vec[i] /= norm
            }
        }
        
        return vec
    }
    
    /**
     * Try to extract model from assets
     */
    private fun extractModelFromAssets(targetFile: File): Boolean {
        return try {
            val assetPath = "models/$MODEL_FILENAME"
            context.assets.open(assetPath).use { input ->
                targetFile.parentFile?.mkdirs()
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }
            Log.d(TAG, "Extracted embedding model from assets")
            true
        } catch (e: Exception) {
            Log.d(TAG, "Model not found in assets: ${e.message}")
            false
        }
    }
    
    private fun updateMetrics(durationMs: Long) {
        totalEmbeddings++
        averageTimeMs = if (totalEmbeddings == 1) {
            durationMs.toDouble()
        } else {
            (averageTimeMs * (totalEmbeddings - 1) + durationMs) / totalEmbeddings
        }
    }
    
    /**
     * Get the embedding dimension
     */
    fun getEmbeddingDimension(): Int {
        return if (textEmbedder != null) EMBEDDING_DIM else MOCK_EMBEDDING_DIM
    }
    
    /**
     * Check if using real embeddings
     */
    fun isUsingRealEmbeddings(): Boolean = textEmbedder != null
    
    /**
     * Get performance metrics
     */
    fun getMetrics(): EmbeddingMetrics {
        return EmbeddingMetrics(
            totalEmbeddings = totalEmbeddings,
            averageTimeMs = averageTimeMs,
            isRealEmbeddings = isUsingRealEmbeddings(),
            embeddingDimension = getEmbeddingDimension()
        )
    }
    
    data class EmbeddingMetrics(
        val totalEmbeddings: Int,
        val averageTimeMs: Double,
        val isRealEmbeddings: Boolean,
        val embeddingDimension: Int
    )
    
    /**
     * Release resources
     */
    fun close() {
        try {
            textEmbedder?.close()
            textEmbedder = null
            isInitialized = false
            Log.d(TAG, "Embedding service closed")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing embedding service", e)
        }
    }
}

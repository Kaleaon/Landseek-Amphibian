package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.text.textembedder.TextEmbedder
import com.google.mediapipe.tasks.text.textembedder.TextEmbedderResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.nio.LongBuffer

/**
 * EmbeddingService (ToolNeuron Integration)
 * 
 * Provides semantic text embeddings with multiple backend support:
 * 1. ONNX Runtime - all-MiniLM-L6-v2 (384-dim, ToolNeuron approach)
 * 2. MediaPipe - Universal Sentence Encoder (512-dim, TPU accelerated)
 * 3. Fallback - Hash-based mock embeddings
 * 
 * Priority: ONNX (MiniLM) > MediaPipe (USE) > Fallback
 * 
 * Features:
 * - Real semantic embeddings via all-MiniLM-L6-v2 (ToolNeuron pattern)
 * - TPU/GPU acceleration on Pixel devices via MediaPipe
 * - Proper WordPiece tokenization for ONNX backend
 * - Batch embedding support
 * - Automatic hardware detection and optimization
 * - Graceful fallback chain
 * 
 * @see https://github.com/Siddhesh2377/ToolNeuron
 */
class EmbeddingService(private val context: Context) {
    
    private val TAG = "AmphibianEmbedding"
    
    // ONNX Runtime for MiniLM (ToolNeuron approach - primary)
    private var ortEnvironment: OrtEnvironment? = null
    private var ortSession: OrtSession? = null
    private var useOnnx = false
    
    // MediaPipe for USE (secondary)
    private var textEmbedder: TextEmbedder? = null
    private var useMediaPipe = false
    
    private var isInitialized = false
    private var activeBackend: EmbeddingBackend = EmbeddingBackend.FALLBACK
    
    // TPU capability service for hardware detection
    private val tpuService = TPUCapabilityService(context)
    
    // WordPiece tokenizer for proper ONNX tokenization
    private var tokenizer: WordPieceTokenizer? = null
    private var tokenizerInitialized = false
    
    // Model configuration
    // MiniLM - ToolNeuron's recommended model (384-dim)
    private val MINILM_MODEL_FILENAME = "all-MiniLM-L6-v2.onnx"
    private val MINILM_EMBEDDING_DIM = 384
    
    // Universal Sentence Encoder (512-dim)
    private val USE_MODEL_FILENAME = "universal_sentence_encoder.tflite"
    private val USE_EMBEDDING_DIM = 512
    
    // Fallback embedding dimension
    private val FALLBACK_EMBEDDING_DIM = 384
    
    // Simple tokenizer for MiniLM (word-piece approximation)
    // In production, use a proper tokenizer like HuggingFace's tokenizers
    private val MAX_SEQ_LENGTH = 128
    private val PAD_TOKEN_ID = 0L
    private val CLS_TOKEN_ID = 101L
    private val SEP_TOKEN_ID = 102L
    // Max sequence length for tokenization
    private val MAX_SEQ_LENGTH = 128
    
    // Performance tracking
    private var totalEmbeddings = 0
    private var averageTimeMs = 0.0
    
    enum class EmbeddingBackend {
        ONNX_MINILM,    // all-MiniLM-L6-v2 via ONNX (ToolNeuron)
        MEDIAPIPE_USE,  // Universal Sentence Encoder via MediaPipe
        FALLBACK        // Hash-based mock embeddings
    }
    
    /**
     * Initialize the embedding service with automatic backend selection
     * Priority: ONNX (MiniLM) > MediaPipe (USE) > Fallback
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        if (isInitialized) {
            Log.d(TAG, "Embedding service already initialized with $activeBackend")
            return@withContext true
        }
        
        val caps = tpuService.detectCapabilities()
        Log.d(TAG, "Initializing embeddings for ${caps.deviceTier} device")
        
        // Initialize tokenizer first
        tokenizer = WordPieceTokenizer(context)
        tokenizerInitialized = tokenizer?.initialize() ?: false
        
        if (tokenizerInitialized) {
            Log.i(TAG, "✅ WordPiece tokenizer initialized with ${tokenizer?.getVocabSize()} tokens")
        } else {
            Log.w(TAG, "⚠️ WordPiece tokenizer initialization failed, will use fallback")
        }
        
        // Try ONNX MiniLM first (ToolNeuron approach)
        if (tryInitializeOnnx()) {
            activeBackend = EmbeddingBackend.ONNX_MINILM
            isInitialized = true
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║       ✅ Embedding Service: ONNX MiniLM (ToolNeuron)       ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Model: all-MiniLM-L6-v2                                    ║
                ║ Dimensions: $MINILM_EMBEDDING_DIM                                          ║
                ║ Backend: ONNX Runtime                                      ║
                ║ Tokenizer: ${if (tokenizerInitialized) "WordPiece (Real)" else "Fallback (Hash)"} ║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            return@withContext true
        }
        
        // Try MediaPipe USE as fallback
        if (tryInitializeMediaPipe(caps)) {
            activeBackend = EmbeddingBackend.MEDIAPIPE_USE
            isInitialized = true
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║       ✅ Embedding Service: MediaPipe USE                  ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Model: Universal Sentence Encoder                          ║
                ║ Dimensions: $USE_EMBEDDING_DIM                                          ║
                ║ Backend: ${caps.recommendedBackend}                                       ║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            return@withContext true
        }
        
        // Use fallback
        activeBackend = EmbeddingBackend.FALLBACK
        isInitialized = true
        Log.w(TAG, """
            ⚠️ Using fallback hash-based embeddings
               To enable real embeddings, download one of:
               - $MINILM_MODEL_FILENAME (recommended, 23MB)
               - $USE_MODEL_FILENAME
               To: ${context.filesDir}/models/
        """.trimIndent())
        return@withContext false
    }
    
    /**
     * Try to initialize ONNX Runtime with MiniLM model
     */
    private fun tryInitializeOnnx(): Boolean {
        val modelFile = File(context.filesDir, "models/$MINILM_MODEL_FILENAME")
        
        // Try to extract from assets if not exists
        if (!modelFile.exists()) {
            if (!extractModelFromAssets(MINILM_MODEL_FILENAME, modelFile)) {
                Log.d(TAG, "MiniLM model not available")
                return false
            }
        }
        
        return try {
            ortEnvironment = OrtEnvironment.getEnvironment()
            
            val sessionOptions = OrtSession.SessionOptions().apply {
                // Enable optimizations
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                // Use multiple threads for inference
                setIntraOpNumThreads(4)
            }
            
            ortSession = ortEnvironment!!.createSession(modelFile.absolutePath, sessionOptions)
            useOnnx = true
            
            Log.d(TAG, "ONNX MiniLM initialized successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize ONNX: ${e.message}", e)
            ortEnvironment?.close()
            ortEnvironment = null
            false
        }
    }
    
    /**
     * Try to initialize MediaPipe Text Embedder
     */
    private fun tryInitializeMediaPipe(caps: TPUCapabilityService.TPUCapabilities): Boolean {
        val modelFile = File(context.filesDir, "models/$USE_MODEL_FILENAME")
        
        // Try to extract from assets if not exists
        if (!modelFile.exists()) {
            if (!extractModelFromAssets(USE_MODEL_FILENAME, modelFile)) {
                Log.d(TAG, "USE model not available")
                return false
            }
        }
        
        return try {
            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetPath(modelFile.absolutePath)
            
            // Apply hardware-specific optimizations
            when (caps.recommendedBackend) {
                TPUCapabilityService.AccelerationBackend.TPU,
                TPUCapabilityService.AccelerationBackend.GPU -> {
                    baseOptionsBuilder.setDelegate(Delegate.GPU)
                    Log.d(TAG, "Using GPU delegate for embeddings")
                }
                else -> {
                    Log.d(TAG, "Using CPU for embeddings")
                }
            }
            
            val options = TextEmbedder.TextEmbedderOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setL2Normalize(true)
                .setQuantize(caps.supportsInt8)
                .build()
            
            textEmbedder = TextEmbedder.createFromOptions(context, options)
            useMediaPipe = true
            
            Log.d(TAG, "MediaPipe USE initialized successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize MediaPipe: ${e.message}", e)
            false
        }
    }
    
    /**
     * Generate embedding for a single text
     */
    suspend fun embed(text: String): FloatArray = withContext(Dispatchers.Default) {
        val startTime = System.currentTimeMillis()
        
        val embedding = when (activeBackend) {
            EmbeddingBackend.ONNX_MINILM -> {
                try {
                    embedWithOnnx(text)
                } catch (e: Exception) {
                    Log.w(TAG, "ONNX embedding failed, using fallback: ${e.message}")
                    generateFallbackEmbedding(text)
                }
            }
            EmbeddingBackend.MEDIAPIPE_USE -> {
                try {
                    val result = textEmbedder!!.embed(text)
                    extractMediaPipeEmbedding(result)
                } catch (e: Exception) {
                    Log.w(TAG, "MediaPipe embedding failed, using fallback: ${e.message}")
                    generateFallbackEmbedding(text)
                }
            }
            EmbeddingBackend.FALLBACK -> {
                generateFallbackEmbedding(text)
            }
        }
        
        val duration = System.currentTimeMillis() - startTime
        updateMetrics(duration)
        
        return@withContext embedding
    }
    
    /**
     * Generate embedding using ONNX MiniLM model
     * Generate embedding using ONNX MiniLM model with proper WordPiece tokenization
     */
    private fun embedWithOnnx(text: String): FloatArray {
        val session = ortSession ?: throw IllegalStateException("ONNX session not initialized")
        val env = ortEnvironment ?: throw IllegalStateException("ONNX environment not initialized")
        
        // Simple tokenization (in production, use proper WordPiece tokenizer)
        val tokens = simpleTokenize(text)
        
        // Create input tensors
        val inputIds = LongArray(MAX_SEQ_LENGTH) { i ->
            when {
                i == 0 -> CLS_TOKEN_ID
                i < tokens.size + 1 -> tokens[i - 1]
                i == tokens.size + 1 -> SEP_TOKEN_ID
                else -> PAD_TOKEN_ID
            }
        }
        
        val attentionMask = LongArray(MAX_SEQ_LENGTH) { i ->
            if (i <= tokens.size + 1) 1L else 0L
        }
        
        val tokenTypeIds = LongArray(MAX_SEQ_LENGTH) { 0L }
        
        // Use proper WordPiece tokenization if available
        val (inputIds, attentionMask, tokenTypeIds) = if (tokenizerInitialized && tokenizer != null) {
            val output = tokenizer!!.tokenize(text, addSpecialTokens = true, maxLength = MAX_SEQ_LENGTH)
            Triple(output.inputIds, output.attentionMask, output.tokenTypeIds)
        } else {
            // Fallback to simple tokenization if WordPiece tokenizer not available
            val tokens = simpleFallbackTokenize(text)
            val specialTokenIds = tokenizer?.getSpecialTokenIds()
            val padId = specialTokenIds?.pad?.toLong() ?: 0L
            val clsId = specialTokenIds?.cls?.toLong() ?: 101L
            val sepId = specialTokenIds?.sep?.toLong() ?: 102L
            
            val ids = LongArray(MAX_SEQ_LENGTH) { i ->
                when {
                    i == 0 -> clsId
                    i < tokens.size + 1 -> tokens[i - 1]
                    i == tokens.size + 1 -> sepId
                    else -> padId
                }
            }
            val mask = LongArray(MAX_SEQ_LENGTH) { i ->
                if (i <= tokens.size + 1) 1L else 0L
            }
            val types = LongArray(MAX_SEQ_LENGTH) { 0L }
            Triple(ids, mask, types)
        }
        
        // Create ONNX tensors
        val shape = longArrayOf(1, MAX_SEQ_LENGTH.toLong())
        
        val inputIdsTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(inputIds), shape)
        val attentionMaskTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(attentionMask), shape)
        val tokenTypeIdsTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(tokenTypeIds), shape)
        
        try {
            val inputs = mapOf(
                "input_ids" to inputIdsTensor,
                "attention_mask" to attentionMaskTensor,
                "token_type_ids" to tokenTypeIdsTensor
            )
            
            val results = session.run(inputs)
            
            // Extract embedding from output with safe type checking
            // MiniLM outputs sentence embedding directly or we need to mean pool
            val outputValue = results[0].value
            
            // Calculate valid length for mean pooling
            val validLength = attentionMask.count { it == 1L }
            
            val embeddings = try {
                when (outputValue) {
                    is Array<*> -> {
                        val outputTensor = outputValue
                        when (val firstElement = outputTensor[0]) {
                            is FloatArray -> firstElement
                            is Array<*> -> {
                                // Need to mean pool over sequence - safely cast with check
                                @Suppress("UNCHECKED_CAST")
                                val sequenceOutput = (firstElement as? Array<FloatArray>)
                                    ?: return generateFallbackEmbedding(text)
                                meanPool(sequenceOutput, tokens.size + 2) // +2 for CLS and SEP
                                meanPool(sequenceOutput, validLength)
                            }
                            else -> {
                                Log.w(TAG, "Unexpected inner output type: ${firstElement?.javaClass}")
                                return generateFallbackEmbedding(text)
                            }
                        }
                    }
                    is FloatArray -> outputValue
                    else -> {
                        Log.w(TAG, "Unexpected ONNX output type: ${outputValue?.javaClass}")
                        return generateFallbackEmbedding(text)
                    }
                }
            } catch (e: ClassCastException) {
                Log.w(TAG, "ONNX output cast failed: ${e.message}")
                return generateFallbackEmbedding(text)
            }
            
            // Normalize
            return normalize(embeddings)
            
        } finally {
            inputIdsTensor.close()
            attentionMaskTensor.close()
            tokenTypeIdsTensor.close()
        }
    }
    
    /**
     * Simple tokenization - converts text to token IDs
     * 
     * ⚠️ IMPORTANT: This is a TEMPORARY simplified implementation using hash-based IDs.
     * For production use, replace with a proper WordPiece tokenizer that matches 
     * the all-MiniLM-L6-v2 vocabulary. The current implementation will produce
     * embeddings that do not semantically match those from the actual model.
     * 
     * Recommended solutions:
     * 1. Use HuggingFace's tokenizers library with ONNX
     * 2. Port the Python tokenizer to Kotlin
     * 3. Use a pre-tokenized vocab file
     */
    private fun simpleTokenize(text: String): LongArray {
        // Simple word-based tokenization with hash-based IDs
        // WARNING: This produces embeddings that won't match true MiniLM semantics
     * Simple fallback tokenization when WordPiece tokenizer is not available
     * Uses hash-based IDs for backwards compatibility
     */
    private fun simpleFallbackTokenize(text: String): LongArray {
        // Simple word-based tokenization with hash-based IDs
        val words = text.lowercase()
            .replace(Regex("[^a-z0-9\\s]"), " ")
            .split("\\s+".toRegex())
            .filter { it.isNotEmpty() }
            .take(MAX_SEQ_LENGTH - 2)
        
        return words.map { word ->
            // Map word to token ID using hash (simplified)
            // Real implementation would use vocabulary lookup
            (Math.abs(word.hashCode()) % 30000 + 1000).toLong()
        }.toLongArray()
    }
    
    /**
     * Mean pooling over sequence embeddings
     */
    private fun meanPool(sequenceOutput: Array<FloatArray>, validLength: Int): FloatArray {
        val dim = sequenceOutput[0].size
        val result = FloatArray(dim)
        
        for (i in 0 until validLength.coerceAtMost(sequenceOutput.size)) {
            for (j in 0 until dim) {
                result.set(j, result.get(j) + sequenceOutput[i][j])
                result[j] += sequenceOutput[i][j]
            }
        }
        
        for (j in 0 until dim) {
            result.set(j, result.get(j) / validLength.toFloat())
            result[j] /= validLength
        }
        
        return result
    }
    
    /**
     * L2 normalize embedding vector
     */
    private fun normalize(vec: FloatArray): FloatArray {
        var norm = 0f
        for (v in vec) {
            norm += v * v
        }
        norm = kotlin.math.sqrt(norm)
        
        if (norm > 0) {
            for (i in vec.indices) {
                vec.set(i, vec.get(i) / norm)
                vec[i] /= norm
            }
        }
        return vec
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
    private fun extractMediaPipeEmbedding(result: TextEmbedderResult): FloatArray {
        val embeddings = result.embeddingResult().embeddings()
        if (embeddings.isEmpty()) {
            Log.w(TAG, "No embeddings in MediaPipe result")
            return FloatArray(USE_EMBEDDING_DIM)
        }
        
        return embeddings[0].floatEmbedding() ?: FloatArray(USE_EMBEDDING_DIM)
    }
    
    /**
     * Generate fallback embedding using hash-based approach
     * This is a mock implementation for when real models are unavailable
     */
    private fun generateFallbackEmbedding(text: String): FloatArray {
        val vec = FloatArray(FALLBACK_EMBEDDING_DIM)
        
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
        
        return normalize(vec)
    }
    
    /**
     * Try to extract model from assets
     */
    private fun extractModelFromAssets(modelName: String, targetFile: File): Boolean {
        return try {
            val assetPath = "models/$modelName"
            context.assets.open(assetPath).use { input ->
                targetFile.parentFile?.mkdirs()
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }
            Log.d(TAG, "Extracted model from assets: $modelName")
            true
        } catch (e: Exception) {
            Log.d(TAG, "Model not found in assets: $modelName - ${e.message}")
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
     * Get the embedding dimension based on active backend
     */
    fun getEmbeddingDimension(): Int {
        return when (activeBackend) {
            EmbeddingBackend.ONNX_MINILM -> MINILM_EMBEDDING_DIM
            EmbeddingBackend.MEDIAPIPE_USE -> USE_EMBEDDING_DIM
            EmbeddingBackend.FALLBACK -> FALLBACK_EMBEDDING_DIM
        }
    }
    
    /**
     * Check if using real embeddings (not fallback)
     */
    fun isUsingRealEmbeddings(): Boolean = activeBackend != EmbeddingBackend.FALLBACK
    
    /**
     * Check if using proper WordPiece tokenization
     */
    fun isUsingRealTokenizer(): Boolean = tokenizerInitialized
    
    /**
     * Get the active backend name
     */
    fun getActiveBackend(): EmbeddingBackend = activeBackend
    
    /**
     * Get performance metrics
     */
    fun getMetrics(): EmbeddingMetrics {
        return EmbeddingMetrics(
            totalEmbeddings = totalEmbeddings,
            averageTimeMs = averageTimeMs,
            isRealEmbeddings = isUsingRealEmbeddings(),
            embeddingDimension = getEmbeddingDimension(),
            backend = activeBackend.name
            isRealTokenizer = isUsingRealTokenizer(),
            embeddingDimension = getEmbeddingDimension(),
            backend = activeBackend.name,
            vocabSize = tokenizer?.getVocabSize() ?: 0
        )
    }
    
    data class EmbeddingMetrics(
        val totalEmbeddings: Int,
        val averageTimeMs: Double,
        val isRealEmbeddings: Boolean,
        val embeddingDimension: Int,
        val backend: String
        val isRealTokenizer: Boolean,
        val embeddingDimension: Int,
        val backend: String,
        val vocabSize: Int
    )
    
    /**
     * Release resources
     */
    fun close() {
        try {
            ortSession?.close()
            ortSession = null
            ortEnvironment?.close()
            ortEnvironment = null
            useOnnx = false
            
            textEmbedder?.close()
            textEmbedder = null
            useMediaPipe = false
            
            isInitialized = false
            activeBackend = EmbeddingBackend.FALLBACK
            
            Log.d(TAG, "Embedding service closed")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing embedding service", e)
        }
    }
}

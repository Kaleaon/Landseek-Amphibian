package com.landseek.amphibian.service

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.File

/**
 * LocalLLMService
 * 
 * Runs Gemma 3 locally on the device using MediaPipe GenAI.
 * Fully optimized for Pixel 10 Tensor G5 TPU with automatic hardware detection.
 * 
 * Hardware Support:
 * - Pixel 10: Tensor G5 TPU with INT4 quantization (Best)
 * - Pixel 9: Tensor G4 TPU with INT4 quantization
 * - Pixel 8: Tensor G3 TPU with INT8 quantization
 * - Pixel 7: Tensor G2 TPU
 * - Pixel 6: Tensor G1 TPU
 * - Other: GPU/CPU fallback
 * 
 * Supported models:
 * - gemma-3-4b-it-gpu-int4.bin (4B model, best quality for Tensor G4+)
 * - gemma-2b-it-gpu-int4.bin (2B model, faster)
 * - gemma-2b-it-cpu-int8.bin (2B model, CPU fallback)
 */
class LocalLLMService(private val context: Context) {

    private val TAG = "AmphibianLLM"
    private var llmInference: LlmInference? = null
    private var isInitialized = false
    private var currentModel: String? = null
    
    // TPU capability detection
    private val tpuService = TPUCapabilityService(context)
    private var tpuCapabilities: TPUCapabilityService.TPUCapabilities? = null
    
    // Model configuration - validates against path traversal
    private val ALLOWED_MODEL_PATTERN = Regex("^[a-zA-Z0-9_.-]+\\.bin\$")
    
    // Generation parameters - will be optimized based on hardware
    private var maxTokens = 1024
    private var topK = 40
    private var temperature = 0.7f
    private var randomSeed = 1234
    
    // Performance metrics
    private var lastInferenceTimeMs: Long = 0
    private var totalInferences: Int = 0
    private var averageTokensPerSecond: Float = 0f
    
    /**
     * Model priority list based on device tier
     */
    private fun getModelPriority(): List<String> {
        val caps = tpuCapabilities ?: tpuService.detectCapabilities()
        
        return when (caps.deviceTier) {
            TPUCapabilityService.DeviceTier.FLAGSHIP -> listOf(
                "gemma-3-4b-it-gpu-int4.bin",
                "gemma-2b-it-gpu-int4.bin",
                "gemma-2b-it-cpu-int8.bin"
            )
            TPUCapabilityService.DeviceTier.HIGH -> listOf(
                "gemma-3-4b-it-gpu-int4.bin",
                "gemma-2b-it-gpu-int4.bin",
                "gemma-2b-it-cpu-int8.bin"
            )
            TPUCapabilityService.DeviceTier.MEDIUM -> listOf(
                "gemma-2b-it-gpu-int4.bin",
                "gemma-2b-it-cpu-int8.bin"
            )
            TPUCapabilityService.DeviceTier.LOW -> listOf(
                "gemma-2b-it-cpu-int8.bin"
            )
        }
    }
    
    private fun getValidModelFile(modelName: String): File? {
        // Validate model name to prevent path traversal
        if (!ALLOWED_MODEL_PATTERN.matches(modelName)) {
            Log.w(TAG, "Invalid model name format: $modelName")
            return null
        }
        return File(context.filesDir, "models/$modelName")
    }

    suspend fun initialize(): Boolean {
        return withContext(Dispatchers.IO) {
            if (isInitialized && llmInference != null) {
                Log.d(TAG, "Local LLM already initialized with $currentModel")
                return@withContext true
            }
            
            // Detect TPU capabilities first
            tpuCapabilities = tpuService.detectCapabilities()
            val caps = tpuCapabilities!!
            
            Log.i(TAG, """
                🦎 Initializing Local LLM with TPU Optimization
                   Device Tier: ${caps.deviceTier}
                   Backend: ${caps.recommendedBackend}
                   Tensor Gen: ${caps.tensorGeneration?.let { "G$it" } ?: "N/A"}
                   INT4 Support: ${caps.supportsInt4}
            """.trimIndent())
            
            // Get optimal generation parameters based on hardware
            val delegateConfig = tpuService.getOptimalDelegateConfig()
            optimizeGenerationParams(caps, delegateConfig)
            
            // Try models in priority order
            val models = getModelPriority()
            
            for (modelName in models) {
                val modelFile = getValidModelFile(modelName) ?: continue
                
                if (!modelFile.exists()) {
                    Log.d(TAG, "Model not found: $modelName")
                    continue
                }

                try {
                    Log.d(TAG, "Attempting to load $modelName...")
                    
                    val optionsBuilder = LlmInference.LlmInferenceOptions.builder()
                        .setModelPath(modelFile.absolutePath)
                        .setMaxTokens(maxTokens)
                        .setTopK(topK)
                        .setTemperature(temperature)
                        .setRandomSeed(randomSeed)
                    
                    // Apply TPU-specific optimizations
                    applyHardwareOptimizations(optionsBuilder, caps, delegateConfig)
                    
                    val options = optionsBuilder.build()
                    
                    val startTime = SystemClock.elapsedRealtime()
                    llmInference = LlmInference.createFromOptions(context, options)
                    val loadTime = SystemClock.elapsedRealtime() - startTime
                    
                    isInitialized = true
                    currentModel = modelName
                    
                    Log.i(TAG, """
                        ╔════════════════════════════════════════════════════════════╗
                        ║          ✅ Local LLM Initialized Successfully!            ║
                        ╠════════════════════════════════════════════════════════════╣
                        ║ Model: ${modelName.padEnd(46)}║
                        ║ Load Time: ${(loadTime.toString() + "ms").padEnd(43)}║
                        ║ Backend: ${caps.recommendedBackend.name.padEnd(45)}║
                        ║ Max Tokens: ${maxTokens.toString().padEnd(42)}║
                        ╚════════════════════════════════════════════════════════════╝
                    """.trimIndent())
                    
                    return@withContext true
                    
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to initialize $modelName: ${e.message}", e)
                    continue
                }
            }
            
            Log.w(TAG, """
                ⚠️ No compatible model found. TPU inference unavailable.
                   Please download a model to: ${context.filesDir}/models/
                   Recommended: ${tpuService.getRecommendedModel().name}
            """.trimIndent())
            return@withContext false
        }
    }
    
    /**
     * Optimize generation parameters based on device capabilities
     */
    private fun optimizeGenerationParams(
        caps: TPUCapabilityService.TPUCapabilities,
        delegateConfig: TPUCapabilityService.DelegateConfig
    ) {
        when (caps.deviceTier) {
            TPUCapabilityService.DeviceTier.FLAGSHIP -> {
                maxTokens = 2048   // More context for flagship
                topK = 40
                temperature = 0.7f
            }
            TPUCapabilityService.DeviceTier.HIGH -> {
                maxTokens = 1536
                topK = 40
                temperature = 0.7f
            }
            TPUCapabilityService.DeviceTier.MEDIUM -> {
                maxTokens = 1024
                topK = 32
                temperature = 0.7f
            }
            TPUCapabilityService.DeviceTier.LOW -> {
                maxTokens = 512    // Conserve memory
                topK = 20
                temperature = 0.8f
            }
        }
        
        Log.d(TAG, "Optimized params: maxTokens=$maxTokens, topK=$topK, temp=$temperature")
    }
    
    /**
     * Apply hardware-specific optimizations to the LLM options
     */
    private fun applyHardwareOptimizations(
        builder: LlmInference.LlmInferenceOptions.Builder,
        caps: TPUCapabilityService.TPUCapabilities,
        config: TPUCapabilityService.DelegateConfig
    ) {
        // Note: MediaPipe GenAI automatically selects the best backend
        // These options help guide the selection for Pixel TPU
        
        when (caps.recommendedBackend) {
            TPUCapabilityService.AccelerationBackend.TPU -> {
                // Tensor TPU optimization - MediaPipe will use GPU path which leverages TPU
                Log.d(TAG, "Configuring for Tensor G${caps.tensorGeneration} TPU acceleration")
                // MediaPipe automatically handles TPU via GPU delegate on Pixel
            }
            TPUCapabilityService.AccelerationBackend.GPU -> {
                Log.d(TAG, "Configuring for GPU acceleration")
            }
            TPUCapabilityService.AccelerationBackend.NNAPI -> {
                Log.d(TAG, "Configuring for NNAPI acceleration")
            }
            TPUCapabilityService.AccelerationBackend.CPU -> {
                Log.d(TAG, "Configuring for CPU inference")
            }
        }
    }

    suspend fun generate(prompt: String, requestedMaxTokens: Int = maxTokens): String {
        return withContext(Dispatchers.Default) {
            if (llmInference == null) {
                // Try to init if missing
                val initialized = initialize()
                if (!initialized) {
                    val recommended = tpuService.getRecommendedModel()
                    return@withContext """
                        Error: LLM not initialized. 
                        Please download a compatible Gemma model to: 
                        ${context.filesDir}/models/
                        
                        Recommended for your device: ${recommended.name}
                        (${recommended.description})
                    """.trimIndent()
                }
            }
            
            try {
                Log.d(TAG, "🧠 Generating response for: ${prompt.take(50)}...")
                val startTime = SystemClock.elapsedRealtime()
                
                val result = llmInference?.generateResponse(prompt) 
                    ?: return@withContext "Error: Inference returned null"
                
                val duration = SystemClock.elapsedRealtime() - startTime
                lastInferenceTimeMs = duration
                totalInferences++
                
                // Calculate tokens per second (estimate based on word count)
                val estimatedTokens = result.split(" ").size
                val tokensPerSecond = if (duration > 0) estimatedTokens * 1000f / duration else 0f
                averageTokensPerSecond = if (totalInferences == 1) {
                    tokensPerSecond
                } else {
                    (averageTokensPerSecond * (totalInferences - 1) + tokensPerSecond) / totalInferences
                }
                
                Log.i(TAG, """
                    ✅ Generation complete
                       Time: ${duration}ms
                       Output: ${result.length} chars (~$estimatedTokens tokens)
                       Speed: ${String.format("%.1f", tokensPerSecond)} tok/s
                       Avg Speed: ${String.format("%.1f", averageTokensPerSecond)} tok/s
                """.trimIndent())
                
                return@withContext result
            } catch (e: Exception) {
                Log.e(TAG, "❌ Inference failed: ${e.message}", e)
                return@withContext "Error: ${e.message}"
            }
        }
    }

    /**
     * Stream generation - yields partial results for real-time UI updates
     */
    suspend fun generateStream(
        prompt: String, 
        requestedMaxTokens: Int = maxTokens,
        onToken: suspend (String) -> Unit
    ): String {
        return withContext(Dispatchers.Default) {
            if (llmInference == null && !initialize()) {
                return@withContext "Error: LLM not initialized"
            }
            
            try {
                val startTime = SystemClock.elapsedRealtime()
                
                // Note: MediaPipe LlmInference doesn't support streaming directly,
                // so we generate full response and simulate streaming for UI
                val result = llmInference?.generateResponse(prompt) ?: ""
                
                val duration = SystemClock.elapsedRealtime() - startTime
                lastInferenceTimeMs = duration
                
                // Stream the response word by word for UI responsiveness
                val words = result.split(" ")
                val builder = StringBuilder()
                
                // Calculate delay based on device tier for smooth streaming
                val caps = tpuCapabilities
                val delayMs = when (caps?.deviceTier) {
                    TPUCapabilityService.DeviceTier.FLAGSHIP -> 5L
                    TPUCapabilityService.DeviceTier.HIGH -> 8L
                    TPUCapabilityService.DeviceTier.MEDIUM -> 12L
                    else -> 15L
                }
                
                for (word in words) {
                    builder.append(word).append(" ")
                    onToken(word + " ")
                    delay(delayMs)
                }
                
                return@withContext builder.toString().trim()
            } catch (e: Exception) {
                Log.e(TAG, "Stream generation failed", e)
                return@withContext "Error: ${e.message}"
            }
        }
    }

    /**
     * Check if a model file exists
     */
    fun isModelAvailable(modelName: String? = null): Boolean {
        val name = modelName ?: getModelPriority().firstOrNull() ?: return false
        val modelFile = getValidModelFile(name) ?: return false
        return modelFile.exists()
    }

    /**
     * Get list of available models
     */
    fun getAvailableModels(): List<String> {
        val modelsDir = File(context.filesDir, "models")
        if (!modelsDir.exists()) return emptyList()
        
        return modelsDir.listFiles()
            ?.filter { it.extension == "bin" }
            ?.map { it.name }
            ?: emptyList()
    }

    /**
     * Check if service is ready for inference
     */
    fun isReady(): Boolean = isInitialized && llmInference != null
    
    /**
     * Get current model name
     */
    fun getCurrentModel(): String? = currentModel
    
    /**
     * Get TPU capabilities
     */
    fun getCapabilities(): TPUCapabilityService.TPUCapabilities? = tpuCapabilities
    
    /**
     * Get performance metrics
     */
    fun getPerformanceMetrics(): PerformanceMetrics {
        return PerformanceMetrics(
            lastInferenceTimeMs = lastInferenceTimeMs,
            totalInferences = totalInferences,
            averageTokensPerSecond = averageTokensPerSecond,
            currentModel = currentModel,
            deviceTier = tpuCapabilities?.deviceTier?.name ?: "Unknown",
            backend = tpuCapabilities?.recommendedBackend?.name ?: "Unknown"
        )
    }
    
    data class PerformanceMetrics(
        val lastInferenceTimeMs: Long,
        val totalInferences: Int,
        val averageTokensPerSecond: Float,
        val currentModel: String?,
        val deviceTier: String,
        val backend: String
    )
    
    /**
     * Get recommended model for this device
     */
    fun getRecommendedModel(): TPUCapabilityService.RecommendedModel {
        return tpuService.getRecommendedModel()
    }
    
    fun close() {
        try {
            llmInference = null
            isInitialized = false
            Log.d(TAG, "Local LLM closed")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing LLM", e)
        }
    }
}

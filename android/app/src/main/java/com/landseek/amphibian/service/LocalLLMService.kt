package com.landseek.amphibian.service

import android.content.Context
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
 * Optimized for Pixel TPU/GPU with automatic fallback.
 * 
 * Supported models:
 * - gemma-3-4b-it-gpu-int4.bin (4B model, best quality)
 * - gemma-2b-it-gpu-int4.bin (2B model, faster)
 */
class LocalLLMService(private val context: Context) {

    private val TAG = "AmphibianLLM"
    private var llmInference: LlmInference? = null
    private var isInitialized = false
    
    // Model configuration - validates against path traversal
    private val PRIMARY_MODEL = "gemma-3-4b-it-gpu-int4.bin"
    private val FALLBACK_MODEL = "gemma-2b-it-gpu-int4.bin"
    private val ALLOWED_MODEL_PATTERN = Regex("^[a-zA-Z0-9_.-]+\\.bin\$")
    
    // Generation parameters optimized for TPU
    private val MAX_TOKENS = 1024
    private val TOP_K = 40
    private val TEMPERATURE = 0.7f
    private val SEED = 1234
    
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
                Log.d(TAG, "Local LLM already initialized")
                return@withContext true
            }
            
            // Try primary model first, then fallback
            val models = listOf(PRIMARY_MODEL, FALLBACK_MODEL)
            
            for (modelName in models) {
                val modelFile = getValidModelFile(modelName) ?: continue
                
                if (!modelFile.exists()) {
                    Log.w(TAG, "Model file not found: ${modelFile.absolutePath}")
                    continue
                }

                try {
                    Log.d(TAG, "Initializing Local LLM with $modelName...")
                    
                    val options = LlmInference.LlmInferenceOptions.builder()
                        .setModelPath(modelFile.absolutePath)
                        .setMaxTokens(MAX_TOKENS)
                        .setTopK(TOP_K)
                        .setTemperature(TEMPERATURE)
                        .setRandomSeed(SEED)
                        .build()

                    llmInference = LlmInference.createFromOptions(context, options)
                    isInitialized = true
                    Log.d(TAG, "✅ Local LLM Initialized with $modelName! 🦎")
                    return@withContext true
                    
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to initialize $modelName: ${e.message}", e)
                    continue
                }
            }
            
            Log.w(TAG, "⚠️ No compatible model found. TPU inference unavailable.")
            return@withContext false
        }
    }

    suspend fun generate(prompt: String, maxTokens: Int = MAX_TOKENS): String {
        return withContext(Dispatchers.Default) {
            if (llmInference == null) {
                // Try to init if missing
                val initialized = initialize()
                if (!initialized) {
                    return@withContext "Error: LLM not initialized. Please download a compatible Gemma model to /data/data/com.landseek.amphibian/files/models/"
                }
            }
            
            try {
                Log.d(TAG, "🧠 Generating response for: ${prompt.take(50)}...")
                val startTime = System.currentTimeMillis()
                
                val result = llmInference?.generateResponse(prompt) 
                    ?: return@withContext "Error: Inference returned null"
                
                val duration = System.currentTimeMillis() - startTime
                Log.d(TAG, "✅ Generation complete in ${duration}ms (${result.length} chars)")
                
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
        maxTokens: Int = MAX_TOKENS,
        onToken: suspend (String) -> Unit
    ): String {
        return withContext(Dispatchers.Default) {
            if (llmInference == null && !initialize()) {
                return@withContext "Error: LLM not initialized"
            }
            
            try {
                // Note: MediaPipe LlmInference doesn't support streaming directly,
                // so we generate full response and simulate streaming for UI
                val result = llmInference?.generateResponse(prompt) ?: ""
                
                // Simulate streaming by yielding words
                val words = result.split(" ")
                val builder = StringBuilder()
                
                for (word in words) {
                    builder.append(word).append(" ")
                    onToken(word + " ")
                    // Small delay for visual effect
                    delay(10)
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
    fun isModelAvailable(modelName: String = PRIMARY_MODEL): Boolean {
        val modelFile = getValidModelFile(modelName) ?: return false
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

package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * LocalLLMService
 * 
 * Runs Gemma 3 locally on the device using MediaPipe GenAI.
 * Optimized for Pixel TPU/GPU.
 */
class LocalLLMService(private val context: Context) {

    private val TAG = "AmphibianLLM"
    private var llmInference: LlmInference? = null
    
    // Model Path (in app storage)
    private val MODEL_NAME = "gemma-2b-it-gpu-int4.bin"

    suspend fun initialize() {
        withContext(Dispatchers.IO) {
            val modelFile = File(context.filesDir, MODEL_NAME)
            if (!modelFile.exists()) {
                Log.w(TAG, "Model file not found: ${modelFile.absolutePath}")
                return@withContext
            }

            Log.d(TAG, "Initializing Local LLM (MediaPipe)...")
            val options = LlmInference.LlmInferenceOptions.builder()
                .setModelPath(modelFile.absolutePath)
                .setMaxTokens(1024)
                .setTopK(40)
                .setTemperature(0.7f)
                .setRandomSeed(1234)
                .build()

            llmInference = LlmInference.createFromOptions(context, options)
            Log.d(TAG, "Local LLM Initialized! 🦎")
        }
    }

    suspend fun generate(prompt: String): String {
        return withContext(Dispatchers.Default) {
            if (llmInference == null) {
                // Try to init if missing
                initialize()
                if (llmInference == null) return@withContext "Error: LLM not initialized. Model missing?"
            }
            
            try {
                Log.d(TAG, "Generating response for: ${prompt.take(50)}...")
                val result = llmInference?.generateResponse(prompt) ?: "Error: Inference returned null"
                Log.d(TAG, "Generation complete.")
                return@withContext result
            } catch (e: Exception) {
                Log.e(TAG, "Inference failed", e)
                return@withContext "Error: ${e.message}"
            }
        }
    }
    
    fun close() {
        // Cleanup native resources
        // llmInference?.close() // (If API supports it)
    }
}

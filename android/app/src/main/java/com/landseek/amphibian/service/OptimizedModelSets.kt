package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * OptimizedModelSets
 * 
 * Defines optimized AI model sets for different use cases and hardware tiers.
 * Each model set is tuned for specific tasks and device capabilities to maximize
 * performance while utilizing FULL OpenClaw distributed inference abilities.
 * 
 * Model Sets:
 * - FLAGSHIP_FULL: Full capability set for Pixel 10 / Tensor G5
 * - HIGH_PERFORMANCE: Optimized for Pixel 8-9 / Tensor G3-G4
 * - BALANCED: Good balance of quality and speed for mid-range devices
 * - EFFICIENCY: Optimized for battery and memory on lower-end devices
 * - DISTRIBUTED: Models optimized for OpenClaw collective inference
 * 
 * OpenClaw Integration:
 * - Automatic model distribution across connected ClawBots
 * - Collective inference pooling for complex tasks
 * - Gradient aggregation for distributed training
 * - Task routing based on device capabilities
 */
object OptimizedModelSets {

    private const val TAG = "AmphibianModelSets"
    
    /**
     * Model set types for different use cases
     */
    enum class ModelSetType {
        FLAGSHIP_FULL,      // Maximum capability for flagship devices
        HIGH_PERFORMANCE,   // High quality with good speed
        BALANCED,           // Balance quality/speed for mid-range
        EFFICIENCY,         // Battery/memory optimized
        DISTRIBUTED,        // OpenClaw collective inference
        CUSTOM              // User-defined configuration
    }
    
    /**
     * Task type for model selection
     */
    enum class TaskType {
        GENERAL_CHAT,       // General conversation
        CODE_ASSIST,        // Code generation/analysis
        DOCUMENT_ANALYSIS,  // RAG/document understanding
        VISION_TASKS,       // Image/video analysis
        VOICE_ASSISTANT,    // TTS/STT tasks
        COLLECTIVE_COMPUTE, // Distributed inference tasks
        TRAINING            // Model fine-tuning/training
    }
    
    /**
     * Single model configuration
     */
    data class ModelConfig(
        val name: String,
        val filename: String,
        val quantization: String,           // int4, int8, fp16, fp32
        val sizeBytes: Long,
        val minRamMB: Long,                 // Minimum RAM required
        val supportedBackends: List<String>, // tpu, gpu, nnapi, cpu
        val supportedTasks: List<TaskType>,
        val maxContextLength: Int,
        val recommendedTemperature: Float,
        val recommendedTopK: Int,
        val supportsStreaming: Boolean,
        val supportsOpenClaw: Boolean,       // Can be distributed via OpenClaw
        val priority: Int                    // Loading priority (lower = higher priority)
    )
    
    /**
     * Complete model set with multiple models for different tasks
     */
    data class ModelSet(
        val type: ModelSetType,
        val name: String,
        val description: String,
        val minDeviceTier: TPUCapabilityService.DeviceTier,
        val models: List<ModelConfig>,
        val defaultModel: String,           // Primary model for general use
        val openClawConfig: OpenClawConfig
    )
    
    /**
     * OpenClaw integration configuration
     */
    data class OpenClawConfig(
        val enableDistributedInference: Boolean,
        val enableCollectiveTraining: Boolean,
        val minPeersForDistributed: Int,
        val preferredTaskTypes: List<String>,
        val contributionWeight: Float        // How much to contribute vs receive
    )
    
    // ============== MODEL DEFINITIONS ==============
    
    // Flagship models (Gemma 3 4B variants)
    val GEMMA_3_4B_INT4 = ModelConfig(
        name = "Gemma 3 4B INT4",
        filename = "gemma-3-4b-it-gpu-int4.bin",
        quantization = "int4",
        sizeBytes = 2_500_000_000L,
        minRamMB = 8000,
        supportedBackends = listOf("tpu", "gpu"),
        supportedTasks = listOf(TaskType.GENERAL_CHAT, TaskType.CODE_ASSIST, TaskType.DOCUMENT_ANALYSIS),
        maxContextLength = 8192,
        recommendedTemperature = 0.7f,
        recommendedTopK = 40,
        supportsStreaming = true,
        supportsOpenClaw = true,
        priority = 1
    )
    
    val GEMMA_3_4B_INT8 = ModelConfig(
        name = "Gemma 3 4B INT8",
        filename = "gemma-3-4b-it-gpu-int8.bin",
        quantization = "int8",
        sizeBytes = 4_500_000_000L,
        minRamMB = 12000,
        supportedBackends = listOf("tpu", "gpu"),
        supportedTasks = listOf(TaskType.GENERAL_CHAT, TaskType.CODE_ASSIST, TaskType.DOCUMENT_ANALYSIS, TaskType.TRAINING),
        maxContextLength = 8192,
        recommendedTemperature = 0.7f,
        recommendedTopK = 40,
        supportsStreaming = true,
        supportsOpenClaw = true,
        priority = 2
    )
    
    // Mid-range models (Gemma 2B variants)
    val GEMMA_2B_INT4 = ModelConfig(
        name = "Gemma 2B INT4",
        filename = "gemma-2b-it-gpu-int4.bin",
        quantization = "int4",
        sizeBytes = 1_300_000_000L,
        minRamMB = 6000,
        supportedBackends = listOf("tpu", "gpu", "nnapi"),
        supportedTasks = listOf(TaskType.GENERAL_CHAT, TaskType.VOICE_ASSISTANT),
        maxContextLength = 4096,
        recommendedTemperature = 0.8f,
        recommendedTopK = 32,
        supportsStreaming = true,
        supportsOpenClaw = true,
        priority = 3
    )
    
    val GEMMA_2B_INT8 = ModelConfig(
        name = "Gemma 2B INT8",
        filename = "gemma-2b-it-cpu-int8.bin",
        quantization = "int8",
        sizeBytes = 2_000_000_000L,
        minRamMB = 4000,
        supportedBackends = listOf("cpu", "nnapi"),
        supportedTasks = listOf(TaskType.GENERAL_CHAT, TaskType.VOICE_ASSISTANT),
        maxContextLength = 2048,
        recommendedTemperature = 0.8f,
        recommendedTopK = 20,
        supportsStreaming = true,
        supportsOpenClaw = true,
        priority = 4
    )
    
    // Specialized models
    val CODE_LLAMA_INT4 = ModelConfig(
        name = "CodeLlama 7B INT4",
        filename = "codellama-7b-instruct-int4.bin",
        quantization = "int4",
        sizeBytes = 4_000_000_000L,
        minRamMB = 10000,
        supportedBackends = listOf("tpu", "gpu"),
        supportedTasks = listOf(TaskType.CODE_ASSIST),
        maxContextLength = 16384,
        recommendedTemperature = 0.4f,
        recommendedTopK = 50,
        supportsStreaming = true,
        supportsOpenClaw = true,
        priority = 5
    )
    
    val EMBEDDING_MINILM = ModelConfig(
        name = "MiniLM Embeddings",
        filename = "all-MiniLM-L6-v2.onnx",
        quantization = "fp16",
        sizeBytes = 23_000_000L,
        minRamMB = 2000,
        supportedBackends = listOf("onnx", "cpu"),
        supportedTasks = listOf(TaskType.DOCUMENT_ANALYSIS),
        maxContextLength = 512,
        recommendedTemperature = 0f,
        recommendedTopK = 0,
        supportsStreaming = false,
        supportsOpenClaw = false,
        priority = 1
    )
    
    // ============== MODEL SETS ==============
    
    val FLAGSHIP_FULL = ModelSet(
        type = ModelSetType.FLAGSHIP_FULL,
        name = "Flagship Full Capability",
        description = "Maximum AI capability for Pixel 10 / Tensor G5. Includes all model types for full OpenClaw integration.",
        minDeviceTier = TPUCapabilityService.DeviceTier.FLAGSHIP,
        models = listOf(GEMMA_3_4B_INT4, GEMMA_3_4B_INT8, CODE_LLAMA_INT4, GEMMA_2B_INT4, EMBEDDING_MINILM),
        defaultModel = "gemma-3-4b-it-gpu-int4.bin",
        openClawConfig = OpenClawConfig(
            enableDistributedInference = true,
            enableCollectiveTraining = true,
            minPeersForDistributed = 2,
            preferredTaskTypes = listOf("inference", "training_batch", "gradient_compute"),
            contributionWeight = 1.0f
        )
    )
    
    val HIGH_PERFORMANCE = ModelSet(
        type = ModelSetType.HIGH_PERFORMANCE,
        name = "High Performance",
        description = "Optimized for Pixel 8-9 / Tensor G3-G4. High quality with efficient inference.",
        minDeviceTier = TPUCapabilityService.DeviceTier.HIGH,
        models = listOf(GEMMA_3_4B_INT4, GEMMA_2B_INT4, EMBEDDING_MINILM),
        defaultModel = "gemma-3-4b-it-gpu-int4.bin",
        openClawConfig = OpenClawConfig(
            enableDistributedInference = true,
            enableCollectiveTraining = false,
            minPeersForDistributed = 3,
            preferredTaskTypes = listOf("inference", "embedding"),
            contributionWeight = 0.8f
        )
    )
    
    val BALANCED = ModelSet(
        type = ModelSetType.BALANCED,
        name = "Balanced",
        description = "Balance of quality and efficiency for mid-range devices. Good for everyday use.",
        minDeviceTier = TPUCapabilityService.DeviceTier.MEDIUM,
        models = listOf(GEMMA_2B_INT4, GEMMA_2B_INT8, EMBEDDING_MINILM),
        defaultModel = "gemma-2b-it-gpu-int4.bin",
        openClawConfig = OpenClawConfig(
            enableDistributedInference = true,
            enableCollectiveTraining = false,
            minPeersForDistributed = 4,
            preferredTaskTypes = listOf("inference", "validation"),
            contributionWeight = 0.5f
        )
    )
    
    val EFFICIENCY = ModelSet(
        type = ModelSetType.EFFICIENCY,
        name = "Efficiency",
        description = "Battery and memory optimized for lower-end devices. Prioritizes reliability.",
        minDeviceTier = TPUCapabilityService.DeviceTier.LOW,
        models = listOf(GEMMA_2B_INT8, EMBEDDING_MINILM),
        defaultModel = "gemma-2b-it-cpu-int8.bin",
        openClawConfig = OpenClawConfig(
            enableDistributedInference = true,  // Can still participate
            enableCollectiveTraining = false,
            minPeersForDistributed = 5,
            preferredTaskTypes = listOf("validation", "embedding"),
            contributionWeight = 0.3f
        )
    )
    
    val DISTRIBUTED = ModelSet(
        type = ModelSetType.DISTRIBUTED,
        name = "OpenClaw Distributed",
        description = "Optimized for distributed inference across multiple devices. Best for collective AI tasks.",
        minDeviceTier = TPUCapabilityService.DeviceTier.MEDIUM,
        models = listOf(GEMMA_3_4B_INT4, GEMMA_2B_INT4, EMBEDDING_MINILM),
        defaultModel = "gemma-2b-it-gpu-int4.bin",
        openClawConfig = OpenClawConfig(
            enableDistributedInference = true,
            enableCollectiveTraining = true,
            minPeersForDistributed = 2,
            preferredTaskTypes = listOf("inference", "training_batch", "gradient_compute", "embedding", "custom"),
            contributionWeight = 1.0f
        )
    )
    
    /**
     * Get all available model sets
     */
    fun getAllModelSets(): List<ModelSet> {
        return listOf(FLAGSHIP_FULL, HIGH_PERFORMANCE, BALANCED, EFFICIENCY, DISTRIBUTED)
    }
    
    /**
     * Get recommended model set for device tier
     */
    fun getRecommendedModelSet(tier: TPUCapabilityService.DeviceTier): ModelSet {
        return when (tier) {
            TPUCapabilityService.DeviceTier.FLAGSHIP -> FLAGSHIP_FULL
            TPUCapabilityService.DeviceTier.HIGH -> HIGH_PERFORMANCE
            TPUCapabilityService.DeviceTier.MEDIUM -> BALANCED
            TPUCapabilityService.DeviceTier.LOW -> EFFICIENCY
        }
    }
    
    /**
     * Get model for specific task from a model set
     */
    fun getModelForTask(modelSet: ModelSet, task: TaskType): ModelConfig? {
        return modelSet.models
            .filter { it.supportedTasks.contains(task) }
            .minByOrNull { it.priority }
    }
    
    /**
     * Get all models that support OpenClaw distribution
     */
    fun getOpenClawCapableModels(): List<ModelConfig> {
        return getAllModelSets()
            .flatMap { it.models }
            .filter { it.supportsOpenClaw }
            .distinctBy { it.filename }
    }
    
    /**
     * Check if model is compatible with device capabilities
     */
    fun isModelCompatible(model: ModelConfig, capabilities: TPUCapabilityService.TPUCapabilities): Boolean {
        // Check RAM requirement
        if (capabilities.totalRamMB < model.minRamMB) {
            return false
        }
        
        // Check backend support
        val availableBackends = mutableListOf<String>()
        if (capabilities.hasTPU) availableBackends.add("tpu")
        if (capabilities.totalRamMB >= 6000) availableBackends.add("gpu")
        if (capabilities.hasNPU) availableBackends.add("nnapi")
        availableBackends.add("cpu")
        availableBackends.add("onnx")
        
        return model.supportedBackends.any { availableBackends.contains(it) }
    }
}

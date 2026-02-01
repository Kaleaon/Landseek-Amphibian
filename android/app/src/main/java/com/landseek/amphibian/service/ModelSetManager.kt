package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File

/**
 * ModelSetManager
 * 
 * Manages loading, switching, and coordinating optimized AI model sets.
 * Integrates with OpenClaw for distributed inference capabilities.
 * 
 * Features:
 * - Automatic model set selection based on device capabilities
 * - Dynamic model loading and unloading
 * - Task-based model switching for optimal performance
 * - OpenClaw pool integration for collective inference
 * - Model availability tracking and download management
 * - Performance metrics and optimization suggestions
 * 
 * @see OptimizedModelSets
 * @see https://github.com/Siddhesh2377/ToolNeuron
 */
class ModelSetManager(
    private val context: Context,
    private val llmService: LocalLLMService
) {

    private val TAG = "AmphibianModelSetMgr"
    
    // Services
    private val tpuService = TPUCapabilityService(context)
    private var embeddingService: EmbeddingService? = null
    
    // State
    private val _currentModelSet = MutableStateFlow<OptimizedModelSets.ModelSet?>(null)
    val currentModelSet: StateFlow<OptimizedModelSets.ModelSet?> = _currentModelSet.asStateFlow()
    
    private val _loadedModels = MutableStateFlow<Set<String>>(emptySet())
    val loadedModels: StateFlow<Set<String>> = _loadedModels.asStateFlow()
    
    private val _availableModels = MutableStateFlow<Set<String>>(emptySet())
    val availableModels: StateFlow<Set<String>> = _availableModels.asStateFlow()
    
    private val _isInitialized = MutableStateFlow(false)
    val isInitialized: StateFlow<Boolean> = _isInitialized.asStateFlow()
    
    private val _openClawStatus = MutableStateFlow(OpenClawStatus())
    val openClawStatus: StateFlow<OpenClawStatus> = _openClawStatus.asStateFlow()
    
    // Coroutine scope
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    /**
     * OpenClaw connection status
     */
    data class OpenClawStatus(
        val isConnected: Boolean = false,
        val poolName: String? = null,
        val connectedPeers: Int = 0,
        val availableTasks: Int = 0,
        val contributionScore: Float = 0f,
        val canDistribute: Boolean = false
    )
    
    /**
     * Model loading result
     */
    sealed class LoadResult {
        data class Success(val modelName: String, val loadTimeMs: Long) : LoadResult()
        data class Error(val modelName: String, val error: String) : LoadResult()
        data class NotFound(val modelName: String, val downloadUrl: String?) : LoadResult()
    }
    
    /**
     * Initialize the model set manager
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        if (_isInitialized.value) {
            Log.d(TAG, "ModelSetManager already initialized")
            return@withContext true
        }
        
        try {
            Log.d(TAG, "Initializing ModelSetManager...")
            
            // Detect device capabilities
            val capabilities = tpuService.detectCapabilities()
            
            // Scan for available models
            scanAvailableModels()
            
            // Get recommended model set
            val recommendedSet = OptimizedModelSets.getRecommendedModelSet(capabilities.deviceTier)
            _currentModelSet.value = recommendedSet
            
            // Initialize services
            embeddingService = EmbeddingService(context)
            
            _isInitialized.value = true
            
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║         ✅ ModelSetManager Initialized                     ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Device Tier: ${capabilities.deviceTier.name.padEnd(41)}║
                ║ Model Set: ${recommendedSet.name.padEnd(43)}║
                ║ Available Models: ${_availableModels.value.size.toString().padEnd(36)}║
                ║ OpenClaw: ${(if (recommendedSet.openClawConfig.enableDistributedInference) "Enabled" else "Disabled").padEnd(44)}║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            
            return@withContext true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize ModelSetManager", e)
            return@withContext false
        }
    }
    
    /**
     * Scan for available models on device
     */
    fun scanAvailableModels() {
        val modelsDir = File(context.filesDir, "models")
        if (!modelsDir.exists()) {
            modelsDir.mkdirs()
            _availableModels.value = emptySet()
            return
        }
        
        val models = modelsDir.listFiles()
            ?.filter { it.isFile && (it.extension == "bin" || it.extension == "onnx") }
            ?.map { it.name }
            ?.toSet()
            ?: emptySet()
        
        _availableModels.value = models
        Log.d(TAG, "Found ${models.size} models: $models")
    }
    
    /**
     * Load a specific model set
     */
    suspend fun loadModelSet(modelSet: OptimizedModelSets.ModelSet): Boolean = withContext(Dispatchers.IO) {
        Log.d(TAG, "Loading model set: ${modelSet.name}")
        
        val capabilities = tpuService.detectCapabilities()
        
        // Check if device meets minimum requirements
        if (capabilities.deviceTier < modelSet.minDeviceTier) {
            Log.w(TAG, "Device tier ${capabilities.deviceTier} does not meet minimum ${modelSet.minDeviceTier}")
            return@withContext false
        }
        
        // Load the default model first
        val defaultModel = modelSet.models.find { it.filename == modelSet.defaultModel }
        if (defaultModel != null) {
            val result = loadModel(defaultModel)
            if (result is LoadResult.Success) {
                _currentModelSet.value = modelSet
                _loadedModels.value = _loadedModels.value + defaultModel.filename
                Log.i(TAG, "Model set ${modelSet.name} loaded with default model ${defaultModel.name}")
                return@withContext true
            }
        }
        
        // Try loading any available model from the set
        for (model in modelSet.models.sortedBy { it.priority }) {
            if (OptimizedModelSets.isModelCompatible(model, capabilities)) {
                val result = loadModel(model)
                if (result is LoadResult.Success) {
                    _currentModelSet.value = modelSet
                    _loadedModels.value = _loadedModels.value + model.filename
                    Log.i(TAG, "Model set ${modelSet.name} loaded with fallback model ${model.name}")
                    return@withContext true
                }
            }
        }
        
        Log.w(TAG, "Failed to load any model from set ${modelSet.name}")
        return@withContext false
    }
    
    /**
     * Load a specific model
     */
    suspend fun loadModel(model: OptimizedModelSets.ModelConfig): LoadResult = withContext(Dispatchers.IO) {
        val modelFile = File(context.filesDir, "models/${model.filename}")
        
        if (!modelFile.exists()) {
            Log.w(TAG, "Model not found: ${model.filename}")
            return@withContext LoadResult.NotFound(
                model.filename,
                getModelDownloadUrl(model.filename)
            )
        }
        
        try {
            val startTime = System.currentTimeMillis()
            
            // Initialize LLM with this model
            val success = llmService.initialize()
            
            val loadTime = System.currentTimeMillis() - startTime
            
            if (success) {
                Log.d(TAG, "Model ${model.name} loaded in ${loadTime}ms")
                return@withContext LoadResult.Success(model.filename, loadTime)
            } else {
                return@withContext LoadResult.Error(model.filename, "Failed to initialize model")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading model ${model.filename}", e)
            return@withContext LoadResult.Error(model.filename, e.message ?: "Unknown error")
        }
    }
    
    /**
     * Get the best model for a specific task
     */
    fun getBestModelForTask(task: OptimizedModelSets.TaskType): OptimizedModelSets.ModelConfig? {
        val modelSet = _currentModelSet.value ?: return null
        return OptimizedModelSets.getModelForTask(modelSet, task)
    }
    
    /**
     * Switch to a model optimized for a specific task
     */
    suspend fun switchToTaskOptimalModel(task: OptimizedModelSets.TaskType): Boolean = withContext(Dispatchers.IO) {
        val model = getBestModelForTask(task) ?: return@withContext false
        
        // Check if already loaded
        if (_loadedModels.value.contains(model.filename)) {
            Log.d(TAG, "Model ${model.filename} already loaded for task $task")
            return@withContext true
        }
        
        val result = loadModel(model)
        return@withContext result is LoadResult.Success
    }
    
    /**
     * Get download URL for a model (placeholder - would connect to model repository)
     */
    private fun getModelDownloadUrl(filename: String): String? {
        // In production, this would return actual download URLs from HuggingFace or similar
        return when {
            filename.contains("gemma") -> "https://huggingface.co/google/gemma-models"
            filename.contains("codellama") -> "https://huggingface.co/codellama/CodeLlama-models"
            filename.contains("MiniLM") -> "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2"
            else -> null
        }
    }
    
    /**
     * Get current OpenClaw configuration
     */
    fun getOpenClawConfig(): OptimizedModelSets.OpenClawConfig? {
        return _currentModelSet.value?.openClawConfig
    }
    
    /**
     * Check if distributed inference is available
     */
    fun canUseDistributedInference(): Boolean {
        val config = getOpenClawConfig() ?: return false
        val status = _openClawStatus.value
        
        return config.enableDistributedInference && 
               status.isConnected && 
               status.connectedPeers >= config.minPeersForDistributed
    }
    
    /**
     * Update OpenClaw status (called from bridge connection)
     */
    fun updateOpenClawStatus(status: OpenClawStatus) {
        _openClawStatus.value = status
    }
    
    /**
     * Get all models compatible with current device
     */
    fun getCompatibleModels(): List<OptimizedModelSets.ModelConfig> {
        val capabilities = tpuService.detectCapabilities()
        return OptimizedModelSets.getAllModelSets()
            .flatMap { it.models }
            .filter { OptimizedModelSets.isModelCompatible(it, capabilities) }
            .distinctBy { it.filename }
    }
    
    /**
     * Get model set recommendations for user
     */
    fun getModelSetRecommendations(): List<ModelSetRecommendation> {
        val capabilities = tpuService.detectCapabilities()
        val recommended = OptimizedModelSets.getRecommendedModelSet(capabilities.deviceTier)
        
        return OptimizedModelSets.getAllModelSets().map { set ->
            ModelSetRecommendation(
                modelSet = set,
                isRecommended = set.type == recommended.type,
                isCompatible = capabilities.deviceTier >= set.minDeviceTier,
                missingModels = set.models
                    .map { it.filename }
                    .filter { !_availableModels.value.contains(it) }
            )
        }
    }
    
    data class ModelSetRecommendation(
        val modelSet: OptimizedModelSets.ModelSet,
        val isRecommended: Boolean,
        val isCompatible: Boolean,
        val missingModels: List<String>
    )
    
    /**
     * Get manager status
     */
    fun getStatus(): ModelSetManagerStatus {
        return ModelSetManagerStatus(
            isInitialized = _isInitialized.value,
            currentModelSet = _currentModelSet.value?.name,
            loadedModels = _loadedModels.value.toList(),
            availableModels = _availableModels.value.toList(),
            openClawStatus = _openClawStatus.value,
            deviceTier = tpuService.detectCapabilities().deviceTier.name
        )
    }
    
    data class ModelSetManagerStatus(
        val isInitialized: Boolean,
        val currentModelSet: String?,
        val loadedModels: List<String>,
        val availableModels: List<String>,
        val openClawStatus: OpenClawStatus,
        val deviceTier: String
    )
    
    /**
     * Cleanup resources
     */
    fun close() {
        scope.cancel()
        // llmService is managed by AmphibianCoreService
        embeddingService?.close()
        _isInitialized.value = false
        Log.d(TAG, "ModelSetManager closed")
    }
}

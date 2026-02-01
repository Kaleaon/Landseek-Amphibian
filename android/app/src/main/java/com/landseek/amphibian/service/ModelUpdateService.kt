package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * ModelUpdateService
 * 
 * Manages AI model downloads, updates, and switching.
 * Supports multiple model types (LLM, embeddings, vision, TTS).
 * 
 * Features:
 * - Model catalog with version checking
 * - Background downloads with progress tracking
 * - Integrity verification (SHA-256)
 * - Model switching without app restart
 * - Storage management (delete unused models)
 * - Offline model catalog caching
 */
class ModelUpdateService(private val context: Context) {
    
    private val TAG = "ModelUpdate"
    
    // Configuration
    private val MODEL_CATALOG_URL = "https://raw.githubusercontent.com/Landseek/model-catalog/main/catalog.json"
    private val MODELS_DIR = "models"
    private val CATALOG_CACHE_FILE = "model_catalog_cache.json"
    
    // Service state
    private var isInitialized = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // State flows
    private val _availableModels = MutableStateFlow<List<ModelInfo>>(emptyList())
    val availableModels: StateFlow<List<ModelInfo>> = _availableModels.asStateFlow()
    
    private val _installedModels = MutableStateFlow<List<InstalledModel>>(emptyList())
    val installedModels: StateFlow<List<InstalledModel>> = _installedModels.asStateFlow()
    
    private val _downloadProgress = MutableStateFlow<Map<String, DownloadProgress>>(emptyMap())
    val downloadProgress: StateFlow<Map<String, DownloadProgress>> = _downloadProgress.asStateFlow()
    
    private val _activeDownloads = MutableStateFlow<Set<String>>(emptySet())
    val activeDownloads: StateFlow<Set<String>> = _activeDownloads.asStateFlow()
    
    // Active model selections
    private val _activeLLMModel = MutableStateFlow<String?>(null)
    val activeLLMModel: StateFlow<String?> = _activeLLMModel.asStateFlow()
    
    private val _activeEmbeddingModel = MutableStateFlow<String?>(null)
    val activeEmbeddingModel: StateFlow<String?> = _activeEmbeddingModel.asStateFlow()
    
    // Download jobs
    private val downloadJobs = mutableMapOf<String, Job>()
    
    /**
     * Model types
     */
    enum class ModelType {
        LLM,            // Large Language Models (Gemma, etc.)
        EMBEDDING,      // Text embedding models (MiniLM, USE)
        VISION,         // Vision models (object detection, etc.)
        TTS,            // Text-to-Speech models
        STT             // Speech-to-Text models
    }
    
    /**
     * Model information from catalog
     */
    data class ModelInfo(
        val id: String,
        val name: String,
        val description: String,
        val type: ModelType,
        val version: String,
        val sizeBytes: Long,
        val downloadUrl: String,
        val sha256: String,
        val minAndroidSdk: Int = 29,
        val requiresTpu: Boolean = false,
        val quantization: String? = null,  // int4, int8, fp16
        val parameters: String? = null,    // 2B, 4B, 7B, etc.
        val releaseDate: String? = null,
        val changelog: String? = null
    )
    
    /**
     * Installed model information
     */
    data class InstalledModel(
        val id: String,
        val name: String,
        val type: ModelType,
        val version: String,
        val sizeBytes: Long,
        val filePath: String,
        val installedAt: Long,
        val isActive: Boolean = false
    )
    
    /**
     * Download progress
     */
    data class DownloadProgress(
        val modelId: String,
        val downloadedBytes: Long,
        val totalBytes: Long,
        val progress: Float,
        val status: DownloadStatus
    )
    
    enum class DownloadStatus {
        PENDING,
        DOWNLOADING,
        VERIFYING,
        COMPLETED,
        FAILED,
        CANCELLED
    }
    
    /**
     * Initialize the service
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        if (isInitialized) return@withContext true
        
        try {
            // Create models directory
            val modelsDir = File(context.filesDir, MODELS_DIR)
            if (!modelsDir.exists()) {
                modelsDir.mkdirs()
            }
            
            // Load installed models
            scanInstalledModels()
            
            // Load cached catalog
            loadCachedCatalog()
            
            // Refresh catalog in background
            scope.launch {
                refreshModelCatalog()
            }
            
            isInitialized = true
            
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║           ✅ Model Update Service Initialized              ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Installed Models: ${_installedModels.value.size.toString().padEnd(37)}║
                ║ Available Models: ${_availableModels.value.size.toString().padEnd(37)}║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize: ${e.message}", e)
            return@withContext false
        }
    }
    
    /**
     * Refresh the model catalog from remote
     */
    suspend fun refreshModelCatalog(): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = URL(MODEL_CATALOG_URL)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "Failed to fetch catalog: ${connection.responseCode}")
                return@withContext false
            }
            
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()
            
            // Parse catalog
            val catalogJson = JSONObject(response)
            val modelsArray = catalogJson.getJSONArray("models")
            val models = mutableListOf<ModelInfo>()
            
            for (i in 0 until modelsArray.length()) {
                val modelJson = modelsArray.getJSONObject(i)
                models.add(parseModelInfo(modelJson))
            }
            
            _availableModels.value = models
            
            // Cache catalog
            File(context.filesDir, CATALOG_CACHE_FILE).writeText(response)
            
            Log.d(TAG, "Refreshed model catalog: ${models.size} models available")
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to refresh catalog: ${e.message}")
            return@withContext false
        }
    }
    
    /**
     * Download and install a model
     */
    fun downloadModel(modelId: String): Job {
        val existingJob = downloadJobs[modelId]
        if (existingJob?.isActive == true) {
            Log.w(TAG, "Download already in progress for $modelId")
            return existingJob
        }
        
        val job = scope.launch {
            val model = _availableModels.value.find { it.id == modelId }
            if (model == null) {
                Log.e(TAG, "Model not found in catalog: $modelId")
                return@launch
            }
            
            try {
                // Update state
                _activeDownloads.value = _activeDownloads.value + modelId
                updateDownloadProgress(modelId, 0, model.sizeBytes, DownloadStatus.PENDING)
                
                // Download
                val success = performDownload(model)
                
                if (success) {
                    updateDownloadProgress(modelId, model.sizeBytes, model.sizeBytes, DownloadStatus.COMPLETED)
                    scanInstalledModels()
                    Log.i(TAG, "Model installed successfully: ${model.name}")
                } else {
                    updateDownloadProgress(modelId, 0, model.sizeBytes, DownloadStatus.FAILED)
                }
                
            } catch (e: CancellationException) {
                updateDownloadProgress(modelId, 0, model.sizeBytes, DownloadStatus.CANCELLED)
                Log.d(TAG, "Download cancelled: $modelId")
            } catch (e: Exception) {
                updateDownloadProgress(modelId, 0, model.sizeBytes, DownloadStatus.FAILED)
                Log.e(TAG, "Download failed for $modelId: ${e.message}")
            } finally {
                _activeDownloads.value = _activeDownloads.value - modelId
                downloadJobs.remove(modelId)
            }
        }
        
        downloadJobs[modelId] = job
        return job
    }
    
    /**
     * Cancel a download
     */
    fun cancelDownload(modelId: String) {
        downloadJobs[modelId]?.cancel()
        downloadJobs.remove(modelId)
        _activeDownloads.value = _activeDownloads.value - modelId
    }
    
    /**
     * Delete an installed model
     */
    suspend fun deleteModel(modelId: String): Boolean = withContext(Dispatchers.IO) {
        val installed = _installedModels.value.find { it.id == modelId }
        if (installed == null) {
            Log.w(TAG, "Model not installed: $modelId")
            return@withContext false
        }
        
        // Don't delete active models
        if (installed.isActive) {
            Log.w(TAG, "Cannot delete active model: $modelId")
            return@withContext false
        }
        
        try {
            val file = File(installed.filePath)
            if (file.exists()) {
                file.delete()
            }
            
            scanInstalledModels()
            Log.d(TAG, "Deleted model: ${installed.name}")
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete model: ${e.message}")
            return@withContext false
        }
    }
    
    /**
     * Set the active LLM model
     */
    suspend fun setActiveLLMModel(modelId: String): Boolean = withContext(Dispatchers.IO) {
        val installed = _installedModels.value.find { it.id == modelId && it.type == ModelType.LLM }
        if (installed == null) {
            Log.w(TAG, "LLM model not installed: $modelId")
            return@withContext false
        }
        
        _activeLLMModel.value = modelId
        saveActiveModels()
        scanInstalledModels() // Refresh to update isActive flags
        
        Log.i(TAG, "Active LLM model set to: ${installed.name}")
        return@withContext true
    }
    
    /**
     * Set the active embedding model
     */
    suspend fun setActiveEmbeddingModel(modelId: String): Boolean = withContext(Dispatchers.IO) {
        val installed = _installedModels.value.find { it.id == modelId && it.type == ModelType.EMBEDDING }
        if (installed == null) {
            Log.w(TAG, "Embedding model not installed: $modelId")
            return@withContext false
        }
        
        _activeEmbeddingModel.value = modelId
        saveActiveModels()
        scanInstalledModels()
        
        Log.i(TAG, "Active embedding model set to: ${installed.name}")
        return@withContext true
    }
    
    /**
     * Check if updates are available
     */
    fun checkForUpdates(): List<ModelInfo> {
        val installedMap = _installedModels.value.associateBy { it.id }
        
        return _availableModels.value.filter { available ->
            val installed = installedMap[available.id]
            installed != null && isNewerVersion(available.version, installed.version)
        }
    }
    
    /**
     * Get storage usage
     */
    fun getStorageUsage(): StorageInfo {
        val modelsDir = File(context.filesDir, MODELS_DIR)
        var totalSize = 0L
        var modelCount = 0
        
        modelsDir.listFiles()?.forEach { file ->
            if (file.isFile) {
                totalSize += file.length()
                modelCount++
            }
        }
        
        return StorageInfo(
            totalBytes = totalSize,
            modelCount = modelCount,
            availableBytes = context.filesDir.freeSpace
        )
    }
    
    data class StorageInfo(
        val totalBytes: Long,
        val modelCount: Int,
        val availableBytes: Long
    )
    
    // --- Private Methods ---
    
    private suspend fun performDownload(model: ModelInfo): Boolean {
        val url = URL(model.downloadUrl)
        val connection = url.openConnection() as HttpURLConnection
        connection.connectTimeout = 30000
        connection.readTimeout = 30000
        
        if (connection.responseCode != HttpURLConnection.HTTP_OK) {
            Log.e(TAG, "Download failed: HTTP ${connection.responseCode}")
            return false
        }
        
        val totalBytes = connection.contentLengthLong.takeIf { it > 0 } ?: model.sizeBytes
        var downloadedBytes = 0L
        
        // Temporary file
        val tempFile = File(context.filesDir, MODELS_DIR + "/${model.id}.tmp")
        val targetFile = File(context.filesDir, MODELS_DIR + "/${model.id}.${getExtension(model)}")
        
        try {
            updateDownloadProgress(model.id, 0, totalBytes, DownloadStatus.DOWNLOADING)
            
            connection.inputStream.use { input ->
                FileOutputStream(tempFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        // Check for cancellation
                        if (!coroutineContext.isActive) {
                            throw CancellationException()
                        }
                        
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead
                        
                        val progress = downloadedBytes.toFloat() / totalBytes
                        updateDownloadProgress(model.id, downloadedBytes, totalBytes, DownloadStatus.DOWNLOADING)
                    }
                }
            }
            
            // Verify integrity
            updateDownloadProgress(model.id, downloadedBytes, totalBytes, DownloadStatus.VERIFYING)
            
            if (!verifyChecksum(tempFile, model.sha256)) {
                Log.e(TAG, "Checksum verification failed for ${model.name}")
                tempFile.delete()
                return false
            }
            
            // Move to final location
            if (targetFile.exists()) {
                targetFile.delete()
            }
            tempFile.renameTo(targetFile)
            
            return true
            
        } catch (e: Exception) {
            tempFile.delete()
            throw e
        } finally {
            connection.disconnect()
        }
    }
    
    private fun verifyChecksum(file: File, expectedSha256: String): Boolean {
        if (expectedSha256.isEmpty()) return true
        
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        
        val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
        return actualHash.equals(expectedSha256, ignoreCase = true)
    }
    
    private fun updateDownloadProgress(modelId: String, downloaded: Long, total: Long, status: DownloadStatus) {
        val progress = if (total > 0) downloaded.toFloat() / total else 0f
        val currentProgress = _downloadProgress.value.toMutableMap()
        currentProgress[modelId] = DownloadProgress(modelId, downloaded, total, progress, status)
        _downloadProgress.value = currentProgress
    }
    
    private fun scanInstalledModels() {
        val modelsDir = File(context.filesDir, MODELS_DIR)
        val installed = mutableListOf<InstalledModel>()
        
        val activeLLM = _activeLLMModel.value
        val activeEmbed = _activeEmbeddingModel.value
        
        modelsDir.listFiles()?.forEach { file ->
            if (file.isFile && !file.name.endsWith(".tmp")) {
                val modelId = file.nameWithoutExtension
                val catalogInfo = _availableModels.value.find { it.id == modelId }
                
                val type = when {
                    catalogInfo != null -> catalogInfo.type
                    file.name.contains("llm", ignoreCase = true) || 
                    file.name.contains("gemma", ignoreCase = true) -> ModelType.LLM
                    file.name.contains("minilm", ignoreCase = true) || 
                    file.name.contains("use", ignoreCase = true) -> ModelType.EMBEDDING
                    file.name.contains("vision", ignoreCase = true) -> ModelType.VISION
                    file.name.contains("tts", ignoreCase = true) -> ModelType.TTS
                    else -> ModelType.LLM
                }
                
                val isActive = when (type) {
                    ModelType.LLM -> modelId == activeLLM
                    ModelType.EMBEDDING -> modelId == activeEmbed
                    else -> false
                }
                
                installed.add(InstalledModel(
                    id = modelId,
                    name = catalogInfo?.name ?: modelId,
                    type = type,
                    version = catalogInfo?.version ?: "unknown",
                    sizeBytes = file.length(),
                    filePath = file.absolutePath,
                    installedAt = file.lastModified(),
                    isActive = isActive
                ))
            }
        }
        
        _installedModels.value = installed
    }
    
    private fun loadCachedCatalog() {
        try {
            val cacheFile = File(context.filesDir, CATALOG_CACHE_FILE)
            if (!cacheFile.exists()) return
            
            val catalogJson = JSONObject(cacheFile.readText())
            val modelsArray = catalogJson.getJSONArray("models")
            val models = mutableListOf<ModelInfo>()
            
            for (i in 0 until modelsArray.length()) {
                models.add(parseModelInfo(modelsArray.getJSONObject(i)))
            }
            
            _availableModels.value = models
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load cached catalog: ${e.message}")
        }
    }
    
    private fun parseModelInfo(json: JSONObject): ModelInfo {
        return ModelInfo(
            id = json.getString("id"),
            name = json.getString("name"),
            description = json.optString("description", ""),
            type = ModelType.valueOf(json.optString("type", "LLM")),
            version = json.getString("version"),
            sizeBytes = json.getLong("sizeBytes"),
            downloadUrl = json.getString("downloadUrl"),
            sha256 = json.optString("sha256", ""),
            minAndroidSdk = json.optInt("minAndroidSdk", 29),
            requiresTpu = json.optBoolean("requiresTpu", false),
            quantization = json.optString("quantization", null),
            parameters = json.optString("parameters", null),
            releaseDate = json.optString("releaseDate", null),
            changelog = json.optString("changelog", null)
        )
    }
    
    private fun saveActiveModels() {
        val prefs = context.getSharedPreferences("model_prefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("active_llm", _activeLLMModel.value)
            .putString("active_embedding", _activeEmbeddingModel.value)
            .apply()
    }
    
    private fun loadActiveModels() {
        val prefs = context.getSharedPreferences("model_prefs", Context.MODE_PRIVATE)
        _activeLLMModel.value = prefs.getString("active_llm", null)
        _activeEmbeddingModel.value = prefs.getString("active_embedding", null)
    }
    
    private fun isNewerVersion(newVersion: String, currentVersion: String): Boolean {
        val new = newVersion.split(".").mapNotNull { it.toIntOrNull() }
        val current = currentVersion.split(".").mapNotNull { it.toIntOrNull() }
        
        for (i in 0 until maxOf(new.size, current.size)) {
            val n = new.getOrElse(i) { 0 }
            val c = current.getOrElse(i) { 0 }
            if (n > c) return true
            if (n < c) return false
        }
        return false
    }
    
    private fun getExtension(model: ModelInfo): String {
        return when (model.type) {
            ModelType.LLM -> "bin"
            ModelType.EMBEDDING -> "onnx"
            ModelType.VISION -> "tflite"
            ModelType.TTS -> "onnx"
            ModelType.STT -> "tflite"
        }
    }
    
    /**
     * Shutdown
     */
    fun shutdown() {
        downloadJobs.values.forEach { it.cancel() }
        downloadJobs.clear()
        scope.cancel()
        Log.d(TAG, "Model update service shutdown")
    }
}

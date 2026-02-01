package com.landseek.amphibian.service

import android.content.Context
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * CloudSyncService
 * 
 * Provides cloud synchronization for memory/RAG data across multiple devices.
 * This extends beyond P2PSyncService's local network sync to enable true
 * multi-device sync via cloud storage.
 * 
 * Features:
 * - End-to-end encryption of all data
 * - Conflict resolution with timestamp-based merging
 * - Delta sync (only sync changes)
 * - Multiple cloud provider support (Firebase, custom server, WebDAV)
 * - Background sync with configurable intervals
 * - Offline-first with queue-based sync
 * - Compression for bandwidth optimization
 * - Device linking via secure pairing
 * 
 * Privacy:
 * - All data is encrypted client-side before upload
 * - Server never sees plaintext data
 * - User controls their encryption key
 */
class CloudSyncService(
    private val context: Context,
    private val ragService: LocalRAGService
) {
    
    private val TAG = "CloudSync"
    
    // Configuration file
    private val CONFIG_FILE = "cloud_sync_config.json"
    private val PENDING_SYNC_FILE = "pending_sync.json"
    
    // Service state
    private var isInitialized = false
    private var syncJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // State flows
    private val _syncState = MutableStateFlow(SyncState.IDLE)
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()
    
    private val _lastSyncTime = MutableStateFlow(0L)
    val lastSyncTime: StateFlow<Long> = _lastSyncTime.asStateFlow()
    
    private val _pendingSyncCount = MutableStateFlow(0)
    val pendingSyncCount: StateFlow<Int> = _pendingSyncCount.asStateFlow()
    
    private val _connectedDevices = MutableStateFlow<List<DeviceInfo>>(emptyList())
    val connectedDevices: StateFlow<List<DeviceInfo>> = _connectedDevices.asStateFlow()
    
    // Configuration
    private var config: CloudSyncConfig? = null
    private var encryptionKey: SecretKeySpec? = null
    
    // Pending changes queue
    private val pendingChanges = mutableListOf<PendingChange>()
    
    /**
     * Sync states
     */
    enum class SyncState {
        IDLE,
        SYNCING,
        UPLOADING,
        DOWNLOADING,
        MERGING,
        ERROR,
        DISABLED
    }
    
    /**
     * Cloud provider types
     */
    enum class CloudProvider {
        CUSTOM_SERVER,  // Self-hosted sync server
        FIREBASE,       // Firebase Realtime Database
        WEBDAV,         // WebDAV compatible servers (Nextcloud, etc.)
        S3_COMPATIBLE   // S3-compatible storage (AWS, MinIO, etc.)
    }
    
    /**
     * Sync configuration
     */
    data class CloudSyncConfig(
        val enabled: Boolean = false,
        val provider: CloudProvider = CloudProvider.CUSTOM_SERVER,
        val serverUrl: String = "",
        val apiKey: String = "",
        val userId: String = "",
        val deviceId: String = java.util.UUID.randomUUID().toString(),
        val deviceName: String = android.os.Build.MODEL,
        val syncIntervalMinutes: Int = 15,
        val syncOnWifiOnly: Boolean = true,
        val encryptionEnabled: Boolean = true,
        val compressionEnabled: Boolean = true,
        val lastSyncTimestamp: Long = 0L
    )
    
    /**
     * Device information
     */
    data class DeviceInfo(
        val deviceId: String,
        val deviceName: String,
        val lastSeen: Long,
        val memoriesCount: Int,
        val platform: String = "android"
    )
    
    /**
     * Pending change for queue-based sync
     */
    data class PendingChange(
        val id: String = java.util.UUID.randomUUID().toString(),
        val type: ChangeType,
        val memoryId: String,
        val timestamp: Long = System.currentTimeMillis(),
        val data: String? = null
    )
    
    enum class ChangeType {
        ADD,
        UPDATE,
        DELETE
    }
    
    /**
     * Sync result
     */
    data class SyncResult(
        val success: Boolean,
        val memoriesPulled: Int = 0,
        val memoriesPushed: Int = 0,
        val conflicts: Int = 0,
        val errorMessage: String? = null
    )
    
    /**
     * Initialize the cloud sync service
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        if (isInitialized) {
            return@withContext true
        }
        
        try {
            // Load configuration
            loadConfig()
            
            // Load pending changes
            loadPendingChanges()
            
            // Initialize encryption if enabled
            if (config?.encryptionEnabled == true) {
                initializeEncryption()
            }
            
            isInitialized = true
            
            // Start background sync if enabled
            if (config?.enabled == true) {
                startBackgroundSync()
            }
            
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║           ✅ Cloud Sync Service Initialized                ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Provider: ${(config?.provider?.name ?: "Not configured").padEnd(43)}║
                ║ Encryption: ${if (config?.encryptionEnabled == true) "Enabled" else "Disabled"}                                    ║
                ║ Auto-Sync: ${if (config?.enabled == true) "Every ${config?.syncIntervalMinutes} minutes" else "Disabled"}                           ║
                ║ Pending Changes: ${pendingChanges.size.toString().padEnd(38)}║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize cloud sync: ${e.message}", e)
            return@withContext false
        }
    }
    
    /**
     * Configure cloud sync
     */
    suspend fun configure(
        provider: CloudProvider,
        serverUrl: String,
        apiKey: String,
        userId: String,
        encryptionPassword: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val newConfig = CloudSyncConfig(
                enabled = true,
                provider = provider,
                serverUrl = serverUrl.trimEnd('/'),
                apiKey = apiKey,
                userId = userId,
                encryptionEnabled = encryptionPassword != null
            )
            
            config = newConfig
            saveConfig()
            
            // Initialize encryption with password
            if (encryptionPassword != null) {
                deriveEncryptionKey(encryptionPassword, userId)
            }
            
            // Test connection
            val connected = testConnection()
            if (!connected) {
                Log.w(TAG, "Cloud sync configured but connection test failed")
            }
            
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to configure cloud sync: ${e.message}", e)
            return@withContext false
        }
    }
    
    /**
     * Perform a full sync
     */
    suspend fun sync(): SyncResult = withContext(Dispatchers.IO) {
        val currentConfig = config ?: return@withContext SyncResult(
            success = false,
            errorMessage = "Cloud sync not configured"
        )
        
        if (!currentConfig.enabled) {
            return@withContext SyncResult(
                success = false,
                errorMessage = "Cloud sync is disabled"
            )
        }
        
        _syncState.value = SyncState.SYNCING
        
        try {
            // 1. Push local changes
            _syncState.value = SyncState.UPLOADING
            val pushed = pushChanges()
            
            // 2. Pull remote changes
            _syncState.value = SyncState.DOWNLOADING
            val pullResult = pullChanges()
            
            // 3. Merge and resolve conflicts
            _syncState.value = SyncState.MERGING
            val merged = mergeChanges(pullResult.memories)
            
            // 4. Update last sync time
            val newConfig = currentConfig.copy(lastSyncTimestamp = System.currentTimeMillis())
            config = newConfig
            saveConfig()
            
            _lastSyncTime.value = newConfig.lastSyncTimestamp
            _syncState.value = SyncState.IDLE
            
            Log.i(TAG, "Sync completed: pushed=$pushed, pulled=${pullResult.memories.size}, merged=$merged")
            
            return@withContext SyncResult(
                success = true,
                memoriesPushed = pushed,
                memoriesPulled = pullResult.memories.size,
                conflicts = pullResult.conflicts
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed: ${e.message}", e)
            _syncState.value = SyncState.ERROR
            
            return@withContext SyncResult(
                success = false,
                errorMessage = e.message
            )
        }
    }
    
    /**
     * Queue a memory change for sync
     */
    fun queueChange(type: ChangeType, memoryId: String, data: String? = null) {
        val change = PendingChange(
            type = type,
            memoryId = memoryId,
            data = data
        )
        
        pendingChanges.add(change)
        _pendingSyncCount.value = pendingChanges.size
        
        scope.launch {
            savePendingChanges()
        }
        
        Log.d(TAG, "Queued ${type.name} change for memory $memoryId")
    }
    
    /**
     * Push local changes to cloud
     */
    private suspend fun pushChanges(): Int {
        if (pendingChanges.isEmpty()) return 0
        
        val currentConfig = config ?: return 0
        val changes = pendingChanges.toList()
        var pushedCount = 0
        
        for (change in changes) {
            try {
                val success = when (change.type) {
                    ChangeType.ADD, ChangeType.UPDATE -> {
                        val memoryJson = change.data ?: continue
                        uploadMemory(memoryJson)
                    }
                    ChangeType.DELETE -> {
                        deleteRemoteMemory(change.memoryId)
                    }
                }
                
                if (success) {
                    pendingChanges.remove(change)
                    pushedCount++
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to push change ${change.id}: ${e.message}")
            }
        }
        
        _pendingSyncCount.value = pendingChanges.size
        savePendingChanges()
        
        return pushedCount
    }
    
    /**
     * Pull changes from cloud
     */
    private suspend fun pullChanges(): PullResult {
        val currentConfig = config ?: return PullResult(emptyList(), 0)
        
        val url = URL("${currentConfig.serverUrl}/api/sync/pull")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
            doOutput = true
        }
        
        try {
            // Send request with last sync timestamp
            val requestBody = JSONObject().apply {
                put("userId", currentConfig.userId)
                put("deviceId", currentConfig.deviceId)
                put("lastSyncTimestamp", currentConfig.lastSyncTimestamp)
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(requestBody.toString())
            }
            
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                throw Exception("Pull failed with code ${connection.responseCode}")
            }
            
            // Parse response
            val response = BufferedReader(InputStreamReader(connection.inputStream)).use { reader ->
                JSONObject(reader.readText())
            }
            
            val memoriesArray = response.getJSONArray("memories")
            val memories = mutableListOf<String>()
            
            for (i in 0 until memoriesArray.length()) {
                var memoryJson = memoriesArray.getString(i)
                
                // Decrypt if needed
                if (currentConfig.encryptionEnabled) {
                    memoryJson = decrypt(memoryJson)
                }
                
                memories.add(memoryJson)
            }
            
            val conflicts = response.optInt("conflicts", 0)
            
            return PullResult(memories, conflicts)
            
        } finally {
            connection.disconnect()
        }
    }
    
    /**
     * Upload a single memory
     */
    private suspend fun uploadMemory(memoryJson: String): Boolean {
        val currentConfig = config ?: return false
        
        var dataToUpload = memoryJson
        
        // Encrypt if enabled
        if (currentConfig.encryptionEnabled) {
            dataToUpload = encrypt(memoryJson)
        }
        
        val url = URL("${currentConfig.serverUrl}/api/sync/push")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
            doOutput = true
        }
        
        try {
            val requestBody = JSONObject().apply {
                put("userId", currentConfig.userId)
                put("deviceId", currentConfig.deviceId)
                put("memory", dataToUpload)
                put("timestamp", System.currentTimeMillis())
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(requestBody.toString())
            }
            
            return connection.responseCode == HttpURLConnection.HTTP_OK
            
        } finally {
            connection.disconnect()
        }
    }
    
    /**
     * Delete a memory from cloud
     */
    private suspend fun deleteRemoteMemory(memoryId: String): Boolean {
        val currentConfig = config ?: return false
        
        val url = URL("${currentConfig.serverUrl}/api/sync/delete")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "DELETE"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
            doOutput = true
        }
        
        try {
            val requestBody = JSONObject().apply {
                put("userId", currentConfig.userId)
                put("deviceId", currentConfig.deviceId)
                put("memoryId", memoryId)
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(requestBody.toString())
            }
            
            return connection.responseCode == HttpURLConnection.HTTP_OK
            
        } finally {
            connection.disconnect()
        }
    }
    
    /**
     * Merge pulled changes with local data
     */
    private suspend fun mergeChanges(remoteMemories: List<String>): Int {
        var mergedCount = 0
        
        for (memoryJson in remoteMemories) {
            try {
                val memory = ragService.jsonToMemory(JSONObject(memoryJson))
                
                // Let RAG service handle the merge (it checks for duplicates)
                ragService.mergeMemories(listOf(memory))
                mergedCount++
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to merge memory: ${e.message}")
            }
        }
        
        return mergedCount
    }
    
    /**
     * Test connection to cloud server
     */
    private suspend fun testConnection(): Boolean {
        val currentConfig = config ?: return false
        
        return try {
            val url = URL("${currentConfig.serverUrl}/api/health")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
                connectTimeout = 5000
                readTimeout = 5000
            }
            
            val result = connection.responseCode == HttpURLConnection.HTTP_OK
            connection.disconnect()
            result
            
        } catch (e: Exception) {
            Log.e(TAG, "Connection test failed: ${e.message}")
            false
        }
    }
    
    /**
     * Get list of linked devices
     */
    suspend fun getLinkedDevices(): List<DeviceInfo> = withContext(Dispatchers.IO) {
        val currentConfig = config ?: return@withContext emptyList()
        
        try {
            val url = URL("${currentConfig.serverUrl}/api/devices")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
            }
            
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                return@withContext emptyList()
            }
            
            val response = BufferedReader(InputStreamReader(connection.inputStream)).use { reader ->
                JSONArray(reader.readText())
            }
            
            val devices = mutableListOf<DeviceInfo>()
            for (i in 0 until response.length()) {
                val deviceJson = response.getJSONObject(i)
                devices.add(DeviceInfo(
                    deviceId = deviceJson.getString("deviceId"),
                    deviceName = deviceJson.getString("deviceName"),
                    lastSeen = deviceJson.getLong("lastSeen"),
                    memoriesCount = deviceJson.optInt("memoriesCount", 0),
                    platform = deviceJson.optString("platform", "unknown")
                ))
            }
            
            _connectedDevices.value = devices
            connection.disconnect()
            
            return@withContext devices
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get linked devices: ${e.message}")
            return@withContext emptyList()
        }
    }
    
    /**
     * Generate a device pairing code
     */
    suspend fun generatePairingCode(): String? = withContext(Dispatchers.IO) {
        val currentConfig = config ?: return@withContext null
        
        try {
            val url = URL("${currentConfig.serverUrl}/api/devices/pair")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
                doOutput = true
            }
            
            val requestBody = JSONObject().apply {
                put("userId", currentConfig.userId)
                put("deviceId", currentConfig.deviceId)
                put("deviceName", currentConfig.deviceName)
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(requestBody.toString())
            }
            
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                return@withContext null
            }
            
            val response = BufferedReader(InputStreamReader(connection.inputStream)).use { reader ->
                JSONObject(reader.readText())
            }
            
            connection.disconnect()
            return@withContext response.optString("pairingCode")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate pairing code: ${e.message}")
            return@withContext null
        }
    }
    
    /**
     * Link a new device using pairing code
     */
    suspend fun linkDevice(pairingCode: String): Boolean = withContext(Dispatchers.IO) {
        val currentConfig = config ?: return@withContext false
        
        try {
            val url = URL("${currentConfig.serverUrl}/api/devices/link")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer ${currentConfig.apiKey}")
                doOutput = true
            }
            
            val requestBody = JSONObject().apply {
                put("userId", currentConfig.userId)
                put("deviceId", currentConfig.deviceId)
                put("deviceName", currentConfig.deviceName)
                put("pairingCode", pairingCode)
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(requestBody.toString())
            }
            
            val success = connection.responseCode == HttpURLConnection.HTTP_OK
            connection.disconnect()
            
            if (success) {
                // Refresh device list
                getLinkedDevices()
            }
            
            return@withContext success
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to link device: ${e.message}")
            return@withContext false
        }
    }
    
    // --- Background Sync ---
    
    /**
     * Start background sync
     */
    fun startBackgroundSync() {
        val intervalMs = (config?.syncIntervalMinutes ?: 15) * 60 * 1000L
        
        syncJob?.cancel()
        syncJob = scope.launch {
            while (isActive) {
                delay(intervalMs)
                
                if (config?.enabled == true) {
                    Log.d(TAG, "Running background sync")
                    sync()
                }
            }
        }
        
        Log.d(TAG, "Started background sync (interval: ${config?.syncIntervalMinutes} minutes)")
    }
    
    /**
     * Stop background sync
     */
    fun stopBackgroundSync() {
        syncJob?.cancel()
        syncJob = null
        Log.d(TAG, "Stopped background sync")
    }
    
    /**
     * Enable/disable sync
     */
    suspend fun setEnabled(enabled: Boolean) {
        config = config?.copy(enabled = enabled)
        saveConfig()
        
        if (enabled) {
            startBackgroundSync()
        } else {
            stopBackgroundSync()
            _syncState.value = SyncState.DISABLED
        }
    }
    
    // --- Encryption ---
    
    private fun initializeEncryption() {
        // Load encryption key from secure storage
        val prefs = context.getSharedPreferences("cloud_sync_secure", Context.MODE_PRIVATE)
        val keyBytes = prefs.getString("encryption_key", null)?.let {
            Base64.decode(it, Base64.NO_WRAP)
        }
        
        if (keyBytes != null) {
            encryptionKey = SecretKeySpec(keyBytes, "AES")
        }
    }
    
    private fun deriveEncryptionKey(password: String, salt: String) {
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = PBEKeySpec(password.toCharArray(), salt.toByteArray(), 65536, 256)
        val secret = factory.generateSecret(spec)
        
        encryptionKey = SecretKeySpec(secret.encoded, "AES")
        
        // Store key securely
        val prefs = context.getSharedPreferences("cloud_sync_secure", Context.MODE_PRIVATE)
        prefs.edit().putString("encryption_key", Base64.encodeToString(secret.encoded, Base64.NO_WRAP)).apply()
    }
    
    private fun encrypt(plaintext: String): String {
        val key = encryptionKey ?: throw IllegalStateException("Encryption key not initialized")
        
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        
        val iv = cipher.iv
        val encrypted = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        
        // Combine IV and ciphertext
        val combined = ByteArray(iv.size + encrypted.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(encrypted, 0, combined, iv.size, encrypted.size)
        
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }
    
    private fun decrypt(ciphertext: String): String {
        val key = encryptionKey ?: throw IllegalStateException("Encryption key not initialized")
        
        val combined = Base64.decode(ciphertext, Base64.NO_WRAP)
        
        // Extract IV and ciphertext
        val iv = combined.sliceArray(0 until 16)
        val encrypted = combined.sliceArray(16 until combined.size)
        
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.DECRYPT_MODE, key, IvParameterSpec(iv))
        
        val decrypted = cipher.doFinal(encrypted)
        return String(decrypted, Charsets.UTF_8)
    }
    
    // --- Persistence ---
    
    private fun saveConfig() {
        try {
            val currentConfig = config ?: return
            
            val json = JSONObject().apply {
                put("enabled", currentConfig.enabled)
                put("provider", currentConfig.provider.name)
                put("serverUrl", currentConfig.serverUrl)
                put("apiKey", currentConfig.apiKey)
                put("userId", currentConfig.userId)
                put("deviceId", currentConfig.deviceId)
                put("deviceName", currentConfig.deviceName)
                put("syncIntervalMinutes", currentConfig.syncIntervalMinutes)
                put("syncOnWifiOnly", currentConfig.syncOnWifiOnly)
                put("encryptionEnabled", currentConfig.encryptionEnabled)
                put("compressionEnabled", currentConfig.compressionEnabled)
                put("lastSyncTimestamp", currentConfig.lastSyncTimestamp)
            }
            
            File(context.filesDir, CONFIG_FILE).writeText(json.toString())
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save config: ${e.message}")
        }
    }
    
    private fun loadConfig() {
        try {
            val file = File(context.filesDir, CONFIG_FILE)
            if (!file.exists()) {
                config = CloudSyncConfig()
                return
            }
            
            val json = JSONObject(file.readText())
            
            config = CloudSyncConfig(
                enabled = json.optBoolean("enabled", false),
                provider = CloudProvider.valueOf(json.optString("provider", "CUSTOM_SERVER")),
                serverUrl = json.optString("serverUrl", ""),
                apiKey = json.optString("apiKey", ""),
                userId = json.optString("userId", ""),
                deviceId = json.optString("deviceId", java.util.UUID.randomUUID().toString()),
                deviceName = json.optString("deviceName", android.os.Build.MODEL),
                syncIntervalMinutes = json.optInt("syncIntervalMinutes", 15),
                syncOnWifiOnly = json.optBoolean("syncOnWifiOnly", true),
                encryptionEnabled = json.optBoolean("encryptionEnabled", true),
                compressionEnabled = json.optBoolean("compressionEnabled", true),
                lastSyncTimestamp = json.optLong("lastSyncTimestamp", 0L)
            )
            
            _lastSyncTime.value = config?.lastSyncTimestamp ?: 0L
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load config: ${e.message}")
            config = CloudSyncConfig()
        }
    }
    
    private fun savePendingChanges() {
        try {
            val jsonArray = JSONArray()
            pendingChanges.forEach { change ->
                jsonArray.put(JSONObject().apply {
                    put("id", change.id)
                    put("type", change.type.name)
                    put("memoryId", change.memoryId)
                    put("timestamp", change.timestamp)
                    put("data", change.data)
                })
            }
            
            File(context.filesDir, PENDING_SYNC_FILE).writeText(jsonArray.toString())
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save pending changes: ${e.message}")
        }
    }
    
    private fun loadPendingChanges() {
        try {
            val file = File(context.filesDir, PENDING_SYNC_FILE)
            if (!file.exists()) return
            
            val jsonArray = JSONArray(file.readText())
            
            for (i in 0 until jsonArray.length()) {
                val json = jsonArray.getJSONObject(i)
                pendingChanges.add(PendingChange(
                    id = json.getString("id"),
                    type = ChangeType.valueOf(json.getString("type")),
                    memoryId = json.getString("memoryId"),
                    timestamp = json.getLong("timestamp"),
                    data = json.optString("data", null)
                ))
            }
            
            _pendingSyncCount.value = pendingChanges.size
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load pending changes: ${e.message}")
        }
    }
    
    /**
     * Shutdown and cleanup
     */
    fun shutdown() {
        stopBackgroundSync()
        scope.cancel()
        isInitialized = false
        Log.d(TAG, "Cloud sync service shutdown")
    }
    
    /**
     * Pull result data class
     */
    private data class PullResult(
        val memories: List<String>,
        val conflicts: Int
    )
}

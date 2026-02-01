package com.landseek.amphibian.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import okhttp3.*
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import com.landseek.amphibian.tools.AndroidToolManager

/**
 * AmphibianCoreService (ToolNeuron + MediaPipe Integration)
 *
 * This Foreground Service is responsible for:
 * 1. Extracting the Node.js runtime from assets (if needed).
 * 2. Spawning the Node.js process ("The Brain").
 * 3. Maintaining the WebSocket bridge to the local Node server.
 * 4. Handling Android tool callbacks from the Agent.
 * 5. Managing on-device AI via TPU/MediaPipe with Pixel 10 optimization.
 * 6. Text-to-Speech for voice output (ToolNeuron pattern)
 * 7. Document parsing for RAG (PDF, Word, Excel)
 * 8. Vision tasks (Object Detection, Face Detection, Hand Tracking)
 * 
 * TPU Support:
 * - Pixel 10: Tensor G5 with INT4 quantization (Best)
 * - Pixel 9: Tensor G4 with INT4 quantization
 * - Pixel 8: Tensor G3 TPU
 * - Pixel 7: Tensor G2 TPU
 * - Pixel 6: Tensor G1 TPU
 * - Other: GPU/CPU fallback
 * 
 * @see https://github.com/Siddhesh2377/ToolNeuron
 * @see https://github.com/google-ai-edge/mediapipe
 */
class AmphibianCoreService : Service() {

    private val TAG = "AmphibianCore"
    private var nodeProcess: Process? = null
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Core Services
    private lateinit var toolManager: AndroidToolManager
    private lateinit var llmService: LocalLLMService
    private lateinit var tpuService: TPUCapabilityService
    private lateinit var ragService: LocalRAGService
    
    // ToolNeuron Integration Services
    private lateinit var ttsService: TTSService
    private lateinit var documentParser: DocumentParserService
    
    // MediaPipe Integration Services
    private lateinit var visionService: MediaPipeVisionService

    // Event Stream
    private val _messageFlow = MutableSharedFlow<String>(replay = 0)
    val messageFlow: SharedFlow<String> = _messageFlow.asSharedFlow()
    
    // Connection state
    private var isConnected = false
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 5

    inner class LocalBinder : Binder() {
        fun getService(): AmphibianCoreService = this@AmphibianCoreService
    }
    
    // Config
    private val PORT = 3000
    private val NOTIFICATION_CHANNEL_ID = "amphibian_brain"
    private val NOTIFICATION_ID = 1
    
    // Generate a secure random token for this session
    private val AUTH_TOKEN: String by lazy {
        val prefs = getSharedPreferences("amphibian_auth", Context.MODE_PRIVATE)
        prefs.getString("auth_token", null) ?: run {
            val newToken = java.util.UUID.randomUUID().toString()
            prefs.edit().putString("auth_token", newToken).apply()
            newToken
        }
    }

    override fun onCreate() {
        super.onCreate()
        
        // Initialize core services
        tpuService = TPUCapabilityService(this)
        toolManager = AndroidToolManager(this)
        llmService = LocalLLMService(this)
        ragService = LocalRAGService(this)
        
        // Initialize ToolNeuron integration services
        ttsService = TTSService(this)
        documentParser = DocumentParserService(this)
        
        // Initialize MediaPipe vision service
        visionService = MediaPipeVisionService(this)
        
        createNotificationChannel()
        
        // Log TPU capabilities on startup
        val caps = tpuService.detectCapabilities()
        Log.i(TAG, "🦎 Amphibian Core created with ${caps.recommendedBackend} backend")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "🐸 Amphibian Service Starting...")
        
        // Start as foreground service
        startForeground(NOTIFICATION_ID, createNotification("Initializing..."))
        
        scope.launch {
            try {
                // Get TPU capabilities
                val caps = tpuService.detectCapabilities()
                val backendName = when (caps.recommendedBackend) {
                    TPUCapabilityService.AccelerationBackend.TPU -> 
                        "Tensor G${caps.tensorGeneration} TPU"
                    TPUCapabilityService.AccelerationBackend.GPU -> "GPU"
                    TPUCapabilityService.AccelerationBackend.NNAPI -> "NNAPI"
                    TPUCapabilityService.AccelerationBackend.CPU -> "CPU"
                }
                
                updateNotification("Initializing $backendName...")
                
                // Initialize all services in parallel
                val llmJob = async { llmService.initialize() }
                val ragJob = async { ragService.initialize() }
                val ttsJob = async { ttsService.initialize() }
                val docJob = async { documentParser.initialize() }
                val visionJob = async { visionService.initialize() }
                
                bootstrapRuntime()
                startNodeProcess()
                
                // Wait for all services
                val llmReady = llmJob.await()
                val ragReady = ragJob.await()
                val ttsReady = ttsJob.await()
                val docReady = docJob.await()
                val visionReady = visionJob.await()
                
                // Log service status
                val servicesReady = listOf(
                    "LLM" to llmReady,
                    "RAG" to ragReady,
                    "TTS" to ttsReady,
                    "Documents" to docReady,
                    "Vision" to visionReady
                )
                
                val readyCount = servicesReady.count { it.second }
                val totalCount = servicesReady.size
                
                Log.i(TAG, """
                    ╔════════════════════════════════════════════════════════════╗
                    ║     🦎 Amphibian Core Ready! (ToolNeuron + MediaPipe)      ║
                    ╠════════════════════════════════════════════════════════════╣
                    ║ Backend: ${backendName.padEnd(45)}║
                    ║ Device Tier: ${caps.deviceTier.name.padEnd(41)}║
                    ║ Services: $readyCount/$totalCount initialized                              ║
                    ╠════════════════════════════════════════════════════════════╣
                    ║ LLM: ${if (llmReady) "✅" else "❌"} | RAG: ${if (ragReady) "✅" else "❌"} | TTS: ${if (ttsReady) "✅" else "❌"} | Docs: ${if (docReady) "✅" else "❌"} | Vision: ${if (visionReady) "✅" else "❌"}  ║
                    ╚════════════════════════════════════════════════════════════╝
                """.trimIndent())
                
                if (llmReady) {
                    val model = llmService.getCurrentModel() ?: "Unknown"
                    updateNotification("Ready ($backendName) 🦎")
                } else {
                    Log.w(TAG, "LLM initialization failed - running without local AI")
                    updateNotification("Ready (Limited) ⚠️")
                }
                
                delay(2000) // Give Node time to start
                connectBridge()
                
            } catch (e: Exception) {
                Log.e(TAG, "Service startup failed", e)
                updateNotification("Error: ${e.message}")
            }
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Amphibian Brain",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "On-device AI Agent Service"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(status: String): Notification {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle("Amphibian Agent")
                .setContentText(status)
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("Amphibian Agent")
                .setContentText(status)
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .build()
        }
    }

    private fun updateNotification(status: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, createNotification(status))
    }

    private fun bootstrapRuntime() {
        val binDir = File(filesDir, "bin")
        if (!binDir.exists()) binDir.mkdirs()

        val nodeBin = File(binDir, "node")
        val openclawDir = File(filesDir, "openclaw/bridge")
        
        // Extract Node binary from assets
        if (!nodeBin.exists()) {
            Log.d(TAG, "Extracting Node binary from assets...")
            try {
                assets.open("node-bin/node").use { inputStream ->
                    FileOutputStream(nodeBin).use { outputStream ->
                        inputStream.copyTo(outputStream)
                    }
                }
                if (nodeBin.setExecutable(true)) {
                    Log.d(TAG, "✅ Node binary extracted and made executable.")
                } else {
                    Log.w(TAG, "⚠️ Failed to make Node binary executable.")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to extract Node binary", e)
            }
        }
        
        // Extract bridge scripts from assets
        if (!openclawDir.exists()) {
            openclawDir.mkdirs()
            extractAssetFolder("bridge", openclawDir)
        }
    }
    
    private fun extractAssetFolder(assetPath: String, targetDir: File) {
        try {
            val files = assets.list(assetPath) ?: return
            for (file in files) {
                val assetFilePath = "$assetPath/$file"
                val targetFile = File(targetDir, file)
                
                // Check if it's a directory
                val subFiles = assets.list(assetFilePath)
                if (subFiles != null && subFiles.isNotEmpty()) {
                    targetFile.mkdirs()
                    extractAssetFolder(assetFilePath, targetFile)
                } else {
                    // It's a file
                    assets.open(assetFilePath).use { input ->
                        FileOutputStream(targetFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                }
            }
            Log.d(TAG, "✅ Extracted asset folder: $assetPath")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract assets from $assetPath", e)
        }
    }

    private fun startNodeProcess() {
        Log.d(TAG, "🚀 Spawning Node.js process...")
        try {
            val binDir = File(filesDir, "bin")
            val scriptPath = File(filesDir, "openclaw/bridge/server.js").absolutePath
            
            val pb = ProcessBuilder(
                "${binDir.absolutePath}/node",
                scriptPath
            )
            
            val env = pb.environment()
            env["AMPHIBIAN_PORT"] = PORT.toString()
            env["AMPHIBIAN_TOKEN"] = AUTH_TOKEN
            env["ANDROID_FILES_DIR"] = filesDir.absolutePath
            env["OLLAMA_URL"] = "http://127.0.0.1:11434"
            env["TPU_MODEL"] = "gemma:3-4b-it"
            
            pb.directory(filesDir)
            pb.redirectErrorStream(true)
            nodeProcess = pb.start()
            
            // Log Node output in background
            scope.launch {
                nodeProcess?.inputStream?.bufferedReader()?.forEachLine { line ->
                    Log.d(TAG, "[Node] $line")
                }
            }
            
            Log.d(TAG, "✅ Node process spawned! PID: ${getProcessId(nodeProcess)}")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to spawn node process", e)
        }
    }

    private fun connectBridge() {
        val client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .build()

        val request = Request.Builder()
            .url("ws://127.0.0.1:$PORT")
            .addHeader("Sec-WebSocket-Protocol", AUTH_TOKEN)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "🐸 Connected to Amphibian Bridge!")
                isConnected = true
                reconnectAttempts = 0
                scope.launch {
                    _messageFlow.emit("{\"type\":\"STATUS\",\"status\":\"Connected to Agent\"}")
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "📥 Agent Message: ${text.take(200)}")
                handleAgentMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "❌ Bridge connection failed: ${t.message}", t)
                isConnected = false
                
                // Attempt reconnection
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++
                    scope.launch {
                        delay(2000L * reconnectAttempts)
                        connectBridge()
                    }
                }
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "Bridge closed: $reason")
                isConnected = false
            }
        })
    }
    
    private fun handleAgentMessage(text: String) {
        scope.launch {
            try {
                val json = JSONObject(text)
                val type = json.optString("type", "")
                
                when (type) {
                    "TOOL_REQUEST" -> {
                        // Handle tool request from Node.js agent
                        val payload = json.getJSONObject("payload")
                        val toolName = payload.getString("tool")
                        val args = payload.getJSONObject("args")
                        
                        val result = toolManager.executeTool(toolName, args)
                        
                        // Send result back
                        val response = JSONObject().apply {
                            put("type", "TOOL_RESULT")
                            put("payload", JSONObject().apply {
                                put("tool", toolName)
                                put("success", result.success)
                                put("output", result.output)
                            })
                        }
                        webSocket?.send(response.toString())
                    }
                    else -> {
                        // Forward to UI
                        _messageFlow.emit(text)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling agent message", e)
                _messageFlow.emit(text) // Forward raw on error
            }
        }
    }
    
    // Command Interface for UI
    fun executeTask(taskDescription: String) {
        if (!isConnected) {
            scope.launch {
                _messageFlow.emit("{\"type\":\"ERROR\",\"message\":\"Not connected to agent\"}")
            }
            return
        }
        
        val json = JSONObject().apply {
            put("type", "EXECUTE_TASK")
            put("payload", JSONObject().apply {
                put("task", taskDescription)
                put("options", JSONObject().apply {
                    put("stream", true)
                })
            })
        }
        
        webSocket?.send(json.toString())
    }
    
    /**
     * Direct tool call from UI
     */
    fun callTool(server: String, tool: String, args: Map<String, Any>) {
        val json = JSONObject().apply {
            put("type", "CALL_TOOL")
            put("payload", JSONObject().apply {
                put("server", server)
                put("tool", tool)
                put("args", JSONObject(args))
            })
        }
        webSocket?.send(json.toString())
    }
    
    /**
     * Stop current task
     */
    fun stopTask() {
        val json = JSONObject().apply {
            put("type", "STOP_TASK")
        }
        webSocket?.send(json.toString())
    }
    
    /**
     * Check connection status
     */
    fun isAgentConnected(): Boolean = isConnected
    
    /**
     * Check if local LLM is ready
     */
    fun isLocalLLMReady(): Boolean = llmService.isReady()
    
    /**
     * Get TPU capabilities
     */
    fun getTPUCapabilities(): TPUCapabilityService.TPUCapabilities {
        return tpuService.detectCapabilities()
    }
    
    /**
     * Get LLM performance metrics
     */
    fun getLLMPerformanceMetrics(): LocalLLMService.PerformanceMetrics {
        return llmService.getPerformanceMetrics()
    }
    
    /**
     * Get current model name
     */
    fun getCurrentModel(): String? = llmService.getCurrentModel()
    
    /**
     * Get recommended model for this device
     */
    fun getRecommendedModel(): TPUCapabilityService.RecommendedModel {
        return tpuService.getRecommendedModel()
    }
    
    // ===== ToolNeuron Integration: TTS Methods =====
    
    /**
     * Speak text using TTS
     */
    fun speak(text: String): String? {
        return ttsService.speak(text)
    }
    
    /**
     * Speak text and wait for completion
     */
    suspend fun speakAndWait(text: String): Boolean {
        return ttsService.speakAndWait(text)
    }
    
    /**
     * Stop TTS
     */
    fun stopSpeaking() {
        ttsService.stop()
    }
    
    /**
     * Check if TTS is speaking
     */
    fun isSpeaking(): Boolean = ttsService.isSpeaking()
    
    /**
     * Get TTS configuration
     */
    fun getTTSConfiguration(): TTSService.TTSConfiguration {
        return ttsService.getConfiguration()
    }
    
    /**
     * Set TTS speech rate
     */
    fun setTTSSpeechRate(rate: Float) {
        ttsService.setSpeechRate(rate)
    }
    
    /**
     * Enable/disable auto-speak for AI responses
     */
    fun setAutoSpeak(enabled: Boolean) {
        ttsService.setAutoSpeak(enabled)
    }
    
    // ===== ToolNeuron Integration: Document Processing Methods =====
    
    /**
     * Parse a document for RAG
     */
    suspend fun parseDocument(filePath: String): DocumentParserService.ParseResult {
        return documentParser.parseDocument(filePath)
    }
    
    /**
     * Parse a document from URI
     */
    suspend fun parseDocument(uri: Uri, fileName: String?): DocumentParserService.ParseResult {
        return documentParser.parseDocument(uri, fileName)
    }
    
    /**
     * Get supported document extensions
     */
    fun getSupportedDocumentExtensions(): List<String> {
        return documentParser.getSupportedExtensions()
    }
    
    /**
     * Check if document is supported
     */
    fun isDocumentSupported(fileName: String): Boolean {
        return documentParser.isSupported(fileName)
    }
    
    // ===== MediaPipe Integration: Vision Methods =====
    
    /**
     * Detect objects in a bitmap
     */
    suspend fun detectObjects(bitmap: Bitmap): MediaPipeVisionService.VisionResult {
        return visionService.detectObjects(bitmap)
    }
    
    /**
     * Detect faces in a bitmap
     */
    suspend fun detectFaces(bitmap: Bitmap): MediaPipeVisionService.VisionResult {
        return visionService.detectFaces(bitmap)
    }
    
    /**
     * Track hands in a bitmap
     */
    suspend fun trackHands(bitmap: Bitmap): MediaPipeVisionService.VisionResult {
        return visionService.trackHands(bitmap)
    }
    
    /**
     * Process image with all available vision tasks
     */
    suspend fun processImage(bitmap: Bitmap): Map<MediaPipeVisionService.VisionTask, MediaPipeVisionService.VisionResult> {
        return visionService.processImage(bitmap)
    }
    
    /**
     * Get vision service status
     */
    fun getVisionServiceStatus(): MediaPipeVisionService.VisionServiceStatus {
        return visionService.getStatus()
    }
    
    // ===== RAG Methods =====
    
    /**
     * Add memory to RAG
     */
    suspend fun addMemory(text: String): String {
        return ragService.addMemory(text)
    }
    
    /**
     * Retrieve context from RAG
     */
    suspend fun retrieveContext(query: String, limit: Int = 3): String {
        return ragService.retrieveContext(query, limit)
    }
    
    /**
     * Get RAG metrics
     */
    fun getRAGMetrics(): EmbeddingService.EmbeddingMetrics? {
        return ragService.getEmbeddingMetrics()
    }
    
    /**
     * Check if using real embeddings
     */
    fun isUsingRealEmbeddings(): Boolean {
        return ragService.isUsingRealEmbeddings()
    }
    
    // ===== Service Status =====
    
    /**
     * Get comprehensive service status
     */
    fun getServiceStatus(): ServiceStatus {
        return ServiceStatus(
            isConnected = isConnected,
            llmReady = llmService.isReady(),
            llmModel = llmService.getCurrentModel(),
            ttsReady = ttsService.isReady.value,
            visionStatus = visionService.getStatus(),
            ragMemoryCount = ragService.getMemoryCount(),
            ragUsingRealEmbeddings = ragService.isUsingRealEmbeddings(),
            tpuCapabilities = tpuService.detectCapabilities()
        )
    }
    
    data class ServiceStatus(
        val isConnected: Boolean,
        val llmReady: Boolean,
        val llmModel: String?,
        val ttsReady: Boolean,
        val visionStatus: MediaPipeVisionService.VisionServiceStatus,
        val ragMemoryCount: Int,
        val ragUsingRealEmbeddings: Boolean,
        val tpuCapabilities: TPUCapabilityService.TPUCapabilities
    )

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        nodeProcess?.destroy()
        webSocket?.close(1000, "Service Destroyed")
        
        // Close all services
        llmService.close()
        ragService.close()
        ttsService.shutdown()
        visionService.close()
        toolManager.destroy()
        
        Log.d(TAG, "Amphibian Service Destroyed")
    }

    override fun onBind(intent: Intent?): IBinder {
        return LocalBinder()
    }
    
    companion object {
        private val PID_REGEX = Regex("pid=(\\d+)")
    }
    
    private fun getProcessId(p: Process?): Long {
        return try {
            p?.toString()?.let { str ->
                PID_REGEX.find(str)?.groupValues?.get(1)?.toLongOrNull()
            } ?: -1L
        } catch (e: Exception) { -1L }
    }
}

package com.landseek.amphibian.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
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
 * AmphibianCoreService
 *
 * This Foreground Service is responsible for:
 * 1. Extracting the Node.js runtime from assets (if needed).
 * 2. Spawning the Node.js process ("The Brain").
 * 3. Maintaining the WebSocket bridge to the local Node server.
 * 4. Handling Android tool callbacks from the Agent.
 * 5. Managing on-device AI via TPU/MediaPipe.
 */
class AmphibianCoreService : Service() {

    private val TAG = "AmphibianCore"
    private var nodeProcess: Process? = null
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // Tool Manager for native Android capabilities
    private lateinit var toolManager: AndroidToolManager
    private lateinit var llmService: LocalLLMService

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
        toolManager = AndroidToolManager(this)
        llmService = LocalLLMService(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "🐸 Amphibian Service Starting...")
        
        // Start as foreground service
        startForeground(NOTIFICATION_ID, createNotification("Initializing..."))
        
        scope.launch {
            try {
                // Initialize LLM in parallel with runtime setup
                val llmJob = async { llmService.initialize() }
                
                bootstrapRuntime()
                startNodeProcess()
                
                // Wait for LLM init
                val llmReady = llmJob.await()
                Log.d(TAG, "Local LLM ready: $llmReady")
                
                delay(2000) // Give Node time to start
                connectBridge()
                
                updateNotification("Agent Ready 🦎")
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

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        nodeProcess?.destroy()
        webSocket?.close(1000, "Service Destroyed")
        llmService.close()
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

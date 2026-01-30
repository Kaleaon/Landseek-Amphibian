package com.landseek.amphibian.service

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * AmphibianCoreService
 *
 * This Foreground Service is responsible for:
 * 1. Extracting the Node.js runtime from assets (if needed).
 * 2. Spawning the Node.js process ("The Brain").
 * 3. Maintaining the WebSocket bridge to the local Node server.
 * 4. Exposing the Agent's capabilities to the UI.
 */
class AmphibianCoreService : Service() {

    private val TAG = "AmphibianCore"
    private var nodeProcess: Process? = null
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val binder = LocalBinder()
    
    // Config
    private val PORT = 3000
    private val AUTH_TOKEN = "amphibian_local_secret" // In prod, generate this safely

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Amphibian Service Starting...")
        
        scope.launch {
            bootstrapRuntime()
            startNodeProcess()
            connectBridge()
        }

        return START_STICKY
    }

    private fun bootstrapRuntime() {
        val binDir = File(filesDir, "bin")
        if (!binDir.exists()) binDir.mkdirs()

        val nodeBin = File(binDir, "node")
        
        // Simulating extraction logic
        if (!nodeBin.exists()) {
            Log.d(TAG, "Extracting Node binary from assets...")
            // TODO: AssetManager.open("node-bin/node").copyTo(nodeBin)
            // nodeBin.setExecutable(true)
        }
    }

    private fun startNodeProcess() {
        Log.d(TAG, "Spawning Node.js process...")
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
            // Pass Android-specific paths for tool access
            env["ANDROID_FILES_DIR"] = filesDir.absolutePath
            
            pb.directory(filesDir)
            nodeProcess = pb.start()
            
            Log.d(TAG, "Node process spawned! PID: ${getProcessId(nodeProcess)}")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to spawn node process", e)
        }
    }

    private fun connectBridge() {
        // Wait a moment for Node to boot
        Thread.sleep(2000)
        
        val client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()

        val request = Request.Builder()
            .url("ws://127.0.0.1:$PORT")
            .addHeader("Sec-WebSocket-Protocol", AUTH_TOKEN)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "Connected to Amphibian Bridge! 🐸")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Agent Says: $text")
                // TODO: Broadcast this to the UI via LiveData/Flow
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "Bridge connection failed", t)
            }
        })
    }
    
    // Command Interface for UI
    fun executeTask(taskDescription: String) {
        val json = JSONObject()
        json.put("type", "EXECUTE_TASK")
        
        val payload = JSONObject()
        payload.put("task", taskDescription)
        json.put("payload", payload)
        
        webSocket?.send(json.toString())
    }

    override fun onDestroy() {
        super.onDestroy()
        nodeProcess?.destroy()
        webSocket?.close(1000, "Service Destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? {
        return binder
    }

    inner class LocalBinder : Binder() {
        fun getService(): AmphibianCoreService = this@AmphibianCoreService
    }
    
    // Java 9+ ProcessHandle workaround for older Android APIs if needed
    private fun getProcessId(p: Process?): Long {
        return try {
            p?.toString()?.split("pid=")?.get(1)?.split("}")?.get(0)?.toLong() ?: -1
        } catch (e: Exception) { -1 }
    }
}

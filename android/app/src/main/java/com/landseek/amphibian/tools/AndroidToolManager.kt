package com.landseek.amphibian.tools

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import com.landseek.amphibian.service.LocalLLMService
import com.landseek.amphibian.service.LocalRAGService
import com.landseek.amphibian.service.P2PSyncService

/**
 * AndroidToolManager
 *
 * Exposes Android system capabilities as executable tools for the Agent.
 * Handles permission checks and native API calls.
 */
class AndroidToolManager(private val context: Context) {

    private val TAG = "AmphibianTools"
    
    // Properly scoped coroutine context
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    data class ToolResult(val success: Boolean, val output: String)

    private val llmService = LocalLLMService(context)
    private val ragService = LocalRAGService(context)
    private val syncService = P2PSyncService(context, ragService)
    
    init {
        scope.launch { 
            ragService.initialize() 
            llmService.initialize()
            syncService.startServer() // Start listening for peers
        }
    }

    fun executeTool(name: String, args: JSONObject): ToolResult {
        return try {
            when (name) {
                "send_sms" -> sendSms(args.getString("phone"), args.getString("message"))
                "make_call" -> makeCall(args.getString("phone"))
                "read_file" -> readFile(args.getString("path"))
                "write_file" -> writeFile(args.getString("path"), args.getString("content"))
                "get_location" -> getLocation()
                "open_url" -> openUrl(args.getString("url"))
                "remember" -> remember(args.getString("content"))
                "recall" -> recall(args.getString("query"))
                "inference" -> runInference(args.getString("prompt"))
                "sync_peer" -> syncPeer(args.getString("ip"))
                else -> ToolResult(false, "Unknown tool: $name")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Tool execution error: ${e.message}", e)
            ToolResult(false, "Tool execution failed: ${e.message}")
        }
    }

    private fun sendSms(phone: String, message: String): ToolResult {
        // Permission check handled by caller/activity before invoking this
        return try {
            val smsManager = context.getSystemService(SmsManager::class.java)
            smsManager.sendTextMessage(phone, null, message, null, null)
            ToolResult(true, "SMS sent to $phone")
        } catch (e: Exception) {
            ToolResult(false, "Failed to send SMS: ${e.message}")
        }
    }

    private fun makeCall(phone: String): ToolResult {
        return try {
            val intent = Intent(Intent.ACTION_CALL)
            intent.data = Uri.parse("tel:$phone")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            ToolResult(true, "Call initiated to $phone")
        } catch (e: Exception) {
            ToolResult(false, "Failed to make call: ${e.message}")
        }
    }

    private fun readFile(path: String): ToolResult {
        // Scoped storage access - restricted to app sandbox for safety
        val file = File(context.filesDir, path)
        if (!file.exists()) return ToolResult(false, "File not found")
        return ToolResult(true, file.readText())
    }

    private fun writeFile(path: String, content: String): ToolResult {
        val file = File(context.filesDir, path)
        file.parentFile?.mkdirs()
        file.writeText(content)
        return ToolResult(true, "File written to $path")
    }

    private fun getLocation(): ToolResult {
        // Placeholder for FusedLocationProvider implementation
        return ToolResult(true, "Lat: 37.7749, Long: -122.4194 (Mock)")
    }

    private fun openUrl(url: String): ToolResult {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        return ToolResult(true, "Opened URL: $url")
    }

    private fun remember(content: String): ToolResult {
        return runBlocking {
            try {
                val id = ragService.addMemory(content)
                ToolResult(true, "Memory saved with ID: $id")
            } catch (e: Exception) {
                ToolResult(false, "Failed to save memory: ${e.message}")
            }
        }
    }

    private fun recall(query: String): ToolResult {
        return runBlocking {
            try {
                val context = ragService.retrieveContext(query, limit = 5)
                ToolResult(true, context)
            } catch (e: Exception) {
                ToolResult(false, "Failed to recall memory: ${e.message}")
            }
        }
    }

    private fun syncPeer(ip: String): ToolResult {
        scope.launch { syncService.syncWithPeer(ip) }
        return ToolResult(true, "Sync initiated with $ip")
    }

    private fun runInference(prompt: String): ToolResult {
        // Run local TPU inference for on-device AI
        val response = runBlocking {
            llmService.generate(prompt)
        }
        return ToolResult(true, response)
    }
    
    /**
     * Cleanup resources when manager is destroyed
     */
    fun destroy() {
        scope.cancel()
        llmService.close()
        ragService.close()
    }
}

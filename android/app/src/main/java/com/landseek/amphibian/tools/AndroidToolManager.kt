package com.landseek.amphibian.tools

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telephony.SmsManager
import android.util.Log
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.launch
import kotlinx.coroutines.GlobalScope
import org.json.JSONObject
import java.io.File

/**
 * AndroidToolManager
 *
 * Exposes Android system capabilities as executable tools for the Agent.
 * Handles permission checks and native API calls.
 */
class AndroidToolManager(private val context: Context) {

    private val TAG = "AmphibianTools"

    data class ToolResult(val success: Boolean, val output: String)

    private val llmService = com.landseek.amphibian.service.LocalLLMService(context)
    private val ragService = com.landseek.amphibian.service.LocalRAGService(context)
    private val syncService = com.landseek.amphibian.service.P2PSyncService(context, ragService)
    
    init {
        kotlinx.coroutines.GlobalScope.launch {
            ragService.initialize() 
            syncService.startServer() // Start listening for peers
        }
    }

    /**
     * Note: executeTool performs blocking calls (runBlocking) for memory + inference.
     * Call from a background thread to avoid UI freezes.
     * Ensure runtime permissions are granted before invoking sensitive tools.
     */
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
                "sync_peer" -> syncPeer(args.getString("ip"))
                "run_inference" -> runInference(args.getString("prompt"))
                else -> ToolResult(false, "Unknown tool: $name")
            }
        } catch (e: Exception) {
            ToolResult(false, "Tool failed: ${e.message}")
        }
    }


    // ...

    private fun syncPeer(ip: String): ToolResult {
        kotlinx.coroutines.GlobalScope.launch { syncService.syncWithPeer(ip) }
        return ToolResult(true, "Sync initiated with $ip")
    }

    private fun remember(content: String): ToolResult {
        val id = runBlocking { ragService.addMemory(content) }
        return ToolResult(true, "Saved memory $id")
    }

    private fun recall(query: String): ToolResult {
        val context = runBlocking { ragService.retrieveContext(query) }
        return ToolResult(true, context)
    }

    private fun runInference(prompt: String): ToolResult {
        // This is a blocking call in this simple architecture
        // Ideally handled via async/callback, but for MVP:
        val response = kotlinx.coroutines.runBlocking {
            llmService.generate(prompt)
        }
        return ToolResult(true, response)
    }

    private fun sendSms(phone: String, message: String): ToolResult {
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
        // Scoped storage access
        val file = File(context.filesDir, path) // Restricted to app sandbox for safety first
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
}

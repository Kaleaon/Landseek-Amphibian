package com.landseek.amphibian.tools

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
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
    
    init {
        // Init async
        kotlinx.coroutines.GlobalScope.launch { 
            ragService.initialize() 
        }
    }

    fun executeTool(name: String, args: JSONObject): ToolResult {
        return try {
            when (name) {
                "send_sms" -> sendSMS(args.getString("phone"), args.getString("message"))
                "make_call" -> makeCall(args.getString("phone"))
                "read_file" -> readFile(args.getString("path"))
                "write_file" -> writeFile(args.getString("path"), args.getString("content"))
                "get_location" -> getLocation()
                "open_url" -> openUrl(args.getString("url"))
                "local_inference" -> runInference(args.getString("prompt"))
                "remember" -> remember(args.getString("content"))
                "recall" -> recall(args.getString("query"))
                else -> ToolResult(false, "Unknown tool: $name")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Tool execution failed: $name", e)
            ToolResult(false, "Error: ${e.message}")
        }
    }

    // ... existing methods ...
    
    private fun remember(content: String): ToolResult {
        val id = kotlinx.coroutines.runBlocking { ragService.addMemory(content) }
        return ToolResult(true, "Memory stored. ID: $id")
    }
    
    private fun recall(query: String): ToolResult {
        val context = kotlinx.coroutines.runBlocking { ragService.retrieveContext(query) }
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
}
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

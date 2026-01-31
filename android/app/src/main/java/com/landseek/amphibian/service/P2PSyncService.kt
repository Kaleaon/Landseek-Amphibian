package com.landseek.amphibian.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.io.File
import java.net.ServerSocket
import java.net.Socket
import org.json.JSONArray
import org.json.JSONObject

/**
 * P2PSyncService
 * 
 * Allows two Amphibian instances to synchronize their Memory (RAG) 
 * and Mind Maps directly over LAN.
 */
class P2PSyncService(private val context: Context, private val ragService: LocalRAGService) {

    private val TAG = "AmphibianSync"
    private val SYNC_PORT = 8888
    private var isSyncing = false

    suspend fun startServer() {
        withContext(Dispatchers.IO) {
            try {
                val serverSocket = ServerSocket(SYNC_PORT)
                Log.d(TAG, "P2P Sync Server listening on port $SYNC_PORT")
                
                while (true) {
                    val client = serverSocket.accept()
                    handleSyncRequest(client)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Sync Server Error", e)
            }
        }
    }

    suspend fun syncWithPeer(ipAddress: String) {
        withContext(Dispatchers.IO) {
            try {
                Log.d(TAG, "Initiating sync with $ipAddress...")
                val socket = Socket(ipAddress, SYNC_PORT)
                socket.soTimeout = 10000 // 10 sec timeout

                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                val writer = PrintWriter(socket.getOutputStream(), true)

                // Get last successful sync time with this peer
                val prefs = context.getSharedPreferences("p2p_sync_prefs", Context.MODE_PRIVATE)
                val lastSyncTime = prefs.getLong("last_sync_$ipAddress", 0L)

                // 1. Send handshake/request
                val request = JSONObject().apply {
                    put("type", "SYNC_REQUEST")
                    put("lastSyncTimestamp", lastSyncTime)
                }
                sendMessage(writer, request)

                // 2. Receive response
                val response = readMessage(reader)
                if (response != null && response.getString("type") == "SYNC_RESPONSE") {
                    val serverTimestamp = response.getLong("serverTimestamp")
                    val memoriesArray = response.getJSONArray("memories")
                    val newMemories = mutableListOf<LocalRAGService.MemoryChunk>()
                    for (i in 0 until memoriesArray.length()) {
                        newMemories.add(ragService.jsonToMemory(memoriesArray.getJSONObject(i)))
                    }
                    ragService.mergeMemories(newMemories)

                    // Update last sync time to server's time (assuming clocks are roughly synced or using server time as high watermark)
                    with(prefs.edit()) {
                        putLong("last_sync_$ipAddress", serverTimestamp)
                        apply()
                    }

                    // 3. Send my missing chunks (PUSH) - send everything since the LAST time we synced
                    val memoriesToSend = ragService.getMemoriesSince(lastSyncTime)
                    val pushMsg = JSONObject().apply {
                        put("type", "PUSH_MEMORIES")
                        val arr = JSONArray()
                        memoriesToSend.forEach { arr.put(ragService.memoryToJson(it)) }
                        put("memories", arr)
                    }
                    sendMessage(writer, pushMsg)

                    Log.d(TAG, "Sync complete! Merged ${newMemories.size} items, Sent ${memoriesToSend.size} items.")
                } else {
                    Log.e(TAG, "Invalid or missing response from peer")
                }

                socket.close()
            } catch (e: Exception) {
                Log.e(TAG, "Sync Client Error", e)
            }
        }
    }

    private suspend fun handleSyncRequest(socket: Socket) {
        withContext(Dispatchers.IO) {
            try {
                socket.soTimeout = 10000
                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                val writer = PrintWriter(socket.getOutputStream(), true)

                val request = readMessage(reader)

                if (request != null && request.getString("type") == "SYNC_REQUEST") {
                    val clientTimestamp = request.getLong("lastSyncTimestamp")

                    // Respond with my memories > clientTimestamp
                    val myTimestamp = ragService.getLatestTimestamp()
                    val memoriesToSend = ragService.getMemoriesSince(clientTimestamp)

                    val response = JSONObject().apply {
                        put("type", "SYNC_RESPONSE")
                        put("serverTimestamp", myTimestamp)
                        val arr = JSONArray()
                        memoriesToSend.forEach { arr.put(ragService.memoryToJson(it)) }
                        put("memories", arr)
                    }
                    sendMessage(writer, response)

                    // Wait for PUSH_MEMORIES
                    val nextMsg = readMessage(reader)
                    if (nextMsg != null && nextMsg.getString("type") == "PUSH_MEMORIES") {
                        val memoriesArray = nextMsg.getJSONArray("memories")
                        val newMemories = mutableListOf<LocalRAGService.MemoryChunk>()
                        for (i in 0 until memoriesArray.length()) {
                            newMemories.add(ragService.jsonToMemory(memoriesArray.getJSONObject(i)))
                        }
                        ragService.mergeMemories(newMemories)
                        Log.d(TAG, "Server received ${newMemories.size} memories via PUSH")
                    }
                }
                socket.close()
            } catch (e: Exception) {
                Log.e(TAG, "Sync Server Error handling request", e)
            }
        }
    }

    private fun sendMessage(writer: PrintWriter, message: JSONObject) {
        writer.println(message.toString())
    }

    private fun readMessage(reader: BufferedReader): JSONObject? {
        val line = reader.readLine()
        return if (line != null) JSONObject(line) else null
    }
}

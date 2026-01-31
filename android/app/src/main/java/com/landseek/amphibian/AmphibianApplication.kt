package com.landseek.amphibian

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log

/**
 * AmphibianApplication
 * 
 * Main Application class for Landseek-Amphibian.
 * Handles global initialization and notification channels.
 */
class AmphibianApplication : Application() {

    companion object {
        const val TAG = "Amphibian"
        const val NOTIFICATION_CHANNEL_ID = "amphibian_brain"
        const val NOTIFICATION_CHANNEL_NAME = "Amphibian Service"
        
        private lateinit var instance: AmphibianApplication
        
        fun getInstance(): AmphibianApplication = instance
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        
        Log.d(TAG, "🐸 Amphibian Application Starting...")
        
        createNotificationChannel()
        extractBridgeAssets()
        
        Log.d(TAG, "✅ Amphibian Application Initialized")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_description)
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
            
            Log.d(TAG, "Notification channel created")
        }
    }

    /**
     * Extract bridge code from assets to internal storage on first run.
     * This copies the Node.js server and dependencies to a writable location.
     */
    private fun extractBridgeAssets() {
        val bridgeDir = getDir("bridge", Context.MODE_PRIVATE)
        val versionFile = java.io.File(bridgeDir, ".version")
        val currentVersion = try {
            assets.open("bridge/.version").bufferedReader().readText().trim()
        } catch (e: Exception) {
            "1.0.0"
        }
        
        // Check if already extracted with same version
        if (versionFile.exists() && versionFile.readText().trim() == currentVersion) {
            Log.d(TAG, "Bridge assets already extracted (v$currentVersion)")
            return
        }
        
        Log.d(TAG, "Extracting bridge assets to ${bridgeDir.absolutePath}")
        
        try {
            // List all files in bridge folder
            val bridgeAssets = assets.list("bridge") ?: emptyArray()
            
            for (asset in bridgeAssets) {
                copyAssetRecursive("bridge/$asset", bridgeDir)
            }
            
            // Write version file
            versionFile.writeText(currentVersion)
            
            Log.d(TAG, "✅ Bridge assets extracted successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract bridge assets", e)
        }
    }

    private fun copyAssetRecursive(assetPath: String, targetDir: java.io.File) {
        val assetList = assets.list(assetPath)
        
        if (assetList.isNullOrEmpty()) {
            // It's a file, copy it
            val fileName = assetPath.substringAfterLast("/")
            val targetFile = java.io.File(targetDir, fileName)
            
            assets.open(assetPath).use { input ->
                targetFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            
            // Make executable if it's a binary
            if (fileName == "node" || fileName.endsWith(".sh")) {
                targetFile.setExecutable(true)
            }
        } else {
            // It's a directory, recurse
            val dirName = assetPath.substringAfterLast("/")
            val subDir = java.io.File(targetDir, dirName)
            subDir.mkdirs()
            
            for (child in assetList) {
                copyAssetRecursive("$assetPath/$child", subDir)
            }
        }
    }

    /**
     * Get the path to the extracted bridge directory
     */
    fun getBridgePath(): String {
        return getDir("bridge", Context.MODE_PRIVATE).absolutePath
    }

    /**
     * Get the path to the Node.js binary
     */
    fun getNodeBinaryPath(): String {
        return "${getDir("node-bin", Context.MODE_PRIVATE).absolutePath}/node"
    }
}

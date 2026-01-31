package com.landseek.amphibian

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.landseek.amphibian.service.AmphibianCoreService

/**
 * BootReceiver
 * 
 * Automatically starts the Amphibian service when the device boots.
 * This ensures the AI agent is always available.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "AmphibianBoot"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            Log.d(TAG, "🐸 Boot completed, starting Amphibian service...")
            
            try {
                val serviceIntent = Intent(context, AmphibianCoreService::class.java)
                context.startForegroundService(serviceIntent)
                Log.d(TAG, "✅ Amphibian service started on boot")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start service on boot", e)
            }
        }
    }
}

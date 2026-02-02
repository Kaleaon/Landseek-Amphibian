package com.landseek.amphibian.proactive

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONObject

class TriggerActionDispatcher(private val context: Context) {

    private val CHANNEL_ID = "amphibian_proactive"

    init {
        createNotificationChannel()
    }

    fun dispatch(trigger: Trigger) {
        // Parse action config
        val actionJson = try {
            JSONObject(trigger.action)
        } catch (e: Exception) {
            JSONObject()
        }

        val message = actionJson.optString("message", "Proactive Alert")
        val speak = actionJson.optBoolean("speak", false)

        // Show notification
        showNotification(trigger.type.name, message, trigger.priority)

        // If speak is true, broadcast an intent that AmphibianCoreService can listen to
        if (speak) {
            val intent = Intent("com.landseek.amphibian.SPEAK_ACTION")
            intent.setPackage(context.packageName) // Restrict to own package
            intent.putExtra("text", message)
            context.sendBroadcast(intent)
        }
    }

    private fun showNotification(title: String, message: String, priority: Int) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Intent to open the app
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(if (priority > 0) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)

        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Proactive Triggers"
            val descriptionText = "Notifications from proactive agent triggers"
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
}

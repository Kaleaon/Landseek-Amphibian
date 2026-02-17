package com.landseek.amphibian.proactive

import android.Manifest
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.provider.CalendarContract
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.File
import java.util.Calendar

class ProactiveManager(private val context: Context) {

    private val store = TriggerStore.getInstance(context)
    private val dispatcher = TriggerActionDispatcher(context)
    private val TAG = "ProactiveManager"

    fun addTrigger(trigger: Trigger) {
        store.saveTrigger(trigger)
        Log.d(TAG, "Trigger added: ${trigger.id}")
    }

    fun removeTrigger(triggerId: String) {
        store.deleteTrigger(triggerId)
        Log.d(TAG, "Trigger removed: $triggerId")
    }

    fun getTriggers(): List<Trigger> {
        return store.getAllTriggers()
    }

    fun evaluateTriggers() {
        Log.d(TAG, "Evaluating triggers...")
        // Load all triggers first
        val triggers = store.getAllTriggers().toMutableList()
        val now = System.currentTimeMillis()
        var hasChanges = false

        for (i in triggers.indices) {
            val trigger = triggers[i]
            if (!trigger.isActive) continue

            if (checkCondition(trigger, now)) {
                Log.d(TAG, "Trigger fired: ${trigger.id}")

                var actionExecuted = false
                // Permission check for Notifications
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED) {
                        dispatcher.dispatch(trigger)
                        actionExecuted = true
                    } else {
                        Log.w(TAG, "Cannot dispatch notification: Permission denied")
                    }
                } else {
                    dispatcher.dispatch(trigger)
                    actionExecuted = true
                }

                if (actionExecuted) {
                    // Update trigger state in memory
                    val updatedTrigger = trigger.copy(lastRun = now)
                    triggers[i] = updatedTrigger
                    hasChanges = true
                }
            }
        }

        // Save changes in batch if any
        if (hasChanges) {
            store.saveTriggers(triggers)
        }
    }

    private fun checkCondition(trigger: Trigger, now: Long): Boolean {
        return try {
            val config = JSONObject(trigger.config)
            when (trigger.type) {
                TriggerType.TIME -> checkTimeCondition(config, now, trigger.lastRun)
                TriggerType.BATTERY -> checkBatteryCondition(config)
                TriggerType.THRESHOLD -> checkThresholdCondition(config)
                TriggerType.EVENT -> checkCalendarCondition(config, now)
                TriggerType.LOCATION -> checkLocationCondition(config)
                else -> false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking condition for trigger ${trigger.id}", e)
            false
        }
    }

    private fun checkTimeCondition(config: JSONObject, now: Long, lastRun: Long): Boolean {
        val targetTime = config.optLong("timestamp", 0)
        val interval = config.optLong("interval", 0)

        if (targetTime > 0) {
            // One-off time trigger
            // Fire if now >= targetTime AND we haven't fired yet (lastRun < targetTime)
            return now >= targetTime && lastRun < targetTime
        } else if (interval > 0) {
            // Periodic trigger
            // Fire if now >= lastRun + interval
            // Let's say if lastRun is 0, fire now.
            return now >= lastRun + interval
        }
        return false
    }

    private fun checkBatteryCondition(config: JSONObject): Boolean {
        val threshold = config.optInt("level", 20)
        val operator = config.optString("operator", "<") // <, >, ==, <=, >=

        val batteryStatus: Intent? = IntentFilter(Intent.ACTION_BATTERY_CHANGED).let { ifilter ->
            context.registerReceiver(null, ifilter)
        }
        val level: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale: Int = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        if (scale == 0) return false
        val batteryPct = level * 100 / scale.toFloat()

        return when (operator) {
            "<" -> batteryPct < threshold
            "<=" -> batteryPct <= threshold
            ">" -> batteryPct > threshold
            ">=" -> batteryPct >= threshold
            "==" -> batteryPct.toInt() == threshold
            else -> false
        }
    }

    private fun checkThresholdCondition(config: JSONObject): Boolean {
        val type = config.optString("metric", "")
        if (type == "storage") {
             val thresholdMb = config.optLong("free_mb", 1000)
             val freeBytes = File(context.filesDir.absolutePath).freeSpace
             val freeMb = freeBytes / (1024 * 1024)
             return freeMb < thresholdMb
        }
        return false
    }

    private fun checkCalendarCondition(config: JSONObject, now: Long): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Calendar permission denied")
            return false
        }

        val keyword = config.optString("keyword", "")
        val lookaheadMs = config.optLong("lookahead_ms", 3600000) // Default 1 hour

        val projection = arrayOf(CalendarContract.Events.TITLE, CalendarContract.Events.DTSTART)
        val selection = "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTSTART} <= ?"
        val selectionArgs = arrayOf(now.toString(), (now + lookaheadMs).toString())

        try {
            val cursor = context.contentResolver.query(
                CalendarContract.Events.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                null
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val title = it.getString(0) ?: ""
                    if (keyword.isEmpty() || title.contains(keyword, ignoreCase = true)) {
                        return true // Found matching event
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error querying calendar", e)
        }
        return false
    }

    private fun checkLocationCondition(config: JSONObject): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Location permission denied")
            return false
        }

        val targetLat = config.optDouble("lat", 0.0)
        val targetLng = config.optDouble("lng", 0.0)
        val radiusMeters = config.optDouble("radius", 100.0)

        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

        // Simple check using last known location (avoids active battery drain)
        val location = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)

        if (location != null) {
            val results = FloatArray(1)
            Location.distanceBetween(location.latitude, location.longitude, targetLat, targetLng, results)
            return results[0] <= radiusMeters
        }

        return false
    }
}

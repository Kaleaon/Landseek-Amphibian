package com.landseek.amphibian.service

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar
import java.util.UUID

/**
 * ProactiveAgentService
 * 
 * Enables the AI agent to reach out to the user unprompted through:
 * - Scheduled reminders and alarms
 * - Time-based triggers (daily briefings, etc.)
 * - Condition-based triggers (battery level, location, etc.)
 * - Notification monitoring triggers
 * - Custom event triggers
 * 
 * This allows the agent to be truly proactive rather than purely reactive.
 * 
 * Features:
 * - One-time and recurring reminders
 * - Cron-like scheduling
 * - Location-based triggers (geofencing)
 * - System event triggers (charging, connectivity, etc.)
 * - Notification listener integration
 * - Custom trigger definitions
 * - Persistent storage of triggers
 */
class ProactiveAgentService(private val context: Context) {
    
    private val TAG = "ProactiveAgent"
    
    // Storage file
    private val TRIGGERS_FILE = "proactive_triggers.json"
    
    // Notification channel
    private val CHANNEL_ID = "amphibian_proactive"
    private val CHANNEL_NAME = "Amphibian Proactive Alerts"
    
    // Service state
    private var isInitialized = false
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    // Trigger storage
    private val triggers = mutableMapOf<String, Trigger>()
    private val activeTriggers = mutableSetOf<String>()
    
    // Event flow for agent to consume
    private val _triggerEvents = MutableSharedFlow<TriggerEvent>(replay = 1, extraBufferCapacity = 10)
    val triggerEvents: Flow<TriggerEvent> = _triggerEvents.asSharedFlow()
    
    // State
    private val _activeTriggerCount = MutableStateFlow(0)
    val activeTriggerCount: StateFlow<Int> = _activeTriggerCount.asStateFlow()
    
    // System services
    private val alarmManager by lazy { context.getSystemService(Context.ALARM_SERVICE) as AlarmManager }
    private val notificationManager by lazy { context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager }
    
    // System event receiver
    private var systemEventReceiver: BroadcastReceiver? = null
    
    /**
     * Trigger types
     */
    enum class TriggerType {
        REMINDER,           // One-time reminder
        RECURRING,          // Recurring (daily, weekly, etc.)
        SYSTEM_EVENT,       // System events (charging, connectivity)
        LOCATION,           // Location-based (geofencing)
        TIME_BASED,         // Time-based (morning briefing, etc.)
        NOTIFICATION,       // When specific notifications arrive
        CUSTOM              // Custom condition
    }
    
    /**
     * Recurrence patterns
     */
    enum class RecurrencePattern {
        NONE,               // One-time
        DAILY,              // Every day
        WEEKLY,             // Every week
        MONTHLY,            // Every month
        WEEKDAYS,           // Monday-Friday
        WEEKENDS,           // Saturday-Sunday
        CUSTOM              // Custom cron-like pattern
    }
    
    /**
     * System events that can be monitored
     */
    enum class SystemEvent {
        BATTERY_LOW,        // Battery below threshold
        BATTERY_CHARGED,    // Battery fully charged
        CHARGING_STARTED,   // Device started charging
        CHARGING_STOPPED,   // Device stopped charging
        WIFI_CONNECTED,     // Connected to WiFi
        WIFI_DISCONNECTED,  // Disconnected from WiFi
        SCREEN_ON,          // Screen turned on
        SCREEN_OFF,         // Screen turned off
        BOOT_COMPLETED,     // Device boot completed
        HEADPHONES_CONNECTED,   // Headphones connected
        HEADPHONES_DISCONNECTED // Headphones disconnected
    }
    
    /**
     * Trigger definition
     */
    data class Trigger(
        val id: String = UUID.randomUUID().toString(),
        val type: TriggerType,
        val name: String,
        val description: String,
        val enabled: Boolean = true,
        val createdAt: Long = System.currentTimeMillis(),
        
        // Time-based triggers
        val triggerTimeMs: Long? = null,        // For one-time reminders
        val recurrence: RecurrencePattern = RecurrencePattern.NONE,
        val timeOfDay: Int? = null,             // Minutes since midnight (for recurring)
        val daysOfWeek: Set<Int>? = null,       // For custom weekly patterns (1=Sunday, 7=Saturday)
        
        // System event triggers
        val systemEvent: SystemEvent? = null,
        val batteryThreshold: Int? = null,      // For battery triggers
        
        // Location triggers
        val latitude: Double? = null,
        val longitude: Double? = null,
        val radiusMeters: Float? = null,
        val enterGeofence: Boolean = true,      // true = enter, false = exit
        
        // Notification triggers
        val notificationPackage: String? = null,
        val notificationTitleContains: String? = null,
        
        // Action to take
        val agentPrompt: String,                // What to tell the agent
        val showNotification: Boolean = true,   // Show notification to user
        val notificationTitle: String? = null,
        val notificationMessage: String? = null,
        
        // Metadata
        val metadata: Map<String, String> = emptyMap()
    )
    
    /**
     * Trigger event (emitted when trigger fires)
     */
    data class TriggerEvent(
        val triggerId: String,
        val triggerName: String,
        val type: TriggerType,
        val agentPrompt: String,
        val timestamp: Long = System.currentTimeMillis(),
        val metadata: Map<String, String> = emptyMap()
    )
    
    /**
     * Initialize the proactive agent service
     */
    fun initialize(): Boolean {
        if (isInitialized) {
            Log.d(TAG, "Proactive agent service already initialized")
            return true
        }
        
        try {
            // Create notification channel
            createNotificationChannel()
            
            // Load saved triggers
            loadTriggers()
            
            // Register system event receiver
            registerSystemEventReceiver()
            
            // Reschedule all time-based triggers
            rescheduleAllAlarms()
            
            isInitialized = true
            
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║         ✅ Proactive Agent Service Initialized             ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Loaded Triggers: ${triggers.size.toString().padEnd(39)}║
                ║ Active Triggers: ${activeTriggers.size.toString().padEnd(39)}║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            
            return true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize proactive agent service: ${e.message}", e)
            return false
        }
    }
    
    /**
     * Create a one-time reminder
     */
    fun createReminder(
        name: String,
        description: String,
        triggerTimeMs: Long,
        agentPrompt: String,
        notificationTitle: String? = null,
        notificationMessage: String? = null
    ): Trigger {
        val trigger = Trigger(
            type = TriggerType.REMINDER,
            name = name,
            description = description,
            triggerTimeMs = triggerTimeMs,
            agentPrompt = agentPrompt,
            notificationTitle = notificationTitle ?: "Reminder: $name",
            notificationMessage = notificationMessage ?: description
        )
        
        addTrigger(trigger)
        scheduleAlarm(trigger)
        
        Log.d(TAG, "Created reminder: $name at ${java.util.Date(triggerTimeMs)}")
        return trigger
    }
    
    /**
     * Create a recurring trigger (e.g., daily briefing)
     */
    fun createRecurringTrigger(
        name: String,
        description: String,
        recurrence: RecurrencePattern,
        hourOfDay: Int,
        minuteOfHour: Int,
        agentPrompt: String,
        daysOfWeek: Set<Int>? = null
    ): Trigger {
        val timeOfDay = hourOfDay * 60 + minuteOfHour
        
        val trigger = Trigger(
            type = TriggerType.RECURRING,
            name = name,
            description = description,
            recurrence = recurrence,
            timeOfDay = timeOfDay,
            daysOfWeek = daysOfWeek,
            agentPrompt = agentPrompt,
            notificationTitle = name,
            notificationMessage = description
        )
        
        addTrigger(trigger)
        scheduleRecurringAlarm(trigger)
        
        Log.d(TAG, "Created recurring trigger: $name (${recurrence.name}) at $hourOfDay:${minuteOfHour.toString().padStart(2, '0')}")
        return trigger
    }
    
    /**
     * Create a system event trigger
     */
    fun createSystemEventTrigger(
        name: String,
        description: String,
        systemEvent: SystemEvent,
        agentPrompt: String,
        batteryThreshold: Int? = null
    ): Trigger {
        val trigger = Trigger(
            type = TriggerType.SYSTEM_EVENT,
            name = name,
            description = description,
            systemEvent = systemEvent,
            batteryThreshold = batteryThreshold,
            agentPrompt = agentPrompt,
            notificationTitle = name,
            notificationMessage = description
        )
        
        addTrigger(trigger)
        
        Log.d(TAG, "Created system event trigger: $name for ${systemEvent.name}")
        return trigger
    }
    
    /**
     * Create a location-based trigger (geofence)
     */
    fun createLocationTrigger(
        name: String,
        description: String,
        latitude: Double,
        longitude: Double,
        radiusMeters: Float = 100f,
        enterGeofence: Boolean = true,
        agentPrompt: String
    ): Trigger {
        val trigger = Trigger(
            type = TriggerType.LOCATION,
            name = name,
            description = description,
            latitude = latitude,
            longitude = longitude,
            radiusMeters = radiusMeters,
            enterGeofence = enterGeofence,
            agentPrompt = agentPrompt,
            notificationTitle = name,
            notificationMessage = description
        )
        
        addTrigger(trigger)
        // Note: Geofence registration would happen here (requires location permission)
        
        Log.d(TAG, "Created location trigger: $name at ($latitude, $longitude)")
        return trigger
    }
    
    /**
     * Create a notification-based trigger
     */
    fun createNotificationTrigger(
        name: String,
        description: String,
        packageName: String,
        titleContains: String? = null,
        agentPrompt: String
    ): Trigger {
        val trigger = Trigger(
            type = TriggerType.NOTIFICATION,
            name = name,
            description = description,
            notificationPackage = packageName,
            notificationTitleContains = titleContains,
            agentPrompt = agentPrompt,
            showNotification = false // Don't show our own notification for notification triggers
        )
        
        addTrigger(trigger)
        
        Log.d(TAG, "Created notification trigger: $name for package $packageName")
        return trigger
    }
    
    /**
     * Add a trigger to storage
     */
    private fun addTrigger(trigger: Trigger) {
        triggers[trigger.id] = trigger
        if (trigger.enabled) {
            activeTriggers.add(trigger.id)
        }
        _activeTriggerCount.value = activeTriggers.size
        saveTriggers()
    }
    
    /**
     * Remove a trigger
     */
    fun removeTrigger(triggerId: String): Boolean {
        val trigger = triggers.remove(triggerId) ?: return false
        activeTriggers.remove(triggerId)
        
        // Cancel alarm if time-based
        if (trigger.type == TriggerType.REMINDER || trigger.type == TriggerType.RECURRING) {
            cancelAlarm(triggerId)
        }
        
        _activeTriggerCount.value = activeTriggers.size
        saveTriggers()
        
        Log.d(TAG, "Removed trigger: ${trigger.name}")
        return true
    }
    
    /**
     * Enable/disable a trigger
     */
    fun setTriggerEnabled(triggerId: String, enabled: Boolean): Boolean {
        val trigger = triggers[triggerId] ?: return false
        val updatedTrigger = trigger.copy(enabled = enabled)
        triggers[triggerId] = updatedTrigger
        
        if (enabled) {
            activeTriggers.add(triggerId)
            if (trigger.type == TriggerType.REMINDER || trigger.type == TriggerType.RECURRING) {
                scheduleAlarm(updatedTrigger)
            }
        } else {
            activeTriggers.remove(triggerId)
            if (trigger.type == TriggerType.REMINDER || trigger.type == TriggerType.RECURRING) {
                cancelAlarm(triggerId)
            }
        }
        
        _activeTriggerCount.value = activeTriggers.size
        saveTriggers()
        
        Log.d(TAG, "Trigger ${trigger.name} ${if (enabled) "enabled" else "disabled"}")
        return true
    }
    
    /**
     * Get all triggers
     */
    fun getAllTriggers(): List<Trigger> = triggers.values.toList()
    
    /**
     * Get trigger by ID
     */
    fun getTrigger(triggerId: String): Trigger? = triggers[triggerId]
    
    /**
     * Fire a trigger (called when conditions are met)
     */
    internal fun fireTrigger(triggerId: String, additionalMetadata: Map<String, String> = emptyMap()) {
        val trigger = triggers[triggerId] ?: return
        
        if (!trigger.enabled) {
            Log.d(TAG, "Trigger ${trigger.name} is disabled, skipping")
            return
        }
        
        Log.i(TAG, "🔔 Firing trigger: ${trigger.name}")
        
        // Show notification if configured
        if (trigger.showNotification) {
            showTriggerNotification(trigger)
        }
        
        // Emit event for agent to consume
        val event = TriggerEvent(
            triggerId = trigger.id,
            triggerName = trigger.name,
            type = trigger.type,
            agentPrompt = trigger.agentPrompt,
            metadata = trigger.metadata + additionalMetadata
        )
        
        scope.launch {
            _triggerEvents.emit(event)
        }
        
        // Handle one-time triggers
        if (trigger.type == TriggerType.REMINDER) {
            // Remove one-time reminders after firing
            removeTrigger(triggerId)
        }
    }
    
    /**
     * Called when a notification is received (from NotificationListenerService)
     */
    fun onNotificationReceived(packageName: String, title: String?, text: String?) {
        triggers.values
            .filter { it.type == TriggerType.NOTIFICATION && it.enabled }
            .filter { it.notificationPackage == packageName }
            .filter { trigger ->
                trigger.notificationTitleContains == null ||
                title?.contains(trigger.notificationTitleContains, ignoreCase = true) == true
            }
            .forEach { trigger ->
                fireTrigger(trigger.id, mapOf(
                    "notification_package" to packageName,
                    "notification_title" to (title ?: ""),
                    "notification_text" to (text ?: "")
                ))
            }
    }
    
    // --- Alarm Management ---
    
    private fun scheduleAlarm(trigger: Trigger) {
        val triggerTime = trigger.triggerTimeMs ?: return
        
        val intent = Intent(context, ProactiveAlarmReceiver::class.java).apply {
            putExtra("trigger_id", trigger.id)
            action = "com.landseek.amphibian.TRIGGER_ALARM"
        }
        
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            trigger.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (alarmManager.canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            } else {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }
        } else {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerTime,
                pendingIntent
            )
        }
        
        Log.d(TAG, "Scheduled alarm for ${trigger.name} at ${java.util.Date(triggerTime)}")
    }
    
    private fun scheduleRecurringAlarm(trigger: Trigger) {
        val timeOfDay = trigger.timeOfDay ?: return
        val hourOfDay = timeOfDay / 60
        val minuteOfHour = timeOfDay % 60
        
        val calendar = Calendar.getInstance().apply {
            timeInMillis = System.currentTimeMillis()
            set(Calendar.HOUR_OF_DAY, hourOfDay)
            set(Calendar.MINUTE, minuteOfHour)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            
            // If time has passed today, schedule for next occurrence
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }
        
        // For weekday/weekend patterns, adjust to next valid day
        when (trigger.recurrence) {
            RecurrencePattern.WEEKDAYS -> {
                while (calendar.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY ||
                       calendar.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) {
                    calendar.add(Calendar.DAY_OF_YEAR, 1)
                }
            }
            RecurrencePattern.WEEKENDS -> {
                while (calendar.get(Calendar.DAY_OF_WEEK) != Calendar.SATURDAY &&
                       calendar.get(Calendar.DAY_OF_WEEK) != Calendar.SUNDAY) {
                    calendar.add(Calendar.DAY_OF_YEAR, 1)
                }
            }
            RecurrencePattern.CUSTOM -> {
                trigger.daysOfWeek?.let { days ->
                    while (calendar.get(Calendar.DAY_OF_WEEK) !in days) {
                        calendar.add(Calendar.DAY_OF_YEAR, 1)
                    }
                }
            }
            else -> {} // DAILY, WEEKLY, MONTHLY handled by interval
        }
        
        val updatedTrigger = trigger.copy(triggerTimeMs = calendar.timeInMillis)
        triggers[trigger.id] = updatedTrigger
        
        scheduleAlarm(updatedTrigger)
    }
    
    private fun cancelAlarm(triggerId: String) {
        val intent = Intent(context, ProactiveAlarmReceiver::class.java).apply {
            putExtra("trigger_id", triggerId)
            action = "com.landseek.amphibian.TRIGGER_ALARM"
        }
        
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            triggerId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        alarmManager.cancel(pendingIntent)
        Log.d(TAG, "Cancelled alarm for trigger $triggerId")
    }
    
    private fun rescheduleAllAlarms() {
        triggers.values
            .filter { it.enabled }
            .filter { it.type == TriggerType.REMINDER || it.type == TriggerType.RECURRING }
            .forEach { trigger ->
                when (trigger.type) {
                    TriggerType.REMINDER -> {
                        if ((trigger.triggerTimeMs ?: 0) > System.currentTimeMillis()) {
                            scheduleAlarm(trigger)
                        }
                    }
                    TriggerType.RECURRING -> scheduleRecurringAlarm(trigger)
                    else -> {}
                }
            }
    }
    
    // --- System Event Handling ---
    
    private fun registerSystemEventReceiver() {
        systemEventReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_BATTERY_LOW -> handleSystemEvent(SystemEvent.BATTERY_LOW)
                    Intent.ACTION_BATTERY_OKAY -> handleSystemEvent(SystemEvent.BATTERY_CHARGED)
                    Intent.ACTION_POWER_CONNECTED -> handleSystemEvent(SystemEvent.CHARGING_STARTED)
                    Intent.ACTION_POWER_DISCONNECTED -> handleSystemEvent(SystemEvent.CHARGING_STOPPED)
                    Intent.ACTION_SCREEN_ON -> handleSystemEvent(SystemEvent.SCREEN_ON)
                    Intent.ACTION_SCREEN_OFF -> handleSystemEvent(SystemEvent.SCREEN_OFF)
                    Intent.ACTION_HEADSET_PLUG -> {
                        val state = intent.getIntExtra("state", -1)
                        if (state == 1) {
                            handleSystemEvent(SystemEvent.HEADPHONES_CONNECTED)
                        } else if (state == 0) {
                            handleSystemEvent(SystemEvent.HEADPHONES_DISCONNECTED)
                        }
                    }
                }
            }
        }
        
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_BATTERY_LOW)
            addAction(Intent.ACTION_BATTERY_OKAY)
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_HEADSET_PLUG)
        }
        
        context.registerReceiver(systemEventReceiver, filter)
        Log.d(TAG, "Registered system event receiver")
    }
    
    private fun handleSystemEvent(event: SystemEvent) {
        Log.d(TAG, "System event: ${event.name}")
        
        triggers.values
            .filter { it.type == TriggerType.SYSTEM_EVENT && it.enabled }
            .filter { it.systemEvent == event }
            .forEach { trigger ->
                fireTrigger(trigger.id, mapOf("system_event" to event.name))
            }
    }
    
    // --- Notifications ---
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications from Amphibian's proactive agent"
            }
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun showTriggerNotification(trigger: Trigger) {
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(trigger.notificationTitle ?: trigger.name)
            .setContentText(trigger.notificationMessage ?: trigger.description)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        
        notificationManager.notify(trigger.id.hashCode(), notification)
    }
    
    // --- Persistence ---
    
    private fun saveTriggers() {
        try {
            val jsonArray = JSONArray()
            triggers.values.forEach { trigger ->
                val json = JSONObject().apply {
                    put("id", trigger.id)
                    put("type", trigger.type.name)
                    put("name", trigger.name)
                    put("description", trigger.description)
                    put("enabled", trigger.enabled)
                    put("createdAt", trigger.createdAt)
                    put("triggerTimeMs", trigger.triggerTimeMs)
                    put("recurrence", trigger.recurrence.name)
                    put("timeOfDay", trigger.timeOfDay)
                    trigger.daysOfWeek?.let { days ->
                        put("daysOfWeek", JSONArray(days.toList()))
                    }
                    put("systemEvent", trigger.systemEvent?.name)
                    put("batteryThreshold", trigger.batteryThreshold)
                    put("latitude", trigger.latitude)
                    put("longitude", trigger.longitude)
                    put("radiusMeters", trigger.radiusMeters)
                    put("enterGeofence", trigger.enterGeofence)
                    put("notificationPackage", trigger.notificationPackage)
                    put("notificationTitleContains", trigger.notificationTitleContains)
                    put("agentPrompt", trigger.agentPrompt)
                    put("showNotification", trigger.showNotification)
                    put("notificationTitle", trigger.notificationTitle)
                    put("notificationMessage", trigger.notificationMessage)
                    
                    val metadataJson = JSONObject()
                    trigger.metadata.forEach { (k, v) -> metadataJson.put(k, v) }
                    put("metadata", metadataJson)
                }
                jsonArray.put(json)
            }
            
            File(context.filesDir, TRIGGERS_FILE).writeText(jsonArray.toString())
            Log.d(TAG, "Saved ${triggers.size} triggers")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save triggers: ${e.message}", e)
        }
    }
    
    private fun loadTriggers() {
        try {
            val file = File(context.filesDir, TRIGGERS_FILE)
            if (!file.exists()) return
            
            val jsonArray = JSONArray(file.readText())
            
            for (i in 0 until jsonArray.length()) {
                val json = jsonArray.getJSONObject(i)
                
                val daysOfWeek = if (json.has("daysOfWeek") && !json.isNull("daysOfWeek")) {
                    val daysArray = json.getJSONArray("daysOfWeek")
                    (0 until daysArray.length()).map { daysArray.getInt(it) }.toSet()
                } else null
                
                val metadata = mutableMapOf<String, String>()
                if (json.has("metadata")) {
                    val metadataJson = json.getJSONObject("metadata")
                    metadataJson.keys().forEach { key ->
                        metadata[key] = metadataJson.getString(key)
                    }
                }
                
                val trigger = Trigger(
                    id = json.getString("id"),
                    type = TriggerType.valueOf(json.getString("type")),
                    name = json.getString("name"),
                    description = json.getString("description"),
                    enabled = json.getBoolean("enabled"),
                    createdAt = json.getLong("createdAt"),
                    triggerTimeMs = if (json.has("triggerTimeMs") && !json.isNull("triggerTimeMs")) 
                        json.getLong("triggerTimeMs") else null,
                    recurrence = RecurrencePattern.valueOf(json.optString("recurrence", "NONE")),
                    timeOfDay = if (json.has("timeOfDay") && !json.isNull("timeOfDay")) 
                        json.getInt("timeOfDay") else null,
                    daysOfWeek = daysOfWeek,
                    systemEvent = if (json.has("systemEvent") && !json.isNull("systemEvent")) 
                        SystemEvent.valueOf(json.getString("systemEvent")) else null,
                    batteryThreshold = if (json.has("batteryThreshold") && !json.isNull("batteryThreshold")) 
                        json.getInt("batteryThreshold") else null,
                    latitude = if (json.has("latitude") && !json.isNull("latitude")) 
                        json.getDouble("latitude") else null,
                    longitude = if (json.has("longitude") && !json.isNull("longitude")) 
                        json.getDouble("longitude") else null,
                    radiusMeters = if (json.has("radiusMeters") && !json.isNull("radiusMeters")) 
                        json.getDouble("radiusMeters").toFloat() else null,
                    enterGeofence = json.optBoolean("enterGeofence", true),
                    notificationPackage = if (json.has("notificationPackage") && !json.isNull("notificationPackage")) 
                        json.getString("notificationPackage") else null,
                    notificationTitleContains = if (json.has("notificationTitleContains") && !json.isNull("notificationTitleContains")) 
                        json.getString("notificationTitleContains") else null,
                    agentPrompt = json.getString("agentPrompt"),
                    showNotification = json.optBoolean("showNotification", true),
                    notificationTitle = if (json.has("notificationTitle") && !json.isNull("notificationTitle")) 
                        json.getString("notificationTitle") else null,
                    notificationMessage = if (json.has("notificationMessage") && !json.isNull("notificationMessage")) 
                        json.getString("notificationMessage") else null,
                    metadata = metadata
                )
                
                triggers[trigger.id] = trigger
                if (trigger.enabled) {
                    activeTriggers.add(trigger.id)
                }
            }
            
            _activeTriggerCount.value = activeTriggers.size
            Log.d(TAG, "Loaded ${triggers.size} triggers")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load triggers: ${e.message}", e)
        }
    }
    
    /**
     * Shutdown and cleanup
     */
    fun shutdown() {
        try {
            systemEventReceiver?.let {
                context.unregisterReceiver(it)
            }
            systemEventReceiver = null
            isInitialized = false
            Log.d(TAG, "Proactive agent service shutdown")
        } catch (e: Exception) {
            Log.e(TAG, "Error shutting down proactive agent service", e)
        }
    }
}

/**
 * BroadcastReceiver for alarm triggers
 */
class ProactiveAlarmReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        val triggerId = intent.getStringExtra("trigger_id") ?: return
        
        Log.d("ProactiveAlarmReceiver", "Alarm received for trigger: $triggerId")
        
        // This would typically communicate with the running service
        // For now, we'll use a singleton or service binding pattern
        ProactiveAgentServiceHolder.service?.fireTrigger(triggerId)
    }
}

/**
 * Holder for the ProactiveAgentService instance
 * This allows the BroadcastReceiver to access the service
 */
object ProactiveAgentServiceHolder {
    var service: ProactiveAgentService? = null
}

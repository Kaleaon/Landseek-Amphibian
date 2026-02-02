package com.landseek.amphibian.proactive

import java.util.UUID

enum class TriggerType {
    TIME,       // Specific time or recurring
    EVENT,      // Calendar event, etc.
    THRESHOLD,  // Battery, Storage, etc.
    LOCATION,   // Arrival/Departure
    BATTERY     // Battery level
}

data class Trigger(
    val id: String = UUID.randomUUID().toString(),
    val type: TriggerType,
    val config: String,   // JSON configuration for the trigger condition
    val action: String,   // JSON configuration for the action
    val priority: Int = 1, // 0: Informational, 1: Urgent
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    var lastRun: Long = 0
)

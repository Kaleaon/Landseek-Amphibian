package com.landseek.amphibian

import com.landseek.amphibian.service.ProactiveAgentService
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.util.Calendar

/**
 * Unit tests for ProactiveAgentService
 */
@RunWith(RobolectricTestRunner::class)
class ProactiveAgentServiceTest {
    
    private lateinit var proactiveService: ProactiveAgentService
    
    @Before
    fun setup() {
        val context = RuntimeEnvironment.getApplication().applicationContext
        proactiveService = ProactiveAgentService(context)
        proactiveService.initialize()
    }
    
    @Test
    fun `createReminder creates trigger with correct type`() {
        val futureTime = System.currentTimeMillis() + 3600000 // 1 hour from now
        
        val trigger = proactiveService.createReminder(
            name = "Test Reminder",
            description = "Test description",
            triggerTimeMs = futureTime,
            agentPrompt = "Remind me about test"
        )
        
        assertEquals(ProactiveAgentService.TriggerType.REMINDER, trigger.type)
        assertEquals("Test Reminder", trigger.name)
        assertEquals(futureTime, trigger.triggerTimeMs)
        assertTrue(trigger.enabled)
    }
    
    @Test
    fun `createRecurringTrigger creates daily trigger`() {
        val trigger = proactiveService.createRecurringTrigger(
            name = "Daily Briefing",
            description = "Morning briefing",
            recurrence = ProactiveAgentService.RecurrencePattern.DAILY,
            hourOfDay = 9,
            minuteOfHour = 0,
            agentPrompt = "Give me the daily briefing"
        )
        
        assertEquals(ProactiveAgentService.TriggerType.RECURRING, trigger.type)
        assertEquals(ProactiveAgentService.RecurrencePattern.DAILY, trigger.recurrence)
        assertEquals(9 * 60 + 0, trigger.timeOfDay) // 9:00 in minutes
    }
    
    @Test
    fun `createSystemEventTrigger creates trigger for battery low`() {
        val trigger = proactiveService.createSystemEventTrigger(
            name = "Battery Warning",
            description = "Alert when battery is low",
            systemEvent = ProactiveAgentService.SystemEvent.BATTERY_LOW,
            agentPrompt = "Battery is running low, suggest power saving tips"
        )
        
        assertEquals(ProactiveAgentService.TriggerType.SYSTEM_EVENT, trigger.type)
        assertEquals(ProactiveAgentService.SystemEvent.BATTERY_LOW, trigger.systemEvent)
    }
    
    @Test
    fun `createLocationTrigger creates geofence trigger`() {
        val trigger = proactiveService.createLocationTrigger(
            name = "Home Arrival",
            description = "Trigger when arriving home",
            latitude = 37.7749,
            longitude = -122.4194,
            radiusMeters = 100f,
            enterGeofence = true,
            agentPrompt = "Welcome home! Here's what you missed today."
        )
        
        assertEquals(ProactiveAgentService.TriggerType.LOCATION, trigger.type)
        assertEquals(37.7749, trigger.latitude!!, 0.0001)
        assertEquals(-122.4194, trigger.longitude!!, 0.0001)
        assertEquals(100f, trigger.radiusMeters!!, 0.1f)
        assertTrue(trigger.enterGeofence)
    }
    
    @Test
    fun `createNotificationTrigger creates trigger for app notifications`() {
        val trigger = proactiveService.createNotificationTrigger(
            name = "Email Alert",
            description = "Alert on important emails",
            packageName = "com.google.android.gm",
            titleContains = "Urgent",
            agentPrompt = "You received an urgent email"
        )
        
        assertEquals(ProactiveAgentService.TriggerType.NOTIFICATION, trigger.type)
        assertEquals("com.google.android.gm", trigger.notificationPackage)
        assertEquals("Urgent", trigger.notificationTitleContains)
    }
    
    @Test
    fun `removeTrigger removes trigger from list`() {
        val trigger = proactiveService.createReminder(
            name = "To Remove",
            description = "Will be removed",
            triggerTimeMs = System.currentTimeMillis() + 3600000,
            agentPrompt = "Test"
        )
        
        val initialCount = proactiveService.getAllTriggers().size
        
        val removed = proactiveService.removeTrigger(trigger.id)
        
        assertTrue(removed)
        assertEquals(initialCount - 1, proactiveService.getAllTriggers().size)
        assertNull(proactiveService.getTrigger(trigger.id))
    }
    
    @Test
    fun `setTriggerEnabled toggles trigger state`() {
        val trigger = proactiveService.createReminder(
            name = "Toggle Test",
            description = "Test",
            triggerTimeMs = System.currentTimeMillis() + 3600000,
            agentPrompt = "Test"
        )
        
        // Initially enabled
        assertTrue(proactiveService.getTrigger(trigger.id)!!.enabled)
        
        // Disable
        proactiveService.setTriggerEnabled(trigger.id, false)
        assertFalse(proactiveService.getTrigger(trigger.id)!!.enabled)
        
        // Re-enable
        proactiveService.setTriggerEnabled(trigger.id, true)
        assertTrue(proactiveService.getTrigger(trigger.id)!!.enabled)
    }
    
    @Test
    fun `getAllTriggers returns all created triggers`() {
        val initialCount = proactiveService.getAllTriggers().size
        
        proactiveService.createReminder("Test 1", "Desc 1", System.currentTimeMillis() + 3600000, "Prompt 1")
        proactiveService.createReminder("Test 2", "Desc 2", System.currentTimeMillis() + 7200000, "Prompt 2")
        
        assertEquals(initialCount + 2, proactiveService.getAllTriggers().size)
    }
    
    @Test
    fun `trigger metadata is preserved`() {
        val trigger = proactiveService.createReminder(
            name = "With Metadata",
            description = "Has metadata",
            triggerTimeMs = System.currentTimeMillis() + 3600000,
            agentPrompt = "Test prompt"
        )
        
        assertNotNull(trigger.id)
        assertEquals("With Metadata", trigger.name)
        assertEquals("Has metadata", trigger.description)
        assertEquals("Test prompt", trigger.agentPrompt)
        assertTrue(trigger.createdAt > 0)
    }
}

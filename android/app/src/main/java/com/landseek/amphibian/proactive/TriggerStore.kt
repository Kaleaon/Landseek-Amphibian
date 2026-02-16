package com.landseek.amphibian.proactive

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import java.io.FileReader
import java.io.FileWriter
import android.util.Log

class TriggerStore private constructor(private val context: Context) {

    private val gson = Gson()
    private val fileName = "triggers.json"
    private val TAG = "TriggerStore"

    companion object {
        @Volatile
        private var instance: TriggerStore? = null

        fun getInstance(context: Context): TriggerStore {
            return instance ?: synchronized(this) {
                instance ?: TriggerStore(context.applicationContext).also { instance = it }
            }
        }
    }

    @Synchronized
    fun getAllTriggers(): List<Trigger> {
        val file = File(context.filesDir, fileName)
        if (!file.exists()) return emptyList()

        return try {
            FileReader(file).use { reader ->
                val type = object : TypeToken<List<Trigger>>() {}.type
                gson.fromJson(reader, type) ?: emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading triggers", e)
            emptyList()
        }
    }

    @Synchronized
    fun saveTrigger(trigger: Trigger) {
        val triggers = getAllTriggers().toMutableList()
        val index = triggers.indexOfFirst { it.id == trigger.id }
        if (index != -1) {
            triggers[index] = trigger
        } else {
            triggers.add(trigger)
        }
        saveTriggersToFile(triggers)
    }

    @Synchronized
    fun saveTriggers(updatedTriggers: List<Trigger>) {
        saveTriggersToFile(updatedTriggers)
    }

    @Synchronized
    fun deleteTrigger(triggerId: String) {
        val triggers = getAllTriggers().toMutableList()
        val removed = triggers.removeIf { it.id == triggerId }
        if (removed) {
            saveTriggersToFile(triggers)
        }
    }

    @Synchronized
    fun getTrigger(triggerId: String): Trigger? {
        return getAllTriggers().find { it.id == triggerId }
    }

    private fun saveTriggersToFile(triggers: List<Trigger>) {
        try {
            val file = File(context.filesDir, fileName)
            FileWriter(file).use { writer ->
                gson.toJson(triggers, writer)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error saving triggers", e)
        }
    }
}

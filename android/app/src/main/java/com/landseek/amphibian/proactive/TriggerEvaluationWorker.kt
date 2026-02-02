package com.landseek.amphibian.proactive

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class TriggerEvaluationWorker(
    context: Context,
    workerParams: WorkerParameters
) : Worker(context, workerParams) {

    override fun doWork(): Result {
        return try {
            val manager = ProactiveManager(applicationContext)
            manager.evaluateTriggers()
            Result.success()
        } catch (e: Exception) {
            Result.failure()
        }
    }
}

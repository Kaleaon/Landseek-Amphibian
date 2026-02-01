package com.landseek.amphibian.service

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facedetector.FaceDetector
import com.google.mediapipe.tasks.vision.facedetector.FaceDetectorResult
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import com.google.mediapipe.tasks.vision.objectdetector.ObjectDetector
import com.google.mediapipe.tasks.vision.objectdetector.ObjectDetectorResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * MediaPipeVisionService
 * 
 * Provides on-device computer vision capabilities using Google MediaPipe.
 * Optimized for Pixel TPU/GPU acceleration.
 * 
 * Features:
 * - Object Detection: Detect and classify objects in images
 * - Face Detection: Detect faces with landmarks
 * - Hand Tracking: Track hand landmarks for gesture recognition
 * - Real-time processing with camera integration
 * - TPU/GPU acceleration on Pixel devices
 * 
 * @see https://github.com/google-ai-edge/mediapipe
 */
class MediaPipeVisionService(private val context: Context) {

    private val TAG = "AmphibianVision"
    
    // TPU capability service for hardware detection
    private val tpuService = TPUCapabilityService(context)
    
    // Vision task instances
    private var objectDetector: ObjectDetector? = null
    private var faceDetector: FaceDetector? = null
    private var handLandmarker: HandLandmarker? = null
    
    // Initialization state
    private var isObjectDetectorReady = false
    private var isFaceDetectorReady = false
    private var isHandLandmarkerReady = false
    
    // Model file names
    private val OBJECT_DETECTOR_MODEL = "efficientdet_lite0.tflite"
    private val FACE_DETECTOR_MODEL = "blaze_face_short_range.tflite"
    private val HAND_LANDMARKER_MODEL = "hand_landmarker.task"
    
    // Detection thresholds
    private var objectDetectionThreshold = 0.5f
    private var faceDetectionThreshold = 0.5f
    private var handTrackingThreshold = 0.5f
    
    // Maximum results
    private var maxObjectResults = 5
    private var maxFaceResults = 3
    private var maxHandResults = 2
    
    /**
     * Vision task types
     */
    enum class VisionTask {
        OBJECT_DETECTION,
        FACE_DETECTION,
        HAND_TRACKING
    }
    
    /**
     * Detection result wrapper
     */
    sealed class VisionResult {
        data class ObjectDetectionResult(
            val detections: List<DetectedObject>,
            val inferenceTimeMs: Long
        ) : VisionResult()
        
        data class FaceDetectionResult(
            val faces: List<DetectedFace>,
            val inferenceTimeMs: Long
        ) : VisionResult()
        
        data class HandTrackingResult(
            val hands: List<DetectedHand>,
            val inferenceTimeMs: Long
        ) : VisionResult()
        
        data class Error(val message: String) : VisionResult()
    }
    
    /**
     * Detected object
     */
    data class DetectedObject(
        val label: String,
        val score: Float,
        val boundingBox: BoundingBox
    )
    
    /**
     * Detected face
     */
    data class DetectedFace(
        val score: Float,
        val boundingBox: BoundingBox,
        val keypoints: List<Keypoint>
    )
    
    /**
     * Detected hand with landmarks
     */
    data class DetectedHand(
        val handedness: String, // "Left" or "Right"
        val score: Float,
        val landmarks: List<Landmark>
    )
    
    /**
     * Bounding box
     */
    data class BoundingBox(
        val left: Float,
        val top: Float,
        val right: Float,
        val bottom: Float
    )
    
    /**
     * Keypoint (for face detection)
     */
    data class Keypoint(
        val x: Float,
        val y: Float,
        val label: String?
    )
    
    /**
     * Landmark (for hand tracking)
     */
    data class Landmark(
        val x: Float,
        val y: Float,
        val z: Float,
        val index: Int
    )
    
    /**
     * Initialize all vision services
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        val caps = tpuService.detectCapabilities()
        Log.d(TAG, "Initializing MediaPipe Vision for ${caps.deviceTier} device")
        
        var allSuccess = true
        
        // Initialize each detector
        if (!initializeObjectDetector(caps)) {
            Log.w(TAG, "Object detector initialization failed")
            allSuccess = false
        }
        
        if (!initializeFaceDetector(caps)) {
            Log.w(TAG, "Face detector initialization failed")
            allSuccess = false
        }
        
        if (!initializeHandLandmarker(caps)) {
            Log.w(TAG, "Hand landmarker initialization failed")
            allSuccess = false
        }
        
        if (allSuccess) {
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║       ✅ MediaPipe Vision Service Initialized              ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Object Detection: ${"Ready".padEnd(38)}║
                ║ Face Detection: ${"Ready".padEnd(40)}║
                ║ Hand Tracking: ${"Ready".padEnd(41)}║
                ║ Backend: ${caps.recommendedBackend.name.padEnd(45)}║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
        }
        
        return@withContext allSuccess
    }
    
    /**
     * Initialize a specific vision task
     */
    suspend fun initializeTask(task: VisionTask): Boolean = withContext(Dispatchers.IO) {
        val caps = tpuService.detectCapabilities()
        
        return@withContext when (task) {
            VisionTask.OBJECT_DETECTION -> initializeObjectDetector(caps)
            VisionTask.FACE_DETECTION -> initializeFaceDetector(caps)
            VisionTask.HAND_TRACKING -> initializeHandLandmarker(caps)
        }
    }
    
    /**
     * Initialize object detector
     */
    private fun initializeObjectDetector(caps: TPUCapabilityService.TPUCapabilities): Boolean {
        val modelFile = File(context.filesDir, "models/$OBJECT_DETECTOR_MODEL")
        
        if (!modelFile.exists()) {
            if (!extractModelFromAssets(OBJECT_DETECTOR_MODEL, modelFile)) {
                Log.w(TAG, "Object detector model not found")
                return false
            }
        }
        
        return try {
            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetPath(modelFile.absolutePath)
            
            // Apply hardware acceleration
            applyHardwareAcceleration(baseOptionsBuilder, caps)
            
            val options = ObjectDetector.ObjectDetectorOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setScoreThreshold(objectDetectionThreshold)
                .setMaxResults(maxObjectResults)
                .setRunningMode(RunningMode.IMAGE)
                .build()
            
            objectDetector = ObjectDetector.createFromOptions(context, options)
            isObjectDetectorReady = true
            
            Log.d(TAG, "Object detector initialized")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize object detector: ${e.message}", e)
            false
        }
    }
    
    /**
     * Initialize face detector
     */
    private fun initializeFaceDetector(caps: TPUCapabilityService.TPUCapabilities): Boolean {
        val modelFile = File(context.filesDir, "models/$FACE_DETECTOR_MODEL")
        
        if (!modelFile.exists()) {
            if (!extractModelFromAssets(FACE_DETECTOR_MODEL, modelFile)) {
                Log.w(TAG, "Face detector model not found")
                return false
            }
        }
        
        return try {
            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetPath(modelFile.absolutePath)
            
            applyHardwareAcceleration(baseOptionsBuilder, caps)
            
            val options = FaceDetector.FaceDetectorOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setMinDetectionConfidence(faceDetectionThreshold)
                .setRunningMode(RunningMode.IMAGE)
                .build()
            
            faceDetector = FaceDetector.createFromOptions(context, options)
            isFaceDetectorReady = true
            
            Log.d(TAG, "Face detector initialized")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize face detector: ${e.message}", e)
            false
        }
    }
    
    /**
     * Initialize hand landmarker
     */
    private fun initializeHandLandmarker(caps: TPUCapabilityService.TPUCapabilities): Boolean {
        val modelFile = File(context.filesDir, "models/$HAND_LANDMARKER_MODEL")
        
        if (!modelFile.exists()) {
            if (!extractModelFromAssets(HAND_LANDMARKER_MODEL, modelFile)) {
                Log.w(TAG, "Hand landmarker model not found")
                return false
            }
        }
        
        return try {
            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetPath(modelFile.absolutePath)
            
            applyHardwareAcceleration(baseOptionsBuilder, caps)
            
            val options = HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setMinHandDetectionConfidence(handTrackingThreshold)
                .setMinHandPresenceConfidence(handTrackingThreshold)
                .setMinTrackingConfidence(handTrackingThreshold)
                .setNumHands(maxHandResults)
                .setRunningMode(RunningMode.IMAGE)
                .build()
            
            handLandmarker = HandLandmarker.createFromOptions(context, options)
            isHandLandmarkerReady = true
            
            Log.d(TAG, "Hand landmarker initialized")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize hand landmarker: ${e.message}", e)
            false
        }
    }
    
    /**
     * Apply hardware acceleration based on device capabilities
     */
    private fun applyHardwareAcceleration(
        builder: BaseOptions.Builder,
        caps: TPUCapabilityService.TPUCapabilities
    ) {
        when (caps.recommendedBackend) {
            TPUCapabilityService.AccelerationBackend.TPU,
            TPUCapabilityService.AccelerationBackend.GPU -> {
                builder.setDelegate(Delegate.GPU)
                Log.d(TAG, "Using GPU delegate (TPU on Pixel)")
            }
            else -> {
                Log.d(TAG, "Using CPU for vision tasks")
            }
        }
    }
    
    /**
     * Detect objects in a bitmap
     */
    suspend fun detectObjects(bitmap: Bitmap): VisionResult = withContext(Dispatchers.Default) {
        if (!isObjectDetectorReady || objectDetector == null) {
            return@withContext VisionResult.Error("Object detector not initialized")
        }
        
        return@withContext try {
            val startTime = System.currentTimeMillis()
            
            val mpImage = BitmapImageBuilder(bitmap).build()
            val result = objectDetector!!.detect(mpImage)
            
            val inferenceTime = System.currentTimeMillis() - startTime
            
            val detections = result.detections().map { detection ->
                val category = detection.categories().firstOrNull()
                val boundingBox = detection.boundingBox()
                
                DetectedObject(
                    label = category?.categoryName() ?: "Unknown",
                    score = category?.score() ?: 0f,
                    boundingBox = BoundingBox(
                        left = boundingBox.left,
                        top = boundingBox.top,
                        right = boundingBox.right,
                        bottom = boundingBox.bottom
                    )
                )
            }
            
            Log.d(TAG, "Detected ${detections.size} objects in ${inferenceTime}ms")
            
            VisionResult.ObjectDetectionResult(detections, inferenceTime)
        } catch (e: Exception) {
            Log.e(TAG, "Object detection failed: ${e.message}", e)
            VisionResult.Error("Object detection failed: ${e.message}")
        }
    }
    
    /**
     * Detect faces in a bitmap
     */
    suspend fun detectFaces(bitmap: Bitmap): VisionResult = withContext(Dispatchers.Default) {
        if (!isFaceDetectorReady || faceDetector == null) {
            return@withContext VisionResult.Error("Face detector not initialized")
        }
        
        return@withContext try {
            val startTime = System.currentTimeMillis()
            
            val mpImage = BitmapImageBuilder(bitmap).build()
            val result = faceDetector!!.detect(mpImage)
            
            val inferenceTime = System.currentTimeMillis() - startTime
            
            val faces = result.detections().map { detection ->
                val boundingBox = detection.boundingBox()
                val keypoints = detection.keypoints().orElse(listOf()).map { kp ->
                    Keypoint(
                        x = kp.x(),
                        y = kp.y(),
                        label = kp.label().orElse(null)
                    )
                }
                
                DetectedFace(
                    score = detection.categories().firstOrNull()?.score() ?: 0f,
                    boundingBox = BoundingBox(
                        left = boundingBox.left,
                        top = boundingBox.top,
                        right = boundingBox.right,
                        bottom = boundingBox.bottom
                    ),
                    keypoints = keypoints
                )
            }
            
            Log.d(TAG, "Detected ${faces.size} faces in ${inferenceTime}ms")
            
            VisionResult.FaceDetectionResult(faces, inferenceTime)
        } catch (e: Exception) {
            Log.e(TAG, "Face detection failed: ${e.message}", e)
            VisionResult.Error("Face detection failed: ${e.message}")
        }
    }
    
    /**
     * Track hands in a bitmap
     */
    suspend fun trackHands(bitmap: Bitmap): VisionResult = withContext(Dispatchers.Default) {
        if (!isHandLandmarkerReady || handLandmarker == null) {
            return@withContext VisionResult.Error("Hand landmarker not initialized")
        }
        
        return@withContext try {
            val startTime = System.currentTimeMillis()
            
            val mpImage = BitmapImageBuilder(bitmap).build()
            val result = handLandmarker!!.detect(mpImage)
            
            val inferenceTime = System.currentTimeMillis() - startTime
            
            val hands = mutableListOf<DetectedHand>()
            
            for (i in 0 until (result.landmarks()?.size ?: 0)) {
                val landmarks = result.landmarks()?.get(i) ?: continue
                val handedness = result.handednesses()?.get(i)?.firstOrNull()
                
                val landmarkList = landmarks.mapIndexed { index, lm ->
                    Landmark(
                        x = lm.x(),
                        y = lm.y(),
                        z = lm.z(),
                        index = index
                    )
                }
                
                hands.add(
                    DetectedHand(
                        handedness = handedness?.categoryName() ?: "Unknown",
                        score = handedness?.score() ?: 0f,
                        landmarks = landmarkList
                    )
                )
            }
            
            Log.d(TAG, "Tracked ${hands.size} hands in ${inferenceTime}ms")
            
            VisionResult.HandTrackingResult(hands, inferenceTime)
        } catch (e: Exception) {
            Log.e(TAG, "Hand tracking failed: ${e.message}", e)
            VisionResult.Error("Hand tracking failed: ${e.message}")
        }
    }
    
    /**
     * Process image with all available detectors
     */
    suspend fun processImage(bitmap: Bitmap): Map<VisionTask, VisionResult> = 
        withContext(Dispatchers.Default) {
            val results = mutableMapOf<VisionTask, VisionResult>()
            
            if (isObjectDetectorReady) {
                results[VisionTask.OBJECT_DETECTION] = detectObjects(bitmap)
            }
            
            if (isFaceDetectorReady) {
                results[VisionTask.FACE_DETECTION] = detectFaces(bitmap)
            }
            
            if (isHandLandmarkerReady) {
                results[VisionTask.HAND_TRACKING] = trackHands(bitmap)
            }
            
            return@withContext results
        }
    
    /**
     * Extract model from assets
     */
    private fun extractModelFromAssets(modelName: String, targetFile: File): Boolean {
        return try {
            val assetPath = "models/$modelName"
            context.assets.open(assetPath).use { input ->
                targetFile.parentFile?.mkdirs()
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }
            Log.d(TAG, "Extracted model from assets: $modelName")
            true
        } catch (e: Exception) {
            Log.d(TAG, "Model not found in assets: $modelName - ${e.message}")
            false
        }
    }
    
    /**
     * Set detection thresholds
     */
    fun setObjectDetectionThreshold(threshold: Float) {
        objectDetectionThreshold = threshold.coerceIn(0f, 1f)
    }
    
    fun setFaceDetectionThreshold(threshold: Float) {
        faceDetectionThreshold = threshold.coerceIn(0f, 1f)
    }
    
    fun setHandTrackingThreshold(threshold: Float) {
        handTrackingThreshold = threshold.coerceIn(0f, 1f)
    }
    
    /**
     * Set maximum results
     */
    fun setMaxObjectResults(max: Int) {
        maxObjectResults = max.coerceIn(1, 20)
    }
    
    fun setMaxFaceResults(max: Int) {
        maxFaceResults = max.coerceIn(1, 10)
    }
    
    fun setMaxHandResults(max: Int) {
        maxHandResults = max.coerceIn(1, 4)
    }
    
    /**
     * Check task readiness
     */
    fun isTaskReady(task: VisionTask): Boolean {
        return when (task) {
            VisionTask.OBJECT_DETECTION -> isObjectDetectorReady
            VisionTask.FACE_DETECTION -> isFaceDetectorReady
            VisionTask.HAND_TRACKING -> isHandLandmarkerReady
        }
    }
    
    /**
     * Get service status
     */
    fun getStatus(): VisionServiceStatus {
        return VisionServiceStatus(
            objectDetectorReady = isObjectDetectorReady,
            faceDetectorReady = isFaceDetectorReady,
            handLandmarkerReady = isHandLandmarkerReady
        )
    }
    
    data class VisionServiceStatus(
        val objectDetectorReady: Boolean,
        val faceDetectorReady: Boolean,
        val handLandmarkerReady: Boolean
    )
    
    /**
     * Release resources
     */
    fun close() {
        try {
            objectDetector?.close()
            objectDetector = null
            isObjectDetectorReady = false
            
            faceDetector?.close()
            faceDetector = null
            isFaceDetectorReady = false
            
            handLandmarker?.close()
            handLandmarker = null
            isHandLandmarkerReady = false
            
            Log.d(TAG, "MediaPipe Vision service closed")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing vision service", e)
        }
    }
}

package com.landseek.amphibian.service

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * STTService (Speech-to-Text)
 * 
 * Provides on-device speech recognition capabilities using Android's SpeechRecognizer.
 * This enables voice input for the AI assistant.
 * 
 * Features:
 * - Real-time speech recognition
 * - Multiple language support
 * - Continuous listening mode
 * - Partial results streaming
 * - Offline recognition (on supported devices)
 * - StateFlow-based reactive state management
 * - Configurable silence detection
 * 
 * Usage:
 * ```kotlin
 * val sttService = STTService(context)
 * sttService.initialize()
 * 
 * // One-shot recognition
 * val result = sttService.recognizeSpeech()
 * 
 * // Continuous listening
 * sttService.startContinuousListening()
 * sttService.transcriptions.collect { text -> 
 *     println("Heard: $text")
 * }
 * ```
 */
class STTService(private val context: Context) {
    
    private val TAG = "AmphibianSTT"
    
    private var speechRecognizer: SpeechRecognizer? = null
    private var isInitialized = false
    private var isContinuousMode = false
    
    // State management
    private val _state = MutableStateFlow(STTState.IDLE)
    val state: StateFlow<STTState> = _state.asStateFlow()
    
    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()
    
    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()
    
    // Partial results stream (for real-time feedback)
    private val _partialResults = MutableStateFlow("")
    val partialResults: StateFlow<String> = _partialResults.asStateFlow()
    
    // Channel for continuous transcriptions
    private val transcriptionChannel = Channel<TranscriptionResult>(Channel.BUFFERED)
    val transcriptions: Flow<TranscriptionResult> = transcriptionChannel.receiveAsFlow()
    
    // Configuration
    private var currentLanguage: Language = Language.ENGLISH
    private var preferOffline: Boolean = true
    private var maxSilenceMs: Int = 2000
    private var partialResultsEnabled: Boolean = true
    
    // Error tracking
    private var lastError: STTError? = null
    
    /**
     * STT State
     */
    enum class STTState {
        IDLE,
        INITIALIZING,
        READY,
        LISTENING,
        PROCESSING,
        ERROR
    }
    
    /**
     * STT Errors
     */
    enum class STTError(val code: Int, val message: String) {
        NETWORK_TIMEOUT(1, "Network operation timed out"),
        NETWORK_ERROR(2, "Network error occurred"),
        AUDIO_ERROR(3, "Audio recording error"),
        SERVER_ERROR(4, "Server error"),
        CLIENT_ERROR(5, "Client error"),
        SPEECH_TIMEOUT(6, "No speech input detected"),
        NO_MATCH(7, "No speech match found"),
        RECOGNIZER_BUSY(8, "Speech recognizer is busy"),
        INSUFFICIENT_PERMISSIONS(9, "Missing RECORD_AUDIO permission"),
        NOT_AVAILABLE(10, "Speech recognition not available"),
        UNKNOWN(99, "Unknown error");
        
        companion object {
            fun fromSpeechRecognizerError(error: Int): STTError {
                return when (error) {
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> NETWORK_TIMEOUT
                    SpeechRecognizer.ERROR_NETWORK -> NETWORK_ERROR
                    SpeechRecognizer.ERROR_AUDIO -> AUDIO_ERROR
                    SpeechRecognizer.ERROR_SERVER -> SERVER_ERROR
                    SpeechRecognizer.ERROR_CLIENT -> CLIENT_ERROR
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> SPEECH_TIMEOUT
                    SpeechRecognizer.ERROR_NO_MATCH -> NO_MATCH
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> RECOGNIZER_BUSY
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> INSUFFICIENT_PERMISSIONS
                    else -> UNKNOWN
                }
            }
        }
    }
    
    /**
     * Language options (matching TTSService)
     */
    enum class Language(val locale: Locale, val displayName: String) {
        ENGLISH(Locale.US, "English"),
        SPANISH(Locale("es", "ES"), "Spanish"),
        FRENCH(Locale.FRANCE, "French"),
        GERMAN(Locale.GERMANY, "German"),
        PORTUGUESE(Locale("pt", "BR"), "Portuguese")
    }
    
    /**
     * Transcription result
     */
    data class TranscriptionResult(
        val text: String,
        val confidence: Float,
        val isFinal: Boolean,
        val alternatives: List<String> = emptyList(),
        val timestamp: Long = System.currentTimeMillis()
    )
    
    /**
     * Initialize the STT service
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.Main) {
        if (isInitialized) {
            Log.d(TAG, "STT already initialized")
            return@withContext true
        }
        
        _state.value = STTState.INITIALIZING
        
        // Check if speech recognition is available
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.e(TAG, "Speech recognition not available on this device")
            _state.value = STTState.ERROR
            lastError = STTError.NOT_AVAILABLE
            return@withContext false
        }
        
        // Check permission
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "RECORD_AUDIO permission not granted")
            _state.value = STTState.ERROR
            lastError = STTError.INSUFFICIENT_PERMISSIONS
            return@withContext false
        }
        
        try {
            // Create speech recognizer on main thread
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)
            
            isInitialized = true
            _isReady.value = true
            _state.value = STTState.READY
            
            Log.i(TAG, """
                ╔════════════════════════════════════════════════════════════╗
                ║            ✅ STT Service Initialized                      ║
                ╠════════════════════════════════════════════════════════════╣
                ║ Engine: Android SpeechRecognizer                           ║
                ║ Language: ${currentLanguage.displayName.padEnd(43)}║
                ║ Offline Mode: ${if (preferOffline) "Preferred" else "Online only"}                                   ║
                ╚════════════════════════════════════════════════════════════╝
            """.trimIndent())
            
            return@withContext true
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize STT: ${e.message}", e)
            _state.value = STTState.ERROR
            return@withContext false
        }
    }
    
    /**
     * One-shot speech recognition
     * Returns the recognized text or throws an exception on error
     */
    suspend fun recognizeSpeech(
        language: Language = currentLanguage,
        timeoutMs: Long = 10000
    ): TranscriptionResult = withContext(Dispatchers.Main) {
        if (!isInitialized || speechRecognizer == null) {
            throw IllegalStateException("STT service not initialized")
        }
        
        if (_state.value == STTState.LISTENING) {
            throw IllegalStateException("Already listening")
        }
        
        return@withContext suspendCancellableCoroutine { continuation ->
            _state.value = STTState.LISTENING
            _isListening.value = true
            _partialResults.value = ""
            
            val intent = createRecognizerIntent(language)
            
            speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    Log.d(TAG, "Ready for speech")
                }
                
                override fun onBeginningOfSpeech() {
                    Log.d(TAG, "Speech started")
                }
                
                override fun onRmsChanged(rmsdB: Float) {
                    // Could be used for visual feedback
                }
                
                override fun onBufferReceived(buffer: ByteArray?) {}
                
                override fun onEndOfSpeech() {
                    Log.d(TAG, "Speech ended")
                    _state.value = STTState.PROCESSING
                }
                
                override fun onError(error: Int) {
                    _state.value = STTState.READY
                    _isListening.value = false
                    
                    val sttError = STTError.fromSpeechRecognizerError(error)
                    lastError = sttError
                    Log.e(TAG, "Recognition error: ${sttError.message} (code: ${sttError.code})")
                    
                    if (continuation.isActive) {
                        continuation.resumeWithException(
                            STTException(sttError)
                        )
                    }
                }
                
                override fun onResults(results: Bundle?) {
                    _state.value = STTState.READY
                    _isListening.value = false
                    
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                    
                    if (matches.isNullOrEmpty()) {
                        if (continuation.isActive) {
                            continuation.resumeWithException(
                                STTException(STTError.NO_MATCH)
                            )
                        }
                        return
                    }
                    
                    val result = TranscriptionResult(
                        text = matches[0],
                        confidence = confidences?.getOrNull(0) ?: 0.0f,
                        isFinal = true,
                        alternatives = matches.drop(1)
                    )
                    
                    Log.d(TAG, "Recognition result: ${result.text} (confidence: ${result.confidence})")
                    
                    if (continuation.isActive) {
                        continuation.resume(result)
                    }
                }
                
                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    if (!matches.isNullOrEmpty()) {
                        _partialResults.value = matches[0]
                        Log.d(TAG, "Partial result: ${matches[0]}")
                    }
                }
                
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            
            speechRecognizer?.startListening(intent)
            
            continuation.invokeOnCancellation {
                stopListening()
            }
        }
    }
    
    /**
     * Start continuous listening mode
     * Results are emitted via the transcriptions Flow
     */
    fun startContinuousListening(language: Language = currentLanguage) {
        if (!isInitialized || speechRecognizer == null) {
            Log.e(TAG, "STT service not initialized")
            return
        }
        
        if (isContinuousMode) {
            Log.w(TAG, "Already in continuous listening mode")
            return
        }
        
        isContinuousMode = true
        startContinuousRecognition(language)
    }
    
    private fun startContinuousRecognition(language: Language) {
        if (!isContinuousMode) return
        
        _state.value = STTState.LISTENING
        _isListening.value = true
        _partialResults.value = ""
        
        val intent = createRecognizerIntent(language)
        
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "Continuous: Ready for speech")
            }
            
            override fun onBeginningOfSpeech() {
                Log.d(TAG, "Continuous: Speech started")
            }
            
            override fun onRmsChanged(rmsdB: Float) {}
            
            override fun onBufferReceived(buffer: ByteArray?) {}
            
            override fun onEndOfSpeech() {
                Log.d(TAG, "Continuous: Speech ended")
                _state.value = STTState.PROCESSING
            }
            
            override fun onError(error: Int) {
                val sttError = STTError.fromSpeechRecognizerError(error)
                lastError = sttError
                
                Log.e(TAG, "Continuous recognition error: ${sttError.message}")
                
                // For continuous mode, restart on certain errors
                if (isContinuousMode && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    // Small delay before restarting
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        if (isContinuousMode) {
                            startContinuousRecognition(language)
                        }
                    }, 500)
                } else {
                    _state.value = STTState.READY
                    _isListening.value = false
                    isContinuousMode = false
                }
            }
            
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                
                if (!matches.isNullOrEmpty()) {
                    val result = TranscriptionResult(
                        text = matches[0],
                        confidence = confidences?.getOrNull(0) ?: 0.0f,
                        isFinal = true,
                        alternatives = matches.drop(1)
                    )
                    
                    Log.d(TAG, "Continuous result: ${result.text}")
                    transcriptionChannel.trySend(result)
                }
                
                // Restart listening for continuous mode
                if (isContinuousMode) {
                    startContinuousRecognition(language)
                } else {
                    _state.value = STTState.READY
                    _isListening.value = false
                }
            }
            
            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!matches.isNullOrEmpty()) {
                    _partialResults.value = matches[0]
                    
                    // Send partial results too
                    val result = TranscriptionResult(
                        text = matches[0],
                        confidence = 0.5f,
                        isFinal = false
                    )
                    transcriptionChannel.trySend(result)
                }
            }
            
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        
        speechRecognizer?.startListening(intent)
    }
    
    /**
     * Stop continuous listening mode
     */
    fun stopContinuousListening() {
        isContinuousMode = false
        stopListening()
    }
    
    /**
     * Stop current recognition
     */
    fun stopListening() {
        try {
            speechRecognizer?.stopListening()
            speechRecognizer?.cancel()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recognition: ${e.message}")
        }
        
        _state.value = STTState.READY
        _isListening.value = false
        _partialResults.value = ""
    }
    
    /**
     * Set the recognition language
     */
    fun setLanguage(language: Language) {
        currentLanguage = language
        Log.d(TAG, "Language set to: ${language.displayName}")
    }
    
    /**
     * Set whether to prefer offline recognition
     */
    fun setPreferOffline(prefer: Boolean) {
        preferOffline = prefer
        Log.d(TAG, "Prefer offline: $prefer")
    }
    
    /**
     * Set maximum silence duration before stopping (in ms)
     */
    fun setMaxSilence(ms: Int) {
        maxSilenceMs = ms.coerceIn(1000, 10000)
        Log.d(TAG, "Max silence: ${maxSilenceMs}ms")
    }
    
    /**
     * Enable/disable partial results
     */
    fun setPartialResultsEnabled(enabled: Boolean) {
        partialResultsEnabled = enabled
        Log.d(TAG, "Partial results: $enabled")
    }
    
    /**
     * Create the recognizer intent with current configuration
     */
    private fun createRecognizerIntent(language: Language): Intent {
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language.locale.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language.locale.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, language.locale.toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partialResultsEnabled)
            
            // Prefer offline if requested and available
            if (preferOffline) {
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
            
            // Speech timeout settings
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, maxSilenceMs.toLong())
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, maxSilenceMs.toLong())
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)
        }
    }
    
    /**
     * Get current configuration
     */
    fun getConfiguration(): STTConfiguration {
        return STTConfiguration(
            language = currentLanguage,
            preferOffline = preferOffline,
            maxSilenceMs = maxSilenceMs,
            partialResultsEnabled = partialResultsEnabled,
            isInitialized = isInitialized,
            lastError = lastError
        )
    }
    
    data class STTConfiguration(
        val language: Language,
        val preferOffline: Boolean,
        val maxSilenceMs: Int,
        val partialResultsEnabled: Boolean,
        val isInitialized: Boolean,
        val lastError: STTError?
    )
    
    /**
     * Custom exception for STT errors
     */
    class STTException(val error: STTError) : Exception(error.message)
    
    /**
     * Check if currently listening
     */
    fun isCurrentlyListening(): Boolean = _isListening.value
    
    /**
     * Get last error
     */
    fun getLastError(): STTError? = lastError
    
    /**
     * Shutdown and release resources
     */
    fun shutdown() {
        try {
            isContinuousMode = false
            speechRecognizer?.stopListening()
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
            speechRecognizer = null
            isInitialized = false
            _isReady.value = false
            _isListening.value = false
            _state.value = STTState.IDLE
            transcriptionChannel.close()
            Log.d(TAG, "STT service shutdown")
        } catch (e: Exception) {
            Log.e(TAG, "Error shutting down STT", e)
        }
    }
}

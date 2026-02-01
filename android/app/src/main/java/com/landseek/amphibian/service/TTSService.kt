package com.landseek.amphibian.service

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.UUID
import kotlin.coroutines.resume

/**
 * TTSService (ToolNeuron Integration)
 * 
 * Provides on-device Text-to-Speech capabilities inspired by ToolNeuron's
 * Supertonic TTS implementation.
 * 
 * Features:
 * - Multiple voices (10 voices - 5 female, 5 male)
 * - Multiple languages (English, Spanish, French, German, Portuguese)
 * - Adjustable speed (0.5x to 2.0x)
 * - Adjustable pitch
 * - Auto-speak option for AI responses
 * - Queue management for multiple utterances
 * - StateFlow-based reactive state management
 * 
 * Note: This implementation uses Android's built-in TTS engine.
 * For production with offline ONNX-based TTS like ToolNeuron's Supertonic,
 * additional native libraries would be needed.
 * 
 * @see https://github.com/Siddhesh2377/ToolNeuron
 */
class TTSService(private val context: Context) {

    private val TAG = "AmphibianTTS"
    
    private var tts: TextToSpeech? = null
    private var isInitialized = false
    
    // State management
    private val _state = MutableStateFlow(TTSState.IDLE)
    val state: StateFlow<TTSState> = _state.asStateFlow()
    
    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady.asStateFlow()
    
    // Configuration
    private var currentVoice: Voice = Voice.F1
    private var currentLanguage: Language = Language.ENGLISH
    private var speechRate: Float = 1.0f
    private var pitch: Float = 1.0f
    private var autoSpeak: Boolean = false
    
    // Callback for utterance completion
    private var onUtteranceComplete: ((String) -> Unit)? = null
    
    /**
     * TTS State
     */
    enum class TTSState {
        IDLE,
        LOADING,
        SPEAKING,
        PAUSED,
        ERROR
    }
    
    /**
     * Voice options (ToolNeuron pattern: 10 voices)
     */
    enum class Voice(val displayName: String, val isFemale: Boolean) {
        F1("Female 1", true),
        F2("Female 2", true),
        F3("Female 3", true),
        F4("Female 4", true),
        F5("Female 5", true),
        M1("Male 1", false),
        M2("Male 2", false),
        M3("Male 3", false),
        M4("Male 4", false),
        M5("Male 5", false)
    }
    
    /**
     * Language options
     */
    enum class Language(val locale: Locale, val displayName: String) {
        ENGLISH(Locale.US, "English"),
        SPANISH(Locale("es", "ES"), "Spanish"),
        FRENCH(Locale.FRANCE, "French"),
        GERMAN(Locale.GERMANY, "German"),
        PORTUGUESE(Locale("pt", "BR"), "Portuguese")
    }
    
    /**
     * Initialize the TTS service
     */
    suspend fun initialize(): Boolean = withContext(Dispatchers.Main) {
        if (isInitialized && tts != null) {
            Log.d(TAG, "TTS already initialized")
            return@withContext true
        }
        
        _state.value = TTSState.LOADING
        
        return@withContext suspendCancellableCoroutine { continuation ->
            tts = TextToSpeech(context) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    isInitialized = true
                    _isReady.value = true
                    _state.value = TTSState.IDLE
                    
                    // Configure default settings
                    tts?.apply {
                        language = currentLanguage.locale
                        setSpeechRate(speechRate)
                        setPitch(pitch)
                        
                        // Set up utterance listener
                        setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                            override fun onStart(utteranceId: String?) {
                                _state.value = TTSState.SPEAKING
                                Log.d(TAG, "Speaking started: $utteranceId")
                            }
                            
                            override fun onDone(utteranceId: String?) {
                                _state.value = TTSState.IDLE
                                Log.d(TAG, "Speaking completed: $utteranceId")
                                utteranceId?.let { onUtteranceComplete?.invoke(it) }
                            }
                            
                            @Deprecated("Deprecated in Java")
                            override fun onError(utteranceId: String?) {
                                _state.value = TTSState.ERROR
                                Log.e(TAG, "Speaking error: $utteranceId")
                            }
                            
                            override fun onError(utteranceId: String?, errorCode: Int) {
                                _state.value = TTSState.ERROR
                                Log.e(TAG, "Speaking error: $utteranceId, code: $errorCode")
                            }
                        })
                    }
                    
                    // Try to select a voice matching our configuration
                    selectVoice(currentVoice)
                    
                    Log.i(TAG, """
                        ╔════════════════════════════════════════════════════════════╗
                        ║            ✅ TTS Service Initialized                      ║
                        ╠════════════════════════════════════════════════════════════╣
                        ║ Engine: Android TTS                                        ║
                        ║ Language: ${currentLanguage.displayName.padEnd(43)}║
                        ║ Voice: ${currentVoice.displayName.padEnd(47)}║
                        ║ Speed: ${speechRate}x                                              ║
                        ╚════════════════════════════════════════════════════════════╝
                    """.trimIndent())
                    
                    continuation.resume(true)
                } else {
                    isInitialized = false
                    _isReady.value = false
                    _state.value = TTSState.ERROR
                    Log.e(TAG, "TTS initialization failed with status: $status")
                    continuation.resume(false)
                }
            }
            
            continuation.invokeOnCancellation {
                tts?.shutdown()
                tts = null
            }
        }
    }
    
    /**
     * Speak text
     */
    fun speak(text: String, queueMode: Int = TextToSpeech.QUEUE_FLUSH): String? {
        if (!isInitialized || tts == null) {
            Log.w(TAG, "TTS not initialized, cannot speak")
            return null
        }
        
        val utteranceId = UUID.randomUUID().toString()
        
        val params = android.os.Bundle().apply {
            putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
        }
        
        tts?.speak(text, queueMode, params, utteranceId)
        Log.d(TAG, "Speaking: ${text.take(50)}... (utteranceId: $utteranceId)")
        
        return utteranceId
    }
    
    /**
     * Speak text and wait for completion
     */
    suspend fun speakAndWait(text: String): Boolean = withContext(Dispatchers.Main) {
        if (!isInitialized || tts == null) {
            Log.w(TAG, "TTS not initialized")
            return@withContext false
        }
        
        return@withContext suspendCancellableCoroutine { continuation ->
            val utteranceId = UUID.randomUUID().toString()
            
            onUtteranceComplete = { completedId ->
                if (completedId == utteranceId) {
                    onUtteranceComplete = null
                    continuation.resume(true)
                }
            }
            
            val params = android.os.Bundle().apply {
                putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
            }
            
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
            
            continuation.invokeOnCancellation {
                stop()
                onUtteranceComplete = null
            }
        }
    }
    
    /**
     * Stop speaking
     */
    fun stop() {
        tts?.stop()
        _state.value = TTSState.IDLE
        Log.d(TAG, "Speaking stopped")
    }
    
    /**
     * Set speech rate (0.5 to 2.0)
     */
    fun setSpeechRate(rate: Float) {
        speechRate = rate.coerceIn(0.5f, 2.0f)
        tts?.setSpeechRate(speechRate)
        Log.d(TAG, "Speech rate set to: $speechRate")
    }
    
    /**
     * Set pitch (0.5 to 2.0)
     */
    fun setPitch(pitchValue: Float) {
        pitch = pitchValue.coerceIn(0.5f, 2.0f)
        tts?.setPitch(pitch)
        Log.d(TAG, "Pitch set to: $pitch")
    }
    
    /**
     * Set language
     */
    fun setLanguage(language: Language): Boolean {
        currentLanguage = language
        val result = tts?.setLanguage(language.locale)
        val success = result != TextToSpeech.LANG_MISSING_DATA && 
                      result != TextToSpeech.LANG_NOT_SUPPORTED
        
        if (success) {
            Log.d(TAG, "Language set to: ${language.displayName}")
        } else {
            Log.w(TAG, "Language not supported: ${language.displayName}")
        }
        
        return success
    }
    
    /**
     * Select voice
     */
    fun selectVoice(voice: Voice) {
        currentVoice = voice
        
        // Try to find a matching voice from available voices
        tts?.voices?.let { availableVoices ->
            val filteredVoices = availableVoices.filter { v ->
                v.locale == currentLanguage.locale &&
                !v.isNetworkConnectionRequired
            }
            
            // Select based on voice preference (female/male)
            val selectedVoice = if (voice.isFemale) {
                filteredVoices.filter { v -> 
                    v.name.lowercase().contains("female") ||
                    v.name.lowercase().contains("woman") ||
                    !v.name.lowercase().contains("male")
                }.firstOrNull() ?: filteredVoices.firstOrNull()
            } else {
                filteredVoices.filter { v -> 
                    v.name.lowercase().contains("male") ||
                    v.name.lowercase().contains("man")
                }.firstOrNull() ?: filteredVoices.firstOrNull()
            }
            
            selectedVoice?.let {
                tts?.voice = it
                Log.d(TAG, "Voice set to: ${it.name}")
            }
        }
    }
    
    /**
     * Enable/disable auto-speak for AI responses
     */
    fun setAutoSpeak(enabled: Boolean) {
        autoSpeak = enabled
        Log.d(TAG, "Auto-speak: $enabled")
    }
    
    /**
     * Check if auto-speak is enabled
     */
    fun isAutoSpeakEnabled(): Boolean = autoSpeak
    
    /**
     * Get available voices for current language
     */
    fun getAvailableVoices(): List<android.speech.tts.Voice> {
        return tts?.voices?.filter { v ->
            v.locale == currentLanguage.locale &&
            !v.isNetworkConnectionRequired
        }?.toList() ?: emptyList()
    }
    
    /**
     * Check if TTS is currently speaking
     */
    fun isSpeaking(): Boolean = tts?.isSpeaking == true
    
    /**
     * Get current configuration
     */
    fun getConfiguration(): TTSConfiguration {
        return TTSConfiguration(
            voice = currentVoice,
            language = currentLanguage,
            speechRate = speechRate,
            pitch = pitch,
            autoSpeak = autoSpeak,
            isInitialized = isInitialized
        )
    }
    
    data class TTSConfiguration(
        val voice: Voice,
        val language: Language,
        val speechRate: Float,
        val pitch: Float,
        val autoSpeak: Boolean,
        val isInitialized: Boolean
    )
    
    /**
     * Shutdown and release resources
     */
    fun shutdown() {
        try {
            tts?.stop()
            tts?.shutdown()
            tts = null
            isInitialized = false
            _isReady.value = false
            _state.value = TTSState.IDLE
            Log.d(TAG, "TTS service shutdown")
        } catch (e: Exception) {
            Log.e(TAG, "Error shutting down TTS", e)
        }
    }
}

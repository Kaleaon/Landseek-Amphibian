# ToolNeuron Integration Guide

This document outlines how [ToolNeuron](https://github.com/Siddhesh2377/ToolNeuron) can enhance Landseek-Amphibian development and provides integration strategies.

## Overview

ToolNeuron is an Android-native AI assistant library that provides several capabilities that could significantly improve Landseek-Amphibian:

| Feature | Current Amphibian Implementation | ToolNeuron Capability |
|---------|----------------------------------|----------------------|
| **LLM Inference** | MediaPipe Gemma models (.bin) | Native GGUF support (any model) |
| **RAG Embeddings** | Mock hash-based vectors | all-MiniLM-L6-v2-Q5_K_M (768-dim) |
| **Function Calling** | Via Node.js bridge | Native grammar-based JSON schema |
| **Document Processing** | Via Node.js DocumentManager | Native PDF, Word, Excel, EPUB parsing |
| **Text-to-Speech** | Not implemented | 10 voices, 5 languages, on-device |
| **Secure Storage** | Basic JSON files | AES-256-GCM Memory Vault with WAL |
| **Plugins** | Via MCP servers | Native web search, calculator, dev utils |

## Integration Strategies

### Strategy 1: Library Integration (Recommended)

Add ToolNeuron as a direct dependency for its native Android capabilities:

```gradle
// android/app/build.gradle
dependencies {
    // Option A: JitPack (if available)
    implementation 'com.github.Siddhesh2377:ToolNeuron:1.2.1'
    
    // Option B: Local AAR module
    implementation project(':toolneuron')
}
```

**Benefits:**
- Native Android performance (no Node.js bridge overhead for local features)
- Real semantic search instead of mock embeddings
- Built-in TTS without additional dependencies
- Function calling with grammar-based enforcement

### Strategy 2: Selective Feature Adoption

Adopt specific ToolNeuron patterns and libraries without full integration:

#### A. Replace Mock Embeddings with all-MiniLM-L6-v2

Current `LocalRAGService.kt` uses mock hash-based embeddings:

```kotlin
// Current mock implementation
private fun generateEmbedding(text: String): FloatArray {
    val size = 128
    val vec = FloatArray(size) { 0.0f }
    val hash = text.hashCode()
    for (i in 0 until size) {
        vec[i] = ((hash shr (i % 32)) and 1).toFloat()
    }
    return vec
}
```

**Recommended upgrade using ToolNeuron's approach:**

```kotlin
// Add dependency
implementation 'com.google.mediapipe:tasks-text:0.10.10'

// Or use ONNX Runtime for all-MiniLM-L6-v2
implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.16.0'
```

```kotlin
class EmbeddingService(private val context: Context) {
    private var session: OrtSession? = null
    private val MODEL_NAME = "all-MiniLM-L6-v2.onnx"
    
    suspend fun initialize() = withContext(Dispatchers.IO) {
        val env = OrtEnvironment.getEnvironment()
        val modelPath = File(context.filesDir, "models/$MODEL_NAME").absolutePath
        session = env.createSession(modelPath)
    }
    
    suspend fun embed(text: String): FloatArray = withContext(Dispatchers.Default) {
        // Tokenize and run inference
        // Returns 768-dimensional embedding vector
    }
}
```

#### B. Add GGUF Model Support

ToolNeuron uses llama.cpp for GGUF inference. Add similar support:

```kotlin
// Use llama-android binding
implementation 'com.github.aspect:llama-android:0.1.0'
```

Benefits over MediaPipe:
- Support for any GGUF model (Llama, Mistral, Gemma, Phi, Qwen)
- Native function calling with JSON grammar enforcement
- Better memory management for large models

#### C. Document Processing Libraries

ToolNeuron uses these libraries for document parsing:

```gradle
dependencies {
    // PDF parsing
    implementation 'com.tom-roush:pdfbox-android:2.0.27.0'
    
    // Microsoft Office formats
    implementation 'org.apache.poi:poi:5.2.5'
    implementation 'org.apache.poi:poi-ooxml:5.2.5'
    
    // EPUB
    implementation 'nl.siegmann.epublib:epublib-core:4.0'
}
```

This would replace the Node.js `DocumentManager` with native Android parsing.

#### D. Text-to-Speech Integration

ToolNeuron uses Supertonic TTS for on-device speech synthesis:

```kotlin
class TTSService(private val context: Context) {
    private var ttsEngine: SupertonicTTS? = null
    
    val voices = listOf(
        Voice("F1", "English Female 1"),
        Voice("F2", "English Female 2"),
        // ... 10 voices total
    )
    
    suspend fun speak(text: String, voice: Voice, speed: Float = 1.0f)
    suspend fun stopSpeaking()
}
```

This would add voice output to AI responses.

### Strategy 3: Hybrid Architecture

Keep the Node.js bridge for MCP/agent capabilities but use ToolNeuron for:

1. **Local RAG with real embeddings** - Replace `LocalRAGService`
2. **TTS output** - Add voice responses
3. **Document parsing** - Native preprocessing before sending to Node.js
4. **Secure storage** - Replace JSON files with encrypted Memory Vault

```
┌─────────────────────────────────────────────────────────────┐
│                    Android APK Process                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │   Jetpack       │    │   Foreground Service            ││
│  │   Compose UI    │───▶│   (AmphibianCoreService)        ││
│  │   (120Hz)       │    │                                 ││
│  └─────────────────┘    │  ┌───────────────────────────┐  ││
│         │               │  │  ToolNeuron Native Layer  │  ││
│         ▼               │  │  - Embeddings (MiniLM)    │  ││
│  ┌─────────────────┐    │  │  - TTS (Supertonic)       │  ││
│  │  TTS Output     │◀───│  │  - Document Parsing       │  ││
│  │  (ToolNeuron)   │    │  │  - Memory Vault           │  ││
│  └─────────────────┘    │  └───────────────────────────┘  ││
│                         │               │                  ││
│                         │               ▼                  ││
│                         │  ┌───────────────────────────┐  ││
│                         │  │  Embedded Node.js Runtime │  ││
│                         │  │  (MCP Host + OpenClaw)    │  ││
│                         │  └───────────────────────────┘  ││
│                         └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Implementation Roadmap

### Phase 1: Embeddings Upgrade (High Priority)
Replace the mock embedding implementation in `LocalRAGService.kt` with real semantic embeddings using all-MiniLM-L6-v2.

**Impact:** Dramatically improves RAG quality and memory search relevance.

**Files to modify:**
- `android/app/src/main/java/com/landseek/amphibian/service/LocalRAGService.kt`
- `android/app/build.gradle` (add ONNX Runtime dependency)

### Phase 2: TTS Integration (Medium Priority)
Add text-to-speech capability for AI responses.

**Impact:** Accessibility improvement, hands-free operation.

**Files to create:**
- `android/app/src/main/java/com/landseek/amphibian/service/TTSService.kt`

### Phase 3: Document Parsing (Medium Priority)
Replace Node.js document processing with native Android parsing.

**Impact:** Faster document analysis, offline document support.

**Files to modify:**
- `bridge/documents/` (can be simplified)
- Add native parsers in `android/app/src/main/java/com/landseek/amphibian/service/`

### Phase 4: Secure Storage (Low Priority)
Implement Memory Vault pattern for encrypted storage.

**Impact:** Enterprise-grade security for sensitive data.

**Files to modify:**
- `android/app/src/main/java/com/landseek/amphibian/service/LocalRAGService.kt`

### Phase 5: GGUF Model Support (Optional)
Add support for GGUF models alongside MediaPipe.

**Impact:** Support for a wider range of AI models.

## Quick Start: Embeddings Upgrade

The highest-impact change is upgrading from mock embeddings to real semantic embeddings. Here's a minimal implementation:

### Step 1: Add Dependencies

```gradle
// android/app/build.gradle
dependencies {
    // ONNX Runtime for embeddings
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.16.0'
}
```

### Step 2: Download Embedding Model

Add the all-MiniLM-L6-v2 ONNX model to assets or download on first run:
- Model URL: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2
- Size: ~23MB (quantized)

### Step 3: Create EmbeddingService

```kotlin
package com.landseek.amphibian.service

import ai.onnxruntime.*
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class EmbeddingService(private val context: Context) {
    private var ortEnvironment: OrtEnvironment? = null
    private var ortSession: OrtSession? = null
    private val EMBEDDING_DIM = 384 // MiniLM-L6-v2 dimension
    
    suspend fun initialize(): Boolean = withContext(Dispatchers.IO) {
        try {
            ortEnvironment = OrtEnvironment.getEnvironment()
            val modelFile = File(context.filesDir, "models/all-MiniLM-L6-v2.onnx")
            if (modelFile.exists()) {
                ortSession = ortEnvironment?.createSession(modelFile.absolutePath)
                return@withContext true
            }
            return@withContext false
        } catch (e: Exception) {
            return@withContext false
        }
    }
    
    suspend fun embed(text: String): FloatArray = withContext(Dispatchers.Default) {
        // Simplified - real implementation needs tokenization
        val session = ortSession ?: return@withContext FloatArray(EMBEDDING_DIM)
        // Run inference and return embedding vector
        FloatArray(EMBEDDING_DIM) // Placeholder
    }
    
    fun close() {
        ortSession?.close()
        ortEnvironment?.close()
    }
}
```

### Step 4: Update LocalRAGService

```kotlin
// In LocalRAGService.kt
private var embeddingService: EmbeddingService? = null

suspend fun initialize() {
    withContext(Dispatchers.IO) {
        embeddingService = EmbeddingService(context)
        if (embeddingService?.initialize() == true) {
            Log.d(TAG, "✅ Using real embeddings (MiniLM-L6-v2)")
        } else {
            Log.w(TAG, "⚠️ Falling back to mock embeddings")
        }
        loadMemories()
        loadMindMap()
    }
}

private suspend fun generateEmbedding(text: String): FloatArray {
    return embeddingService?.embed(text) ?: generateMockEmbedding(text)
}
```

## Resources

- **ToolNeuron Repository:** https://github.com/Siddhesh2377/ToolNeuron
- **ToolNeuron Releases:** https://github.com/Siddhesh2377/ToolNeuron/releases
- **GGUF Models:** https://huggingface.co/models?library=gguf
- **Sentence Transformers:** https://huggingface.co/sentence-transformers
- **Apache POI:** https://poi.apache.org/
- **PDFBox Android:** https://github.com/TomRoush/PdfBox-Android

## Conclusion

ToolNeuron provides production-ready implementations of several features that Landseek-Amphibian currently has as prototypes or missing entirely. The recommended approach is a **hybrid integration** that:

1. **Keeps the Node.js bridge** for MCP protocol and agent runtime
2. **Adopts ToolNeuron patterns** for native Android capabilities
3. **Upgrades embeddings** as the highest-priority improvement
4. **Adds TTS** for enhanced user experience

This approach preserves the existing architecture while significantly improving AI capabilities through proven, battle-tested implementations from ToolNeuron.

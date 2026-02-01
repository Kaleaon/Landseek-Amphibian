# ToolNeuron Integration Guide

This document outlines how [ToolNeuron](https://github.com/Siddhesh2377/ToolNeuron) and [MediaPipe](https://github.com/google-ai-edge/mediapipe) have been integrated into Landseek-Amphibian.

## ✅ Integration Status

| Feature | Status | Implementation |
|---------|--------|----------------|
| **RAG Embeddings** | ✅ Complete | ONNX MiniLM + MediaPipe fallback |
| **LLM Inference** | ✅ Complete | MediaPipe Gemma with TPU |
| **Text-to-Speech** | ✅ Complete | TTSService with 10 voices |
| **Document Processing** | ✅ Complete | PDFBox + Apache POI |
| **Vision Tasks** | ✅ Complete | MediaPipe Vision (Object/Face/Hand) |
| **Memory Vault** | 🔄 Partial | Using JSON storage |

## Overview

ToolNeuron is an Android-native AI assistant library that provides several capabilities that have been integrated into Landseek-Amphibian:

| Feature | Previous Implementation | With ToolNeuron Integration |
|---------|-------------------------|----------------------------|
| **LLM Inference** | MediaPipe Gemma (.bin) | MediaPipe Gemma with TPU optimization |
| **RAG Embeddings** | Mock hash-based vectors | ONNX all-MiniLM-L6-v2 (384-dim semantic) |
| **Function Calling** | Via Node.js bridge | Native + Node.js bridge |
| **Document Processing** | Via Node.js DocumentManager | Native PDF, Word, Excel parsing |
| **Text-to-Speech** | Not implemented | 10 voices, 5 languages, on-device |
| **Vision Tasks** | Not implemented | Object Detection, Face Detection, Hand Tracking |

## Implemented Services

### 1. EmbeddingService (Enhanced)

**File:** `android/app/src/main/java/com/landseek/amphibian/service/EmbeddingService.kt`

Multi-backend embedding service with automatic fallback:
- **Primary:** ONNX Runtime with all-MiniLM-L6-v2 (384-dim)
- **Secondary:** MediaPipe Universal Sentence Encoder (512-dim)
- **Fallback:** Hash-based mock embeddings

```kotlin
// Priority: ONNX (MiniLM) > MediaPipe (USE) > Fallback
val embeddingService = EmbeddingService(context)
embeddingService.initialize()

val embedding = embeddingService.embed("Your text here")
val similarity = embeddingService.cosineSimilarity(embedding1, embedding2)
```

### 2. TTSService (New)

**File:** `android/app/src/main/java/com/landseek/amphibian/service/TTSService.kt`

On-device text-to-speech following ToolNeuron's pattern:
- 10 voices (5 female, 5 male)
- 5 languages (English, Spanish, French, German, Portuguese)
- Adjustable speed (0.5x - 2.0x) and pitch
- Auto-speak option for AI responses

```kotlin
val ttsService = TTSService(context)
ttsService.initialize()

// Speak text
ttsService.speak("Hello, world!")

// Speak and wait for completion
ttsService.speakAndWait("This blocks until speech completes")

// Configure
ttsService.setLanguage(Language.ENGLISH)
ttsService.selectVoice(Voice.F1)
ttsService.setSpeechRate(1.2f)
```

### 3. DocumentParserService (New)

**File:** `android/app/src/main/java/com/landseek/amphibian/service/DocumentParserService.kt`

Native document parsing for RAG knowledge base creation:
- **PDF:** via PDFBox-Android
- **Word:** .doc and .docx via Apache POI
- **Excel:** .xls and .xlsx via Apache POI
- **Text:** .txt, .md

```kotlin
val documentParser = DocumentParserService(context)
documentParser.initialize()

// Parse document
val result = documentParser.parseDocument("/path/to/document.pdf")

if (result.success) {
    val text = result.text
    val chunks = result.chunks  // Pre-chunked for RAG
    val metadata = result.metadata
}
```

### 4. MediaPipeVisionService (New)

**File:** `android/app/src/main/java/com/landseek/amphibian/service/MediaPipeVisionService.kt`

Computer vision tasks using MediaPipe:
- **Object Detection:** EfficientDet with multi-class support
- **Face Detection:** BlazeFace with landmarks
- **Hand Tracking:** 21 landmarks per hand

```kotlin
val visionService = MediaPipeVisionService(context)
visionService.initialize()

// Object detection
val objectResult = visionService.detectObjects(bitmap)

// Face detection
val faceResult = visionService.detectFaces(bitmap)

// Hand tracking
val handResult = visionService.trackHands(bitmap)

// Process all at once
val allResults = visionService.processImage(bitmap)
```

## Dependencies Added

```gradle
// build.gradle
dependencies {
    // MediaPipe Vision Tasks (Object Detection, Face Detection, Hand Tracking)
    implementation 'com.google.mediapipe:tasks-vision:0.10.14'
    
    // CameraX for camera integration
    implementation 'androidx.camera:camera-core:1.3.1'
    implementation 'androidx.camera:camera-camera2:1.3.1'
    implementation 'androidx.camera:camera-lifecycle:1.3.1'
    implementation 'androidx.camera:camera-view:1.3.1'
    
    // ONNX Runtime for MiniLM embeddings (ToolNeuron pattern)
    implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.16.0'
    
    // Document Processing (ToolNeuron pattern)
    implementation 'com.tom-roush:pdfbox-android:2.0.27.0'
    implementation 'org.apache.poi:poi:5.2.5'
    implementation 'org.apache.poi:poi-ooxml:5.2.5'
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Android APK Process                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │   Jetpack       │    │   AmphibianCoreService          ││
│  │   Compose UI    │───▶│   (Foreground Service)          ││
│  │   (120Hz)       │    │                                 ││
│  └─────────────────┘    │  ┌───────────────────────────┐  ││
│         │               │  │  ToolNeuron Native Layer  │  ││
│         ▼               │  │  - EmbeddingService       │  ││
│  ┌─────────────────┐    │  │    (ONNX MiniLM)          │  ││
│  │  TTS Output     │◀───│  │  - TTSService             │  ││
│  │  (TTSService)   │    │  │  - DocumentParserService  │  ││
│  └─────────────────┘    │  │    (PDF, Word, Excel)     │  ││
│                         │  └───────────────────────────┘  ││
│  ┌─────────────────┐    │               │                  ││
│  │  Vision Output  │◀───│  ┌───────────────────────────┐  ││
│  │  (MediaPipe)    │    │  │  MediaPipe Vision Layer   │  ││
│  └─────────────────┘    │  │  - Object Detection       │  ││
│                         │  │  - Face Detection         │  ││
│                         │  │  - Hand Tracking          │  ││
│                         │  └───────────────────────────┘  ││
│                         │               │                  ││
│                         │  ┌───────────────────────────┐  ││
│                         │  │  MediaPipe LLM Layer      │  ││
│                         │  │  - LocalLLMService        │  ││
│                         │  │  - TPU Acceleration       │  ││
│                         │  └───────────────────────────┘  ││
│                         │               │                  ││
│                         │  ┌───────────────────────────┐  ││
│                         │  │  Embedded Node.js Runtime │  ││
│                         │  │  (MCP Host + OpenClaw)    │  ││
│                         │  └───────────────────────────┘  ││
│                         └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Model Files Required

Place these models in `assets/models/` or they will be downloaded on first use:

| Model | File | Size | Purpose |
|-------|------|------|---------|
| MiniLM Embeddings | `all-MiniLM-L6-v2.onnx` | ~23MB | Semantic embeddings |
| USE Embeddings | `universal_sentence_encoder.tflite` | ~50MB | Fallback embeddings |
| Gemma LLM | `gemma-3-4b-it-gpu-int4.bin` | ~2.5GB | Text generation |
| Object Detector | `efficientdet_lite0.tflite` | ~4MB | Object detection |
| Face Detector | `blaze_face_short_range.tflite` | ~200KB | Face detection |
| Hand Landmarker | `hand_landmarker.task` | ~10MB | Hand tracking |

## Usage in AmphibianCoreService

The core service now provides access to all integrated services:

```kotlin
// Get service via binding
val service = coreServiceBinder.getService()

// TTS
service.speak("Hello!")
service.setAutoSpeak(true)

// Document Processing
val result = service.parseDocument(uri, "document.pdf")

// Vision
val objects = service.detectObjects(bitmap)
val faces = service.detectFaces(bitmap)
val hands = service.trackHands(bitmap)

// RAG
service.addMemory("Important information to remember")
val context = service.retrieveContext("What do you know about X?")

// Service Status
val status = service.getServiceStatus()
println("LLM Ready: ${status.llmReady}")
println("TTS Ready: ${status.ttsReady}")
println("Vision: ${status.visionStatus}")
```

## Resources

- **ToolNeuron Repository:** https://github.com/Siddhesh2377/ToolNeuron
- **MediaPipe Repository:** https://github.com/google-ai-edge/mediapipe
- **MediaPipe Documentation:** https://developers.google.com/mediapipe
- **ONNX Runtime:** https://onnxruntime.ai/
- **Apache POI:** https://poi.apache.org/
- **PDFBox Android:** https://github.com/TomRoush/PdfBox-Android

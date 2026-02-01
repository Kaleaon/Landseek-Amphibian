# New Features Guide

This document describes the major new features added to Landseek-Amphibian.

## Table of Contents

1. [Real Embeddings with WordPiece Tokenization](#1-real-embeddings)
2. [Voice I/O (Speech-to-Text)](#2-voice-io)
3. [Proactive Agent / Background Triggers](#3-proactive-agent)
4. [Calendar & Email Tools](#4-calendar--email)
5. [Cloud Sync for Memory](#5-cloud-sync)
6. [Model Update Mechanism](#6-model-updates)
7. [Extension Marketplace](#7-extension-marketplace)
8. [Identity & Reputation System](#8-identity-system)

---

## 1. Real Embeddings

### Overview
The RAG system now uses proper WordPiece tokenization for semantic embeddings instead of hash-based mock vectors. This enables accurate semantic search and memory retrieval.

### Key Classes
- `WordPieceTokenizer.kt` - Full WordPiece algorithm implementation
- `EmbeddingService.kt` - Updated to use real tokenization

### Usage

```kotlin
val tokenizer = WordPieceTokenizer(context)
tokenizer.initialize()

// Tokenize text
val result = tokenizer.tokenize("Hello, how are you?")
println("Input IDs: ${result.inputIds.take(10)}")
println("Attention Mask: ${result.attentionMask.take(10)}")

// The embedding service uses this automatically
val embeddingService = EmbeddingService(context)
embeddingService.initialize()
val embedding = embeddingService.embed("Your text here")
```

### Configuration
- Place `vocab.txt` in `assets/models/` for full vocabulary
- Falls back to embedded vocabulary (~500 tokens) if not available
- Supports all-MiniLM-L6-v2 (384-dim) model

---

## 2. Voice I/O

### Overview
Speech-to-Text capability using Android's SpeechRecognizer enables voice input for the AI assistant.

### Key Classes
- `STTService.kt` - Speech recognition service
- `TTSService.kt` - Existing text-to-speech service

### Usage

```kotlin
val sttService = STTService(context)
sttService.initialize()

// One-shot recognition
val result = sttService.recognizeSpeech()
println("You said: ${result.text}")

// Continuous listening
sttService.startContinuousListening()
sttService.transcriptions.collect { result ->
    if (result.isFinal) {
        println("Final: ${result.text}")
    } else {
        println("Partial: ${result.text}")
    }
}

// Stop listening
sttService.stopContinuousListening()
```

### Features
- Multiple language support (English, Spanish, French, German, Portuguese)
- Partial results for real-time feedback
- Offline recognition on supported devices
- Configurable silence detection

---

## 3. Proactive Agent

### Overview
The proactive agent system allows the AI to reach out unprompted through scheduled triggers.

### Key Classes
- `ProactiveAgentService.kt` - Trigger management and scheduling

### Trigger Types

1. **Reminders** - One-time notifications
```kotlin
proactiveService.createReminder(
    name = "Meeting",
    description = "Team standup",
    triggerTimeMs = System.currentTimeMillis() + 3600000,
    agentPrompt = "Remind me about the team standup meeting"
)
```

2. **Recurring Triggers** - Daily/weekly patterns
```kotlin
proactiveService.createRecurringTrigger(
    name = "Daily Briefing",
    description = "Morning update",
    recurrence = RecurrencePattern.DAILY,
    hourOfDay = 9,
    minuteOfHour = 0,
    agentPrompt = "Give me today's briefing"
)
```

3. **System Event Triggers** - Battery, charging, etc.
```kotlin
proactiveService.createSystemEventTrigger(
    name = "Battery Warning",
    description = "Alert on low battery",
    systemEvent = SystemEvent.BATTERY_LOW,
    agentPrompt = "Battery is low, suggest power saving"
)
```

4. **Location Triggers** - Geofencing
```kotlin
proactiveService.createLocationTrigger(
    name = "Home Arrival",
    description = "Welcome home",
    latitude = 37.7749,
    longitude = -122.4194,
    radiusMeters = 100f,
    agentPrompt = "Welcome home!"
)
```

---

## 4. Calendar & Email

### Overview
MCP tool servers for calendar and email integration.

### Calendar Tools
- `calendar_get_events` - List events in a time range
- `calendar_create_event` - Create new event
- `calendar_update_event` - Update existing event
- `calendar_delete_event` - Delete event
- `calendar_check_availability` - Check free/busy
- `calendar_find_free_time` - Find open slots
- `calendar_list_calendars` - List all calendars
- `calendar_get_today` - Today's schedule

### Email Tools
- `email_list_messages` - List inbox messages
- `email_read_message` - Read full message
- `email_send` - Compose and send
- `email_reply` - Reply to message
- `email_forward` - Forward message
- `email_search` - Search emails
- `email_move` - Move to folder
- `email_delete` - Delete message
- `email_get_unread_count` - Unread count
- `email_get_summary` - Daily email summary

---

## 5. Cloud Sync

### Overview
Encrypted cloud synchronization for memory data across devices.

### Key Classes
- `CloudSyncService.kt` - Cloud sync management

### Configuration

```kotlin
val cloudSync = CloudSyncService(context, ragService)
cloudSync.initialize()

// Configure cloud provider
cloudSync.configure(
    provider = CloudProvider.CUSTOM_SERVER,
    serverUrl = "https://your-sync-server.com",
    apiKey = "your-api-key",
    userId = "user-id",
    encryptionPassword = "secure-password"
)

// Manual sync
val result = cloudSync.sync()
println("Pushed: ${result.memoriesPushed}, Pulled: ${result.memoriesPulled}")

// Device linking
val pairingCode = cloudSync.generatePairingCode()
// Share code with other device
cloudSync.linkDevice(pairingCode)
```

### Features
- End-to-end encryption (AES-256)
- Multiple providers (custom server, Firebase, WebDAV, S3)
- Delta sync (only changes)
- Conflict resolution
- Background auto-sync

---

## 6. Model Updates

### Overview
Download and manage AI models from a central catalog.

### Key Classes
- `ModelUpdateService.kt` - Model management

### Usage

```kotlin
val modelService = ModelUpdateService(context)
modelService.initialize()

// Refresh catalog
modelService.refreshModelCatalog()

// List available models
modelService.availableModels.collect { models ->
    models.forEach { println("${it.name}: ${it.sizeBytes / 1024 / 1024} MB") }
}

// Download a model
val downloadJob = modelService.downloadModel("gemma-3-4b")
modelService.downloadProgress.collect { progress ->
    println("Progress: ${(progress["gemma-3-4b"]?.progress ?: 0f) * 100}%")
}

// Set active model
modelService.setActiveLLMModel("gemma-3-4b")

// Check for updates
val updates = modelService.checkForUpdates()
```

---

## 7. Extension Marketplace

### Overview
Discover and install community MCP server extensions.

### Key Classes
- `marketplace/index.js` - Extension marketplace

### Usage

```javascript
const { ExtensionMarketplace } = require('./marketplace');

const marketplace = new ExtensionMarketplace();
await marketplace.initialize();

// Search extensions
const results = marketplace.search('weather', {
    type: ExtensionType.MCP_SERVER,
    verifiedOnly: true
});

// Install extension
await marketplace.install('weather-tools');

// Check for updates
const updates = marketplace.checkForUpdates();

// Update all
for (const update of updates) {
    await marketplace.update(update.id);
}

// Uninstall
await marketplace.uninstall('weather-tools');
```

### Extension Types
- `MCP_SERVER` - Tool servers
- `PERSONALITY` - AI personalities
- `SKILL` - Agent capabilities
- `INTEGRATION` - External services

---

## 8. Identity System

### Overview
Cryptographic identity and reputation for the P2P collective.

### Key Classes
- `collective/identity.js` - Identity management

### Usage

```javascript
const { IdentityManager, TrustLevel } = require('./collective');

const identityManager = new IdentityManager();

// Create new identity
const identity = await identityManager.createIdentity(saveStorage);
console.log(`ID: ${identity.id}`);
console.log(`Display Name: ${identity.displayName}`);

// Authenticate with peer
const challenge = identityManager.createChallenge(peerId);
// Peer responds...
const authResult = identityManager.verifyAuthResponse(response);

// Add reputation
identityManager.addReputation(identity.id, {
    type: 'task_completed',
    points: 10,
    reason: 'Completed inference task'
});

// Check trust level
if (identity.trustLevel >= TrustLevel.TRUSTED) {
    // Grant advanced permissions
}
```

### Trust Levels
0. ANONYMOUS - Limited access
1. NEW - Building reputation
2. TRUSTED - Proven track record
3. VERIFIED - Verified identity
4. GUARDIAN - Moderation capabilities

---

## Integration Example

Here's how to integrate all features in the main application:

```kotlin
// In AmphibianCoreService.kt

// Initialize all new services
val tokenizer = WordPieceTokenizer(context)
val sttService = STTService(context)
val proactiveService = ProactiveAgentService(context)
val cloudSync = CloudSyncService(context, ragService)
val modelService = ModelUpdateService(context)

lifecycleScope.launch {
    // Initialize services
    tokenizer.initialize()
    sttService.initialize()
    proactiveService.initialize()
    cloudSync.initialize()
    modelService.initialize()
    
    // Listen for proactive triggers
    proactiveService.triggerEvents.collect { event ->
        // Handle trigger - send to agent
        processAgentPrompt(event.agentPrompt)
    }
}

// Voice input button
fun onVoiceInputPressed() {
    lifecycleScope.launch {
        try {
            val result = sttService.recognizeSpeech()
            processUserInput(result.text)
        } catch (e: STTService.STTException) {
            showError("Speech recognition failed: ${e.error.message}")
        }
    }
}
```

---

For more details, see the source code documentation in each file.

/**
 * Optimized Model Sets Configuration
 * 
 * Defines model sets optimized for different device tiers and use cases.
 * Integrates with OpenClaw for distributed inference capabilities.
 * 
 * This mirrors the Kotlin OptimizedModelSets.kt but for the Node.js bridge.
 * 
 * Features:
 * - Model set definitions for all device tiers
 * - OpenClaw task routing configuration
 * - Model capability declarations
 * - Task-to-model mapping
 */

const { BotCapability } = require('../openclaw/registry');

/**
 * Task types for model selection
 */
const TaskType = {
    GENERAL_CHAT: 'general_chat',
    CODE_ASSIST: 'code_assist',
    DOCUMENT_ANALYSIS: 'document_analysis',
    VISION_TASKS: 'vision_tasks',
    VOICE_ASSISTANT: 'voice_assistant',
    COLLECTIVE_COMPUTE: 'collective_compute',
    TRAINING: 'training'
};

/**
 * Model set types
 */
const ModelSetType = {
    FLAGSHIP_FULL: 'flagship_full',
    HIGH_PERFORMANCE: 'high_performance',
    BALANCED: 'balanced',
    EFFICIENCY: 'efficiency',
    DISTRIBUTED: 'distributed',
    CUSTOM: 'custom'
};

/**
 * Device tiers (mirror Kotlin enum)
 */
const DeviceTier = {
    FLAGSHIP: 'FLAGSHIP',
    HIGH: 'HIGH',
    MEDIUM: 'MEDIUM',
    LOW: 'LOW'
};

/**
 * Individual model configurations
 */
const Models = {
    // Flagship models
    GEMMA_3_4B_INT4: {
        name: 'Gemma 3 4B INT4',
        filename: 'gemma-3-4b-it-gpu-int4.bin',
        quantization: 'int4',
        sizeBytes: 2_500_000_000,
        minRamMB: 8000,
        supportedBackends: ['tpu', 'gpu'],
        supportedTasks: [TaskType.GENERAL_CHAT, TaskType.CODE_ASSIST, TaskType.DOCUMENT_ANALYSIS],
        maxContextLength: 8192,
        recommendedTemperature: 0.7,
        recommendedTopK: 40,
        supportsStreaming: true,
        supportsOpenClaw: true,
        openClawCapability: BotCapability.TPU,
        priority: 1
    },
    
    GEMMA_3_4B_INT8: {
        name: 'Gemma 3 4B INT8',
        filename: 'gemma-3-4b-it-gpu-int8.bin',
        quantization: 'int8',
        sizeBytes: 4_500_000_000,
        minRamMB: 12000,
        supportedBackends: ['tpu', 'gpu'],
        supportedTasks: [TaskType.GENERAL_CHAT, TaskType.CODE_ASSIST, TaskType.DOCUMENT_ANALYSIS, TaskType.TRAINING],
        maxContextLength: 8192,
        recommendedTemperature: 0.7,
        recommendedTopK: 40,
        supportsStreaming: true,
        supportsOpenClaw: true,
        openClawCapability: BotCapability.TPU,
        priority: 2
    },
    
    // Mid-range models
    GEMMA_2B_INT4: {
        name: 'Gemma 2B INT4',
        filename: 'gemma-2b-it-gpu-int4.bin',
        quantization: 'int4',
        sizeBytes: 1_300_000_000,
        minRamMB: 6000,
        supportedBackends: ['tpu', 'gpu', 'nnapi'],
        supportedTasks: [TaskType.GENERAL_CHAT, TaskType.VOICE_ASSISTANT],
        maxContextLength: 4096,
        recommendedTemperature: 0.8,
        recommendedTopK: 32,
        supportsStreaming: true,
        supportsOpenClaw: true,
        openClawCapability: BotCapability.GPU,
        priority: 3
    },
    
    GEMMA_2B_INT8: {
        name: 'Gemma 2B INT8',
        filename: 'gemma-2b-it-cpu-int8.bin',
        quantization: 'int8',
        sizeBytes: 2_000_000_000,
        minRamMB: 4000,
        supportedBackends: ['cpu', 'nnapi'],
        supportedTasks: [TaskType.GENERAL_CHAT, TaskType.VOICE_ASSISTANT],
        maxContextLength: 2048,
        recommendedTemperature: 0.8,
        recommendedTopK: 20,
        supportsStreaming: true,
        supportsOpenClaw: true,
        openClawCapability: BotCapability.STANDARD,
        priority: 4
    },
    
    // Specialized models
    CODE_LLAMA_INT4: {
        name: 'CodeLlama 7B INT4',
        filename: 'codellama-7b-instruct-int4.bin',
        quantization: 'int4',
        sizeBytes: 4_000_000_000,
        minRamMB: 10000,
        supportedBackends: ['tpu', 'gpu'],
        supportedTasks: [TaskType.CODE_ASSIST],
        maxContextLength: 16384,
        recommendedTemperature: 0.4,
        recommendedTopK: 50,
        supportsStreaming: true,
        supportsOpenClaw: true,
        openClawCapability: BotCapability.GPU,
        priority: 5
    },
    
    EMBEDDING_MINILM: {
        name: 'MiniLM Embeddings',
        filename: 'all-MiniLM-L6-v2.onnx',
        quantization: 'fp16',
        sizeBytes: 23_000_000,
        minRamMB: 2000,
        supportedBackends: ['onnx', 'cpu'],
        supportedTasks: [TaskType.DOCUMENT_ANALYSIS],
        maxContextLength: 512,
        recommendedTemperature: 0,
        recommendedTopK: 0,
        supportsStreaming: false,
        supportsOpenClaw: false,
        openClawCapability: BotCapability.BASIC,
        priority: 1
    }
};

/**
 * OpenClaw configuration for each model set
 */
const OpenClawConfigs = {
    FLAGSHIP: {
        enableDistributedInference: true,
        enableCollectiveTraining: true,
        minPeersForDistributed: 2,
        preferredTaskTypes: ['inference', 'training_batch', 'gradient_compute'],
        contributionWeight: 1.0,
        maxConcurrentTasks: 4
    },
    HIGH_PERFORMANCE: {
        enableDistributedInference: true,
        enableCollectiveTraining: false,
        minPeersForDistributed: 3,
        preferredTaskTypes: ['inference', 'embedding'],
        contributionWeight: 0.8,
        maxConcurrentTasks: 3
    },
    BALANCED: {
        enableDistributedInference: true,
        enableCollectiveTraining: false,
        minPeersForDistributed: 4,
        preferredTaskTypes: ['inference', 'validation'],
        contributionWeight: 0.5,
        maxConcurrentTasks: 2
    },
    EFFICIENCY: {
        enableDistributedInference: true,
        enableCollectiveTraining: false,
        minPeersForDistributed: 5,
        preferredTaskTypes: ['validation', 'embedding'],
        contributionWeight: 0.3,
        maxConcurrentTasks: 1
    },
    DISTRIBUTED: {
        enableDistributedInference: true,
        enableCollectiveTraining: true,
        minPeersForDistributed: 2,
        preferredTaskTypes: ['inference', 'training_batch', 'gradient_compute', 'embedding', 'custom'],
        contributionWeight: 1.0,
        maxConcurrentTasks: 4
    }
};

/**
 * Model Set definitions
 */
const ModelSets = {
    FLAGSHIP_FULL: {
        type: ModelSetType.FLAGSHIP_FULL,
        name: 'Flagship Full Capability',
        description: 'Maximum AI capability for Pixel 10 / Tensor G5. Includes all model types for full OpenClaw integration.',
        minDeviceTier: DeviceTier.FLAGSHIP,
        models: [
            Models.GEMMA_3_4B_INT4,
            Models.GEMMA_3_4B_INT8,
            Models.CODE_LLAMA_INT4,
            Models.GEMMA_2B_INT4,
            Models.EMBEDDING_MINILM
        ],
        defaultModel: 'gemma-3-4b-it-gpu-int4.bin',
        openClawConfig: OpenClawConfigs.FLAGSHIP
    },
    
    HIGH_PERFORMANCE: {
        type: ModelSetType.HIGH_PERFORMANCE,
        name: 'High Performance',
        description: 'Optimized for Pixel 8-9 / Tensor G3-G4. High quality with efficient inference.',
        minDeviceTier: DeviceTier.HIGH,
        models: [
            Models.GEMMA_3_4B_INT4,
            Models.GEMMA_2B_INT4,
            Models.EMBEDDING_MINILM
        ],
        defaultModel: 'gemma-3-4b-it-gpu-int4.bin',
        openClawConfig: OpenClawConfigs.HIGH_PERFORMANCE
    },
    
    BALANCED: {
        type: ModelSetType.BALANCED,
        name: 'Balanced',
        description: 'Balance of quality and efficiency for mid-range devices. Good for everyday use.',
        minDeviceTier: DeviceTier.MEDIUM,
        models: [
            Models.GEMMA_2B_INT4,
            Models.GEMMA_2B_INT8,
            Models.EMBEDDING_MINILM
        ],
        defaultModel: 'gemma-2b-it-gpu-int4.bin',
        openClawConfig: OpenClawConfigs.BALANCED
    },
    
    EFFICIENCY: {
        type: ModelSetType.EFFICIENCY,
        name: 'Efficiency',
        description: 'Battery and memory optimized for lower-end devices. Prioritizes reliability.',
        minDeviceTier: DeviceTier.LOW,
        models: [
            Models.GEMMA_2B_INT8,
            Models.EMBEDDING_MINILM
        ],
        defaultModel: 'gemma-2b-it-cpu-int8.bin',
        openClawConfig: OpenClawConfigs.EFFICIENCY
    },
    
    DISTRIBUTED: {
        type: ModelSetType.DISTRIBUTED,
        name: 'OpenClaw Distributed',
        description: 'Optimized for distributed inference across multiple devices. Best for collective AI tasks.',
        minDeviceTier: DeviceTier.MEDIUM,
        models: [
            Models.GEMMA_3_4B_INT4,
            Models.GEMMA_2B_INT4,
            Models.EMBEDDING_MINILM
        ],
        defaultModel: 'gemma-2b-it-gpu-int4.bin',
        openClawConfig: OpenClawConfigs.DISTRIBUTED
    }
};

/**
 * Get recommended model set for device tier
 */
function getRecommendedModelSet(deviceTier) {
    switch (deviceTier) {
        case DeviceTier.FLAGSHIP:
            return ModelSets.FLAGSHIP_FULL;
        case DeviceTier.HIGH:
            return ModelSets.HIGH_PERFORMANCE;
        case DeviceTier.MEDIUM:
            return ModelSets.BALANCED;
        case DeviceTier.LOW:
        default:
            return ModelSets.EFFICIENCY;
    }
}

/**
 * Get model for specific task
 */
function getModelForTask(modelSet, taskType) {
    const compatibleModels = modelSet.models
        .filter(m => m.supportedTasks.includes(taskType))
        .sort((a, b) => a.priority - b.priority);
    
    return compatibleModels[0] || null;
}

/**
 * Get all OpenClaw-capable models
 */
function getOpenClawCapableModels() {
    const allModels = Object.values(Models);
    return allModels.filter(m => m.supportsOpenClaw);
}

/**
 * Map device tier to OpenClaw capability
 */
function deviceTierToCapability(deviceTier) {
    switch (deviceTier) {
        case DeviceTier.FLAGSHIP:
            return BotCapability.TPU;
        case DeviceTier.HIGH:
            return BotCapability.GPU;
        case DeviceTier.MEDIUM:
            return BotCapability.STANDARD;
        case DeviceTier.LOW:
        default:
            return BotCapability.BASIC;
    }
}

/**
 * Get optimal model config for OpenClaw task
 */
function getModelForOpenClawTask(taskType, deviceCapability) {
    const capabilityLevels = {
        [BotCapability.TPU]: 6,
        [BotCapability.GPU]: 5,
        [BotCapability.ADVANCED]: 4,
        [BotCapability.STANDARD]: 3,
        [BotCapability.BASIC]: 2,
        [BotCapability.MINIMAL]: 1
    };
    
    const deviceLevel = capabilityLevels[deviceCapability] || 2;
    
    const compatibleModels = Object.values(Models)
        .filter(m => {
            const modelLevel = capabilityLevels[m.openClawCapability] || 2;
            return m.supportsOpenClaw && modelLevel <= deviceLevel;
        })
        .sort((a, b) => a.priority - b.priority);
    
    // Prefer models that support the specific task type
    const taskSpecific = compatibleModels.find(m => 
        m.supportedTasks.some(t => t.toLowerCase().includes(taskType.toLowerCase()))
    );
    
    return taskSpecific || compatibleModels[0] || null;
}

module.exports = {
    TaskType,
    ModelSetType,
    DeviceTier,
    Models,
    ModelSets,
    OpenClawConfigs,
    getRecommendedModelSet,
    getModelForTask,
    getOpenClawCapableModels,
    deviceTierToCapability,
    getModelForOpenClawTask
};

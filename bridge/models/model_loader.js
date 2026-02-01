/**
 * Model Loader with OpenClaw Integration
 * 
 * Handles loading and managing AI models with full OpenClaw distributed
 * inference capabilities. Coordinates with the OpenClaw pool for:
 * 
 * - Distributed model inference across connected ClawBots
 * - Task routing based on model capabilities
 * - Collective training coordination
 * - Model availability broadcasting
 * 
 * @see model_sets.js for model definitions
 * @see ../openclaw/pool.js for OpenClaw pool
 */

const { EventEmitter } = require('events');
const {
    ModelSets,
    Models,
    TaskType,
    DeviceTier,
    getRecommendedModelSet,
    getModelForTask,
    getModelForOpenClawTask,
    deviceTierToCapability
} = require('./model_sets');
const { OpenPool, OpenTaskType } = require('../openclaw/pool');
const { BotCapability, BotStatus } = require('../openclaw/registry');

/**
 * Model loading status
 */
const LoadStatus = {
    NOT_LOADED: 'not_loaded',
    LOADING: 'loading',
    LOADED: 'loaded',
    ERROR: 'error'
};

/**
 * ModelLoader class
 * 
 * Manages model sets and integrates with OpenClaw for distributed inference.
 */
class ModelLoader extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.deviceTier = options.deviceTier || DeviceTier.MEDIUM;
        this.modelsPath = options.modelsPath || './models';
        
        // Current state
        this.currentModelSet = null;
        this.loadedModels = new Map(); // filename -> { model, status, loadTime }
        this.availableModels = new Set();
        
        // OpenClaw integration
        this.openClawPool = options.openClawPool || null;
        this.openClawEnabled = false;
        this.connectedPeers = 0;
        
        // Android bridge callback
        this.androidCallback = options.androidCallback || null;
        
        // Performance tracking
        this.inferenceMetrics = {
            totalInferences: 0,
            localInferences: 0,
            distributedInferences: 0,
            averageLatencyMs: 0
        };
        
        console.log(`🧠 ModelLoader initialized for ${this.deviceTier} device tier`);
    }
    
    /**
     * Initialize the model loader
     */
    async initialize() {
        try {
            console.log('📦 Initializing ModelLoader...');
            
            // Set recommended model set
            this.currentModelSet = getRecommendedModelSet(this.deviceTier);
            console.log(`📋 Selected model set: ${this.currentModelSet.name}`);
            
            // Setup OpenClaw if configured
            if (this.openClawPool || this.currentModelSet.openClawConfig.enableDistributedInference) {
                await this.setupOpenClawIntegration();
            }
            
            this.emit('initialized', {
                modelSet: this.currentModelSet.name,
                openClawEnabled: this.openClawEnabled
            });
            
            console.log(`✅ ModelLoader ready with ${this.currentModelSet.name}`);
            return true;
            
        } catch (error) {
            console.error('❌ ModelLoader initialization failed:', error);
            this.emit('error', error);
            return false;
        }
    }
    
    /**
     * Setup OpenClaw integration
     */
    async setupOpenClawIntegration() {
        const config = this.currentModelSet.openClawConfig;
        
        if (!config.enableDistributedInference) {
            console.log('⚠️ Distributed inference disabled for this model set');
            return;
        }
        
        console.log('🌐 Setting up OpenClaw integration...');
        
        // Create pool if not provided
        if (!this.openClawPool) {
            this.openClawPool = new OpenPool({
                poolName: `Amphibian-${this.deviceTier}`,
                registryOptions: {
                    minReputationForTraining: config.enableCollectiveTraining ? 0.5 : 0.8
                }
            });
        }
        
        // Register event handlers
        this.openClawPool.on('bot_joined', (bot) => {
            this.connectedPeers++;
            this.checkDistributedAvailability();
            this.emit('peer_joined', bot);
        });
        
        this.openClawPool.on('bot_left', (bot) => {
            this.connectedPeers--;
            this.checkDistributedAvailability();
            this.emit('peer_left', bot);
        });
        
        this.openClawPool.on('task_completed', ({ task, botId, result }) => {
            this.inferenceMetrics.distributedInferences++;
            this.emit('distributed_inference_complete', { task, botId, result });
        });
        
        // Register this device's capability
        const deviceCapability = deviceTierToCapability(this.deviceTier);
        
        // Auto-register if pool is running
        if (this.openClawPool.isRunning) {
            await this.registerWithPool(deviceCapability);
        }
        
        this.openClawEnabled = true;
        console.log('✅ OpenClaw integration enabled');
    }
    
    /**
     * Register this device with the OpenClaw pool
     */
    async registerWithPool(capability) {
        // This would be called when pool is available
        console.log(`🤖 Registering with OpenClaw pool as ${capability}`);
        
        // Broadcast available models
        const availableModels = this.currentModelSet.models
            .filter(m => m.supportsOpenClaw)
            .map(m => ({
                name: m.name,
                filename: m.filename,
                capability: m.openClawCapability,
                supportedTasks: m.supportedTasks
            }));
        
        this.emit('models_broadcast', availableModels);
    }
    
    /**
     * Check if distributed inference is available
     */
    checkDistributedAvailability() {
        const config = this.currentModelSet?.openClawConfig;
        if (!config) return false;
        
        const available = this.openClawEnabled && 
                          this.connectedPeers >= config.minPeersForDistributed;
        
        this.emit('distributed_availability_changed', { available, peers: this.connectedPeers });
        return available;
    }
    
    /**
     * Load a model set
     */
    async loadModelSet(modelSetType) {
        const modelSet = ModelSets[modelSetType];
        if (!modelSet) {
            throw new Error(`Unknown model set: ${modelSetType}`);
        }
        
        console.log(`📦 Loading model set: ${modelSet.name}`);
        
        // Update current model set
        this.currentModelSet = modelSet;
        
        // Notify Android side if callback available
        if (this.androidCallback) {
            this.androidCallback({
                type: 'MODEL_SET_CHANGED',
                modelSet: {
                    type: modelSetType,
                    name: modelSet.name,
                    defaultModel: modelSet.defaultModel
                }
            });
        }
        
        this.emit('model_set_loaded', modelSet);
        return modelSet;
    }
    
    /**
     * Get model for a specific task (local or distributed)
     */
    async getModelForTask(taskType, preferDistributed = false) {
        // Check if we should use distributed inference
        if (preferDistributed && this.checkDistributedAvailability()) {
            return this.getDistributedModel(taskType);
        }
        
        // Use local model
        const model = getModelForTask(this.currentModelSet, taskType);
        if (!model) {
            console.warn(`No model found for task: ${taskType}`);
            return null;
        }
        
        return {
            model,
            isDistributed: false,
            source: 'local'
        };
    }
    
    /**
     * Get model for distributed inference
     */
    async getDistributedModel(taskType) {
        if (!this.openClawPool || !this.openClawEnabled) {
            return null;
        }
        
        // Find capable peers
        const capableBots = this.openClawPool.registry.getInferenceCapableBots();
        if (capableBots.length === 0) {
            return null;
        }
        
        // Select best bot based on capability and reputation
        const bestBot = capableBots[0]; // Already sorted by reputation
        const model = getModelForOpenClawTask(taskType, bestBot.capability);
        
        return {
            model,
            isDistributed: true,
            source: 'openclaw',
            targetBot: bestBot.id
        };
    }
    
    /**
     * Submit inference task (local or distributed)
     */
    async submitInferenceTask(prompt, options = {}) {
        const taskType = options.taskType || TaskType.GENERAL_CHAT;
        const preferDistributed = options.preferDistributed ?? false;
        
        const startTime = Date.now();
        
        try {
            // Get appropriate model
            const modelInfo = await this.getModelForTask(taskType, preferDistributed);
            
            if (!modelInfo || !modelInfo.model) {
                return { error: 'No suitable model available' };
            }
            
            let result;
            
            if (modelInfo.isDistributed && this.openClawPool) {
                // Submit to OpenClaw pool
                result = await this.submitDistributedTask(prompt, modelInfo, options);
            } else {
                // Local inference via Android bridge
                result = await this.submitLocalTask(prompt, modelInfo.model, options);
            }
            
            const latency = Date.now() - startTime;
            this.updateMetrics(latency, modelInfo.isDistributed);
            
            return {
                result,
                model: modelInfo.model.name,
                isDistributed: modelInfo.isDistributed,
                latencyMs: latency
            };
            
        } catch (error) {
            console.error('Inference task failed:', error);
            return { error: error.message };
        }
    }
    
    /**
     * Submit distributed task to OpenClaw
     */
    async submitDistributedTask(prompt, modelInfo, options) {
        return new Promise((resolve, reject) => {
            const taskId = this.openClawPool.submitTask(OpenTaskType.INFERENCE, {
                prompt,
                model: modelInfo.model.filename,
                options: {
                    temperature: modelInfo.model.recommendedTemperature,
                    topK: modelInfo.model.recommendedTopK,
                    maxTokens: options.maxTokens || 1024,
                    ...options
                }
            }, {
                requiredCapability: modelInfo.model.openClawCapability,
                timeout: options.timeout || 60000
            });
            
            // Wait for result
            const handler = ({ task, result }) => {
                if (task.id === taskId) {
                    this.openClawPool.removeListener('task_completed', handler);
                    resolve(result);
                }
            };
            
            const errorHandler = ({ task, error }) => {
                if (task.id === taskId) {
                    this.openClawPool.removeListener('task_failed', errorHandler);
                    reject(new Error(error));
                }
            };
            
            this.openClawPool.on('task_completed', handler);
            this.openClawPool.on('task_failed', errorHandler);
            
            // Timeout
            setTimeout(() => {
                this.openClawPool.removeListener('task_completed', handler);
                this.openClawPool.removeListener('task_failed', errorHandler);
                reject(new Error('Distributed inference timeout'));
            }, options.timeout || 60000);
        });
    }
    
    /**
     * Submit local task via Android bridge
     */
    async submitLocalTask(prompt, model, options) {
        if (!this.androidCallback) {
            throw new Error('Android callback not configured');
        }
        
        return new Promise((resolve, reject) => {
            // Send to Android for local inference
            this.androidCallback({
                type: 'LOCAL_INFERENCE',
                payload: {
                    prompt,
                    model: model.filename,
                    options: {
                        temperature: model.recommendedTemperature,
                        topK: model.recommendedTopK,
                        maxTokens: options.maxTokens || 1024,
                        stream: options.stream || false,
                        ...options
                    }
                }
            });
            
            // Result comes back via event
            const resultHandler = (data) => {
                if (data.type === 'INFERENCE_RESULT') {
                    this.removeListener('android_result', resultHandler);
                    resolve(data.result);
                } else if (data.type === 'INFERENCE_ERROR') {
                    this.removeListener('android_result', resultHandler);
                    reject(new Error(data.error));
                }
            };
            
            this.on('android_result', resultHandler);
        });
    }
    
    /**
     * Handle result from Android
     */
    handleAndroidResult(data) {
        this.emit('android_result', data);
    }
    
    /**
     * Update performance metrics
     */
    updateMetrics(latencyMs, isDistributed) {
        this.inferenceMetrics.totalInferences++;
        
        if (isDistributed) {
            this.inferenceMetrics.distributedInferences++;
        } else {
            this.inferenceMetrics.localInferences++;
        }
        
        // Running average
        const n = this.inferenceMetrics.totalInferences;
        this.inferenceMetrics.averageLatencyMs = 
            (this.inferenceMetrics.averageLatencyMs * (n - 1) + latencyMs) / n;
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            modelSet: this.currentModelSet?.name,
            deviceTier: this.deviceTier,
            loadedModels: Array.from(this.loadedModels.keys()),
            openClawEnabled: this.openClawEnabled,
            connectedPeers: this.connectedPeers,
            distributedAvailable: this.checkDistributedAvailability(),
            metrics: this.inferenceMetrics
        };
    }
    
    /**
     * Get OpenClaw pool status
     */
    getOpenClawStatus() {
        if (!this.openClawPool) {
            return { enabled: false };
        }
        
        return {
            enabled: this.openClawEnabled,
            poolStatus: this.openClawPool.getStatus(),
            config: this.currentModelSet?.openClawConfig
        };
    }
    
    /**
     * Set Android callback
     */
    setAndroidCallback(callback) {
        this.androidCallback = callback;
    }
    
    /**
     * Cleanup
     */
    async shutdown() {
        console.log('🛑 Shutting down ModelLoader...');
        
        if (this.openClawPool) {
            await this.openClawPool.stop();
        }
        
        this.loadedModels.clear();
        this.emit('shutdown');
    }
}

module.exports = {
    ModelLoader,
    LoadStatus
};

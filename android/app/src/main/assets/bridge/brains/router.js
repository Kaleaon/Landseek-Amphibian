/**
 * MultiBrain Orchestrator
 * 
 * Routes tasks to the best available brain based on the request type and active configuration.
 * Now integrates with optimized model sets for task-specific model routing.
 *
 * Features:
 * - LLM-based intent classification
 * - Task-to-model routing via ModelSets
 * - OpenClaw distributed inference support
 * - Keyword fallback for reliability
 * - Decision caching for performance
 */

const LRUCache = require('./lru_cache');
const {
    TaskType,
    getModelForTask,
    getRecommendedModelSet,
    DeviceTier
} = require('../models/model_sets');

class MultiBrain {
    constructor(localBrain, options = {}) {
        this.localBrain = localBrain;
        this.brains = {}; // Registry of available brains/servers (just names or config)
        this.cache = new LRUCache(50); // Cache up to 50 recent routing decisions

        // Model set integration
        this.deviceTier = options.deviceTier || DeviceTier.MEDIUM;
        this.currentModelSet = options.modelSet || getRecommendedModelSet(this.deviceTier);
        this.modelLoader = options.modelLoader || null;

        // OpenClaw integration
        this.openClawEnabled = options.openClawEnabled || false;
        this.openClawPool = options.openClawPool || null;
    }

    register(name, brainData) {
        this.brains[name] = brainData || true;
        console.log(`🧠 Registered brain: ${name}`);
    }

    /**
     * Set the active model set
     */
    setModelSet(modelSet) {
        this.currentModelSet = modelSet;
        console.log(`📦 Router using model set: ${modelSet.name}`);
    }

    /**
     * Set device tier for model selection
     */
    setDeviceTier(tier) {
        this.deviceTier = tier;
        this.currentModelSet = getRecommendedModelSet(tier);
        console.log(`📱 Router device tier: ${tier}, model set: ${this.currentModelSet.name}`);
    }

    /**
     * Set model loader for advanced routing
     */
    setModelLoader(loader) {
        this.modelLoader = loader;
    }

    /**
     * Enable/disable OpenClaw distributed inference
     */
    setOpenClawEnabled(enabled, pool = null) {
        this.openClawEnabled = enabled;
        this.openClawPool = pool;
        console.log(`🌐 OpenClaw ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Map tool name to task type for model selection
     */
    toolToTaskType(toolName) {
        const mapping = {
            'jules': TaskType.CODE_ASSIST,
            'stitch': TaskType.VISION_TASKS,
            'context7': TaskType.DOCUMENT_ANALYSIS,
            'android': TaskType.VOICE_ASSISTANT,
            'collective': TaskType.COLLECTIVE_COMPUTE,
            'local': TaskType.GENERAL_CHAT
        };
        return mapping[toolName] || TaskType.GENERAL_CHAT;
    }

    /**
     * Get optimal model for the routed task
     */
    getOptimalModel(toolName) {
        if (!this.currentModelSet) return null;

        const taskType = this.toolToTaskType(toolName);
        const model = getModelForTask(this.currentModelSet, taskType);

        if (model) {
            console.log(`🎯 Optimal model for ${toolName} (${taskType}): ${model.name}`);
        }

        return model;
    }

    /**
     * Check if distributed inference should be used
     */
    shouldUseDistributed(toolName, taskComplexity = 'medium') {
        if (!this.openClawEnabled || !this.openClawPool) return false;

        const config = this.currentModelSet?.openClawConfig;
        if (!config || !config.enableDistributedInference) return false;

        // Use distributed for collective tasks or high complexity
        if (toolName === 'collective') return true;
        if (taskComplexity === 'high' && this.openClawPool.connectedPeers >= config.minPeersForDistributed) {
            return true;
        }

        return false;
    }

    async route(task, contextHistory = []) {
        console.log('🤔 Router: Analyzing intent...');

        // Check cache first
        const cached = this.cache.get(task);
        if (cached) {
            console.log(`🧠 Router Decision (Cached): ${JSON.stringify(cached)}`);
            if (cached.tool === 'local' || this.brains[cached.tool]) {
                const model = this.getOptimalModel(cached.tool);
                return {
                    toolName: cached.tool,
                    confidence: cached.confidence,
                    reason: 'LLM Classification (Cached)',
                    optimalModel: model?.name,
                    useDistributed: this.shouldUseDistributed(cached.tool)
                };
            }
        }
        
        // 1. Try Local LLM Classification
        if (this.localBrain) {
            try {
                const prompt = `
You are the routing system for the Amphibian Agent.
Your job is to decide which tool should handle the user's request.

Available Tools:
- jules: Coding, refactoring, fixing bugs, git operations.
- stitch: UI generation, screen design, frontend layouts.
- context7: Memory, searching past conversations, long-term context.
- android: Sending SMS, making calls, system settings.
- collective: Distributed inference across multiple devices (use for complex or compute-heavy tasks when collective pool is available).
- local: General chat, reasoning, simple questions, or if no other tool fits.

Current Model Set: ${this.currentModelSet?.name || 'Default'}
OpenClaw Available: ${this.openClawEnabled ? 'Yes' : 'No'}

User Request: "${task}"

Return ONLY a JSON object with this format:
{ "tool": "tool_name", "confidence": 0.9, "complexity": "low|medium|high" }
`;
                // Use a dedicated chat call for routing
                const response = await this.localBrain.chat([{ role: 'user', content: prompt }]);

                if (response && response.content) {
                    // Extract JSON from response (it might be wrapped in markdown blocks)
                    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const decision = JSON.parse(jsonMatch[0]);
                        console.log(`🧠 Router Decision: ${JSON.stringify(decision)}`);

                        // Check if the decided tool is actually available (registered)
                        // 'local' is always available if localBrain is there.
                        if (decision.confidence > 0.6) {
                            this.cache.set(task, decision);

                            if (decision.tool === 'local' || this.brains[decision.tool]) {
                                const model = this.getOptimalModel(decision.tool);
                                // Default complexity to 'medium' if LLM doesn't provide it
                                const complexity = decision.complexity || 'medium';
                                const useDistributed = this.shouldUseDistributed(
                                    decision.tool,
                                    complexity
                                );

                                return {
                                    toolName: decision.tool,
                                    confidence: decision.confidence,
                                    reason: 'LLM Classification',
                                    complexity: complexity,
                                    optimalModel: model?.name,
                                    modelConfig: model,
                                    useDistributed
                                };
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Router LLM failed, falling back to keywords:', e);
            }
        }

        // 2. Fallback: Keyword Matching
        const text = task.toLowerCase();
        let toolName = 'local';
        let complexity = 'medium';

        if (text.includes('code') || text.includes('refactor') || text.includes('bug') || text.includes('git')) {
            if (this.brains['jules']) toolName = 'jules';
            complexity = 'high';
        } else if (text.includes('ui') || text.includes('screen') || text.includes('design') || text.includes('layout')) {
            if (this.brains['stitch']) toolName = 'stitch';
            complexity = 'high';
        } else if (text.includes('search') || text.includes('remember') || text.includes('history')) {
            if (this.brains['context7']) toolName = 'context7';
        } else if (text.includes('sms') || text.includes('text') || text.includes('call')) {
            if (this.brains['android']) toolName = 'android';
        } else if (text.includes('distributed') || text.includes('collective') || text.includes('train')) {
            if (this.brains['collective'] || this.openClawEnabled) {
                toolName = 'collective';
                complexity = 'high';
            }
        }

        const model = this.getOptimalModel(toolName);
        const useDistributed = this.shouldUseDistributed(toolName, complexity);

        return {
            toolName: toolName,
            confidence: 1.0,
            reason: 'keyword/fallback',
            complexity,
            optimalModel: model?.name,
            modelConfig: model,
            useDistributed
        };
    }

    /**
     * Get router status
     */
    getStatus() {
        return {
            registeredBrains: Object.keys(this.brains),
            deviceTier: this.deviceTier,
            modelSet: this.currentModelSet?.name,
            openClawEnabled: this.openClawEnabled,
            cacheSize: this.cache.size || 0
        };
    }
}

module.exports = MultiBrain;

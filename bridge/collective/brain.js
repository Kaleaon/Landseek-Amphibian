/**
 * Collective Brain
 * 
 * A distributed brain that uses the collective pool for inference.
 * Designed to work with high latency by:
 * - Breaking prompts into manageable chunks
 * - Using speculative execution
 * - Aggregating partial results
 * - Implementing retry with exponential backoff
 */

const { CollectiveCoordinator, DeviceCapability } = require('./coordinator');

/**
 * Task types for collective inference
 */
const CollectiveTaskType = {
    INFERENCE: 'inference',           // Full inference request
    TOKENIZE: 'tokenize',             // Tokenize input
    GENERATE_CHUNK: 'generate_chunk', // Generate N tokens
    EMBED: 'embed',                   // Generate embeddings
    ROUTE: 'route'                    // Classify/route a request
};

class CollectiveBrain {
    constructor(coordinator, options = {}) {
        this.coordinator = coordinator;
        this.model = options.model || 'collective';
        
        // Configuration for chunked inference
        this.config = {
            maxTokensPerChunk: options.maxTokensPerChunk || 32,
            maxTotalTokens: options.maxTotalTokens || 1024,
            temperature: options.temperature || 0.7,
            topK: options.topK || 40,
            topP: options.topP || 0.9,
            streamResults: options.streamResults !== false,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 2000,
            maxRetryDelay: options.maxRetryDelay || 10000 // Cap exponential backoff at 10 seconds
        };
        
        // Tracking
        this.activeInferences = new Map();
        this.inferenceIdCounter = 0;
    }

    /**
     * Check if the collective is available
     */
    async isAvailable() {
        const status = this.coordinator.getStatus();
        return status.isRunning && status.devices >= 1;
    }

    /**
     * Get available model info
     */
    getModelInfo() {
        const status = this.coordinator.getStatus();
        return {
            name: 'Collective Brain',
            model: this.model,
            devices: status.devices,
            capabilities: status.deviceList?.map(d => d.capability) || []
        };
    }

    /**
     * Perform chat inference using the collective
     * @param {Array} messages - Chat messages [{role, content}]
     * @param {Object} options - Inference options
     */
    async chat(messages, options = {}) {
        const inferenceId = `inf_${++this.inferenceIdCounter}_${Date.now()}`;
        
        console.log(`🧠 Collective Brain: Starting inference ${inferenceId}`);
        
        // Build prompt from messages
        const prompt = this.buildPrompt(messages);
        
        // Track inference
        const inference = {
            id: inferenceId,
            prompt,
            options,
            startTime: Date.now(),
            chunks: [],
            status: 'running'
        };
        this.activeInferences.set(inferenceId, inference);
        
        try {
            // Submit inference task to collective
            const result = await this.performInference(prompt, options);
            
            inference.status = 'completed';
            inference.endTime = Date.now();
            
            return {
                role: 'assistant',
                content: result.content,
                collective: true,
                latency: inference.endTime - inference.startTime,
                devicesUsed: result.devicesUsed
            };
            
        } catch (error) {
            inference.status = 'failed';
            inference.error = error.message;
            
            console.error(`❌ Collective inference failed: ${error.message}`);
            
            return {
                role: 'assistant',
                content: `I'm having trouble processing that through the collective. Error: ${error.message}`,
                collective: true,
                error: true
            };
        } finally {
            // Cleanup after a delay
            setTimeout(() => this.activeInferences.delete(inferenceId), 60000);
        }
    }

    /**
     * Streaming chat inference
     * @param {Array} messages - Chat messages
     * @param {Object} options - Inference options
     */
    async *chatStream(messages, options = {}) {
        const inferenceId = `inf_${++this.inferenceIdCounter}_${Date.now()}`;
        
        console.log(`🌊 Collective Brain: Starting streaming inference ${inferenceId}`);
        
        const prompt = this.buildPrompt(messages);
        
        const inference = {
            id: inferenceId,
            prompt,
            options,
            startTime: Date.now(),
            chunks: [],
            status: 'running'
        };
        this.activeInferences.set(inferenceId, inference);
        
        try {
            // Perform chunked inference and yield results
            let totalTokens = 0;
            let context = prompt;
            let retryCount = 0;
            
            while (totalTokens < this.config.maxTotalTokens) {
                try {
                    // Request a chunk of tokens
                    const { taskId, promise } = await this.coordinator.submitTask(
                        CollectiveTaskType.GENERATE_CHUNK,
                        {
                            prompt: context,
                            maxTokens: this.config.maxTokensPerChunk,
                            temperature: this.config.temperature,
                            topK: this.config.topK,
                            topP: this.config.topP,
                            stopSequences: options.stopSequences || ['\n\nUser:', '\n\nHuman:']
                        },
                        { priority: 2 }
                    );
                    
                    const result = await promise;
                    
                    if (!result.result || result.result.length === 0) {
                        break; // Generation complete
                    }
                    
                    // Check for stop sequences
                    let chunk = result.result;
                    let shouldStop = false;
                    
                    for (const stop of (options.stopSequences || [])) {
                        const idx = chunk.indexOf(stop);
                        if (idx !== -1) {
                            chunk = chunk.substring(0, idx);
                            shouldStop = true;
                            break;
                        }
                    }
                    
                    if (chunk.length > 0) {
                        inference.chunks.push(chunk);
                        totalTokens += chunk.split(/\s+/).length; // Rough token estimate
                        context += chunk;
                        
                        yield chunk;
                    }
                    
                    retryCount = 0; // Reset on success
                    
                    if (shouldStop) break;
                    
                } catch (chunkError) {
                    retryCount++;
                    if (retryCount >= this.config.retryAttempts) {
                        console.error(`Chunk generation failed after ${retryCount} retries`);
                        break;
                    }
                    
                    // Exponential backoff with maximum cap
                    const backoffDelay = Math.min(
                        this.config.retryDelay * Math.pow(2, retryCount - 1),
                        this.config.maxRetryDelay
                    );
                    await this.delay(backoffDelay);
                }
            }
            
            inference.status = 'completed';
            inference.endTime = Date.now();
            
            console.log(`✅ Streaming inference complete: ${inference.chunks.length} chunks, ${totalTokens} tokens`);
            
        } catch (error) {
            inference.status = 'failed';
            inference.error = error.message;
            
            yield ` [Collective Error: ${error.message}]`;
        } finally {
            setTimeout(() => this.activeInferences.delete(inferenceId), 60000);
        }
    }

    /**
     * Perform non-streaming inference
     */
    async performInference(prompt, options = {}) {
        let attempts = 0;
        let lastError = null;
        
        while (attempts < this.config.retryAttempts) {
            try {
                const { taskId, promise } = await this.coordinator.submitTask(
                    CollectiveTaskType.INFERENCE,
                    {
                        prompt,
                        maxTokens: options.maxTokens || this.config.maxTotalTokens,
                        temperature: options.temperature || this.config.temperature,
                        topK: options.topK || this.config.topK,
                        topP: options.topP || this.config.topP,
                        stopSequences: options.stopSequences || ['\n\nUser:', '\n\nHuman:']
                    },
                    { 
                        priority: options.priority || 1,
                        requiredResults: 1
                    }
                );
                
                const result = await promise;
                
                return {
                    content: result.result,
                    partial: result.partial,
                    devicesUsed: result.completedBy,
                    latency: result.latency
                };
                
            } catch (error) {
                lastError = error;
                attempts++;
                
                if (attempts < this.config.retryAttempts) {
                    console.log(`⚠️ Inference attempt ${attempts} failed, retrying...`);
                    // Exponential backoff with maximum cap
                    const backoffDelay = Math.min(
                        this.config.retryDelay * Math.pow(2, attempts - 1),
                        this.config.maxRetryDelay
                    );
                    await this.delay(backoffDelay);
                }
            }
        }
        
        throw lastError || new Error('Inference failed after all retries');
    }

    /**
     * Quick inference for routing/classification
     */
    async quickInfer(prompt, options = {}) {
        const { promise } = await this.coordinator.submitTask(
            CollectiveTaskType.ROUTE,
            {
                prompt,
                maxTokens: options.maxTokens || 256
            },
            { priority: 3 } // Higher priority for routing
        );
        
        const result = await promise;
        return {
            role: 'assistant',
            content: result.result
        };
    }

    /**
     * Generate embeddings using the collective
     */
    async embed(text) {
        const { promise } = await this.coordinator.submitTask(
            CollectiveTaskType.EMBED,
            { text },
            { priority: 1 }
        );
        
        const result = await promise;
        return result.result; // Array of numbers
    }

    /**
     * Build a prompt from chat messages
     */
    buildPrompt(messages) {
        let prompt = '';
        
        for (const msg of messages) {
            switch (msg.role) {
                case 'system':
                    prompt += `System: ${msg.content}\n\n`;
                    break;
                case 'user':
                    prompt += `User: ${msg.content}\n\n`;
                    break;
                case 'assistant':
                    prompt += `Assistant: ${msg.content}\n\n`;
                    break;
            }
        }
        
        prompt += 'Assistant: ';
        return prompt;
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get active inference status
     */
    getActiveInferences() {
        return Array.from(this.activeInferences.values()).map(inf => ({
            id: inf.id,
            status: inf.status,
            chunksReceived: inf.chunks.length,
            elapsed: Date.now() - inf.startTime
        }));
    }
}

module.exports = { CollectiveBrain, CollectiveTaskType };

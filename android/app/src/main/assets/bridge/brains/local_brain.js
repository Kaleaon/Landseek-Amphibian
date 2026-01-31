/**
 * Local Brain Adapter (Ollama / TPU)
 *
 * Connects to a local Ollama instance (default: localhost:11434).
 * Optimized for on-device TPU inference with Gemma 3 4B.
 * Used for routing, basic chat, and fallback inference.
 */

class LocalBrain {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
        this.model = config.model || process.env.TPU_MODEL || 'gemma:3-4b-it'; // Gemma 3 4B for TPU
        this.fallbackModel = config.fallbackModel || 'gemma:2b'; // Fallback to smaller model
        this.maxRetries = config.maxRetries || 2;
        this.timeout = config.timeout || 30000; // 30 second timeout
        
        console.log(`🧠 Local Brain initialized at ${this.baseUrl}`);
        console.log(`   Primary model: ${this.model}`);
        console.log(`   Fallback model: ${this.fallbackModel}`);
    }

    async isAvailable() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const res = await fetch(`${this.baseUrl}/api/tags`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return res.ok;
        } catch (e) {
            console.log('⚠️ Ollama not available:', e.message);
            return false;
        }
    }

    async getAvailableModels() {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.models?.map(m => m.name) || [];
        } catch (e) {
            return [];
        }
    }

    async chat(messages, options = {}) {
        const models = [this.model, this.fallbackModel];
        let lastError = null;
        
        for (const model of models) {
            try {
                console.log(`💭 Attempting inference with ${model}...`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);
                
                const response = await fetch(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        stream: false,
                        options: {
                            temperature: options.temperature || 0.7,
                            top_k: options.topK || 40,
                            top_p: options.topP || 0.9,
                            num_predict: options.maxTokens || 1024
                        }
                    }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Ollama API error: ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`✅ Inference complete with ${model}`);
                return data.message; // { role: 'assistant', content: '...' }
                
            } catch (error) {
                console.error(`❌ ${model} failed:`, error.message);
                lastError = error;
                continue; // Try next model
            }
        }
        
        // All models failed, return fallback response
        console.error('All local brain models failed:', lastError?.message);
        return {
            role: 'assistant',
            content: `I'm having trouble processing that right now. Please ensure Ollama is running with a compatible model (${this.model} or ${this.fallbackModel}).`
        };
    }

    // Streaming implementation (Generator) - optimized for TPU
    async *chatStream(messages, options = {}) {
        const model = this.model;
        
        try {
            console.log(`🌊 Starting streaming inference with ${model}...`);
            
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    stream: true,
                    options: {
                        temperature: options.temperature || 0.7,
                        top_k: options.topK || 40,
                        top_p: options.topP || 0.9,
                        num_predict: options.maxTokens || 1024
                    }
                })
            });

            if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Process all complete lines
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.message && json.message.content) {
                            yield json.message.content;
                        }
                        if (json.done) {
                            console.log('✅ Streaming complete');
                            return;
                        }
                    } catch (e) {
                        // ignore parse errors for incomplete JSON
                    }
                }
            }

            // Process any remaining data in the buffer
            if (buffer.trim() !== '') {
                try {
                    const json = JSON.parse(buffer);
                    if (json.message && json.message.content) {
                        yield json.message.content;
                    }
                } catch (e) {
                    // ignore incomplete JSON at very end
                }
            }
        } catch (error) {
            console.error('🌊 Stream Error:', error.message);
            yield " [Error: Local Brain stream disconnected]";
        }
    }

    /**
     * Quick inference for classification/routing (uses smaller context)
     */
    async quickInfer(prompt, options = {}) {
        return this.chat([{ role: 'user', content: prompt }], {
            ...options,
            maxTokens: options.maxTokens || 256 // Shorter for classification
        });
    }
}

module.exports = LocalBrain;

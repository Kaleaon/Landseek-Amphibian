/**
 * TPU Brain
 *
 * Bridges Node.js to Android's local TPU inference (e.g. MediaPipe / Gemma).
 */

class TPUBrain {
    constructor(bridgeCallback) {
        this.bridgeCallback = bridgeCallback;
        if (!this.bridgeCallback) {
            console.warn("⚠️ TPUBrain initialized without bridge callback. Inference will fail unless mocked.");
        }
    }

    /**
     * Generate text from the local model.
     * @param {string} prompt
     * @param {function} onChunk (chunk) => void
     * @returns {Promise<string>} Full response
     */
    async generate(prompt, onChunk) {
        if (!this.bridgeCallback) {
            throw new Error("Android Bridge not connected.");
        }

        return new Promise((resolve, reject) => {
            let fullText = "";

            // Call the Android JNI Bridge
            // The signature is: inference(prompt, jsCallback)
            // jsCallback will be called multiple times: (error, chunk, done)
            this.bridgeCallback.inference(prompt, (error, chunk, done) => {
                if (error) {
                    reject(new Error(error));
                    return;
                }

                if (chunk) {
                    fullText += chunk;
                    if (onChunk) onChunk(chunk);
                }

                if (done) {
                    resolve(fullText);
                }
            });
        });
    }

    /**
     * Chat interface for Router/Agent compatibility.
     * Converts a list of messages to a single prompt string.
     * @param {Array} messages - [{role: 'user', content: '...'}, ...]
     * @returns {Promise<Object>} { content: "..." }
     */
    async chat(messages) {
        // Simple prompt construction.
        // Ideally, we'd use a template appropriate for the model (e.g., ChatML or Gemma formatting).
        // For now, we'll just join them.
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + "\nassistant:";

        const content = await this.generate(prompt);
        return { content };
    }
}

module.exports = TPUBrain;

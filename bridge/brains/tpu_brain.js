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
            // Note: The JNI layer must handle invoking this JS callback from the native thread.
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
}

module.exports = TPUBrain;

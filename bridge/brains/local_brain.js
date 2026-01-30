/**
 * Local Brain Adapter (Ollama)
 *
 * Connects to a local Ollama instance (default: localhost:11434).
 * Used for routing, basic chat, and fallback inference.
 */

class LocalBrain {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.model = config.model || 'gemma:2b'; // Default to a small model
        console.log(`🧠 Local Brain initialized at ${this.baseUrl} using model ${this.model}`);
    }

    async isAvailable() {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    async chat(messages, options = {}) {
        try {
            let fullContent = '';
            for await (const chunk of this.chatStream(messages, options)) {
                fullContent += chunk;
                if (options.onChunk) {
                    options.onChunk(chunk);
                }
            }
            return {
                role: 'assistant',
                content: fullContent
            };
        } catch (error) {
            console.error('Local Brain Chat Error:', error);
            // Fallback response
            return {
                role: 'assistant',
                content: "I'm having trouble thinking right now. Is Ollama running?"
            };
        }
    }

    // Streaming implementation (Generator)
    async *chatStream(messages, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    stream: true,
                    ...options
                })
            });

            if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);

            // Note: In Node.js environment, response.body is a ReadableStream (web standard) if using fetch.
            // But if we use node-fetch or undici, it might differ. Node 22 has native fetch which returns web stream.

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
                        if (json.done) return;
                    } catch (e) {
                        // ignore parse errors
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
             console.error('Local Brain Stream Error:', error);
             yield " [Error: Local Brain Disconnected]";
        }
    }
}

module.exports = LocalBrain;

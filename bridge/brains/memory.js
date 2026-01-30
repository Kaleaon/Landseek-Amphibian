/**
 * Conversation Memory
 *
 * Stores the recent conversation history to provide context to the LLM.
 */

class ConversationMemory {
    constructor(limit = 20) {
        this.limit = limit;
        this.history = [];
    }

    add(role, content) {
        this.history.push({ role, content });
        if (this.history.length > this.limit) {
            this.history.shift(); // Remove oldest
        }
    }

    getHistory() {
        return [...this.history];
    }

    clear() {
        this.history = [];
    }
}

module.exports = ConversationMemory;

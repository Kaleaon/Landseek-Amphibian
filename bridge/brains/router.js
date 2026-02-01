/**
 * MultiBrain Orchestrator
 * 
 * Routes tasks to the best available brain based on the request type and active configuration.
 */

const fs = require('fs');

class MultiBrain {
    constructor(config) {
        this.config = config;
        this.brains = {};
    }

    register(name, brain) {
        this.brains[name] = brain;
        console.log(`🧠 Registered brain: ${name}`);
    }

    async route(task, context) {
        // Simple heuristic router
        // In the future, this could be an LLM classifier itself
        
        const text = task.toLowerCase();

        // 1. Coding Tasks -> Google Jules
        if (text.includes('code') || text.includes('refactor') || text.includes('bug')) {
            if (this.brains['jules']) return this.brains['jules'];
        }

        // 2. High Context / Retrieval -> Context7
        if (text.includes('search') || text.includes('context') || text.includes('remember')) {
            if (this.brains['context7']) return this.brains['context7'];
        }

        // 3. Pipeline / Media -> Stitch (Hypothetical usage)
        if (text.includes('stitch') || text.includes('pipeline')) {
            if (this.brains['stitch']) return this.brains['stitch'];
        }

        // Default -> Local TPU (Gemma)
        return this.brains['local'] || this.brains['mock'];
    }
}

module.exports = MultiBrain;

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
        // Simple heuristic router for specialized tasks
        
        const text = task.toLowerCase();

        // 1. Coding Tasks -> Google Jules
        if (text.includes('code') || text.includes('refactor') || text.includes('bug') || text.includes('function')) {
            if (this.brains['jules']) return this.brains['jules'];
        }

        // 2. High Context / Retrieval -> Context7
        if (text.includes('search') || text.includes('context') || text.includes('remember') || text.includes('recall')) {
            if (this.brains['context7']) return this.brains['context7'];
        }

        // 3. Pipeline / Media -> Stitch
        if (text.includes('stitch') || text.includes('pipeline') || text.includes('ui') || text.includes('screen')) {
            if (this.brains['stitch']) return this.brains['stitch'];
        }

        // Default -> Local TPU
        // This covers "chat", "explain", "write", and general conversation
        return this.brains['tpu'] || this.brains['local'] || this.brains['mock'];
    }
}

module.exports = MultiBrain;

/**
 * MultiBrain Orchestrator
 * 
 * Routes tasks to the best available brain based on the request type and active configuration.
 */

const LRUCache = require('./lru_cache');

class MultiBrain {
    constructor(localBrain) {
        this.localBrain = localBrain;
        this.brains = {}; // Registry of available brains/servers (just names or config)
        this.cache = new LRUCache(50); // Cache up to 50 recent routing decisions
    }

    register(name, brainData) {
        this.brains[name] = brainData || true;
        console.log(`🧠 Registered brain: ${name}`);
    }

    async route(task, contextHistory = []) {
        console.log('🤔 Router: Analyzing intent...');

        // Check cache first
        const cached = this.cache.get(task);
        if (cached) {
            console.log(`🧠 Router Decision (Cached): ${JSON.stringify(cached)}`);
            if (cached.tool === 'local' || this.brains[cached.tool]) {
                return {
                    toolName: cached.tool,
                    confidence: cached.confidence,
                    reason: 'LLM Classification (Cached)'
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

User Request: "${task}"

Return ONLY a JSON object with this format:
{ "tool": "tool_name", "confidence": 0.9 }
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
                                return {
                                    toolName: decision.tool,
                                    confidence: decision.confidence,
                                    reason: 'LLM Classification'
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

        if (text.includes('code') || text.includes('refactor') || text.includes('bug') || text.includes('git')) {
            if (this.brains['jules']) toolName = 'jules';
        } else if (text.includes('ui') || text.includes('screen') || text.includes('design') || text.includes('layout')) {
            if (this.brains['stitch']) toolName = 'stitch';
        } else if (text.includes('search') || text.includes('remember') || text.includes('history')) {
            if (this.brains['context7']) toolName = 'context7';
        } else if (text.includes('sms') || text.includes('text') || text.includes('call')) {
            if (this.brains['android']) toolName = 'android';
        }

        return {
            toolName: toolName,
            confidence: 1.0,
            reason: 'keyword/fallback'
        };
    }
}

module.exports = MultiBrain;

/**
 * AI Personality System
 * 
 * Manages multiple AI personalities for the chat room experience.
 * Each personality has unique characteristics, conversation style, and memory.
 * Based on the Landseek personality system (Nova, Echo, Sage, etc.)
 */

const fs = require('fs');
const path = require('path');

// Default AI Personalities from Landseek
const DEFAULT_PERSONALITIES = [
    {
        id: 'nova',
        name: 'Nova',
        avatar: '🌟',
        style: 'Curious, analytical, asks probing questions',
        tags: ['analytical', 'curious', 'scientific'],
        systemPrompt: `You are Nova, a curious and analytical AI assistant. You love asking probing questions to understand topics deeply. You approach problems scientifically and enjoy breaking down complex ideas into understandable components. You often express genuine excitement when learning something new.`,
        color: '#FFD700',
        active: true
    },
    {
        id: 'echo',
        name: 'Echo',
        avatar: '🎭',
        style: 'Creative, playful, uses metaphors',
        tags: ['creative', 'playful', 'artistic'],
        systemPrompt: `You are Echo, a creative and playful AI assistant. You love using metaphors, analogies, and creative language to explain things. You see the world through an artistic lens and often find beauty in unexpected places. Your responses tend to be imaginative and sometimes whimsical.`,
        color: '#9B59B6',
        active: true
    },
    {
        id: 'sage',
        name: 'Sage',
        avatar: '🦉',
        style: 'Wise, contemplative, philosophical',
        tags: ['wise', 'philosophical', 'balanced'],
        systemPrompt: `You are Sage, a wise and contemplative AI assistant. You take a philosophical approach to questions and often consider multiple perspectives before responding. You value balance and nuance, and you're comfortable sitting with uncertainty. You occasionally share relevant quotes or ancient wisdom.`,
        color: '#2E7D32',
        active: true
    },
    {
        id: 'spark',
        name: 'Spark',
        avatar: '⚡',
        style: 'Energetic, enthusiastic, motivational',
        tags: ['energetic', 'motivational', 'optimistic'],
        systemPrompt: `You are Spark, an energetic and enthusiastic AI assistant. You bring positive energy to every conversation and love motivating others. You see challenges as opportunities and always focus on possibilities. Your responses are uplifting and action-oriented.`,
        color: '#FF9800',
        active: false
    },
    {
        id: 'atlas',
        name: 'Atlas',
        avatar: '🗺️',
        style: 'Practical, structured, action-oriented',
        tags: ['practical', 'organized', 'action-oriented'],
        systemPrompt: `You are Atlas, a practical and structured AI assistant. You excel at organizing information and creating actionable plans. You prefer concrete solutions over abstract theories. Your responses are well-organized, often using lists and steps to make information clear.`,
        color: '#607D8B',
        active: false
    },
    {
        id: 'luna',
        name: 'Luna',
        avatar: '🌙',
        style: 'Empathetic, nurturing, supportive',
        tags: ['empathetic', 'supportive', 'emotional'],
        systemPrompt: `You are Luna, an empathetic and nurturing AI assistant. You prioritize emotional understanding and support. You're an excellent listener and often validate feelings before offering advice. Your responses are warm, compassionate, and make people feel heard.`,
        color: '#7B68EE',
        active: false
    },
    {
        id: 'cipher',
        name: 'Cipher',
        avatar: '🔮',
        style: 'Logical, precise, technical',
        tags: ['logical', 'technical', 'precise'],
        systemPrompt: `You are Cipher, a logical and precise AI assistant. You excel at technical topics and value accuracy above all. You break down problems systematically and prefer data-driven answers. Your responses are clear, precise, and often include technical details.`,
        color: '#00BCD4',
        active: false
    },
    {
        id: 'muse',
        name: 'Muse',
        avatar: '🎨',
        style: 'Artistic, inspiring, poetic',
        tags: ['artistic', 'inspiring', 'poetic'],
        systemPrompt: `You are Muse, an artistic and inspiring AI assistant. You have a gift for finding inspiration in everyday moments. You often express ideas through creative language, sometimes using poetry or vivid imagery. Your responses spark imagination and encourage creative thinking.`,
        color: '#E91E63',
        active: false
    },
    {
        id: 'phoenix',
        name: 'Phoenix',
        avatar: '🔥',
        style: 'Resilient, transformative, growth-focused',
        tags: ['resilient', 'growth', 'transformative'],
        systemPrompt: `You are Phoenix, a resilient and transformative AI assistant. You specialize in helping people through challenges and changes. You believe in the power of transformation and see setbacks as opportunities for growth. Your responses are empowering and focus on building strength.`,
        color: '#FF5722',
        active: false
    },
    {
        id: 'zen',
        name: 'Zen',
        avatar: '☯️',
        style: 'Calm, mindful, peaceful',
        tags: ['calm', 'mindful', 'peaceful'],
        systemPrompt: `You are Zen, a calm and mindful AI assistant. You approach every conversation with peaceful presence. You help people slow down and find clarity. Your responses are measured, thoughtful, and often include mindfulness perspectives. You value simplicity and inner peace.`,
        color: '#009688',
        active: false
    }
];

class PersonalityManager {
    constructor(storagePath = null) {
        this.personalities = new Map();
        this.storagePath = storagePath;
        this.customNames = new Map(); // Track renamed personalities
        
        // Load default personalities
        DEFAULT_PERSONALITIES.forEach(p => {
            this.personalities.set(p.id, { ...p });
        });
    }

    /**
     * Get all personalities
     */
    getAll() {
        return Array.from(this.personalities.values());
    }

    /**
     * Get only active personalities
     */
    getActive() {
        return this.getAll().filter(p => p.active);
    }

    /**
     * Get a specific personality by ID
     */
    get(id) {
        return this.personalities.get(id);
    }

    /**
     * Get personality by name (including custom names)
     */
    getByName(name) {
        const normalizedName = name.toLowerCase();
        
        // Check custom names first
        for (const [id, customName] of this.customNames) {
            if (customName.toLowerCase() === normalizedName) {
                return this.get(id);
            }
        }
        
        // Check default names
        for (const p of this.personalities.values()) {
            if (p.name.toLowerCase() === normalizedName) {
                return p;
            }
        }
        
        return null;
    }

    /**
     * Activate a personality for the chat
     */
    activate(id) {
        const personality = this.get(id);
        if (personality) {
            personality.active = true;
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Deactivate a personality
     */
    deactivate(id) {
        const personality = this.get(id);
        if (personality) {
            personality.active = false;
            this.save();
            return true;
        }
        return false;
    }

    /**
     * Rename a personality
     */
    rename(id, newName) {
        const personality = this.get(id);
        if (personality) {
            this.customNames.set(id, newName);
            this.save();
            return { oldName: personality.name, newName };
        }
        return null;
    }

    /**
     * Get display name for a personality (custom name if set)
     */
    getDisplayName(id) {
        return this.customNames.get(id) || this.get(id)?.name || id;
    }

    /**
     * Build the system prompt for a personality including context
     */
    buildSystemPrompt(personality, context = {}) {
        const { chatRoom = 'Amphibian Chat', otherParticipants = [] } = context;
        
        let prompt = personality.systemPrompt;
        
        // Add context about the chat environment
        prompt += `\n\nYou are in ${chatRoom}. `;
        
        if (otherParticipants.length > 0) {
            prompt += `Other participants in this conversation: ${otherParticipants.join(', ')}. `;
        }
        
        prompt += `\nRespond naturally as ${this.getDisplayName(personality.id)} would. Keep responses concise but meaningful.`;
        
        return prompt;
    }

    /**
     * Save personality state to storage
     */
    save() {
        if (!this.storagePath) return;
        
        try {
            const data = {
                personalities: this.getAll().map(p => ({
                    id: p.id,
                    active: p.active
                })),
                customNames: Object.fromEntries(this.customNames)
            };
            
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save personality state:', e);
        }
    }

    /**
     * Load personality state from storage
     */
    load() {
        if (!this.storagePath || !fs.existsSync(this.storagePath)) return;
        
        try {
            const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            
            // Restore active states
            if (data.personalities) {
                data.personalities.forEach(saved => {
                    const personality = this.get(saved.id);
                    if (personality) {
                        personality.active = saved.active;
                    }
                });
            }
            
            // Restore custom names
            if (data.customNames) {
                this.customNames = new Map(Object.entries(data.customNames));
            }
        } catch (e) {
            console.error('Failed to load personality state:', e);
        }
    }

    /**
     * Format personality info for display
     */
    formatInfo(personality) {
        const displayName = this.getDisplayName(personality.id);
        return `${personality.avatar} ${displayName}: ${personality.style}`;
    }

    /**
     * List all personalities formatted
     */
    listFormatted() {
        const lines = ['**AI Personalities:**\n'];
        
        for (const p of this.getAll()) {
            const status = p.active ? '✅' : '⬜';
            const displayName = this.getDisplayName(p.id);
            lines.push(`${status} ${p.avatar} **${displayName}** - ${p.style}`);
        }
        
        return lines.join('\n');
    }
}

module.exports = { PersonalityManager, DEFAULT_PERSONALITIES };

/**
 * Collective Identity & Authentication
 * 
 * Provides identity and reputation management for the P2P collective.
 * Allows users to build reputation through contributions while maintaining
 * privacy through pseudonymous identities.
 * 
 * Features:
 * - Cryptographic identity generation
 * - Reputation scoring based on contributions
 * - Trust levels and permissions
 * - Challenge-response authentication
 * - Anonymous mode support
 * - Identity verification (optional)
 */

const crypto = require('crypto');

/**
 * Trust levels for collective members
 */
const TrustLevel = {
    ANONYMOUS: 0,       // No identity, limited access
    NEW: 1,             // New identity, building reputation
    TRUSTED: 2,         // Proven track record
    VERIFIED: 3,        // Verified identity
    GUARDIAN: 4         // High trust, moderation capabilities
};

/**
 * Permission types
 */
const Permission = {
    SUBMIT_TASK: 'submit_task',
    CLAIM_TASK: 'claim_task',
    VIEW_RESULTS: 'view_results',
    CONTRIBUTE_TRAINING: 'contribute_training',
    ACCESS_PREMIUM: 'access_premium',
    MODERATE: 'moderate',
    ADMIN: 'admin'
};

/**
 * Generates a cryptographic identity
 */
function generateIdentity() {
    const keyPair = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    // Generate a user-friendly ID from public key hash
    const publicKeyHash = crypto.createHash('sha256')
        .update(keyPair.publicKey)
        .digest('hex')
        .substring(0, 16);
    
    return {
        id: `amphi_${publicKeyHash}`,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        createdAt: Date.now()
    };
}

/**
 * Signs a message with the identity's private key
 */
function signMessage(privateKey, message) {
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    return sign.sign(privateKey, 'base64');
}

/**
 * Verifies a signed message
 */
function verifySignature(publicKey, message, signature) {
    try {
        const verify = crypto.createVerify('SHA256');
        verify.update(message);
        return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
        return false;
    }
}

/**
 * User identity profile
 */
class CollectiveIdentity {
    constructor({
        id,
        publicKey,
        privateKey = null,
        displayName = null,
        trustLevel = TrustLevel.NEW,
        reputation = 0,
        contributions = {},
        badges = [],
        createdAt = Date.now(),
        lastActive = Date.now(),
        verified = false,
        metadata = {}
    }) {
        this.id = id;
        this.publicKey = publicKey;
        this.privateKey = privateKey;  // Only for local identity
        this.displayName = displayName || this.generateDisplayName();
        this.trustLevel = trustLevel;
        this.reputation = reputation;
        this.contributions = contributions;
        this.badges = badges;
        this.createdAt = createdAt;
        this.lastActive = lastActive;
        this.verified = verified;
        this.metadata = metadata;
    }
    
    /**
     * Generate a friendly display name from ID
     */
    generateDisplayName() {
        const adjectives = ['Swift', 'Brave', 'Wise', 'Kind', 'Bright', 'Noble', 'Bold', 'Calm'];
        const animals = ['Frog', 'Salamander', 'Newt', 'Axolotl', 'Toad', 'Caecilian', 'Gecko', 'Triton'];
        
        const hash = parseInt(this.id.substring(6, 14), 16);
        const adj = adjectives[hash % adjectives.length];
        const animal = animals[(hash >> 8) % animals.length];
        const num = hash % 1000;
        
        return `${adj}${animal}${num}`;
    }
    
    /**
     * Sign a message
     */
    sign(message) {
        if (!this.privateKey) {
            throw new Error('Cannot sign without private key');
        }
        return signMessage(this.privateKey, message);
    }
    
    /**
     * Create authentication challenge response
     */
    createAuthResponse(challenge) {
        const timestamp = Date.now();
        const message = `${challenge}:${timestamp}:${this.id}`;
        const signature = this.sign(message);
        
        return {
            id: this.id,
            publicKey: this.publicKey,
            challenge,
            timestamp,
            signature
        };
    }
    
    /**
     * Check if identity has a specific permission
     */
    hasPermission(permission) {
        const levelPermissions = {
            [TrustLevel.ANONYMOUS]: [Permission.VIEW_RESULTS],
            [TrustLevel.NEW]: [Permission.VIEW_RESULTS, Permission.SUBMIT_TASK, Permission.CLAIM_TASK],
            [TrustLevel.TRUSTED]: [Permission.VIEW_RESULTS, Permission.SUBMIT_TASK, Permission.CLAIM_TASK, Permission.CONTRIBUTE_TRAINING],
            [TrustLevel.VERIFIED]: [Permission.VIEW_RESULTS, Permission.SUBMIT_TASK, Permission.CLAIM_TASK, Permission.CONTRIBUTE_TRAINING, Permission.ACCESS_PREMIUM],
            [TrustLevel.GUARDIAN]: [Permission.VIEW_RESULTS, Permission.SUBMIT_TASK, Permission.CLAIM_TASK, Permission.CONTRIBUTE_TRAINING, Permission.ACCESS_PREMIUM, Permission.MODERATE]
        };
        
        return (levelPermissions[this.trustLevel] || []).includes(permission);
    }
    
    /**
     * Export public profile (safe to share)
     */
    toPublicProfile() {
        return {
            id: this.id,
            publicKey: this.publicKey,
            displayName: this.displayName,
            trustLevel: this.trustLevel,
            reputation: this.reputation,
            contributions: this.contributions,
            badges: this.badges,
            verified: this.verified,
            memberSince: this.createdAt
        };
    }
    
    /**
     * Serialize for storage (includes private key)
     */
    serialize() {
        return JSON.stringify({
            id: this.id,
            publicKey: this.publicKey,
            privateKey: this.privateKey,
            displayName: this.displayName,
            trustLevel: this.trustLevel,
            reputation: this.reputation,
            contributions: this.contributions,
            badges: this.badges,
            createdAt: this.createdAt,
            lastActive: this.lastActive,
            verified: this.verified,
            metadata: this.metadata
        });
    }
    
    /**
     * Deserialize from storage
     */
    static deserialize(data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return new CollectiveIdentity(parsed);
    }
}

/**
 * Reputation entry
 */
class ReputationEvent {
    constructor({
        type,
        points,
        reason,
        timestamp = Date.now(),
        relatedId = null,
        metadata = {}
    }) {
        this.type = type;
        this.points = points;
        this.reason = reason;
        this.timestamp = timestamp;
        this.relatedId = relatedId;
        this.metadata = metadata;
    }
}

/**
 * Identity Manager
 * Handles identity creation, storage, and authentication
 */
class IdentityManager {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'collective_identity';
        this.challengeExpiry = options.challengeExpiry || 300000; // 5 minutes
        
        // State
        this.localIdentity = null;
        this.knownIdentities = new Map();
        this.pendingChallenges = new Map();
        this.reputationHistory = [];
        
        // Callbacks
        this.onReputationChange = options.onReputationChange || (() => {});
        this.onTrustLevelChange = options.onTrustLevelChange || (() => {});
    }
    
    /**
     * Initialize identity manager
     * @param {Function} loadStorage - Function to load stored identity
     */
    async initialize(loadStorage) {
        try {
            const stored = await loadStorage(this.storageKey);
            if (stored) {
                this.localIdentity = CollectiveIdentity.deserialize(stored);
                console.log(`🔐 Loaded identity: ${this.localIdentity.displayName} (${this.localIdentity.id})`);
            }
            return this.localIdentity;
        } catch (error) {
            console.error('Failed to load identity:', error.message);
            return null;
        }
    }
    
    /**
     * Create a new identity
     */
    async createIdentity(saveStorage) {
        const keys = generateIdentity();
        
        this.localIdentity = new CollectiveIdentity({
            id: keys.id,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
            trustLevel: TrustLevel.NEW,
            reputation: 0
        });
        
        if (saveStorage) {
            await saveStorage(this.storageKey, this.localIdentity.serialize());
        }
        
        console.log(`🆕 Created new identity: ${this.localIdentity.displayName}`);
        return this.localIdentity;
    }
    
    /**
     * Get current identity
     */
    getIdentity() {
        return this.localIdentity;
    }
    
    /**
     * Create an authentication challenge
     */
    createChallenge(targetId) {
        const challenge = crypto.randomBytes(32).toString('hex');
        
        this.pendingChallenges.set(challenge, {
            targetId,
            createdAt: Date.now()
        });
        
        // Clean up expired challenges
        this.cleanupExpiredChallenges();
        
        return challenge;
    }
    
    /**
     * Verify an authentication response
     */
    verifyAuthResponse(response) {
        const { id, publicKey, challenge, timestamp, signature } = response;
        
        // Check challenge exists and hasn't expired
        const pending = this.pendingChallenges.get(challenge);
        if (!pending) {
            return { valid: false, reason: 'Unknown challenge' };
        }
        
        if (Date.now() - pending.createdAt > this.challengeExpiry) {
            this.pendingChallenges.delete(challenge);
            return { valid: false, reason: 'Challenge expired' };
        }
        
        // Verify signature
        const message = `${challenge}:${timestamp}:${id}`;
        const valid = verifySignature(publicKey, message, signature);
        
        if (!valid) {
            return { valid: false, reason: 'Invalid signature' };
        }
        
        // Success - clean up challenge
        this.pendingChallenges.delete(challenge);
        
        // Store/update known identity
        let knownIdentity = this.knownIdentities.get(id);
        if (!knownIdentity) {
            knownIdentity = new CollectiveIdentity({
                id,
                publicKey,
                trustLevel: TrustLevel.NEW
            });
        }
        knownIdentity.lastActive = Date.now();
        this.knownIdentities.set(id, knownIdentity);
        
        return { valid: true, identity: knownIdentity };
    }
    
    /**
     * Update reputation for a contribution
     */
    addReputation(identityId, event) {
        const identity = identityId === this.localIdentity?.id 
            ? this.localIdentity 
            : this.knownIdentities.get(identityId);
            
        if (!identity) {
            console.warn(`Unknown identity: ${identityId}`);
            return;
        }
        
        const oldReputation = identity.reputation;
        identity.reputation += event.points;
        
        // Track contribution type
        identity.contributions[event.type] = (identity.contributions[event.type] || 0) + 1;
        
        // Store event
        this.reputationHistory.push({
            identityId,
            ...event
        });
        
        // Check for trust level changes
        this.updateTrustLevel(identity);
        
        // Callbacks
        this.onReputationChange(identity, event);
        
        console.log(`📈 Reputation update for ${identity.displayName}: ${oldReputation} -> ${identity.reputation} (${event.reason})`);
        
        return identity.reputation;
    }
    
    /**
     * Update trust level based on reputation
     */
    updateTrustLevel(identity) {
        const thresholds = [
            { level: TrustLevel.GUARDIAN, minReputation: 10000, minContributions: 500 },
            { level: TrustLevel.VERIFIED, minReputation: 1000, minContributions: 50 },
            { level: TrustLevel.TRUSTED, minReputation: 100, minContributions: 10 },
            { level: TrustLevel.NEW, minReputation: 0, minContributions: 0 }
        ];
        
        const totalContributions = Object.values(identity.contributions).reduce((a, b) => a + b, 0);
        
        for (const threshold of thresholds) {
            if (identity.reputation >= threshold.minReputation && 
                totalContributions >= threshold.minContributions &&
                identity.trustLevel < threshold.level) {
                
                const oldLevel = identity.trustLevel;
                identity.trustLevel = threshold.level;
                
                this.onTrustLevelChange(identity, oldLevel, threshold.level);
                console.log(`🏆 Trust level upgrade: ${identity.displayName} is now level ${threshold.level}`);
                
                break;
            }
        }
    }
    
    /**
     * Get public profile for an identity
     */
    getPublicProfile(identityId) {
        if (identityId === this.localIdentity?.id) {
            return this.localIdentity.toPublicProfile();
        }
        return this.knownIdentities.get(identityId)?.toPublicProfile();
    }
    
    /**
     * Get reputation leaderboard
     */
    getLeaderboard(limit = 10) {
        const allIdentities = [
            ...(this.localIdentity ? [this.localIdentity] : []),
            ...this.knownIdentities.values()
        ];
        
        return allIdentities
            .map(id => id.toPublicProfile())
            .sort((a, b) => b.reputation - a.reputation)
            .slice(0, limit);
    }
    
    /**
     * Award a badge to an identity
     */
    awardBadge(identityId, badge) {
        const identity = identityId === this.localIdentity?.id 
            ? this.localIdentity 
            : this.knownIdentities.get(identityId);
            
        if (identity && !identity.badges.includes(badge)) {
            identity.badges.push(badge);
            console.log(`🏅 Badge awarded to ${identity.displayName}: ${badge}`);
        }
    }
    
    /**
     * Clean up expired challenges
     */
    cleanupExpiredChallenges() {
        const now = Date.now();
        for (const [challenge, data] of this.pendingChallenges) {
            if (now - data.createdAt > this.challengeExpiry) {
                this.pendingChallenges.delete(challenge);
            }
        }
    }
    
    /**
     * Set display name for local identity
     */
    setDisplayName(name, saveStorage) {
        if (this.localIdentity) {
            this.localIdentity.displayName = name;
            if (saveStorage) {
                saveStorage(this.storageKey, this.localIdentity.serialize());
            }
        }
    }
}

/**
 * Badge definitions
 */
const Badges = {
    FIRST_CONTRIBUTION: 'first_contribution',
    TEN_CONTRIBUTIONS: '10_contributions',
    HUNDRED_CONTRIBUTIONS: '100_contributions',
    FIRST_TRAINING: 'first_training',
    PERFECT_ACCURACY: 'perfect_accuracy',
    EARLY_ADOPTER: 'early_adopter',
    HELPFUL_PEER: 'helpful_peer',
    FAST_RESPONDER: 'fast_responder',
    CONSISTENT_CONTRIBUTOR: 'consistent_contributor',
    TRUSTED_MEMBER: 'trusted_member'
};

/**
 * Reputation point values
 */
const ReputationPoints = {
    TASK_COMPLETED: 10,
    TASK_VERIFIED: 5,
    TRAINING_CONTRIBUTION: 15,
    HELPFUL_ANSWER: 3,
    PEER_ENDORSEMENT: 5,
    BUG_REPORT: 8,
    FAST_RESPONSE: 2
};

module.exports = {
    TrustLevel,
    Permission,
    CollectiveIdentity,
    IdentityManager,
    ReputationEvent,
    Badges,
    ReputationPoints,
    generateIdentity,
    signMessage,
    verifySignature
};

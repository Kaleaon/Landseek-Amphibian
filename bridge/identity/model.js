/**
 * Moltbook Identity Model
 * Defines the identity structure and trust scoring logic.
 */

class MoltbookIdentity {
    constructor(data = {}) {
        this.userId = data.userId || null;
        this.username = data.username || 'Anonymous';
        this.karma = data.karma || 0;
        this.accountAgeDays = data.accountAgeDays || 0;
        this.isVerified = !!data.isVerified;
        this.isFlagged = !!data.isFlagged;
        this.badges = data.badges || [];
        this.lastSynced = data.lastSynced || null;
    }

    /**
     * Calculate trust score between 0.0 and 1.0
     */
    calculateTrustScore() {
        if (this.isFlagged) return 0.0;

        let score = 0.1; // Base score

        // Karma contribution (max 0.4)
        // 1000 karma gets max score
        score += Math.min(this.karma / 1000, 1.0) * 0.4;

        // Age contribution (max 0.2)
        // 1 year (365 days) gets max score
        score += Math.min(this.accountAgeDays / 365, 1.0) * 0.2;

        // Verification bonus
        if (this.isVerified) score += 0.3;

        return Math.min(Math.max(score, 0.0), 1.0);
    }

    /**
     * Get human-readable trust level
     */
    getTrustLevel() {
        const score = this.calculateTrustScore();
        if (this.isFlagged) return 'Untrusted';
        if (score >= 0.9) return 'Vouched';
        if (score >= 0.7) return 'Trusted';
        if (score >= 0.4) return 'Established';
        return 'Newcomer';
    }

    toJSON() {
        return {
            userId: this.userId,
            username: this.username,
            karma: this.karma,
            accountAgeDays: this.accountAgeDays,
            isVerified: this.isVerified,
            isFlagged: this.isFlagged,
            badges: this.badges,
            trustScore: this.calculateTrustScore(),
            trustLevel: this.getTrustLevel(),
            lastSynced: this.lastSynced
        };
    }
}

module.exports = { MoltbookIdentity };

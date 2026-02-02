/**
 * Identity Manager
 * Manages identity state, persistence, and provider selection.
 */

const fs = require('fs');
const path = require('path');
const { MoltbookProvider, LocalProvider } = require('./providers');
const { MoltbookIdentity } = require('./model');

class IdentityManager {
    constructor(storagePath) {
        this.storagePath = storagePath;
        this.identityFile = path.join(storagePath, 'identity.json');
        this.providers = {
            moltbook: new MoltbookProvider({
                clientId: process.env.MOLTBOOK_CLIENT_ID,
                clientSecret: process.env.MOLTBOOK_CLIENT_SECRET
            }),
            local: new LocalProvider()
        };
        this.currentProviderName = 'local';
        this.currentIdentity = null;
        this.accessToken = null;
    }

    /**
     * Load saved identity from disk
     */
    async load() {
        try {
            if (fs.existsSync(this.identityFile)) {
                const data = JSON.parse(fs.readFileSync(this.identityFile, 'utf8'));
                this.currentProviderName = data.provider || 'local';
                this.accessToken = data.accessToken;
                this.currentIdentity = new MoltbookIdentity(data.identity);
                console.log(`[IdentityManager] Loaded identity: ${this.currentIdentity.username} (${this.currentProviderName})`);
            } else {
                // Initialize with local default
                await this.useProvider('local');
            }
        } catch (e) {
            console.error('[IdentityManager] Failed to load identity:', e);
            await this.useProvider('local');
        }
    }

    /**
     * Save current identity to disk
     */
    save() {
        try {
            const data = {
                provider: this.currentProviderName,
                accessToken: this.accessToken,
                identity: this.currentIdentity
            };

            // Ensure directory exists
            if (!fs.existsSync(this.storagePath)) {
                fs.mkdirSync(this.storagePath, { recursive: true });
            }

            fs.writeFileSync(this.identityFile, JSON.stringify(data, null, 2));
            console.log('[IdentityManager] Identity saved');
        } catch (e) {
            console.error('[IdentityManager] Failed to save identity:', e);
        }
    }

    /**
     * Switch provider and load initial profile
     */
    async useProvider(providerName) {
        if (!this.providers[providerName]) {
            throw new Error(`Unknown provider: ${providerName}`);
        }

        this.currentProviderName = providerName;
        // Reset identity until authenticated (except for local)
        if (providerName === 'local') {
            const provider = this.providers['local'];
            this.currentIdentity = await provider.getProfile('local_token');
            this.accessToken = 'local_token';
            this.save();
        }
    }

    /**
     * Handle login callback
     */
    async handleLoginCallback(providerName, code) {
        const provider = this.providers[providerName];
        if (!provider) throw new Error('Invalid provider');

        const tokens = await provider.handleCallback(code);
        this.accessToken = tokens.accessToken;
        this.currentProviderName = providerName;

        // Fetch profile immediately
        await this.refreshProfile();
        this.save();

        return this.currentIdentity;
    }

    /**
     * Refresh profile from current provider
     */
    async refreshProfile() {
        if (!this.accessToken) return;

        const provider = this.providers[this.currentProviderName];
        this.currentIdentity = await provider.getProfile(this.accessToken);
        this.currentIdentity.lastSynced = new Date().toISOString();
        this.save();
        return this.currentIdentity;
    }

    /**
     * Get current identity info
     */
    getIdentity() {
        return this.currentIdentity;
    }

    /**
     * Get login URL for a provider
     */
    getLoginUrl(providerName) {
        const provider = this.providers[providerName];
        if (!provider) throw new Error('Invalid provider');
        return provider.getLoginUrl();
    }
}

module.exports = { IdentityManager };

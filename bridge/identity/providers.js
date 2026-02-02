/**
 * Identity Providers
 * Handles authentication logic for different providers.
 */

const { MoltbookIdentity } = require('./model');

// Abstract Base Class
class AuthProvider {
    constructor(config = {}) {
        this.config = config;
    }

    getLoginUrl() {
        throw new Error('Not implemented');
    }

    async handleCallback(code) {
        throw new Error('Not implemented');
    }

    async getProfile(accessToken) {
        throw new Error('Not implemented');
    }
}

// Moltbook Provider (Stub/Simulation)
class MoltbookProvider extends AuthProvider {
    constructor(config) {
        super(config);
        this.name = 'moltbook';
        // Base URL for Moltbook (fictional for now)
        this.baseUrl = config.baseUrl || 'https://moltbook.com/api/v1';
    }

    getLoginUrl() {
        // Return a mock URL for now, or the real OAuth endpoint if it existed
        const clientId = this.config.clientId || 'amphibian_client';
        const redirectUri = this.config.redirectUri || 'http://localhost:3000/auth/moltbook/callback';
        return `https://moltbook.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    }

    async handleCallback(code) {
        // Simulate exchanging code for token
        console.log(`[MoltbookProvider] Exchanging code: ${code}`);

        // In a real implementation, we would POST to /oauth/token
        // For now, return a mock token
        return {
            accessToken: 'mock_access_token_' + Date.now(),
            refreshToken: 'mock_refresh_token_' + Date.now(),
            expiresIn: 3600
        };
    }

    async getProfile(accessToken) {
        // Simulate fetching user profile
        console.log(`[MoltbookProvider] Fetching profile with token: ${accessToken}`);

        // Return mock data that resembles expected Moltbook API response
        return new MoltbookIdentity({
            userId: 'mb_12345678',
            username: 'AmphibianAgent',
            karma: 150,
            accountAgeDays: 45,
            isVerified: true,
            isFlagged: false,
            badges: ['beta_tester', 'verified_agent'],
            lastSynced: new Date().toISOString()
        });
    }
}

// Local Fallback Provider
class LocalProvider extends AuthProvider {
    constructor(config) {
        super(config);
        this.name = 'local';
    }

    getLoginUrl() {
        return null; // No login needed for local
    }

    async handleCallback(code) {
        return { accessToken: 'local_token' };
    }

    async getProfile(accessToken) {
        return new MoltbookIdentity({
            userId: 'local_user',
            username: 'Local User',
            karma: 0,
            accountAgeDays: 0,
            isVerified: false,
            isFlagged: false,
            lastSynced: new Date().toISOString()
        });
    }
}

module.exports = { AuthProvider, MoltbookProvider, LocalProvider };

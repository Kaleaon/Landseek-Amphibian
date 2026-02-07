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

// Moltbook Provider
class MoltbookProvider extends AuthProvider {
    constructor(config) {
        super(config);
        this.name = 'moltbook';
        // Base URL for Moltbook API
        this.baseUrl = config.baseUrl || 'https://moltbook.com/api/v1';
        // OAuth base URL (derived once for consistency)
        this.oauthBaseUrl = config.oauthBaseUrl || new URL('/', this.baseUrl).origin;
    }

    getLoginUrl() {
        const clientId = this.config.clientId || 'amphibian_client';
        const redirectUri = this.config.redirectUri || 'http://localhost:3000/auth/moltbook/callback';
        return `${this.oauthBaseUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    }

    async handleCallback(code) {
        console.log(`[MoltbookProvider] Exchanging code for token`);

        const clientId = this.config.clientId || 'amphibian_client';
        const clientSecret = this.config.clientSecret || '';
        const redirectUri = this.config.redirectUri || 'http://localhost:3000/auth/moltbook/callback';

        try {
            const response = await fetch(`${this.oauthBaseUrl}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri
                })
            });

            if (!response.ok) {
                throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in || 3600
            };
        } catch (error) {
            console.error(`[MoltbookProvider] Token exchange error: ${error.message}`);
            throw error;
        }
    }

    async getProfile(accessToken) {
        console.log(`[MoltbookProvider] Fetching profile`);

        try {
            const response = await fetch(`${this.baseUrl}/users/me`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Profile fetch failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return new MoltbookIdentity({
                userId: data.user_id || data.id,
                username: data.username,
                karma: data.karma || 0,
                accountAgeDays: data.account_age_days || 0,
                isVerified: data.is_verified || false,
                isFlagged: data.is_flagged || false,
                badges: data.badges || [],
                lastSynced: new Date().toISOString()
            });
        } catch (error) {
            console.error(`[MoltbookProvider] Profile fetch error: ${error.message}`);
            throw error;
        }
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

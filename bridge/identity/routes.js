/**
 * Identity Routes
 * Handles HTTP requests for authentication and identity.
 */

const url = require('url');

/**
 * Handle identity-related routes
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {IdentityManager} identityManager
 * @returns {boolean} True if handled, false otherwise
 */
async function handleIdentityRoutes(req, res, identityManager) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Helper to send JSON response
    const sendJson = (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    };

    // Helper to redirect
    const redirect = (location) => {
        res.writeHead(302, { 'Location': location });
        res.end();
    };

    try {
        // GET /auth/moltbook/login
        if (pathname === '/auth/moltbook/login' && req.method === 'GET') {
            const loginUrl = identityManager.getLoginUrl('moltbook');
            // Since this is likely called by the UI to open a browser, we can return the URL
            // or redirect if opened directly in browser.
            // For API usage, returning JSON with url is better.
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                sendJson({ url: loginUrl });
            } else {
                redirect(loginUrl);
            }
            return true;
        }

        // GET /auth/moltbook/callback
        if (pathname === '/auth/moltbook/callback' && req.method === 'GET') {
            const code = parsedUrl.query.code;
            if (!code) {
                sendJson({ error: 'Missing code' }, 400);
                return true;
            }

            await identityManager.handleLoginCallback('moltbook', code);
            // Redirect to success page or close window
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Login Successful</h1><p>You can close this window and return to the app.</p>');
            return true;
        }

        // GET /identity/me
        if (pathname === '/identity/me' && req.method === 'GET') {
            const identity = identityManager.getIdentity();
            sendJson(identity);
            return true;
        }

        // GET /identity/trust-score
        if (pathname === '/identity/trust-score' && req.method === 'GET') {
            const identity = identityManager.getIdentity();
            if (!identity) {
                sendJson({ error: 'No identity found' }, 404);
            } else {
                sendJson({
                    score: identity.calculateTrustScore(),
                    level: identity.getTrustLevel(),
                    details: identity
                });
            }
            return true;
        }

        // POST /identity/refresh
        if (pathname === '/identity/refresh' && req.method === 'POST') {
             const identity = await identityManager.refreshProfile();
             sendJson(identity);
             return true;
        }

    } catch (err) {
        console.error('Identity route error:', err);
        sendJson({ error: err.message }, 500);
        return true;
    }

    return false;
}

module.exports = { handleIdentityRoutes };

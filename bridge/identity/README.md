# Identity Module

This module handles agent authentication and reputation management, integrating with Moltbook as an identity provider.

## Configuration

The identity manager requires environment variables for Moltbook integration (optional, defaults to stub/local if missing).

```env
MOLTBOOK_CLIENT_ID=your_client_id
MOLTBOOK_CLIENT_SECRET=your_client_secret
```

## API Endpoints

### Authentication

*   `GET /auth/moltbook/login`
    *   Redirects to Moltbook OAuth login page.
    *   If `Accept: application/json` header is sent, returns JSON: `{ "url": "..." }`.

*   `GET /auth/moltbook/callback`
    *   Callback URL for OAuth flow. Exchanges code for token.

### Identity Management

*   `GET /identity/me`
    *   Returns the current authenticated identity.
    *   Response:
        ```json
        {
          "userId": "mb_12345",
          "username": "AgentName",
          "karma": 150,
          "trustScore": 0.55,
          "trustLevel": "Established",
           ...
        }
        ```

*   `GET /identity/trust-score`
    *   Returns detailed trust score information.
    *   Response:
        ```json
        {
          "score": 0.55,
          "level": "Established",
          "details": { ... }
        }
        ```

*   `POST /identity/refresh`
    *   Forces a profile refresh from the provider.

## Trust Model

Trust is calculated based on:
1.  **Karma**: Higher karma increases trust.
2.  **Account Age**: Older accounts are more trusted.
3.  **Verification**: Verified accounts get a bonus.
4.  **Flags**: Flagged accounts have 0 trust.

Trust Levels:
*   **Vouched**: Score >= 0.9
*   **Trusted**: Score >= 0.7
*   **Established**: Score >= 0.4
*   **Newcomer**: Score < 0.4
*   **Untrusted**: Flagged

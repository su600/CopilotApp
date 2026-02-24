/**
 * GitHub OAuth Device Flow Authentication API
 * Implements the GitHub Device Authorization Grant
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */

const GITHUB_API = 'https://api.github.com';
// Use a relative proxy path so the browser doesn't make cross-origin requests
// to github.com/login (which has no CORS headers and causes "Failed to fetch").
// nginx.conf (production) and vite.config.js (dev) both proxy /github-login/ → https://github.com/login/
const GITHUB_LOGIN = '/github-login';
// The copilot_internal endpoint is an internal API that does not include CORS headers,
// so direct browser requests fail with "Failed to fetch". Use a same-origin proxy instead.
// nginx.conf (production) and vite.config.js (dev) proxy only the exact path
// /github-api/copilot_internal/v2/token → https://api.github.com/copilot_internal/v2/token
const GITHUB_API_PROXY = '/github-api';

/**
 * Step 1: Request device and user codes
 * @param {string} clientId - GitHub OAuth App client ID
 * @param {string} scope - OAuth scope(s) to request
 * @returns {Promise<{device_code, user_code, verification_uri, expires_in, interval}>}
 */
export async function requestDeviceCode(clientId, scope = 'read:user') {
  const response = await fetch(`${GITHUB_LOGIN}/device/code`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_id: clientId, scope }),
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  return data;
}

/**
 * Step 2: Poll for access token until user authorizes
 * @param {string} clientId - GitHub OAuth App client ID
 * @param {string} deviceCode - device_code from step 1
 * @param {number} interval - polling interval in seconds
 * @param {AbortSignal} signal - abort signal to cancel polling
 * @returns {Promise<string>} GitHub access token
 */
export async function pollForToken(clientId, deviceCode, interval = 5, signal = null) {
  return new Promise((resolve, reject) => {
    let pollInterval = interval;

    const poll = async () => {
      if (signal?.aborted) {
        reject(new Error('Polling cancelled'));
        return;
      }

      try {
        const response = await fetch(`${GITHUB_LOGIN}/oauth/access_token`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          // Proxy or upstream returned a non-JSON response (e.g. an HTML error page).
          // Treat 5xx as transient and retry; anything else is a permanent failure.
          if (response.status >= 500) {
            setTimeout(poll, pollInterval * 1000);
            return;
          }
          throw new Error(`Unexpected response from authorization server (HTTP ${response.status}). Please try again.`);
        }

        const data = await response.json();

        if (data.access_token) {
          resolve(data.access_token);
          return;
        }

        switch (data.error) {
          case 'authorization_pending':
            // User hasn't authorized yet, keep polling
            setTimeout(poll, pollInterval * 1000);
            break;
          case 'slow_down':
            // Increase polling interval as instructed by server
            pollInterval += 5;
            setTimeout(poll, pollInterval * 1000);
            break;
          case 'expired_token':
            reject(new Error('Device code expired. Please try again.'));
            break;
          case 'access_denied':
            reject(new Error('Access denied by user.'));
            break;
          default:
            reject(new Error(data.error_description || data.error || 'Unknown error'));
        }
      } catch (err) {
        reject(err);
      }
    };

    setTimeout(poll, pollInterval * 1000);
  });
}

/**
 * Get the authenticated GitHub user info
 * @param {string} token - GitHub access token
 * @returns {Promise<{login, name, avatar_url}>}
 */
export async function getGitHubUser(token) {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Failed to get user info: ${response.statusText}`);
  return response.json();
}

/**
 * Exchange GitHub OAuth token for GitHub Copilot API token
 * @param {string} githubToken - GitHub OAuth or PAT token
 * @returns {Promise<{token: string, expires_at: string}>}
 */
export async function getCopilotToken(githubToken) {
  const response = await fetch(`${GITHUB_API_PROXY}/copilot_internal/v2/token`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      'Editor-Version': 'CopilotApp/1.0',
      'Editor-Plugin-Version': 'CopilotApp/1.0',
    },
  });

  if (!response.ok) {
    const msg = response.status === 401
      ? 'Invalid token or Copilot access not found'
      : response.status === 403 || response.status === 404
        ? 'No GitHub Copilot subscription found for this account'
        : `Failed to get Copilot token: ${response.statusText}`;
    throw new Error(msg);
  }

  const data = await response.json();
  return { token: data.token, expires_at: data.expires_at };
}

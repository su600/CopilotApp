/**
 * GitHub Gist API helpers for cross-device conversation sync.
 * Conversations are stored as a single secret Gist owned by the authenticated user.
 */

const GITHUB_API = 'https://api.github.com';
const GIST_DESCRIPTION = 'CopilotApp Conversations';
const GIST_FILENAME = 'copilot_conversations.json';
const GIST_ID_KEY = 'copilot_gist_id';

export function getCachedGistId() {
  return localStorage.getItem(GIST_ID_KEY) || null;
}

export function setCachedGistId(id) {
  if (id) localStorage.setItem(GIST_ID_KEY, id);
  else localStorage.removeItem(GIST_ID_KEY);
}

async function githubFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!response.ok) {
    const msg = data?.message || response.statusText;
    throw new Error(`GitHub API error: ${msg} (${response.status})`);
  }
  return data;
}

async function findExistingGist(token) {
  // Paginate through all gists to find the CopilotApp one
  let page = 1;
  while (true) {
    const gists = await githubFetch(`${GITHUB_API}/gists?per_page=100&page=${page}`, token);
    if (!Array.isArray(gists) || gists.length === 0) return null;
    const found = gists.find((g) => g.description === GIST_DESCRIPTION);
    if (found) return found;
    if (gists.length < 100) return null; // last page
    page++;
  }
}

async function createGist(token) {
  return githubFetch(`${GITHUB_API}/gists`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: '{}' } },
    }),
  });
}

/**
 * Find or create the CopilotApp Conversations gist.
 * Caches the gist ID in localStorage so subsequent calls are instant.
 * @param {string} token - GitHub access token with `gist` scope
 * @returns {Promise<string>} gist ID
 */
export async function findOrCreateGist(token) {
  const cached = getCachedGistId();
  if (cached) return cached;
  const existing = await findExistingGist(token);
  if (existing) {
    setCachedGistId(existing.id);
    return existing.id;
  }
  const created = await createGist(token);
  setCachedGistId(created.id);
  return created.id;
}

/**
 * Load conversations from the gist.
 * @param {string} token - GitHub access token
 * @param {string} gistId - gist ID returned by findOrCreateGist
 * @returns {Promise<object>} conversations object
 */
export async function loadConversationsFromGist(token, gistId) {
  const data = await githubFetch(`${GITHUB_API}/gists/${gistId}`, token);
  const content = data?.files?.[GIST_FILENAME]?.content;
  if (!content) return {};
  try { return JSON.parse(content); } catch { return {}; }
}

/**
 * Save conversations to the gist.
 * @param {string} token - GitHub access token
 * @param {string} gistId - gist ID
 * @param {object} conversations - conversations to save
 */
export async function saveConversationsToGist(token, gistId, conversations) {
  await githubFetch(`${GITHUB_API}/gists/${gistId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(conversations) } },
    }),
  });
}

/**
 * Clear conversations stored in the gist (reset to empty).
 * @param {string} token - GitHub access token
 * @param {string} gistId - gist ID
 */
export async function clearConversationsGist(token, gistId) {
  await githubFetch(`${GITHUB_API}/gists/${gistId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: '{}' } },
    }),
  });
}

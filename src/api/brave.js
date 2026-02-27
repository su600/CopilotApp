/**
 * Brave Search API wrapper
 * Uses the /brave-search nginx proxy to avoid CORS errors.
 * @see https://brave.com/search/api/
 */

const BRAVE_SEARCH_ENDPOINT = '/brave-search';

/**
 * Search the web using Brave Search API
 * @param {string} apiKey - Brave Search API subscription token
 * @param {string} query - Search query
 * @param {number} count - Number of results to return (default 5, max 20)
 * @returns {Promise<string>} Formatted search results as markdown text
 */
export async function braveSearch(apiKey, query, count = 5) {
  if (!apiKey?.trim()) {
    throw new Error('Brave Search API key is required');
  }
  const validCount = Math.max(1, Math.min(count, 20));
  const url = `${BRAVE_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&count=${validCount}`;
  const response = await fetch(url, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Brave Search error: ${response.status} ${response.statusText}${text ? ` – ${text}` : ''}`);
  }

  const data = await response.json();
  const results = data.web?.results || [];
  if (!results.length) return 'No results found.';
  return results
    .map((r, i) => `${i + 1}. **${r.title}**\n${r.url}\n${r.description || ''}`)
    .join('\n\n');
}

/**
 * GitHub Copilot API wrapper
 * OpenAI-compatible API endpoints served by GitHub Copilot
 * @see https://api.githubcopilot.com
 */

const COPILOT_API = '/copilot-api';

// Fallback tier/provider info — only used when the API doesn't return these fields
const MODEL_META = {
  'gpt-4o':                    { tier: 'premium' },
  'gpt-4o-mini':               { tier: 'standard' },
  'o1':                        { tier: 'premium' },
  'o1-mini':                   { tier: 'premium' },
  'o3-mini':                   { tier: 'premium' },
  'o4-mini':                   { tier: 'premium' },
  'claude-3.5-sonnet':         { tier: 'premium' },
  'claude-3.5-haiku':          { tier: 'premium' },
  'claude-3.7-sonnet':         { tier: 'premium' },
  'claude-3.7-sonnet-thought': { tier: 'premium' },
  'gemini-2.0-flash':          { tier: 'premium' },
  'gemini-2.5-pro':            { tier: 'premium' },
};

// Module-level in-memory cache for fetchModels results
let _modelCache = null;
let _modelCacheTime = 0;
let _modelCacheToken = null;   // token the cache was built for
let _modelCachePromise = null; // in-flight request promise (deduplication)
const MODEL_CACHE_TTL = 3600000; // 1 hour in ms

const PROVIDER_COLORS = {
  OpenAI: '#74aa9c',
  Anthropic: '#d97706',
  Google: '#4285f4',
  Microsoft: '#00a1f1',
  Meta: '#1877f2',
};

/**
 * Build request headers for Copilot API calls
 */
function buildHeaders(copilotToken) {
  return {
    Authorization: `Bearer ${copilotToken}`,
    'Content-Type': 'application/json',
    'Copilot-Integration-Id': 'vscode-chat',
    'Editor-Version': 'CopilotApp/1.0',
    'Editor-Plugin-Version': 'CopilotApp/1.0',
    'OpenAI-Intent': 'conversation-general',
  };
}

/**
 * Fetch available Copilot models
 * @param {string} copilotToken
 * @param {object} [options]
 * @param {boolean} [options.forceRefresh] - bypass cache and force a fresh API request
 * @returns {Promise<Array>} list of model objects enriched with metadata
 */
export async function fetchModels(copilotToken, options = {}) {
  // Invalidate cache when the token changes (e.g. account switch)
  if (copilotToken !== _modelCacheToken) {
    _modelCache = null;
    _modelCacheTime = 0;
    _modelCachePromise = null;
    _modelCacheToken = copilotToken;
  }

  const now = Date.now();
  if (!options.forceRefresh && _modelCache && now - _modelCacheTime < MODEL_CACHE_TTL) {
    return _modelCache;
  }

  // Deduplicate concurrent requests: share the in-flight promise
  if (_modelCachePromise) {
    return _modelCachePromise;
  }

  _modelCachePromise = (async () => {
    try {
      const response = await fetch(`${COPILOT_API}/models`, {
        headers: buildHeaders(copilotToken),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.data || data.models || data || [];

      const result = models.map((model) => {
        const id = model.id || model.name || '';
        const meta = MODEL_META[id] || {};
        const provider = guessProvider(id);

        const isPremiumFromApi = model.policy?.is_premium ?? model.is_premium;
        const tier = isPremiumFromApi != null
          ? (isPremiumFromApi ? 'premium' : 'standard')
          : (meta.tier || 'standard');

        const requestsPerMonth =
          model.policy?.terms?.monthly_quota ??
          model.policy?.quota?.monthly ??
          model.quota?.monthly ??
          null;

        return {
          ...model,
          id,
          tier,
          requestsPerMonth,
          contextWindow: model.context_window || null,
          provider,
          providerColor: PROVIDER_COLORS[provider] || '#6b7280',
        };
      });

      _modelCache = result;
      _modelCacheTime = Date.now();
      return result;
    } finally {
      _modelCachePromise = null;
    }
  })();

  return _modelCachePromise;
}

/**
 * Invalidate the in-memory models cache, forcing the next fetchModels call to hit the API.
 */
export function invalidateModelsCache() {
  _modelCache = null;
  _modelCacheTime = 0;
  _modelCacheToken = null;
  _modelCachePromise = null;
}

/**
 * Guess provider from model ID string
 */
function guessProvider(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) return 'OpenAI';
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('gemini')) return 'Google';
  if (id.includes('llama') || id.includes('meta')) return 'Meta';
  if (id.includes('phi') || id.includes('mistral')) return 'Microsoft';
  return 'Unknown';
}

/**
 * Send a chat completion request (non-streaming)
 * @param {string} copilotToken
 * @param {string} modelId
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options - temperature, max_tokens, etc.
 * @returns {Promise<{content: string, usage: object, model: string, finish_reason: string}>}
 */
export async function sendChatMessage(copilotToken, modelId, messages, options = {}) {
  const body = {
    model: modelId,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: false,
    ...options,
  };

  const response = await fetch(`${COPILOT_API}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(copilotToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || '',
    usage: data.usage || {},
    model: data.model || modelId,
    finish_reason: choice?.finish_reason || '',
  };
}

/**
 * Send a streaming chat completion request
 * @param {string} copilotToken
 * @param {string} modelId
 * @param {Array} messages
 * @param {function} onChunk - callback(text: string)
 * @param {AbortSignal} signal
 * @param {object} options
 */
export async function sendChatMessageStream(copilotToken, modelId, messages, onChunk, signal, options = {}) {
  const body = {
    model: modelId,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  };

  const response = await fetch(`${COPILOT_API}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(copilotToken),
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let usage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') break;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
        if (parsed.usage) usage = parsed.usage;
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return { usage };
}

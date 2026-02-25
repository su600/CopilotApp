/**
 * GitHub Copilot API wrapper
 * OpenAI-compatible API endpoints served by GitHub Copilot
 * @see https://api.githubcopilot.com
 */

const COPILOT_API = '/copilot-api';

// Static fallback tier and multiplier info.
// These entries are ONLY used when the live API response does not include
// billing.is_premium / billing.multiplier / policy.is_premium / policy.is_free_for_copilot_pro for a model.
// For all current Copilot models the API already returns proper billing data, so these
// serve purely as a safety net for unknown / future models.
// Click "🔄 同步模型" in the UI to always get the latest live data.
const MODEL_META = {
  // ── OpenAI ────────────────────────────────────────────────────────────
  'gpt-4o':                        { tier: 'standard', multiplier: 0 },
  'gpt-4.1':                       { tier: 'standard', multiplier: 0 },
  'gpt-5-mini':                    { tier: 'standard', multiplier: 0 },
  'gpt-5.1':                       { tier: 'premium',  multiplier: 1 },
  'gpt-5.1-codex':                 { tier: 'premium',  multiplier: 1 },
  'gpt-5.1-codex-max':             { tier: 'premium',  multiplier: 1 },
  'gpt-5.1-codex-mini':            { tier: 'premium',  multiplier: 0.33 },
  'gpt-5.2':                       { tier: 'premium',  multiplier: 1 },
  'gpt-5.2-codex':                 { tier: 'premium',  multiplier: 1 },
  'gpt-5.3-codex':                 { tier: 'premium',  multiplier: 1 },
  // ── Anthropic Claude ──────────────────────────────────────────────────
  'claude-haiku-4.5':              { tier: 'premium',  multiplier: 0.33 },
  'claude-opus-4.5':               { tier: 'premium',  multiplier: 3 },
  'claude-opus-4.6':               { tier: 'premium',  multiplier: 3 },
  'claude-sonnet-4':               { tier: 'premium',  multiplier: 1 },
  'claude-sonnet-4.5':             { tier: 'premium',  multiplier: 1 },
  'claude-sonnet-4.6':             { tier: 'premium',  multiplier: 1 },
  // ── Google Gemini ─────────────────────────────────────────────────────
  'gemini-2.5-pro':                { tier: 'premium',  multiplier: 1 },
  'gemini-3-flash':                { tier: 'premium',  multiplier: 0.33 },
  'gemini-3-pro':                  { tier: 'premium',  multiplier: 1 },
  'gemini-3.1-pro':                { tier: 'premium',  multiplier: 1 },
  // ── xAI Grok ──────────────────────────────────────────────────────────
  'grok-code-fast-1':              { tier: 'premium',  multiplier: 0.25 },
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
  xAI: '#1da1f2',
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
      console.log('[CopilotApp] Raw models API response:', data);
      const models = data.data || data.models || data || [];

      const result = models.map((model) => {
        // Skip models that are not explicitly available in the model picker
        if (model.model_picker_enabled !== true) return null;

        // Field mapping from API response to display model:
        // - API: model.id → Display: id
        // - API: model.name → Display: name
        // - API: model.vendor → Display: provider
        // - API: model.capabilities.limits.max_context_window_tokens → Display: contextWindow
        const id = model.id || model.name || '';
        const meta = MODEL_META[id] || {};

        const provider = model.vendor || guessProvider(id);

        // Multiplier: use MODEL_META as primary source since the API does not include billing multiplier data.
        // Fall back to the API billing field only as a safety net.
        const multiplier = meta.multiplier ?? model.billing?.multiplier ?? null;

        // Tier: if multiplier is 0 the model is free/unlimited → standard.
        // Otherwise prefer billing.is_premium / policy flags, then MODEL_META fallback.
        let tier;
        if (multiplier === 0) {
          tier = 'standard';
        } else {
          const billingPremium = model.billing?.is_premium;
          const policyPremium  = model.policy?.is_premium ?? model.is_premium;
          const isFreeForPro   = model.policy?.is_free_for_copilot_pro;
          tier =
            billingPremium != null ? (billingPremium ? 'premium' : 'standard') :
            policyPremium  != null ? (policyPremium  ? 'premium' : 'standard') :
            isFreeForPro   != null ? (isFreeForPro   ? 'standard' : 'premium') :
            (meta.tier || 'standard');
        }

        const requestsPerMonth =
          model.policy?.terms?.monthly_quota ??
          model.policy?.quota?.monthly ??
          model.quota?.monthly ??
          null;

        return {
          ...model,
          _raw: model,
          id,
          name: model.name || id,
          tier,
          multiplier,
          requestsPerMonth,
          contextWindow:
            model.capabilities?.limits?.max_context_window_tokens ||
            model.context_window ||
            null,
          provider,
          providerColor: PROVIDER_COLORS[provider] || '#6b7280',
        };
      });

      // Exclude null entries and models with no context window
      const available = result.filter((m) => m != null && m.contextWindow != null && m.contextWindow > 0);

      _modelCache = available;
      _modelCacheTime = Date.now();
      return available;
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
 * Extract the premium request quota object from various possible sources.
 * Handles multiple API response structures for resilience across API changes.
 *
 * Priority order:
 * 1. copilotTokenData.limited_user_quotas (original API v2 structure)
 * 2. copilotTokenData.quotas.limited_user_quotas (nested structure)
 * 3. subscription.premium_chat_completions (subscription endpoint)
 * 4. copilotTokenData directly if it has quota fields
 *
 * @param {object|null|undefined} limitedQuotas - the limited_user_quotas field from token
 * @param {object|null|undefined} copilotTokenData - full copilot token response
 * @param {object|null|undefined} subscription - subscription details
 * @returns {object|null} quota record with { quota, used, overage, overage_usd } or null
 */
export function extractPremiumQuota(limitedQuotas, copilotTokenData = null, subscription = null) {
  // First try the direct limitedQuotas parameter (original behavior)
  if (limitedQuotas) {
    const quota = (
      limitedQuotas.chat_premium_requests ??
      limitedQuotas.premium_requests ??
      limitedQuotas.chat_premium ??
      limitedQuotas.premium ??
      Object.values(limitedQuotas).find(
        (v) => v && typeof v === 'object' && 'quota' in v,
      ) ??
      null
    );

    if (quota) {
      console.log('extractPremiumQuota - found in limitedQuotas:', quota);
      return quota;
    }
  }

  // Try nested structure in copilotTokenData
  if (copilotTokenData?.quotas?.limited_user_quotas) {
    const nested = extractPremiumQuota(
      copilotTokenData.quotas.limited_user_quotas,
      null,
      null,
    );
    if (nested) {
      console.log('extractPremiumQuota - found in nested quotas:', nested);
      return nested;
    }
  }

  // Try subscription data
  if (subscription?.premium_chat_completions) {
    const subQuota = subscription.premium_chat_completions;
    if (typeof subQuota === 'object' && 'quota' in subQuota) {
      console.log('extractPremiumQuota - found in subscription:', subQuota);
      return subQuota;
    }
  }

  // Try direct fields in copilotTokenData (fallback for unknown structure)
  if (copilotTokenData && 'quota' in copilotTokenData && 'used' in copilotTokenData) {
    console.log('extractPremiumQuota - found directly in token data:', {
      quota: copilotTokenData.quota,
      used: copilotTokenData.used,
      overage: copilotTokenData.overage,
      overage_usd: copilotTokenData.overage_usd,
    });
    return {
      quota: copilotTokenData.quota,
      used: copilotTokenData.used,
      overage: copilotTokenData.overage ?? 0,
      overage_usd: copilotTokenData.overage_usd ?? 0,
    };
  }

  console.log('extractPremiumQuota - no quota found in any location');
  console.log('extractPremiumQuota - limitedQuotas:', limitedQuotas);
  console.log('extractPremiumQuota - copilotTokenData:', copilotTokenData);
  console.log('extractPremiumQuota - subscription:', subscription);

  return null;
}

/**
 * Return true when the Copilot token response indicates the user has at least
 * one unlimited-quota feature (i.e. unlimited_user_quotas is non-null/empty).
 * @param {Array|object|*} unlimitedQuotas - the unlimited_user_quotas field
 * @returns {boolean}
 */
export function hasUnlimitedQuotas(unlimitedQuotas) {
  if (!unlimitedQuotas) return false;
  if (Array.isArray(unlimitedQuotas)) return unlimitedQuotas.length > 0;
  if (typeof unlimitedQuotas === 'object') return Object.keys(unlimitedQuotas).length > 0;
  return Boolean(unlimitedQuotas);
}

/**
 * Guess provider from model ID string (fallback when vendor field is absent)
 */
function guessProvider(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || id.startsWith('o5')) return 'OpenAI';
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('gemini')) return 'Google';
  if (id.includes('grok')) return 'xAI';
  if (id.includes('llama') || id.includes('meta')) return 'Unknown';
  if (id.includes('phi') || id.includes('mistral')) return 'Unknown';
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

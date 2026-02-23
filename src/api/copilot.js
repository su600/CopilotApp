/**
 * GitHub Copilot API wrapper
 * OpenAI-compatible API endpoints served by GitHub Copilot
 * @see https://api.githubcopilot.com
 */

const COPILOT_API = 'https://api.githubcopilot.com';

// Known rate/tier information for GitHub Copilot models
// Premium requests consume quota; standard models are unlimited for Pro subscribers
const MODEL_META = {
  'gpt-4o': { tier: 'premium', requestsPerMonth: 300, contextWindow: 128000, provider: 'OpenAI' },
  'gpt-4o-mini': { tier: 'standard', requestsPerMonth: null, contextWindow: 128000, provider: 'OpenAI' },
  'o1': { tier: 'premium', requestsPerMonth: 10, contextWindow: 200000, provider: 'OpenAI' },
  'o1-mini': { tier: 'premium', requestsPerMonth: 50, contextWindow: 128000, provider: 'OpenAI' },
  'o3-mini': { tier: 'premium', requestsPerMonth: 50, contextWindow: 200000, provider: 'OpenAI' },
  'o4-mini': { tier: 'premium', requestsPerMonth: 50, contextWindow: 200000, provider: 'OpenAI' },
  'claude-3.5-sonnet': { tier: 'premium', requestsPerMonth: 50, contextWindow: 200000, provider: 'Anthropic' },
  'claude-3.5-haiku': { tier: 'premium', requestsPerMonth: 100, contextWindow: 200000, provider: 'Anthropic' },
  'claude-3.7-sonnet': { tier: 'premium', requestsPerMonth: 50, contextWindow: 200000, provider: 'Anthropic' },
  'claude-3.7-sonnet-thought': { tier: 'premium', requestsPerMonth: 50, contextWindow: 200000, provider: 'Anthropic' },
  'gemini-2.0-flash': { tier: 'premium', requestsPerMonth: 50, contextWindow: 1000000, provider: 'Google' },
  'gemini-2.5-pro': { tier: 'premium', requestsPerMonth: 50, contextWindow: 1000000, provider: 'Google' },
};

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
 * @returns {Promise<Array>} list of model objects enriched with metadata
 */
export async function fetchModels(copilotToken) {
  const response = await fetch(`${COPILOT_API}/models`, {
    headers: buildHeaders(copilotToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const models = data.data || data.models || data || [];

  return models.map((model) => {
    const id = model.id || model.name || '';
    const meta = MODEL_META[id] || {};
    const provider = meta.provider || guessProvider(id);
    return {
      ...model,
      id,
      tier: meta.tier || 'standard',
      requestsPerMonth: meta.requestsPerMonth || null,
      contextWindow: meta.contextWindow || model.context_window || null,
      provider,
      providerColor: PROVIDER_COLORS[provider] || '#6b7280',
    };
  });
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

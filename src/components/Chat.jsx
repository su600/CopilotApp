/**
 * Chat: Multi-model chat interface with streaming support
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendChatMessageStream } from '../api/copilot.js';
import { braveSearch } from '../api/brave.js';
import { getModelDisplayName, groupedModels } from '../utils/models.js';

const BRAVE_KEY = 'brave_search_api_key';

const BRAVE_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'brave_search',
    description: 'Search the web using Brave Search to find current information, news, or facts.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on the web.',
        },
      },
      required: ['query'],
    },
  },
};

const SYSTEM_PRESETS = [
  { label: 'General Assistant', value: 'You are a helpful assistant.' },
  { label: 'Code Expert', value: 'You are an expert software engineer. Provide concise, correct code examples.' },
  { label: 'Explain Simply', value: 'Explain concepts simply, as if to a beginner. Use analogies and examples.' },
  { label: 'Custom…', value: '' },
];

export default function Chat({ copilotToken, models, selectedModel, onSelectModel }) {
  const [conversations, setConversations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('copilot_conversations') || '{}');
    } catch { return {}; }
  });
  const [activeConvId, setActiveConvId] = useState(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sendError, setSendError] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [systemPreset, setSystemPreset] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [compareMode, setCompareMode] = useState(false);
  const [compareModel, setCompareModel] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Track all active AbortControllers so concurrent compare-mode requests can all be cancelled
  const abortControllersRef = useRef(new Set());
  const bottomRef = useRef(null);

  // Current conversation messages
  const convKey = activeConvId || '_default';
  const messages = useMemo(() => conversations[convKey]?.messages || [], [conversations, convKey]);

  // Persist conversations to localStorage
  useEffect(() => {
    try {
      // Keep only the 20 most recent conversations (by createdAt) to avoid storage bloat
      const entries = Object.entries(conversations);
      const pruned = entries.length > 20
        ? Object.fromEntries(
            entries
              .slice()
              .sort(([, a], [, b]) => {
                const aTime = typeof a?.createdAt === 'number' ? a.createdAt : 0;
                const bTime = typeof b?.createdAt === 'number' ? b.createdAt : 0;
                return bTime - aTime;
              })
              .slice(0, 20),
          )
        : conversations;
      localStorage.setItem('copilot_conversations', JSON.stringify(pruned));
    } catch { /* ignore quota errors */ }
  }, [conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newConversation = useCallback(() => {
    const id = `conv_${Date.now()}`;
    setConversations((prev) => ({
      ...prev,
      [id]: { id, title: 'New chat', messages: [], model: selectedModel?.id, createdAt: Date.now() },
    }));
    setActiveConvId(id);
  }, [selectedModel]);

  const deleteConversation = useCallback((id) => {
    setConversations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeConvId === id) setActiveConvId(null);
  }, [activeConvId]);


  const sendMessage = async (modelId, appendToKey) => {
    const model = modelId || selectedModel?.id;
    if (!model) return;

    const braveApiKey = localStorage.getItem(BRAVE_KEY) || '';
    const tools = braveApiKey ? [BRAVE_SEARCH_TOOL] : [];

    const userMsg = { role: 'user', content: input.trim() };
    const sysMsg = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    const history = appendToKey
      ? (conversations[appendToKey]?.messages || [])
      : messages;
    const allMessages = [...sysMsg, ...history.filter((m) => m.role !== 'system'), userMsg];

    const assistantMsg = { role: 'assistant', content: '', model, pending: true };

    const targetKey = appendToKey || convKey;
    const currentMsgs = appendToKey
      ? (conversations[appendToKey]?.messages || [])
      : messages;

    const updatedWithUser = [...currentMsgs, userMsg, assistantMsg];
    setConversations((prev) => ({
      ...prev,
      [targetKey]: {
        ...(prev[targetKey] || { id: targetKey, createdAt: Date.now() }),
        messages: updatedWithUser,
        title: userMsg.content.slice(0, 40),
        model,
      },
    }));

    const controller = new AbortController();
    abortControllersRef.current.add(controller);

    try {
      let apiMessages = [...allMessages];
      let displayPrefix = '';

      // Agentic tool-call loop (max 5 iterations to prevent infinite loops)
      for (let iter = 0; iter < 5; iter++) {
        let accumulatedContent = '';
        // eslint-disable-next-line no-await-in-loop
        const { toolCalls } = await sendChatMessageStream(
          copilotToken,
          model,
          apiMessages,
          (chunk) => {
            accumulatedContent += chunk;
            setConversations((prev) => {
              const existing = prev[targetKey]?.messages || [];
              const updated = existing.map((m, i) =>
                i === existing.length - 1 && m.pending
                  ? { ...m, content: displayPrefix + accumulatedContent }
                  : m,
              );
              return { ...prev, [targetKey]: { ...prev[targetKey], messages: updated } };
            });
          },
          controller.signal,
          { temperature, maxTokens, ...(tools.length ? { tools } : {}) },
        );

        if (!toolCalls?.length) break;

        // Append assistant message with tool_calls to the API message list
        apiMessages = [
          ...apiMessages,
          {
            role: 'assistant',
            content: accumulatedContent || null,
            tool_calls: toolCalls,
          },
        ];

        // Execute each tool call and append results
        for (const tc of toolCalls) {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch {
            args = {};
            if (import.meta.env && import.meta.env.DEV) {
              console.warn('[CopilotApp] Failed to parse tool call arguments:', tc.function.arguments);
            }
          }
          const query = args.query || '';

          displayPrefix += `🔍 Searching: "${query}"\n`;
          setConversations((prev) => {
            const existing = prev[targetKey]?.messages || [];
            const updated = existing.map((m, i) =>
              i === existing.length - 1 && m.pending
                ? { ...m, content: displayPrefix }
                : m,
            );
            return { ...prev, [targetKey]: { ...prev[targetKey], messages: updated } };
          });

          let result;
          try {
            // eslint-disable-next-line no-await-in-loop
            result = await braveSearch(braveApiKey, query);
          } catch (err) {
            result = `Search failed: ${err.message}`;
          }

          apiMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          });
        }

        displayPrefix += '\n';
      }

      // Mark as complete
      setConversations((prev) => {
        const existing = prev[targetKey]?.messages || [];
        const updated = existing.map((m, i) =>
          i === existing.length - 1 && m.pending ? { ...m, pending: false } : m,
        );
        return { ...prev, [targetKey]: { ...prev[targetKey], messages: updated } };
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        // Ensure streaming state is reset on aborts, even when sendMessage is called directly
        setStreaming(false);
        return;
      }
      setConversations((prev) => {
        const existing = prev[targetKey]?.messages || [];
        const updated = existing.map((m, i) =>
          i === existing.length - 1 && m.pending
            ? { ...m, content: `[Error: ${err.message}]`, pending: false, error: true }
            : m,
        );
        return { ...prev, [targetKey]: { ...prev[targetKey], messages: updated } };
      });
    } finally {
      abortControllersRef.current.delete(controller);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    if (!selectedModel?.id) {
      setSendError('Please select a model from the Models tab first.');
      return;
    }
    setSendError('');

    setStreaming(true);
    try {
      if (compareMode && compareModel) {
        // Compare mode: send identical prompt to two different models in parallel.
        // primaryConvKey = the currently active conversation (gets selectedModel's response)
        // compareConvId  = a newly created conversation (gets compareModel's response)
        const compareConvId = `compare_${Date.now()}`;
        setConversations((prev) => ({
          ...prev,
          [compareConvId]: { id: compareConvId, messages: [], title: 'Compare', createdAt: Date.now() },
        }));
        await Promise.all([
          sendMessage(selectedModel.id, convKey),      // primary model → active conversation
          sendMessage(compareModel.id, compareConvId), // compare model → new side conversation
        ]);
      } else {
        await sendMessage(selectedModel?.id, null);
      }
    } finally {
      setInput('');
      setStreaming(false);
    }
  };

  const stopStreaming = () => {
    abortControllersRef.current.forEach((c) => c.abort());
    abortControllersRef.current.clear();
    setStreaming(false);
  };

  const handlePreset = (idx) => {
    setSystemPreset(idx);
    if (SYSTEM_PRESETS[idx].value) setSystemPrompt(SYSTEM_PRESETS[idx].value);
  };

  const sortedConvs = Object.values(conversations).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className={`chat-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Mobile sidebar overlay backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: conversation list */}
      <aside className="chat-sidebar">
        <button className="btn btn-primary btn-sm new-chat-btn" onClick={newConversation}>
          + New Chat
        </button>
        <div className="conv-list">
          {sortedConvs.length === 0 && (
            <p className="conv-empty">No conversations yet.<br />Start a new chat!</p>
          )}
          {sortedConvs.map((conv) => (
            <div
              key={conv.id}
              className={`conv-item ${(conv.id === activeConvId || (conv.id === '_default' && !activeConvId)) ? 'active' : ''}`}
              onClick={() => setActiveConvId(conv.id === '_default' ? null : conv.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setActiveConvId(conv.id)}
            >
              <div className="conv-title">{conv.title || 'New chat'}</div>
              {conv.model && <div className="conv-model">{conv.model}</div>}
              <button
                className="conv-delete"
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                title="Delete conversation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="chat-main">
        {/* Chat header */}
        <div className="chat-header">
          <button
            className="btn btn-ghost btn-sm sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle conversation list"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
          <div className="chat-model-select">
            <label>Model:</label>
            <select
              className="input input-sm model-dropdown"
              value={selectedModel?.id || ''}
              onChange={(e) => {
                const m = models.find((x) => x.id === e.target.value);
                if (m) onSelectModel(m);
              }}
            >
              <option value="">-- Select model --</option>
              {groupedModels(models).map(({ provider, models: pModels }) => (
                <optgroup key={provider} label={provider}>
                  {pModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {getModelDisplayName(m)} ({m.tier === 'premium' ? '⭐ Premium' : '✓ Standard'})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            className={`btn btn-sm ${showSettings ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowSettings((v) => !v)}
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="chat-settings-panel">
            <div className="settings-row">
              <label>System Prompt</label>
              <div className="preset-tabs">
                {SYSTEM_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    className={`filter-tab ${systemPreset === i ? 'active' : ''}`}
                    onClick={() => handlePreset(i)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                className="input textarea"
                rows={2}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Optional system prompt…"
              />
            </div>
            <div className="settings-row settings-inline">
              <label>Temperature: <strong>{temperature}</strong></label>
              <input
                type="range" min="0" max="2" step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="range-input"
              />
              <label>Max Tokens: <strong>{maxTokens}</strong></label>
              <input
                type="range" min="256" max="32768" step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                className="range-input"
              />
            </div>
            <div className="settings-row settings-inline">
              <label>
                <input
                  type="checkbox"
                  checked={compareMode}
                  onChange={(e) => setCompareMode(e.target.checked)}
                />
                &nbsp;Compare mode
              </label>
              {compareMode && (
                <select
                  className="input input-sm"
                  value={compareModel?.id || ''}
                  onChange={(e) => setCompareModel(models.find((x) => x.id === e.target.value) || null)}
                >
                  <option value="">-- Compare with --</option>
                  {groupedModels(models.filter((m) => m.id !== selectedModel?.id)).map(({ provider, models: pModels }) => (
                    <optgroup key={provider} label={provider}>
                      {pModels.map((m) => (
                        <option key={m.id} value={m.id}>{getModelDisplayName(m)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="messages-area">
          {messages.length === 0 && (
            <div className="messages-empty">
              <p>Start a conversation{selectedModel ? ` with ${selectedModel.id}` : ''}.</p>
              <div className="starter-prompts">
                {['Hello! What can you do?', 'Write a hello world in Rust', 'Explain async/await in JavaScript'].map((p) => (
                  <button key={p} className="starter-btn" onClick={() => { setInput(p); }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <Message key={i} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="chat-input-area">
          {sendError && (
            <div className="send-error" role="alert">
              <span>⚠️ {sendError}</span>
              <button className="alert-close" onClick={() => setSendError('')}>×</button>
            </div>
          )}
          <textarea
            className="input chat-textarea"
            placeholder={selectedModel ? `Message ${selectedModel.id}…` : 'Select a model to start chatting…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={3}
            disabled={streaming}
          />
          <div className="input-actions">
            <span className="input-hint">Enter to send, Shift+Enter for newline</span>
            {streaming ? (
              <button className="btn btn-danger btn-sm" onClick={stopStreaming}>⏹ Stop</button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSend}
                disabled={!input.trim() || !selectedModel}
              >
                Send ↑
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';
  if (isSystem) return null;

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'} ${msg.error ? 'message-error' : ''}`}>
      <div className="message-meta">
        <span className="message-role">{isUser ? 'You' : (msg.model || 'Assistant')}</span>
        {msg.pending && <span className="message-pending">▋</span>}
      </div>
      <div className="message-content">
        <MessageContent content={msg.content} pending={msg.pending} />
      </div>
    </div>
  );
}

const markdownComponents = {
  // Handle ALL block code via the pre override (extracts content from hast AST directly,
  // so the code override below is only ever reached for inline code)
  pre({ node }) {
    const codeEl = node?.children?.find((c) => c.tagName === 'code');
    const classNames = Array.isArray(codeEl?.properties?.className)
      ? codeEl.properties.className.join(' ')
      : (codeEl?.properties?.className ?? '');
    const lang = /language-([\w-]+)/.exec(classNames)?.[1];
    const text = (codeEl?.children ?? []).map((c) => c.value ?? '').join('');
    return (
      <pre className="code-block">
        {lang && <span className="code-lang">{lang}</span>}
        <code>{text}</code>
      </pre>
    );
  },
  // Only reached for inline code (block code fully handled in `pre`)
  code({ children }) {
    return <code className="inline-code">{children}</code>;
  },
  // Render markdown images as links to avoid outbound requests to third-party URLs
  img({ src, alt }) {
    return <a href={src} className="md-img-link" target="_blank" rel="noopener noreferrer">{alt || src}</a>;
  },
};

function MessageContent({ content, pending }) {
  if (!content) return <span className="cursor-blink">▋</span>;
  // During streaming, render as plain text to avoid re-parsing markdown on every delta
  if (pending) return <span className="md-streaming">{content}</span>;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
      className="md-content"
    >
      {content}
    </ReactMarkdown>
  );
}

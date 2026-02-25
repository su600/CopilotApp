/**
 * ModelList: Shows all available GitHub Copilot models with metadata and rates
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchModels } from '../api/copilot.js';

const TIER_BADGE = {
  premium: { label: 'Premium', className: 'badge-premium' },
  'premium-expensive': { label: 'Premium', className: 'badge-premium-expensive' },
  standard: { label: 'Standard', className: 'badge-standard' },
};

const MAIN_PROVIDERS = new Set(['Anthropic', 'OpenAI', 'Google']);
const PROVIDER_ORDER = ['Anthropic', 'OpenAI', 'Google', '其它'];

export default function ModelList({ copilotToken, onSelectModel, selectedModelId }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'premium' | 'standard'
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchModels(copilotToken);
      setModels(data);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [copilotToken]);

  useEffect(() => {
    if (!copilotToken) return;
    load();
  }, [copilotToken, load]);

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const data = await fetchModels(copilotToken, { forceRefresh: true });
      setModels(data);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = models.filter((m) => {
    if (filter !== 'all' && m.tier !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!m.id.toLowerCase().includes(q) && !m.name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Group by display provider: Anthropic / OpenAI / Google → own section; everything else → 其它
  const grouped = filtered.reduce((acc, m) => {
    const p = MAIN_PROVIDERS.has(m.provider) ? m.provider : '其它';
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});

  const sortedProviders = Object.keys(grouped).sort((a, b) => {
    const ia = PROVIDER_ORDER.indexOf(a);
    const ib = PROVIDER_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  if (loading || syncing) {
    return (
      <div className="models-loading">
        <div className="spinner" />
        <p>Loading models…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="models-error">
        <p>⚠️ {error}</p>
        <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="models-container">
      <div className="models-header">
        <h2>Available Models <span className="model-count">({models.length})</span></h2>
        <div className="models-controls">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleSync}
            disabled={syncing || loading}
            aria-label={syncing ? '正在同步模型' : '同步模型'}
          >
            {syncing ? '⏳' : '🔄'} 同步
          </button>
          <input
            type="text"
            className="input input-sm"
            placeholder="Search models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filter-tabs">
            {['all', 'premium', 'standard'].map((f) => (
              <button
                key={f}
                className={`filter-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p className="no-results">No models match your filter.</p>
      ) : (
        sortedProviders.map((provider) => {
          const providerModels = grouped[provider];
          return (
            <div key={provider} className="provider-section">
              <h3
                className="provider-title"
                style={{ borderLeftColor: provider === '其它' ? '#6b7280' : providerModels[0]?.providerColor }}
              >
                {provider}
              </h3>
              <div className="model-grid">
                {providerModels.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    isSelected={model.id === selectedModelId}
                    onSelect={() => onSelectModel(model)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="models-footnote">
        <p>
          <strong>Premium</strong> models consume monthly premium request quota (multiplied by each model's rate).{' '}
          <strong>Standard</strong> (included) models like GPT-4o and Claude 3.5 Haiku are unlimited on paid plans.{' '}
          <a
            href="https://docs.github.com/en/copilot/managing-copilot/monitoring-usage-and-entitlements/about-premium-requests"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more ↗
          </a>
        </p>
        <p className="models-footnote-disclaimer">
          数据来源于 GitHub Copilot API，点击「同步模型」按钮可获取最新数据。
        </p>
        {lastSyncedAt && (
          <p className="models-footnote-sync-time">
            上次同步：{lastSyncedAt.toLocaleString('zh-CN')}
          </p>
        )}
      </div>
    </div>
  );
}

function ModelCard({ model, isSelected, onSelect }) {
  const [showInfo, setShowInfo] = useState(false);

  const badgeKey =
    model.tier === 'premium' && model.multiplier != null && model.multiplier >= 3
      ? 'premium-expensive'
      : model.tier;
  const tierInfo = TIER_BADGE[badgeKey] || TIER_BADGE.standard;
  const ctxDisplay = model.contextWindow
    ? model.contextWindow >= 1000000
      ? `${(model.contextWindow / 1000000).toFixed(1)}M`
      : `${Math.round(model.contextWindow / 1000)}k`
    : '—';

  const displayName = model.name && model.name !== model.id ? model.name : null;

  const handleInfoClick = (e) => {
    e.stopPropagation();
    setShowInfo((v) => !v);
  };

  return (
    <div
      className={`model-card ${isSelected ? 'model-card-selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      aria-pressed={isSelected}
    >
      <div className="model-card-header">
        <div className="model-id">
          {displayName ? displayName : model.id}
          {displayName && <span className="model-id-sub">{model.id}</span>}
        </div>
        <div className="model-card-header-right">
          <span className={`badge ${tierInfo.className}`}>{tierInfo.label}</span>
          <button
            className="model-info-btn"
            onClick={handleInfoClick}
            title="查看原始 API 数据"
            aria-label="查看原始 API 数据"
          >
            ℹ
          </button>
        </div>
      </div>

      {showInfo && (
        <div className="model-info-panel" onClick={(e) => e.stopPropagation()}>
          <pre className="model-info-pre">{JSON.stringify(model._raw || model, null, 2)}</pre>
          <button className="btn btn-secondary btn-sm model-info-close" onClick={handleInfoClick}>关闭</button>
        </div>
      )}

      <div className="model-meta">
        <div className="meta-item">
          <span className="meta-label">Context</span>
          <span className="meta-value">{ctxDisplay}</span>
        </div>
        {model.tier === 'premium' && model.multiplier != null && model.multiplier > 0 && (
          <div className="meta-item">
            <span className="meta-label">Rate</span>
            <span className="meta-value">{model.multiplier}× req</span>
          </div>
        )}
        {model.requestsPerMonth != null && (
          <div className="meta-item">
            <span className="meta-label">Quota</span>
            <span className="meta-value">{model.requestsPerMonth} req/mo</span>
          </div>
        )}
        {model.tier === 'standard' && (
          <div className="meta-item">
            <span className="meta-label">Quota</span>
            <span className="meta-value meta-unlimited">Unlimited ∞</span>
          </div>
        )}
      </div>

      {isSelected && (
        <div className="model-selected-indicator">✓ Selected for Chat</div>
      )}
    </div>
  );
}

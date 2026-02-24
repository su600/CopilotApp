/**
 * ModelList: Shows all available GitHub Copilot models with metadata and rates
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchModels } from '../api/copilot.js';

const TIER_BADGE = {
  premium: { label: 'Premium', className: 'badge-premium' },
  standard: { label: 'Standard', className: 'badge-standard' },
};

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
      const matchId = m.id.toLowerCase().includes(q);
      const matchName = m.displayName?.toLowerCase().includes(q);
      if (!matchId && !matchName) return false;
    }
    return true;
  });

  // Group by provider
  const grouped = filtered.reduce((acc, m) => {
    const p = m.provider || 'Other';
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});

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
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleSync}
            disabled={syncing || loading}
            aria-label={syncing ? '正在同步模型' : '同步模型'}
          >
            {syncing ? '同步中…' : '🔄 同步模型'}
          </button>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <p className="no-results">No models match your filter.</p>
      ) : (
        Object.entries(grouped).map(([provider, providerModels]) => (
          <div key={provider} className="provider-section">
            <h3
              className="provider-title"
              style={{ borderLeftColor: providerModels[0]?.providerColor }}
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
        ))
      )}

      <div className="models-footnote">
        <p>
          <strong>Premium</strong> 模型消耗每月 Premium 额度（GitHub Copilot Pro：300 次/月）。{' '}
          <strong>Standard</strong> 模型对订阅用户无限制（Unlimited）。{' '}
          <strong>倍率</strong>（Multiplier）表示每次调用消耗的 Premium 请求数，例如 10× 代表每次消耗 10 次额度。{' '}
          <a
            href="https://docs.github.com/zh/copilot/about-github-copilot/subscription-plans-for-github-copilot"
            target="_blank"
            rel="noopener noreferrer"
          >
            了解更多 ↗
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
  const tierInfo = TIER_BADGE[model.tier] || TIER_BADGE.standard;
  const ctxDisplay = model.contextWindow
    ? model.contextWindow >= 1000000
      ? `${(model.contextWindow / 1000000).toFixed(1)}M`
      : `${Math.round(model.contextWindow / 1000)}K`
    : '—';

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
        <div className="model-id-group">
          {model.displayName && <div className="model-display-name">{model.displayName}</div>}
          <div className="model-id">{model.id}</div>
        </div>
        <span className={`badge ${tierInfo.className}`}>{tierInfo.label}</span>
      </div>

      <div className="model-meta">
        <div className="meta-item">
          <span className="meta-label">Context</span>
          <span className="meta-value">{ctxDisplay} tokens</span>
        </div>
        {model.tier === 'premium' && model.multiplier != null && (
          <div className="meta-item">
            <span className="meta-label">倍率</span>
            <span className="meta-value">{model.multiplier}×</span>
          </div>
        )}
        {model.requestsPerMonth != null && (
          <div className="meta-item">
            <span className="meta-label">Quota</span>
            <span className="meta-value">{model.requestsPerMonth} req/mo</span>
          </div>
        )}
        {model.requestsPerMonth == null && model.tier === 'standard' && (
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

/**
 * ModelList: Shows all available GitHub Copilot models with metadata and rates
 */
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!copilotToken) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchModels(copilotToken);
        if (!cancelled) setModels(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [copilotToken]);

  const filtered = models.filter((m) => {
    if (filter !== 'all' && m.tier !== filter) return false;
    if (search && !m.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by provider
  const grouped = filtered.reduce((acc, m) => {
    const p = m.provider || 'Other';
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});

  if (loading) {
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
        <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>Retry</button>
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
          <strong>Premium</strong> requests consume monthly quota (GitHub Copilot Pro: 300 premium requests/month).{' '}
          <strong>Standard</strong> models are unlimited for active subscribers.{' '}
          <a
            href="https://docs.github.com/en/copilot/about-github-copilot/subscription-plans-for-github-copilot"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more ↗
          </a>
        </p>
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
        <div className="model-id">{model.id}</div>
        <span className={`badge ${tierInfo.className}`}>{tierInfo.label}</span>
      </div>

      <div className="model-meta">
        <div className="meta-item">
          <span className="meta-label">Context</span>
          <span className="meta-value">{ctxDisplay} tokens</span>
        </div>
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

import { useState, useEffect, useCallback } from 'react';
import Auth from './components/Auth.jsx';
import ModelList from './components/ModelList.jsx';
import Chat from './components/Chat.jsx';
import Settings from './components/Settings.jsx';
import UsageDashboard from './components/UsageDashboard.jsx';
import { getCopilotToken } from './api/github.js';
import { fetchModels, extractPremiumQuota, hasUnlimitedQuotas } from './api/copilot.js';
import './index.css';

const STORAGE_KEY = 'copilot_app_auth';
const TABS = ['models', 'chat', 'settings'];
const TAB_LABELS = { models: '🤖 Models', chat: '💬 Chat', settings: '⚙️ Settings' };

function loadAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveAuth(auth) {
  if (!auth) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  // Never persist the Copilot token or its data to storage (they expire; re-fetch on startup)
  const { copilotToken: _ct, copilotTokenData: _ctd, ...rest } = auth;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
}

// Compact quota button shown in the nav bar
function UsageButton({ copilotTokenData, expanded, onClick }) {
  console.log('UsageButton - copilotTokenData:', copilotTokenData);
  // Pass copilotTokenData as both first and second argument for comprehensive extraction
  const premiumQuota = extractPremiumQuota(
    copilotTokenData?.limited_user_quotas,
    copilotTokenData,
    null // subscription not available here
  );
  console.log('UsageButton - premiumQuota:', premiumQuota);

  let label = '📊 额度';
  let extra = '';

  if (premiumQuota) {
    const { quota = 0, used = 0, overage_usd = 0 } = premiumQuota;
    if (overage_usd > 0) {
      label = `⚠ -$${overage_usd.toFixed(2)}`;
      extra = ' nav-usage-over';
    } else {
      const remaining = Math.max(0, quota - used);
      label = `✦ ${remaining}/${quota}`;
    }
  } else if (hasUnlimitedQuotas(copilotTokenData?.unlimited_user_quotas)) {
    label = '✦ 无限制';
  }

  return (
    <button
      className={`nav-usage-btn${extra}`}
      onClick={onClick}
      title="查看额度与用量"
      aria-label="查看额度与用量"
      aria-expanded={expanded}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [copilotToken, setCopilotToken] = useState(null);
  const [copilotTokenData, setCopilotTokenData] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [tab, setTab] = useState('models');
  const [tokenError, setTokenError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);

  // On mount: restore saved auth and refresh copilot token
  useEffect(() => {
    const saved = loadAuth();
    if (saved?.githubToken) {
      setAuth(saved);
      refreshCopilotToken(saved.githubToken).finally(() => setInitializing(false));
    } else {
      setInitializing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshCopilotToken = useCallback(async (githubToken) => {
    setTokenError('');
    try {
      const data = await getCopilotToken(githubToken);
      console.log('Copilot token data:', data);
      setCopilotToken(data.token);
      setCopilotTokenData(data);
      setAuth((prev) => prev ? { ...prev, copilotTokenExpiresAt: data.expires_at } : prev);
      return data.token;
    } catch (err) {
      setTokenError(err.message);
      return null;
    }
  }, []);

  // Refresh token 2 minutes before expiry
  useEffect(() => {
    if (!auth?.copilotTokenExpiresAt || !auth?.githubToken) return;
    const msUntilExpiry = auth.copilotTokenExpiresAt * 1000 - Date.now() - 2 * 60 * 1000;
    if (msUntilExpiry <= 0) {
      refreshCopilotToken(auth.githubToken);
      return;
    }
    const timer = setTimeout(() => refreshCopilotToken(auth.githubToken), msUntilExpiry);
    return () => clearTimeout(timer);
  }, [auth?.copilotTokenExpiresAt, auth?.githubToken, refreshCopilotToken]);

  // Load models when copilot token is available
  useEffect(() => {
    if (!copilotToken) return;
    let cancelled = false;
    fetchModels(copilotToken)
      .then((data) => {
        if (cancelled) return;
        setModels(data);
        // Auto-select gpt-4o if no model selected
        if (!selectedModel) {
          const def = data.find((m) => m.id === 'gpt-4o') || data[0];
          if (def) setSelectedModel(def);
        }
      })
      .catch(() => {}); // Non-critical; ModelList will show its own error
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copilotToken]);

  const handleAuth = useCallback((authData) => {
    const { copilotToken: ct, copilotTokenData: ctd, ...rest } = authData;
    setAuth(rest);
    setCopilotToken(ct);
    setCopilotTokenData(ctd || null);
    saveAuth(rest);
  }, []);

  const handleUpdateAuth = useCallback((newAuth) => {
    // Extract copilotToken so it goes to the right state and isn't persisted
    const { copilotToken: ct, ...rest } = newAuth;
    setAuth(rest);
    if (ct) setCopilotToken(ct);
    saveAuth(rest);
  }, []);

  const handleSignOut = useCallback(() => {
    setAuth(null);
    setCopilotToken(null);
    setCopilotTokenData(null);
    setModels([]);
    setSelectedModel(null);
    saveAuth(null);
  }, []);

  if (initializing) {
    return (
      <div className="app-loading">
        <div className="spinner large" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!auth || !copilotToken) {
    return (
      <div className="app">
        {tokenError && (
          <div className="global-error">
            ⚠️ {tokenError} —{' '}
            <button className="link-btn" onClick={handleSignOut}>Sign in again</button>
          </div>
        )}
        <Auth onAuth={handleAuth} savedClientId={auth?.clientId} />
      </div>
    );
  }

  return (
    <div className="app">
      {/* Top navigation */}
      <nav className="app-nav">
        <div className="nav-brand">
          <span className="brand-icon">🤖</span>
          <span className="brand-name">Copilot Playground</span>
        </div>
        <div className="nav-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={`nav-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="nav-right">
          <UsageButton copilotTokenData={copilotTokenData} expanded={showDashboard} onClick={() => setShowDashboard((v) => !v)} />
          <div className="nav-user">
            {auth.user?.avatar_url && (
              <img src={auth.user.avatar_url} alt="avatar" className="nav-avatar" />
            )}
            <span className="nav-username">{auth.user?.login}</span>
          </div>
        </div>
      </nav>

      {/* Usage dashboard popup */}
      {showDashboard && (
        <UsageDashboard
          githubToken={auth.githubToken}
          copilotTokenData={copilotTokenData}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {/* Tab content */}
      <div className="app-content">
        {tab === 'models' && (
          <ModelList
            copilotToken={copilotToken}
            selectedModelId={selectedModel?.id}
            onSelectModel={(m) => { setSelectedModel(m); setTab('chat'); }}
          />
        )}
        {tab === 'chat' && (
          <Chat
            copilotToken={copilotToken}
            githubToken={auth?.githubToken}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
          />
        )}
        {tab === 'settings' && (
          <Settings
            auth={auth}
            onUpdateAuth={handleUpdateAuth}
            onSignOut={handleSignOut}
          />
        )}
      </div>
    </div>
  );
}

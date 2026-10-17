import { useState, useEffect, useCallback } from 'react';
import Auth from './components/Auth.jsx';
import ModelList from './components/ModelList.jsx';
import Chat from './components/Chat.jsx';
import Settings from './components/Settings.jsx';
import UsageDashboard from './components/UsageDashboard.jsx';
import { getCopilotSubscription, getCopilotToken } from './api/github.js';
import { fetchModels, hasUnlimitedQuotas } from './api/copilot.js';
import './index.css';

const STORAGE_KEY = 'copilot_app_auth';
const PERSIST_KEY = 'copilot_app_persist';
const TABS = ['models', 'chat', 'settings'];
const TAB_LABELS = { models: '🤖 Models', chat: '💬 Chat', settings: '⚙️ Settings' };

function loadPersist() {
  return localStorage.getItem(PERSIST_KEY) === 'true';
}

function loadAuth() {
  try {
    const storage = loadPersist() ? localStorage : sessionStorage;
    return JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveAuth(auth, persist = loadPersist()) {
  // Always clear both storages to prevent stale data when toggling persistence
  sessionStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  if (!auth) return;
  // Never persist the Copilot token or its data to storage (they expire; re-fetch on startup)
  const { copilotToken: _ct, copilotTokenData: _ctd, ...rest } = auth;
  const storage = persist ? localStorage : sessionStorage;
  storage.setItem(STORAGE_KEY, JSON.stringify(rest));
}

// Compact quota button shown in the nav bar
function UsageButton({ copilotTokenData, billingAmount, expanded, onClick }) {
  let icon = '📊';
  let text = '额度';
  let extra = '';

  const overageUsd = billingAmount ?? 0;
  if (overageUsd > 0) {
    icon = '💰️';
    text = '计费';
    extra = ' nav-usage-over';
  } else if (hasUnlimitedQuotas(copilotTokenData?.unlimited_user_quotas)) {
    icon = '✦';
    text = '无限';
  }

  const handleClick = () => {
    if (import.meta.env && import.meta.env.DEV) {
      console.log('[CopilotApp] 额度按钮 - billingAmount:', billingAmount);
      const redactedCopilotTokenData = { ...(copilotTokenData || {}) };
      delete redactedCopilotTokenData.token;
      console.log('[CopilotApp] 额度按钮 - copilotTokenData (redacted):', redactedCopilotTokenData);
    }
    onClick();
  };

  return (
    <button
      className={`nav-usage-btn${extra}`}
      onClick={handleClick}
      title="查看额度与用量"
      aria-label="查看额度与用量"
      aria-expanded={expanded}
    >
      <span>{icon}</span>{' '}<span>{text}</span>
    </button>
  );
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [copilotToken, setCopilotToken] = useState(null);
  const [copilotTokenData, setCopilotTokenData] = useState(null);
  const [billingAmount, setBillingAmount] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [tab, setTab] = useState('models');
  const [tokenError, setTokenError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);
  const [persistLogin, setPersistLogin] = useState(() => loadPersist());

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
      const [data, subscriptionResult] = await Promise.all([
        getCopilotToken(githubToken),
        getCopilotSubscription(githubToken)
          .then((copilotSubscription) => ({ ok: true, copilotSubscription }))
          .catch((error) => ({ ok: false, error })),
      ]);
      console.log('Copilot token data:', data);
      if (!subscriptionResult.ok) {
        console.warn('[CopilotApp] Failed to refresh Copilot subscription:', subscriptionResult.error);
      }
      setCopilotToken(data.token);
      setCopilotTokenData(data);
      setAuth((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          copilotTokenExpiresAt: data.expires_at,
          ...(subscriptionResult.ok ? { copilotSubscription: subscriptionResult.copilotSubscription } : {}),
        };
      });
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
    const { copilotToken: copilotTokenValue, copilotTokenData: copilotTokenDataValue, ...rest } = authData;
    setAuth(rest);
    setCopilotToken(copilotTokenValue);
    setCopilotTokenData(copilotTokenDataValue || null);
    saveAuth(rest);
  }, []);

  const handleUpdateAuth = useCallback((newAuth) => {
    // Extract volatile Copilot token fields so they go to state and aren't persisted
    const { copilotToken: copilotTokenValue, copilotTokenData: copilotTokenDataValue, ...rest } = newAuth;
    setAuth(rest);
    if (copilotTokenValue) setCopilotToken(copilotTokenValue);
    if ('copilotTokenData' in newAuth) setCopilotTokenData(copilotTokenDataValue || null);
    saveAuth(rest);
  }, []);

  const handleSignOut = useCallback(() => {
    setAuth(null);
    setCopilotToken(null);
    setCopilotTokenData(null);
    setBillingAmount(null);
    setModels([]);
    setSelectedModel(null);
    saveAuth(null);
  }, []);

  const handleTogglePersist = useCallback((val) => {
    if (val) {
      localStorage.setItem(PERSIST_KEY, 'true');
    } else {
      localStorage.removeItem(PERSIST_KEY);
    }
    setPersistLogin(val);
    // Migrate the stored auth to the newly selected storage
    if (auth) saveAuth(auth, val);
  }, [auth]);

  const handleBillingDataUpdate = useCallback((billingData) => {
    if (!billingData?.usageItems) {
      setBillingAmount(null);
      return;
    }
    const totalBilledAmount = billingData.usageItems.reduce(
      (sum, i) => sum + (i.netAmount || 0),
      0
    );
    setBillingAmount(totalBilledAmount);
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
          <UsageButton copilotTokenData={copilotTokenData} billingAmount={billingAmount} expanded={showDashboard} onClick={() => setShowDashboard((v) => !v)} />
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
          username={auth.user?.login}
          copilotTokenData={copilotTokenData}
          copilotSubscription={auth.copilotSubscription}
          onBillingDataUpdate={handleBillingDataUpdate}
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
            persistLogin={persistLogin}
            onTogglePersist={handleTogglePersist}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Settings: Manage auth tokens, client ID, and clear data
 */
import { useState } from 'react';
import { getCopilotToken } from '../api/github.js';
import { version as APP_VERSION, repository } from '../../package.json';
import { BRAVE_KEY } from '../constants.js';

const REPO_URL = repository?.url || 'https://github.com/su600/CopilotApp';

export default function Settings({ auth, onUpdateAuth, onSignOut, persistLogin, onTogglePersist }) {
  const [clientId, setClientId] = useState(auth.clientId || '');
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [braveApiKey, setBraveApiKey] = useState(() => localStorage.getItem(BRAVE_KEY) || '');
  const [braveSaved, setBraveSaved] = useState(false);

  const saveClientId = () => {
    onUpdateAuth({ ...auth, clientId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveBraveApiKey = () => {
    if (braveApiKey.trim()) {
      localStorage.setItem(BRAVE_KEY, braveApiKey.trim());
    } else {
      localStorage.removeItem(BRAVE_KEY);
    }
    setBraveSaved(true);
    setTimeout(() => setBraveSaved(false), 2000);
  };

  const refreshCopilotToken = async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      const data = await getCopilotToken(auth.githubToken);
      onUpdateAuth({ ...auth, copilotToken: data.token, copilotTokenExpiresAt: data.expires_at });
    } catch (err) {
      setRefreshError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const clearHistory = () => {
    localStorage.removeItem('copilot_conversations');
    window.location.reload();
  };

  const tokenExpiry = auth.copilotTokenExpiresAt
    ? new Date(auth.copilotTokenExpiresAt * 1000).toLocaleString()
    : 'Unknown';

  const isExpired = auth.copilotTokenExpiresAt && Date.now() > auth.copilotTokenExpiresAt * 1000;

  return (
    <div className="settings-container">
      <h2>Settings</h2>

      {/* User Info */}
      {auth.user && (
        <section className="settings-section">
          <h3>Account</h3>
          <div className="user-card">
            {auth.user.avatar_url && (
              <img src={auth.user.avatar_url} alt="avatar" className="user-avatar" />
            )}
            <div>
              <div className="user-name">{auth.user.name || auth.user.login}</div>
              <div className="user-login">@{auth.user.login}</div>
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={onSignOut}>Sign Out</button>
        </section>
      )}

      {/* Copilot Token Status */}
      <section className="settings-section">
        <h3>Copilot API Token</h3>
        <div className={`token-status ${isExpired ? 'token-expired' : 'token-valid'}`}>
          <span>{isExpired ? '⚠️ Expired' : '✓ Valid'}</span>
          <span>Expires: {tokenExpiry}</span>
        </div>
        {refreshError && <p className="text-error">{refreshError}</p>}
        <button className="btn btn-secondary btn-sm" onClick={refreshCopilotToken} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : '🔄 Refresh Token'}
        </button>
        <p className="settings-hint">Copilot tokens expire after ~30 minutes and are refreshed automatically on use.</p>
      </section>

      {/* OAuth Client ID */}
      <section className="settings-section">
        <h3>OAuth App Client ID (Device Flow)</h3>
        <div className="form-group">
          <input
            type="text"
            className="input"
            placeholder="Iv1.abc123def456..."
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
          />
          <small className="form-hint">
            Used for GitHub Device Flow login.{' '}
            <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer">
              Create an OAuth App ↗
            </a>
          </small>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={saveClientId}>
          {saved ? '✓ Saved' : 'Save Client ID'}
        </button>
      </section>

      {/* Data management */}
      <section className="settings-section">
        <h3>Data</h3>
        <div className="form-group">
          <label className="settings-persist-label">
            <input
              type="checkbox"
              checked={!!persistLogin}
              onChange={(e) => onTogglePersist(e.target.checked)}
            />
            &nbsp;Keep me signed in across sessions
          </label>
          <small className="form-hint">
            When enabled, your GitHub access token is stored in localStorage and persists until you sign out.
            Disable or sign out on shared or public devices.
          </small>
        </div>
        {confirmingClear ? (
          <div className="confirm-box">
            <p>Clear all conversation history? This cannot be undone.</p>
            <div className="btn-group">
              <button className="btn btn-danger btn-sm" onClick={clearHistory}>Yes, clear all</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmingClear(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmingClear(true)}>
            🗑️ Clear Conversation History
          </button>
        )}
        <p className="settings-hint">
          By default, login state is stored in sessionStorage and cleared when you close the tab.
          When &ldquo;Keep me signed in&rdquo; is enabled, your GitHub access token is persisted in localStorage
          until you sign out. Conversations are always stored in localStorage. Avoid enabling persistent
          login on shared or public machines.
        </p>
      </section>

      {/* Brave Search */}
      <section className="settings-section">
        <h3>🔍 Brave Search</h3>
        <div className="form-group">
          <input
            type="password"
            className="input"
            placeholder="BSA…"
            value={braveApiKey}
            onChange={(e) => setBraveApiKey(e.target.value)}
            autoComplete="off"
          />
          <small className="form-hint">
            Brave Search API key for web search in chat. When set, models can call Brave Search as a tool.{' '}
            <a href="https://brave.com/search/api/" target="_blank" rel="noopener noreferrer">
              Get a key ↗
            </a>
          </small>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={saveBraveApiKey}>
          {braveSaved ? '✓ Saved' : 'Save API Key'}
        </button>
      </section>

      {/* About */}
      <section className="settings-section">
        <h3>About</h3>
        <p className="settings-hint">
          GitHub Copilot Playground v{APP_VERSION}<br />
          A PWA for testing GitHub Copilot models via the OpenAI-compatible API.<br />
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            View on GitHub ↗
          </a>
        </p>
      </section>
    </div>
  );
}

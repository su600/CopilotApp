/**
 * Settings: Manage auth tokens, client ID, and clear data
 */
import { useState } from 'react';
import { getCopilotToken } from '../api/github.js';
import { version as APP_VERSION, repository } from '../../package.json';

const REPO_URL = repository?.url || 'https://github.com/su600/CopilotApp';

export default function Settings({ auth, onUpdateAuth, onSignOut }) {
  const [clientId, setClientId] = useState(auth.clientId || '');
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const saveClientId = () => {
    onUpdateAuth({ ...auth, clientId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

  const exportConversations = () => {
    try {
      const conversations = localStorage.getItem('copilot_conversations') || '{}';
      const blob = new Blob([conversations], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `copilot-conversations-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to export conversations: ' + err.message);
    }
  };

  const importConversations = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') throw new Error('Invalid file content');

        // Validate JSON structure
        const data = JSON.parse(content);
        if (typeof data !== 'object' || data === null) {
          throw new Error('Invalid conversations format');
        }

        // Merge with existing conversations
        const existing = JSON.parse(localStorage.getItem('copilot_conversations') || '{}');
        const merged = { ...existing, ...data };
        localStorage.setItem('copilot_conversations', JSON.stringify(merged));

        // Reload to reflect changes
        window.location.reload();
      } catch (err) {
        alert('Failed to import conversations: ' + err.message);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be imported again
    event.target.value = '';
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

        {/* Export/Import */}
        <div className="btn-group" style={{ marginBottom: '1rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={exportConversations}>
            📥 Export Conversations
          </button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
            📤 Import Conversations
            <input
              type="file"
              accept="application/json,.json"
              onChange={importConversations}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <p className="settings-hint">Export conversations to sync across devices. Import will merge with existing conversations.</p>

        {/* Clear All */}
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
        <p className="settings-hint">Conversations are stored locally in your browser (localStorage).</p>
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

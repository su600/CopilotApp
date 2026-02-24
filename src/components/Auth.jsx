/**
 * Auth page: GitHub Device Flow login + PAT fallback
 */
import { useState, useEffect, useRef } from 'react';
import { requestDeviceCode, pollForToken, getGitHubUser, getCopilotToken } from '../api/github.js';

// Built-in GitHub OAuth App Client ID for device flow (copilot.vim's well-known client ID,
// recognized by GitHub's Copilot token exchange endpoint).
// Users can override this with their own OAuth App Client ID in Settings.
const DEFAULT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

export default function Auth({ onAuth, savedClientId }) {
  const [mode, setMode] = useState('choose'); // 'choose' | 'device' | 'pat'
  const [clientId, setClientId] = useState(savedClientId || DEFAULT_CLIENT_ID);
  const [pat, setPat] = useState('');
  const [deviceData, setDeviceData] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const verificationWindowRef = useRef(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // --- Device Flow ---
  const startDeviceFlow = async () => {
    if (!clientId.trim()) {
      setError('Please enter your GitHub OAuth App Client ID first.');
      return;
    }
    setError('');
    setLoading(true);
    setStatus('Requesting device code…');

    // Open a blank window synchronously while still in the user-gesture call stack,
    // so browsers don't block it as an unsolicited popup. We navigate it to the
    // verification URL once the device code is received.
    verificationWindowRef.current = window.open('', '_blank');

    try {
      const data = await requestDeviceCode(clientId.trim(), 'read:user gist');
      setDeviceData(data);
      setStatus('Waiting for authorization…');

      // Navigate the pre-opened window to the verification URL (avoids popup blocker)
      if (verificationWindowRef.current && !verificationWindowRef.current.closed) {
        verificationWindowRef.current.location.href = data.verification_uri;
      }

      // Start polling
      const controller = new AbortController();
      abortRef.current = controller;

      const githubToken = await pollForToken(
        clientId.trim(),
        data.device_code,
        data.interval || 5,
        controller.signal,
      );

      setStatus('Exchanging for Copilot token…');
      await completeAuth(githubToken);

      // Close the verification window after successful authentication
      verificationWindowRef.current?.close();
      verificationWindowRef.current = null;
    } catch (err) {
      verificationWindowRef.current?.close();
      verificationWindowRef.current = null;
      setError(err.message);
      setStatus('');
      setDeviceData(null);
    } finally {
      setLoading(false);
    }
  };

  const cancelDeviceFlow = () => {
    abortRef.current?.abort();
    setDeviceData(null);
    setStatus('');
    setMode('choose');
  };

  // --- PAT Flow ---
  const loginWithPat = async () => {
    if (!pat.trim()) {
      setError('Please enter your GitHub Personal Access Token.');
      return;
    }
    setError('');
    setLoading(true);
    setStatus('Authenticating…');
    try {
      await completeAuth(pat.trim());
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  // Common: get user info + copilot token, then call onAuth
  const completeAuth = async (githubToken) => {
    const [user, copilotData] = await Promise.all([
      getGitHubUser(githubToken),
      getCopilotToken(githubToken),
    ]);

    onAuth({
      githubToken,
      copilotToken: copilotData.token,
      copilotTokenExpiresAt: copilotData.expires_at,
      copilotTokenData: copilotData,
      user,
      clientId: clientId.trim(),
    });
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" className="copilot-icon">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2a8 8 0 110 16A8 8 0 0112 4zm0 2a6 6 0 100 12A6 6 0 0012 6zm-1 2h2v5h-2zm0 7h2v2h-2z"/>
          </svg>
        </div>
        <h1 className="auth-title">GitHub Copilot Playground</h1>
        <p className="auth-subtitle">Test and compare GitHub Copilot models</p>

        {error && (
          <div className="alert alert-error">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')} className="alert-close">×</button>
          </div>
        )}

        {mode === 'choose' && (
          <div className="auth-options">
            <button className="btn btn-primary" onClick={() => { setMode('device'); setError(''); startDeviceFlow(); }}>
              <span className="btn-icon">🔐</span>
              Sign in with GitHub (Device Flow)
            </button>
            {!clientId && (
              <p className="auth-hint">
                Device Flow requires a GitHub OAuth App Client ID.{' '}
                <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer">
                  Create one here
                </a>{' '}
                or configure it in Settings after signing in with a PAT.
              </p>
            )}
            <div className="divider"><span>or</span></div>
            <button className="btn btn-secondary" onClick={() => { setMode('pat'); setError(''); }}>
              <span className="btn-icon">🔑</span>
              Use Personal Access Token
            </button>
          </div>
        )}

        {mode === 'device' && (
          <div className="auth-device">
            <div className="form-group">
              <label htmlFor="clientId">GitHub OAuth App Client ID</label>
              <input
                id="clientId"
                type="text"
                className="input"
                placeholder="e.g. Iv1.abc123def456..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              <small className="form-hint">
                <a href="https://github.com/settings/applications/new" target="_blank" rel="noopener noreferrer">
                  Create a GitHub OAuth App
                </a>{' '}
                — enable <strong>Device Flow</strong>, set the callback URL to your app URL (e.g. <code>http://localhost:5173</code>), and note your <strong>Client ID</strong>.
              </small>
            </div>

            {!deviceData ? (
              <div className="btn-group">
                <button className="btn btn-primary" onClick={startDeviceFlow} disabled={loading || !clientId.trim()}>
                  {loading ? 'Requesting…' : 'Get Device Code'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setMode('choose'); setError(''); }}>
                  Back
                </button>
              </div>
            ) : (
              <div className="device-code-box">
                <p className="device-instruction">
                  Visit <a href={deviceData.verification_uri} target="_blank" rel="noopener noreferrer" className="link-primary">
                    {deviceData.verification_uri}
                  </a> and enter this code:
                </p>
                <div className="device-code">{deviceData.user_code}</div>
                <button
                  className="btn btn-ghost btn-sm copy-btn"
                  onClick={() => navigator.clipboard?.writeText(deviceData.user_code)}
                >
                  📋 Copy Code
                </button>
                <p className="device-status">
                  {status || 'Waiting for you to authorize in the browser…'}
                </p>
                <button className="btn btn-ghost" onClick={cancelDeviceFlow}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {mode === 'pat' && (
          <div className="auth-pat">
            <div className="form-group">
              <label htmlFor="pat">GitHub Personal Access Token</label>
              <input
                id="pat"
                type="password"
                className="input"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && loginWithPat()}
                autoComplete="off"
              />
              <small className="form-hint">
                <a href="https://github.com/settings/tokens/new?scopes=read:user,gist&description=CopilotApp" target="_blank" rel="noopener noreferrer">
                  Generate a new token
                </a>{' '}
                with <code>read:user</code> and <code>gist</code> scopes. Your account must have a GitHub Copilot subscription.
              </small>
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={loginWithPat} disabled={loading || !pat.trim()}>
                {loading ? status || 'Authenticating…' : 'Sign In'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setMode('choose'); setError(''); }}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

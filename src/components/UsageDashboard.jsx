/**
 * UsageDashboard: popup panel showing Copilot Pro quota, usage, overage and next reset.
 */
import { useState, useEffect, useRef } from 'react';
import { getBillingPremiumRequestUsage } from '../api/github.js';
import { extractPremiumQuota, hasUnlimitedQuotas } from '../api/copilot.js';

const BILLING_PAT_KEY = 'copilot_billing_pat';

/** Read the user-provided Fine-Grained PAT from localStorage. */
function loadBillingToken() {
  try { return localStorage.getItem(BILLING_PAT_KEY) || ''; } catch (e) {
    console.warn('[CopilotApp] Could not read billing token from localStorage:', e);
    return '';
  }
}

/** Default plan quota (Copilot Pro = 300 requests/month). Used when subscription data is unavailable. */
const DEFAULT_PLAN_QUOTA = 300;

const SKU_NAMES = {
  copilot_for_individuals: 'Pro',
  copilot_v2: 'Pro',
  copilot_business: 'Business',
  copilot_enterprise: 'Enterprise',
};

/** Return a localised string for the 1st day of next month. */
function getNextMonthFirst() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Format a potentially very small or large number, avoiding scientific notation.
 *  Uses 10 decimal places for values < 0.01 to preserve precision (e.g. remaining quota 0.000000001). */
function formatLargeNumber(value) {
  const val = parseFloat(value) || 0;
  if (val === 0) return '0';
  if (Math.abs(val) < 0.01) {
    // 10 decimal places preserves sub-cent precision common in Copilot billing fractions
    return val.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  } else if (val < 1000 && val !== Math.floor(val)) {
    return val.toFixed(2);
  }
  return String(Math.floor(val));
}

export default function UsageDashboard({ githubToken, username, copilotTokenData, onBillingDataUpdate, onClose }) {
  const [billingToken, setBillingToken] = useState(loadBillingToken);
  const [billingTokenInput, setBillingTokenInput] = useState('');
  const [billingData, setBillingData] = useState(null);
  const [billingError, setBillingError] = useState('');
  const panelRef = useRef(null);

  // Derived: true while credentials are present but a result has not yet arrived
  const billingLoading = Boolean(billingToken && username && billingData === null && !billingError);

  useEffect(() => {
    if (!billingToken || !username) return;
    getBillingPremiumRequestUsage(username, billingToken)
      .then((data) => { 
        setBillingData(data); 
        setBillingError(''); 
        // Notify parent component of billing data update
        if (onBillingDataUpdate) {
          onBillingDataUpdate(data);
        }
      })
      .catch((err) => { setBillingError(`账单加载失败: ${err.message}`); });
  }, [billingToken, username, onBillingDataUpdate]);

  const saveBillingToken = () => {
    const token = billingTokenInput.trim();
    try { localStorage.setItem(BILLING_PAT_KEY, token); } catch (e) {
      console.warn('[CopilotApp] Could not save billing token to localStorage:', e);
    }
    setBillingToken(token);
    setBillingTokenInput('');
    setBillingData(null);
    setBillingError('');
  };

  const clearBillingToken = () => {
    try { localStorage.removeItem(BILLING_PAT_KEY); } catch (e) {
      console.warn('[CopilotApp] Could not remove billing token from localStorage:', e);
    }
    setBillingToken('');
    setBillingData(null);
    setBillingError('');
    // Notify parent that billing data is cleared
    if (onBillingDataUpdate) {
      onBillingDataUpdate(null);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Extract quota data from the Copilot token response
  console.log('UsageDashboard - copilotTokenData:', copilotTokenData);

  // Pass all possible data sources to extractPremiumQuota for comprehensive checking
  const premiumQuota = extractPremiumQuota(
    copilotTokenData?.limited_user_quotas,
    copilotTokenData,
    null
  );
  console.log('UsageDashboard - final premiumQuota:', premiumQuota);

  // True when the API signals that this feature has no usage cap for the current plan
  const isUnlimited = !premiumQuota && hasUnlimitedQuotas(copilotTokenData?.unlimited_user_quotas);

  const planName = SKU_NAMES[copilotTokenData?.sku]
    ? `GitHub Copilot ${SKU_NAMES[copilotTokenData.sku]}`
    : 'GitHub Copilot';

  const quotaTotal = premiumQuota?.quota ?? null;
  const quotaUsed = premiumQuota?.used ?? null;
  const overage = premiumQuota?.overage ?? 0;
  const overageUsd = premiumQuota?.overage_usd ?? 0;
  const pct = (quotaTotal !== null && quotaTotal > 0 && quotaUsed !== null) ? Math.min(100, (quotaUsed / quotaTotal) * 100) : null;

  // Billing REST API stats
  const billingItems = billingData?.usageItems || [];
  const totalGross = billingItems.reduce((sum, i) => sum + (i.grossQuantity || 0), 0);
  const totalIncluded = billingItems.reduce((sum, i) => sum + (i.discountQuantity || 0), 0);
  const totalBilledQty = billingItems.reduce((sum, i) => sum + (i.netQuantity || 0), 0);
  const totalBilledAmount = billingItems.reduce((sum, i) => sum + (i.netAmount || 0), 0);
  const planQuota = quotaTotal ?? DEFAULT_PLAN_QUOTA;
  const top5Models = [...billingItems]
    .sort((a, b) => (b.grossQuantity || 0) - (a.grossQuantity || 0))
    .slice(0, 5);

  return (
    <div className="dashboard-overlay" onMouseDown={onClose}>
      <div
        className="dashboard-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-dashboard-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="dashboard-header">
          <h3 className="dashboard-title" id="usage-dashboard-title">✦ 额度与用量</h3>
          <button className="dashboard-close btn btn-ghost btn-sm" onClick={onClose} aria-label="关闭">×</button>
        </div>

        {/* Plan info */}
        <div className="dashboard-section">
          <div className="dashboard-plan-name">{planName}</div>
        </div>

        <div className="dashboard-divider" />

        {/* Premium quota */}
        <div className="dashboard-section">
          <div className="dashboard-row">
            <span className="dashboard-section-title">高级请求 (Premium)</span>
            {billingData && (
              <span className="dashboard-value">免费额度 {formatLargeNumber(totalIncluded)} / {formatLargeNumber(planQuota)}</span>
            )}
          </div>
          <>
              {pct !== null && (
                <div className="dashboard-bar-wrap">
                  <div className="dashboard-bar">
                    <div
                      className={`dashboard-bar-fill${pct >= 100 ? ' full' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="dashboard-bar-label">{quotaUsed} / {quotaTotal}</span>
                </div>
              )}
              {quotaTotal !== null ? (
                <>
                  <div className="dashboard-row">
                    <span className="dashboard-label">月度额度</span>
                    <span className="dashboard-value">{quotaTotal} 次</span>
                  </div>
                  {quotaUsed !== null && (
                    <div className="dashboard-row">
                      <span className="dashboard-label">已使用</span>
                      <span className="dashboard-value">{quotaUsed} 次</span>
                    </div>
                  )}
                </>
              ) : isUnlimited ? (
                <div className="dashboard-row">
                  <span className="dashboard-label">高级请求</span>
                  <span className="dashboard-value dashboard-value-success">无使用量限制</span>
                </div>
              ) : null}
            </>
        </div>

        {/* Overage */}
        {(overage > 0 || overageUsd > 0) && (
          <>
            <div className="dashboard-divider" />
            <div className="dashboard-section">
              <div className="dashboard-section-title dashboard-section-title-danger">超额消费</div>
              <div className="dashboard-row">
                <span className="dashboard-label">超额请求</span>
                <span className="dashboard-value dashboard-value-danger">{overage} 次</span>
              </div>
              <div className="dashboard-row">
                <span className="dashboard-label">预计费用</span>
                <span className="dashboard-value dashboard-value-danger">${overageUsd.toFixed(2)}</span>
              </div>
            </div>
          </>
        )}

        <div className="dashboard-divider" />

        {/* Billing details from REST API (requires a user-provided Fine-Grained PAT) */}
        <div className="dashboard-section">
          <div className="dashboard-section-title">账单详情 (本月)</div>
          {!billingToken ? (
            <>
              <p className="dashboard-value dashboard-value-muted" style={{ fontSize: '12px', marginBottom: '6px' }}>
                需要 Fine-Grained PAT（Plan: read 权限）查看账单详情
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="password"
                  className="input"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  placeholder="github_pat_…"
                  value={billingTokenInput}
                  onChange={(e) => setBillingTokenInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && billingTokenInput.trim() && saveBillingToken()}
                  autoComplete="off"
                />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={saveBillingToken}
                  disabled={!billingTokenInput.trim()}
                >
                  保存
                </button>
              </div>
            </>
          ) : billingLoading ? (
            <div className="dashboard-loading"><div className="spinner" /></div>
          ) : billingError ? (
            <>
              <p className="text-error" style={{ fontSize: '12px' }}>{billingError}</p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: '4px', fontSize: '11px' }} onClick={clearBillingToken}>清除 Token</button>
            </>
          ) : billingData ? (
            <>
              <div className="dashboard-row">
                <span className="dashboard-label">📌 总用量</span>
                <span className="dashboard-value">{formatLargeNumber(totalGross)} 次</span>
              </div>
              <div className="dashboard-row">
                <span className="dashboard-label">✅ 免费额度</span>
                <span className="dashboard-value">{formatLargeNumber(totalIncluded)} / {planQuota}</span>
              </div>
              <div className="dashboard-row">
                <span className="dashboard-label">💰 计费请求</span>
                <span className="dashboard-value">{formatLargeNumber(totalBilledQty)}</span>
              </div>
              <div className="dashboard-row">
                <span className="dashboard-label">💳 计费金额</span>
                <span className={`dashboard-value${totalBilledAmount > 0 ? ' dashboard-value-danger' : ''}`}>
                  ${totalBilledAmount.toFixed(2)}
                </span>
              </div>
              {top5Models.length > 0 && (
                <>
                  <div className="dashboard-section-title" style={{ marginTop: '8px' }}>Top 5 模型用量</div>
                  {top5Models.map((item, idx) => (
                    <div key={idx} className="dashboard-row">
                      <span className="dashboard-label" style={{ fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.model || 'unknown'}
                      </span>
                      <span className="dashboard-value" style={{ fontSize: '12px' }}>
                        {formatLargeNumber(item.grossQuantity || 0)}
                        {(item.netAmount || 0) > 0 && ` / $${parseFloat(item.netAmount).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: '6px', fontSize: '11px' }} onClick={clearBillingToken}>清除 Token</button>
            </>
          ) : (
            <div className="dashboard-row">
              <span className="dashboard-value dashboard-value-muted">本月暂无数据</span>
            </div>
          )}
        </div>

        <div className="dashboard-divider" />

        {/* Next reset – moved to bottom */}
        <div className="dashboard-section">
          <div className="dashboard-row">
            <span className="dashboard-label">下次重置</span>
            <span className="dashboard-value">
              {getNextMonthFirst()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

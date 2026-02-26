/**
 * UsageDashboard: popup panel showing Copilot Pro quota, usage, overage and next reset.
 */
import { useState, useEffect, useRef } from 'react';
import { getCopilotSubscription, getBillingPremiumRequestUsage } from '../api/github.js';
import { extractPremiumQuota, hasUnlimitedQuotas } from '../api/copilot.js';

const BILLING_TOKEN = import.meta.env.VITE_FINE_GRAINED_TOKEN || '';
/** Default plan quota (Copilot Pro = 300 requests/month). Used when subscription data is unavailable. */
const DEFAULT_PLAN_QUOTA = 300;

const PLAN_NAMES = {
  copilot_for_individuals: 'GitHub Copilot Pro',
  copilot_business: 'GitHub Copilot Business',
  copilot_enterprise: 'GitHub Copilot Enterprise',
  copilot_free: 'GitHub Copilot Free',
};

const SKU_NAMES = {
  copilot_for_individuals: 'Pro',
  copilot_v2: 'Pro',
  copilot_business: 'Business',
  copilot_enterprise: 'Enterprise',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
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

export default function UsageDashboard({ githubToken, username, copilotTokenData, onClose }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(githubToken));
  const [error, setError] = useState('');
  const [billingData, setBillingData] = useState(null);
  const [billingLoading, setBillingLoading] = useState(() => Boolean(BILLING_TOKEN && username));
  const [billingError, setBillingError] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    if (!githubToken) return;
    getCopilotSubscription(githubToken)
      .then((data) => { setSubscription(data); setLoading(false); })
      .catch((err) => { setError(`加载失败: ${err.message}`); setLoading(false); });
  }, [githubToken]);

  useEffect(() => {
    if (!BILLING_TOKEN || !username) return;
    getBillingPremiumRequestUsage(username, BILLING_TOKEN)
      .then((data) => { setBillingData(data); setBillingLoading(false); })
      .catch((err) => { setBillingError(`账单加载失败: ${err.message}`); setBillingLoading(false); });
  }, [username]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Extract quota data from the Copilot token response
  console.log('UsageDashboard - copilotTokenData:', copilotTokenData);
  console.log('UsageDashboard - subscription:', subscription);

  // Pass all possible data sources to extractPremiumQuota for comprehensive checking
  const premiumQuota = extractPremiumQuota(
    copilotTokenData?.limited_user_quotas,
    copilotTokenData,
    subscription
  );
  console.log('UsageDashboard - final premiumQuota:', premiumQuota);

  // True when the API signals that this feature has no usage cap for the current plan
  const isUnlimited = !premiumQuota && hasUnlimitedQuotas(copilotTokenData?.unlimited_user_quotas);
  console.log('UsageDashboard - isUnlimited:', isUnlimited);
  // True for org-managed plans where individual premium request quotas are not applicable
  const isOrgManaged =
    ['copilot_business', 'copilot_enterprise'].includes(subscription?.plan_type) ||
    ['copilot_business', 'copilot_enterprise'].includes(copilotTokenData?.sku);

  const planName = subscription
    ? (PLAN_NAMES[subscription.plan_type] || subscription.plan_type || 'GitHub Copilot')
    : (SKU_NAMES[copilotTokenData?.sku] ? `GitHub Copilot ${SKU_NAMES[copilotTokenData.sku]}` : 'GitHub Copilot');

  const nextReset = subscription?.next_billing_date;
  const billingCycle = subscription?.billing_cycle;

  const quotaTotal = premiumQuota?.quota ?? null;
  const quotaUsed = premiumQuota?.used ?? null;
  const quotaRemaining = (quotaTotal !== null && quotaUsed !== null) ? Math.max(0, quotaTotal - quotaUsed) : null;
  const overage = premiumQuota?.overage ?? 0;
  const overageUsd = premiumQuota?.overage_usd ?? 0;
  const pct = (quotaTotal !== null && quotaTotal > 0 && quotaUsed !== null) ? Math.min(100, (quotaUsed / quotaTotal) * 100) : null;

  // Billing REST API stats
  const billingItems = billingData?.usageItems || [];
  const totalGross = billingItems.reduce((sum, i) => sum + (i.grossQuantity || 0), 0);
  const totalIncluded = billingItems.reduce((sum, i) => sum + (i.discountQuantity || 0), 0);
  const totalBilledQty = billingItems.reduce((sum, i) => sum + (i.netQuantity || 0), 0);
  const totalBilledAmount = billingItems.reduce((sum, i) => sum + (i.netAmount || 0), 0);
  const planQuota = quotaTotal || DEFAULT_PLAN_QUOTA;
  const billingRemaining = Math.max(0, planQuota - totalIncluded);
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
          {billingCycle && (
            <div className="dashboard-row">
              <span className="dashboard-label">计费周期</span>
              <span className="dashboard-value">{billingCycle === 'monthly' ? '每月' : '每年'}</span>
            </div>
          )}
        </div>

        <div className="dashboard-divider" />

        {/* Premium quota */}
        <div className="dashboard-section">
          <div className="dashboard-section-title">高级请求 (Premium)</div>
          {loading ? (
            <div className="dashboard-loading"><div className="spinner" /></div>
          ) : (
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
                  {quotaRemaining !== null && (
                    <div className="dashboard-row">
                      <span className="dashboard-label">剩余</span>
                      <span className={`dashboard-value${quotaRemaining === 0 ? ' dashboard-value-danger' : ' dashboard-value-success'}`}>
                        {quotaRemaining} 次
                      </span>
                    </div>
                  )}
                </>
              ) : isUnlimited ? (
                <div className="dashboard-row">
                  <span className="dashboard-label">高级请求</span>
                  <span className="dashboard-value dashboard-value-success">无使用量限制</span>
                </div>
              ) : (
                <div className="dashboard-row">
                  <span className="dashboard-label">额度</span>
                  <span className="dashboard-value dashboard-value-muted">
                    {isOrgManaged ? '由组织统一管理' : '暂无数据'}
                  </span>
                </div>
              )}
            </>
          )}
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

        {/* Next reset */}
        <div className="dashboard-section">
          <div className="dashboard-row">
            <span className="dashboard-label">下次重置</span>
            <span className="dashboard-value">
              {loading ? '加载中…' : (nextReset ? formatDate(nextReset) : '—')}
            </span>
          </div>
        </div>

        <div className="dashboard-divider" />

        {/* Billing details from REST API (requires VITE_FINE_GRAINED_TOKEN) */}
        <div className="dashboard-section">
          <div className="dashboard-section-title">账单详情 (本月)</div>
          {!BILLING_TOKEN ? (
            <div className="dashboard-row">
              <span className="dashboard-value dashboard-value-muted" style={{ fontSize: '12px' }}>
                配置 VITE_FINE_GRAINED_TOKEN 后可查看账单详情
              </span>
            </div>
          ) : billingLoading ? (
            <div className="dashboard-loading"><div className="spinner" /></div>
          ) : billingError ? (
            <p className="text-error" style={{ fontSize: '12px' }}>{billingError}</p>
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
                <span className="dashboard-label">🔋 剩余额度</span>
                <span className={`dashboard-value${billingRemaining === 0 ? ' dashboard-value-danger' : ' dashboard-value-success'}`}>
                  {formatLargeNumber(billingRemaining)}
                </span>
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
            </>
          ) : (
            <div className="dashboard-row">
              <span className="dashboard-value dashboard-value-muted">本月暂无数据</span>
            </div>
          )}
        </div>

        {error && (
          <div className="dashboard-section">
            <p className="text-error" style={{ fontSize: '12px' }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

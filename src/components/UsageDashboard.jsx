/**
 * UsageDashboard: popup panel showing Copilot Pro quota, usage, overage and next reset.
 */
import { useState, useEffect, useRef } from 'react';
import { getCopilotSubscription } from '../api/github.js';

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

export default function UsageDashboard({ githubToken, copilotTokenData, onClose }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(githubToken));
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    if (!githubToken) return;
    getCopilotSubscription(githubToken)
      .then((data) => { setSubscription(data); setLoading(false); })
      .catch((err) => { setError(`加载失败: ${err.message}`); setLoading(false); });
  }, [githubToken]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Extract quota data from the Copilot token response
  const limitedQuotas = copilotTokenData?.limited_user_quotas;
  // Support both common key names used by the Copilot internal API
  const premiumQuota = limitedQuotas?.chat_premium_requests ?? limitedQuotas?.premium_requests ?? null;

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

  return (
    <div className="dashboard-overlay" onMouseDown={onClose}>
      <div className="dashboard-panel" ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="dashboard-header">
          <h3 className="dashboard-title">✦ 额度与用量</h3>
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
              ) : (
                <div className="dashboard-row">
                  <span className="dashboard-label">额度</span>
                  <span className="dashboard-value dashboard-value-muted">未获取到数据</span>
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

        {error && (
          <div className="dashboard-section">
            <p className="text-error" style={{ fontSize: '12px' }}>{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

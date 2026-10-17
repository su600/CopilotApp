const STORAGE_KEY_PREFIX = 'copilot_daily_premium_credits_v1:';
export const DAILY_PREMIUM_CREDITS_EVENT = 'copilot-daily-premium-credits-updated';

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStorageKey(username) {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(username || 'default')}`;
}

/** Return this account's locally tracked premium credits for the current local day. */
export function getTodayPremiumCredits(username, now = new Date()) {
  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey(username)) || 'null');
    if (saved?.date !== getLocalDateKey(now) || !Number.isFinite(saved.credits)) return 0;
    return Math.max(0, saved.credits);
  } catch {
    return 0;
  }
}

/** Add credits for one successfully completed Copilot API request. */
export function recordDailyPremiumCredits(username, credits, now = new Date()) {
  if (!Number.isFinite(credits) || credits <= 0) return getTodayPremiumCredits(username, now);

  const date = getLocalDateKey(now);
  const current = getTodayPremiumCredits(username, now);
  const total = Number((current + credits).toFixed(4));

  try {
    localStorage.setItem(getStorageKey(username), JSON.stringify({ date, credits: total }));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(DAILY_PREMIUM_CREDITS_EVENT));
    }
  } catch {
    // Usage tracking is best-effort and must never interrupt a successful chat request.
  }

  return total;
}

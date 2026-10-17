const STORAGE_PREFIX = 'copilot_daily_premium_credits';
export const DAILY_PREMIUM_CREDITS_EVENT = 'copilot-daily-premium-credits-updated';

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStorageKey(username) {
  const account = typeof username === 'string' && username.trim() ? username.trim() : 'default';
  return `${STORAGE_PREFIX}_${encodeURIComponent(account.toLowerCase())}`;
}

/** Return the current local day's Premium credits recorded by this app for this account. */
export function getTodayPremiumCredits(username) {
  try {
    const stored = JSON.parse(localStorage.getItem(getStorageKey(username)) || 'null');
    if (!stored || stored.date !== getLocalDateKey()) return 0;
    const credits = Number(stored.credits);
    return Number.isFinite(credits) && credits > 0 ? credits : 0;
  } catch {
    return 0;
  }
}

/** Add credits for a successfully completed Copilot API request. */
export function recordDailyPremiumCredits(username, amount) {
  const creditsToAdd = Number(amount);
  if (!Number.isFinite(creditsToAdd) || creditsToAdd <= 0) return getTodayPremiumCredits(username);

  const storageKey = getStorageKey(username);
  const total = getTodayPremiumCredits(username) + creditsToAdd;
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      date: getLocalDateKey(),
      credits: Math.round(total * 10000) / 10000,
    }));
    window.dispatchEvent(new Event(DAILY_PREMIUM_CREDITS_EVENT));
  } catch {
    // Local storage can be unavailable or full; do not interrupt chat responses.
  }
  return getTodayPremiumCredits(username);
}

/** Resolve the current plan's Premium request weight, accepting numeric API strings too. */
export function getPremiumRequestMultiplier(model) {
  if (!model) return 0;
  const rawMultiplier = model.multiplier
    ?? (model.tier === 'premium' ? model.freeMultiplier ?? 1 : 0);
  const multiplier = Number(rawMultiplier);
  return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0;
}

/**
 * Shared model utility constants and helpers used by Chat and ModelList components.
 */

export const MAIN_PROVIDERS = new Set(['Anthropic', 'OpenAI', 'Google']);
export const PROVIDER_ORDER = ['Anthropic', 'OpenAI', 'Google'];
export const OTHER_PROVIDER = '其它';

/** Sort models: standard first, then premium by multiplier ascending, then alphabetically */
export function sortModels(arr) {
  return [...arr].sort((a, b) => {
    if (a.tier !== b.tier) {
      if (a.tier === 'standard') return -1;
      if (b.tier === 'standard') return 1;
    }
    const ma = a.multiplier ?? Infinity;
    const mb = b.multiplier ?? Infinity;
    if (ma !== mb) return ma - mb;
    return a.id.localeCompare(b.id);
  });
}

/** Return the display name for a model */
export function getModelDisplayName(model) {
  return model.name && model.name !== model.id ? model.name : model.id;
}

/** Group models by provider into sorted buckets, ordered by PROVIDER_ORDER */
export function groupedModels(models) {
  const groups = {};
  for (const m of models) {
    const p = MAIN_PROVIDERS.has(m.provider) ? m.provider : OTHER_PROVIDER;
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  }
  const predefined = [...PROVIDER_ORDER, OTHER_PROVIDER].filter((p) => groups[p]);
  const extra = Object.keys(groups).filter((p) => !predefined.includes(p)).sort();
  return [...predefined, ...extra].map((p) => ({ provider: p, models: sortModels(groups[p]) }));
}

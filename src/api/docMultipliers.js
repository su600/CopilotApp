/**
 * Fetch and parse annual-plan model multiplier data from the official GitHub Copilot docs page.
 * @see https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing#model-multipliers-for-annual-copilot-pro-and-copilot-pro-subscribers
 */

const DOCS_URL = '/github-docs/en/copilot/reference/copilot-billing/models-and-pricing';
export const ANNUAL_PLAN_EFFECTIVE_DATE = '2026-06-01';

/**
 * Normalize a human-readable model name from the docs table into the kebab-case
 * identifier used by the Copilot API.
 *
 * Examples:
 *   "Claude Haiku 4.5" → "claude-haiku-4.5"
 *   "GPT-5.1-Codex"    → "gpt-5.1-codex"
 *   "GPT-5.4 mini"     → "gpt-5.4-mini"
 *   "Claude Opus 4.6 (fast mode) (preview)" → "claude-opus-4.6-fast-mode-preview"
 */
function normalizeModelName(name) {
  return name
    .trim()
    .toLowerCase()
    // Replace any sequence of characters not allowed in API ids with a single hyphen
    .replace(/[^a-z0-9.-]+/g, '-')
    // Trim leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse a multiplier cell value.
 * Returns the numeric multiplier, or null for "Not applicable" / unparseable values.
 */
function parseMultiplierCell(text) {
  const trimmed = (text || '').trim().toLowerCase();
  if (!trimmed || trimmed === 'not applicable' || trimmed === 'n/a' || trimmed === '—') {
    return null;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse the annual-plan model multiplier HTML table from the docs page.
 *
 * Returns a map keyed by normalized model id:
 *   { "claude-haiku-4.5": { currentMultiplier: 0.33, annualMultiplier: 0.33 }, … }
 *
 * If a model entry in the table has parenthesised qualifiers such as
 * "(fast mode) (preview)", an additional entry without those qualifiers is
 * stored *only* when it does not conflict with another entry.
 */
function parseAnnualPlanMultiplierTable(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');

  for (const table of tables) {
    const headers = [...table.querySelectorAll('thead th')].map((h) =>
      h.textContent.trim().toLowerCase().replace(/\s+/g, ' ')
    );
    const currentIndex = headers.indexOf('current multiplier');
    const annualIndex = headers.indexOf('new multiplier');
    if (!headers[0]?.startsWith('model') || currentIndex === -1 || annualIndex === -1) continue;

    const rows = table.querySelectorAll('tbody tr');
    const result = {};

    for (const row of rows) {
      const modelName = row.querySelector('th')?.textContent?.trim();
      if (!modelName) continue;

      const cells = row.querySelectorAll('td');
      const currentMultiplier = parseMultiplierCell(cells[currentIndex - 1]?.textContent);
      const annualMultiplier = parseMultiplierCell(cells[annualIndex - 1]?.textContent);

      const fullKey = normalizeModelName(modelName);
      result[fullKey] = { currentMultiplier, annualMultiplier };

      // If the name contains parenthesised qualifiers, also store a cleaned key
      // (e.g. "claude-opus-4.6") so preview models still match when the API uses
      // the shorter id. Skip if it would overwrite an existing entry.
      const cleanKey = normalizeModelName(modelName.replace(/\s*\([^)]*\)/g, ''));
      if (cleanKey !== fullKey && !(cleanKey in result)) {
        result[cleanKey] = { currentMultiplier, annualMultiplier };
      }
    }

    return result;
  }

  return {};
}

/**
 * Fetch the annual-plan model multiplier table from GitHub's official Copilot billing docs.
 *
 * Returns a map of normalized model id → { currentMultiplier, annualMultiplier }.
 * On network failure or parse error the promise rejects.
 */
export async function fetchAnnualPlanMultipliers() {
  const response = await fetch(DOCS_URL, { headers: { Accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(`Failed to fetch docs page: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const map = parseAnnualPlanMultiplierTable(html);
  if (Object.keys(map).length === 0) {
    throw new Error('Could not find the annual-plan multiplier table in the docs page');
  }
  console.log('[CopilotApp] Parsed annual-plan doc multipliers:', map);
  return map;
}

/**
 * Look up a model id in the doc multiplier map.
 * Tries exact match first, then falls back to stripping a "-preview" suffix.
 */
function lookupDocMultiplier(docMap, modelId) {
  const id = modelId.toLowerCase();
  if (docMap[id]) return docMap[id];

  // Fallback: try without "-preview" suffix (many preview models share the
  // same multiplier as their non-preview counterpart).
  const withoutPreview = id.replace(/-preview$/, '');
  if (withoutPreview !== id && docMap[withoutPreview]) return docMap[withoutPreview];

  return null;
}

/**
 * Merge annual-plan doc data into a list of model objects returned by fetchModels().
 *
 * @param {Array} models - model array from fetchModels()
 * @param {object} docMap - map from fetchAnnualPlanMultipliers()
 * @returns {Array} new model array with annual-plan multiplier metadata
 */
export function applyAnnualPlanMultipliers(models, docMap) {
  return models.map((model) => {
    const doc = lookupDocMultiplier(docMap, model.id);
    if (!doc) return model;

    return {
      ...model,
      annualPlanCurrentMultiplier: doc.currentMultiplier ?? null,
      annualPlanMultiplier: doc.annualMultiplier ?? null,
      annualPlanEffectiveDate: ANNUAL_PLAN_EFFECTIVE_DATE,
    };
  });
}

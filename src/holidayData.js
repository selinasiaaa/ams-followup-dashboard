export const HOLIDAY_SOURCE = 'https://malaysia-holiday.dydxsoft.my';
export const STATE_CODES = { JHR: 'Johor', KDH: 'Kedah', KTN: 'Kelantan', MLK: 'Melaka', NSN: 'Negeri Sembilan', PHG: 'Pahang', PNG: 'Penang', PRK: 'Perak', PLS: 'Perlis', SBH: 'Sabah', SWK: 'Sarawak', SGR: 'Selangor', TRG: 'Terengganu', KUL: 'Kuala Lumpur', PJY: 'Putrajaya', LBN: 'Labuan' };
export const CACHE_KEY = 'ams-holiday-feed-v1';
export const MANUAL_KEY = 'ams-holiday-manual-v1';
export const DAY_MS = 86400000;

export function readSaved(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function normalizeHolidays(payload, year) {
  if (!Array.isArray(payload?.data) || !payload.data.length) throw new Error(`No published calendar is available for ${year} yet.`);
  return payload.data.map((row, index) => {
    const parsed = new Date(`${row.date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !row.date.startsWith(`${year}-`) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.date || !row.name?.trim() || !Array.isArray(row.state_codes) || !row.state_codes.length || row.state_codes.some(code => !STATE_CODES[code])) {
      throw new Error('The holiday provider returned an unrecognized calendar. Keeping saved dates.');
    }
    return { id: `feed-${year}-${index}`, name: row.name.trim(), date: row.date, states: [...new Set(row.state_codes.map(code => STATE_CODES[code]))], source: 'feed', sourceUrl: /^https:\/\//.test(row.source?.source_url || '') ? row.source.source_url : HOLIDAY_SOURCE, tentative: Boolean(row.is_subject_to_change) };
  });
}
export async function fetchHolidayYear(year) {
  const response = await fetch(`${HOLIDAY_SOURCE}/api/v1/holidays?year=${year}&include_source=1`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Holiday provider unavailable (${response.status}). Keeping saved dates.`);
  return { records: normalizeHolidays(await response.json(), year), fetchedAt: Date.now() };
}
export function appliesToState(holiday, state) {
  return state === 'All' || holiday.state === 'All' || holiday.state === state || holiday.states?.includes(state);
}
// Replace only the untouched bundled examples once a published year is available.
// User additions and edits stay in the effective schedule and in storage.
export function mergeHolidays(manual, cache, defaults) {
  const bundled = new Map(defaults.map(h => [h.id, h]));
  return [...manual.filter(h => {
    const original = bundled.get(h.id);
    const untouched = original && original.date === h.date && original.name === h.name && original.state === h.state;
    return !untouched || !cache[h.date.slice(0, 4)]?.records?.length;
  }), ...Object.values(cache).flatMap(entry => entry.records || [])];
}

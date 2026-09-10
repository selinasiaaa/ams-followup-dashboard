import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_KEY, DAY_MS, fetchHolidayYear, readSaved, saveLocal } from './holidayData';

export default function useHolidayFeed(yearsKey) {
  const [cache, setCache] = useState(() => readSaved(CACHE_KEY, {}));
  const [status, setStatus] = useState({});
  const cacheRef = useRef(cache);
  const pending = useRef(new Map());
  const refresh = useCallback((year, force = false) => {
    if (pending.current.has(year)) return pending.current.get(year);
    if (!force && Date.now() - (cacheRef.current[year]?.fetchedAt || 0) < DAY_MS) return Promise.resolve();
    const job = (async () => {
      setStatus(prev => ({ ...prev, [year]: { loading: true } }));
      try {
        const entry = await fetchHolidayYear(year);
        cacheRef.current = { ...cacheRef.current, [year]: entry };
        const saved = saveLocal(CACHE_KEY, cacheRef.current);
        setCache(cacheRef.current);
        setStatus(prev => ({ ...prev, [year]: { error: saved ? '' : 'Calendar loaded, but this browser could not save an offline copy.' } }));
      } catch (error) {
        setStatus(prev => ({ ...prev, [year]: { error: error.message } }));
      } finally { pending.current.delete(year); }
    })();
    pending.current.set(year, job);
    return job;
  }, []);
  useEffect(() => {
    const update = () => {
      const current = new Date().getFullYear();
      const years = new Set([current, current + 1, ...yearsKey.split(',').filter(Boolean).map(Number)]);
      years.forEach(year => { if (year >= 2000 && year <= 2100) void refresh(year); });
    };
    update();
    const interval = setInterval(update, DAY_MS);
    window.addEventListener('online', update);
    return () => { clearInterval(interval); window.removeEventListener('online', update); };
  }, [yearsKey, refresh]);
  return { cache, status, refresh };
}

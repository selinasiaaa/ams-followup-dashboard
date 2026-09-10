import { useEffect, useState } from 'react';
import { appliesToState, HOLIDAY_SOURCE } from './holidayData';
import './holidayCalendar.css';

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const months = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1).toLocaleDateString('en-GB', { month: 'long' }));
const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HolidayCalendar({ holidays, setHolidays, operatingState, setOperatingState, requestDelete, feed, states }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(iso(now));
  const [viewState, setViewState] = useState(operatingState);
  const [form, setForm] = useState(null);
  const entry = feed.cache[year];
  const status = feed.status[year] || {};
  const refresh = feed.refresh;
  useEffect(() => { void refresh(year); }, [year, refresh]);
  const visible = holidays.filter(h => h.date.startsWith(`${year}-`) && appliesToState(h, viewState));
  const byDay = new Map();
  visible.forEach(h => byDay.set(h.date, [...(byDay.get(h.date) || []), h]));
  const selectedHolidays = byDay.get(selected) || [];
  const monthCount = visible.filter(h => Number(h.date.slice(5, 7)) === month + 1).length;
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const changeMonth = (nextYear, nextMonth) => {
    const date = new Date(nextYear, nextMonth, 1);
    if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return;
    setYear(date.getFullYear()); setMonth(date.getMonth()); setSelected(iso(date)); setForm(null);
  };
  const save = event => {
    event.preventDefault();
    if (!form.name.trim() || !form.date) return;
    const record = { ...form, name: form.name.trim(), id: form.id || `manual-${crypto.randomUUID()}` };
    setHolidays(prev => form.id ? prev.map(h => h.id === form.id ? record : h) : [...prev, record]);
    const date = new Date(`${form.date}T12:00:00`);
    setYear(date.getFullYear()); setMonth(date.getMonth()); setSelected(form.date); setForm(null);
  };
  return <section className="holiday-calendar">
    <header className="holiday-heading"><div><span className="holiday-eyebrow">PLAN YOUR WORKING DAYS</span><h2>Public holiday calendar</h2><p>Explore Malaysian holidays by year, month and state. Select a day for details.</p></div><button type="button" disabled={status.loading} onClick={() => refresh(year, true)}>{status.loading ? 'Updating…' : 'Refresh holidays'}</button></header>
    <div className="holiday-office"><div><strong>Office scheduling state</strong><p>Follow-up dates use holidays for this state. Previewing another state below does not change your schedule.</p></div><label>Office state<select value={operatingState} onChange={e => setOperatingState(e.target.value)}>{states.filter(s => s !== 'All').map(s => <option key={s}>{s}</option>)}</select></label></div>
    <div className="holiday-feed-status" role="status">
      {status.loading ? `Checking published holidays for ${year}…` : entry ? `Updated ${new Date(entry.fetchedAt).toLocaleString('en-GB')}.` : `No live calendar loaded for ${year}. Saved entries are shown where available.`}
      {status.error && <p className="holiday-warning">{status.error} {entry ? 'Showing the last saved calendar.' : 'Follow-up dates may be incomplete for this year.'}</p>}
      <p>Automatically checks daily while the app is open and loads the new year on your next visit. <a href={`${HOLIDAY_SOURCE}/api/docs`} target="_blank" rel="noreferrer">Malaysia Holiday API</a> is an independent provider; source links appear in holiday details. Additional or replacement holidays may need a manual entry.</p>
    </div>
    <div className="holiday-toolbar"><div className="holiday-month-nav"><button aria-label="Previous month" disabled={year === 2000 && month === 0} onClick={() => changeMonth(year, month - 1)}>←</button><h3>{months[month]} {year}</h3><button aria-label="Next month" disabled={year === 2100 && month === 11} onClick={() => changeMonth(year, month + 1)}>→</button></div><div className="holiday-filters"><button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(iso(now)); }}>Today</button><label>Year<select value={year} onChange={e => changeMonth(Number(e.target.value), month)}>{Array.from({ length: 101 }, (_, i) => 2000 + i).map(y => <option key={y}>{y}</option>)}</select></label><label>Month<select value={month} onChange={e => changeMonth(year, Number(e.target.value))}>{months.map((m, i) => <option key={m} value={i}>{m}</option>)}</select></label><label>Preview state<select value={viewState} onChange={e => setViewState(e.target.value)}>{states.map(s => <option key={s} value={s}>{s === 'All' ? 'All states' : s}</option>)}</select></label></div></div>
    <div className="holiday-layout"><div className="holiday-month"><div className="holiday-weekdays">{weekday.map(day => <span key={day}>{day}</span>)}</div><div className="holiday-days">{Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
      const day = index - offset + 1;
      if (day < 1 || day > days) return <div className="holiday-blank" key={index} />;
      const date = iso(new Date(year, month, day));
      const events = byDay.get(date) || [];
      return <button key={date} type="button" className={`holiday-day ${events.length ? 'has-holiday' : ''} ${selected === date ? 'is-selected' : ''} ${date === iso(now) ? 'is-today' : ''}`} aria-pressed={selected === date} aria-label={`${date}${events.length ? ': ' + events.map(h => h.name).join(', ') : ': No holiday listed'}`} onClick={() => { setSelected(date); setForm(null); }}><span className="holiday-day-number">{day}</span>{events.slice(0, 2).map(h => <span className="holiday-day-name" key={h.id}>{h.name}</span>)}{events.length > 2 && <span className="holiday-day-name">+{events.length - 2} more</span>}{events.length > 0 && <span className="holiday-dot" aria-hidden="true" />}</button>;
    })}</div><footer>{monthCount} holiday entries this month · Coloured days have holidays. Dates subject to confirmation are marked in the details.</footer></div>
    <aside className="holiday-detail"><span className="holiday-eyebrow">SELECTED DAY</span><h3>{new Date(`${selected}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3><p>{viewState === 'All' ? 'All states and territories' : viewState}</p>
      {!selectedHolidays.length && <div className="holiday-empty">No holiday listed for this day.{!entry && <p>The provider’s calendar for this year has not been loaded.</p>}</div>}
      {selectedHolidays.map(h => <article key={h.id} className="holiday-event"><strong>{h.name}</strong><p>{h.states ? h.states.join(' · ') : h.state === 'All' ? 'All states' : h.state}</p>{h.tentative && <span className="holiday-warning">Subject to official confirmation</span>}{h.source === 'feed' ? <a href={h.sourceUrl} target="_blank" rel="noreferrer">View published source ↗</a> : <><span className="holiday-eyebrow">Saved / manual entry</span><div className="holiday-event-actions"><button onClick={() => setForm({ id: h.id, date: h.date, name: h.name, state: h.state })}>Edit</button><button onClick={() => requestDelete(`Delete the manual holiday "${h.name}"? This changes working-day calculations.`, () => setHolidays(prev => prev.filter(item => item.id !== h.id)))}>Delete</button></div></>}</article>)}
      <button className="holiday-add" onClick={() => setForm({ date: selected, name: '', state: operatingState })}>+ Add manual holiday</button>
      {form && <form onSubmit={save} className="holiday-form"><label>Date<input required type="date" min="2000-01-01" max="2100-12-31" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label><label>Holiday name<input autoFocus required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Applies to<select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>{states.map(s => <option key={s}>{s}</option>)}</select></label><div className="holiday-event-actions"><button type="submit">Save holiday</button><button type="button" onClick={() => setForm(null)}>Cancel</button></div></form>}
    </aside></div>
  </section>;
}

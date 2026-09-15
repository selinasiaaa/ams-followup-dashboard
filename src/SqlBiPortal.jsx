import { useEffect, useState } from "react";
import { BarChart3, Database, FileText, LogOut, RefreshCw, Server, Table2 } from "lucide-react";

const NAVY = "#12172B";
const TEAL = "#0F8A82";
const LINE = "#E7E5DE";

const apiUrl = () => String(import.meta.env.VITE_SQL_BI_API_URL || "")
  .replace(/^http:\/\/localhost:8010$/, "http://127.0.0.1:8010")
  .replace(/\/$/, "");

async function readApi(path) {
  const base = apiUrl();
  if (!base) throw new Error("SQL BI server address has not been configured yet.");
  const response = await fetch(`${base}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Could not reach SQL BI server.");
  return response.json();
}

async function postApi(path, payload) {
  const base = apiUrl();
  if (!base) throw new Error("SQL BI server address has not been configured yet.");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || "Could not load SQL BI report.");
  return response.json();
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

function amount(value) {
  return `RM ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm" style={{ background: active ? "rgba(15,138,130,0.18)" : "transparent", color: active ? "#5FD8CC" : "#B7B9C6" }}><Icon size={16} /><span>{label}</span></button>;
}

export default function SqlBiPortal({ onSignOut }) {
  const [page, setPage] = useState("dashboard");
  const [status, setStatus] = useState({ loading: true, data: null, error: "" });
  const [tables, setTables] = useState({ loading: false, data: [], error: "" });
  const [report, setReport] = useState({ loading: false, data: null, error: "" });
  const [selectedDcf, setSelectedDcf] = useState("");
  const [fdbs, setFdbs] = useState([]);
  const [selection, setSelection] = useState({ fdb: "", loading: false, error: "" });
  const [quotations, setQuotations] = useState({ loading: false, columns: [], rows: [], error: "" });

  const refreshStatus = async () => {
    setStatus({ loading: true, data: null, error: "" });
    try { setStatus({ loading: false, data: await readApi("/api/access/status"), error: "" }); }
    catch (error) { setStatus({ loading: false, data: null, error: error.message }); }
  };
  const loadTables = async () => {
    setTables({ loading: true, data: [], error: "" });
    try { const result = await readApi("/api/tables"); setTables({ loading: false, data: result.tables || [], error: "" }); }
    catch (error) { setTables({ loading: false, data: [], error: error.message }); }
  };
  const loadReport = async () => {
    setReport({ loading: true, data: null, error: "" });
    const end = localDateString();
    try {
      const data = await postApi("/api/reporting/profit-loss", {
        start: `${new Date().getFullYear()}-01-01`,
        end,
        columns: ["current", "ytd"],
        basis: "POSTDATE",
      });
      setReport({ loading: false, data, error: "" });
    } catch (error) {
      setReport({ loading: false, data: null, error: error.message });
    }
  };
  const loadQuotations = async () => {
    setQuotations({ loading: true, columns: [], rows: [], error: "" });
    try {
      const result = await readApi("/api/documents/SL_QT?limit=500");
      setQuotations({ loading: false, columns: result.columns || [], rows: result.rows || [], error: "" });
    } catch (error) { setQuotations({ loading: false, columns: [], rows: [], error: error.message }); }
  };
  const loadFdbs = async (dcf) => {
    setSelectedDcf(dcf);
    setFdbs([]);
    setSelection({ fdb: "", loading: true, error: "" });
    if (!dcf) { setSelection({ fdb: "", loading: false, error: "" }); return; }
    try {
      const result = await postApi("/api/access/fdbs", { dcf });
      const available = (result.fdbs || []).filter((item) => item.available);
      setFdbs(available);
      setSelection({ fdb: "", loading: false, error: available.length ? "" : "No available FDB database was found in this DCF." });
    } catch (error) { setSelection({ fdb: "", loading: false, error: error.message }); }
  };
  const chooseDatabase = async () => {
    if (!selectedDcf || !selection.fdb) return;
    setSelection((current) => ({ ...current, loading: true, error: "" }));
    try {
      await postApi("/api/access/select-database", { dcf: selectedDcf, fdb: selection.fdb });
      setSelection({ fdb: selection.fdb, loading: false, error: "" });
      await refreshStatus();
    } catch (error) { setSelection((current) => ({ ...current, loading: false, error: error.message })); }
  };
  useEffect(() => { refreshStatus(); }, []);
  useEffect(() => { if (page === "tables") loadTables(); }, [page]);
  useEffect(() => { if (page === "reports" && !report.data && !report.loading) loadReport(); }, [page]);
  useEffect(() => { if (page === "quotations" && !quotations.rows.length && !quotations.loading) loadQuotations(); }, [page]);

  const connected = Boolean(status.data?.database_ready);
  return <div className="flex min-h-screen" style={{ background: "#F6F5F1", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
    <aside className="w-60 shrink-0 p-3 flex flex-col" style={{ background: NAVY }}>
      <div className="px-2.5 pt-2 pb-5"><div className="text-white font-semibold">SQL Accounting BI</div><div className="text-[11px]" style={{ color: "#7B7E92" }}>Read-only office dashboard</div></div>
      <nav className="flex flex-col gap-1"><NavButton icon={BarChart3} label="Dashboard" active={page === "dashboard"} onClick={() => setPage("dashboard")} /><NavButton icon={FileText} label="Reports" active={page === "reports"} onClick={() => setPage("reports")} /><NavButton icon={FileText} label="SQL Quotations" active={page === "quotations"} onClick={() => setPage("quotations")} /><NavButton icon={Table2} label="Database Tables" active={page === "tables"} onClick={() => setPage("tables")} /></nav>
      <div className="mt-auto border-t pt-3" style={{ borderColor: "#262B45" }}><button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg" style={{ color: "#B7B9C6", background: "#1E2340" }}><LogOut size={13} /> Return to sign in</button></div>
    </aside>
    <main className="flex-1 min-w-0 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-6"><div><h1 className="text-xl font-semibold" style={{ color: NAVY }}>SQL Accounting BI</h1><p className="text-xs mt-1" style={{ color: "#6B6F76" }}>Separate, read-only workspace based on the supplied SQL BI project.</p></div><button onClick={refreshStatus} className="text-xs px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={13} /> Refresh connection</button></div>
      {!connected && <div className="rounded-xl border p-4 mb-5" style={{ borderColor: status.error ? "#D99A34" : LINE, background: "#FFF9EE" }}><div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#9A640B" }}><Server size={16} /> {status.error ? "Office SQL BI service not connected" : "Choose a database to continue"}</div><p className="text-xs mt-1" style={{ color: "#6B6F76" }}>{status.loading ? "Checking the configured SQL BI server…" : status.error || "Select a DCF file, then an FDB database, just like the original SQL BI portal."}</p><p className="text-[11px] mt-2" style={{ color: "#8B8C92" }}>This page never reads or writes the Follow-up Firestore collections.</p></div>}
      {!connected && !status.error && !status.loading && <DatabasePicker dcfs={status.data?.dcfs || []} selectedDcf={selectedDcf} fdbs={fdbs} selectedFdb={selection.fdb} loading={selection.loading} error={selection.error} onDcfChange={loadFdbs} onFdbChange={(fdb) => setSelection((current) => ({ ...current, fdb, error: "" }))} onSubmit={chooseDatabase} />}
      {page === "dashboard" && <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><InfoCard label="Connection" value={connected ? "Ready" : "Not connected"} tint={connected ? TEAL : "#B4690E"} /><InfoCard label="Selected database" value={status.data?.fdb || "—"} /><InfoCard label="Access" value="Read-only" tint={TEAL} /><section className="md:col-span-3 rounded-xl border bg-white p-5" style={{ borderColor: LINE }}><h2 className="text-sm font-semibold" style={{ color: NAVY }}>Available BI pages</h2><p className="text-xs mt-2" style={{ color: "#6B6F76" }}>The supplied project contains Profit & Loss, Yearly Sales Analysis, Customer Statement, and database-table views. They will load here through the office server after its safe connection is configured.</p></section></div>}
      {page === "reports" && <ReportsPage report={report} onRefresh={loadReport} />}
      {page === "quotations" && <SqlQuotationsPage quotations={quotations} onRefresh={loadQuotations} />}
      {page === "tables" && <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}><div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: LINE }}><h2 className="text-sm font-semibold" style={{ color: NAVY }}>Database Tables</h2><span className="text-xs" style={{ color: "#8B8C92" }}>{tables.loading ? "Loading…" : `${tables.data.length} tables`}</span></div>{tables.error ? <p className="p-5 text-xs" style={{ color: "#B4690E" }}>{tables.error}</p> : <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{tables.data.map((table) => <div key={table} className="text-xs rounded-lg border px-3 py-2" style={{ borderColor: LINE, color: "#5C5D63" }}><Database size={12} className="inline mr-1.5" />{table}</div>)}</div>}</section>}
    </main>
  </div>;
}

function SqlQuotationsPage({ quotations, onRefresh }) {
  return <div className="flex flex-col gap-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold" style={{ color: NAVY }}>SQL Accounting Quotations</h2><p className="text-xs mt-1" style={{ color: "#6B6F76" }}>Live read-only quotation records from the selected Firebird database.</p></div><button onClick={onRefresh} className="text-xs px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={13} /> Refresh quotations</button></div>{quotations.loading && <div className="rounded-xl border bg-white p-5 text-xs" style={{ borderColor: LINE, color: "#6B6F76" }}>Reading quotations from Firebird…</div>}{quotations.error && <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#D99A34", background: "#FFF9EE", color: "#8B5A08" }}>Quotations could not be loaded: {quotations.error}</div>}{!quotations.loading && !quotations.error && <section className="rounded-xl border bg-white overflow-auto" style={{ borderColor: LINE }}><div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: LINE }}><h3 className="text-sm font-semibold" style={{ color: NAVY }}>Sales Quotations</h3><span className="text-xs" style={{ color: "#8B8C92" }}>{quotations.rows.length} records</span></div>{quotations.rows.length ? <table className="w-full min-w-[760px] text-xs"><thead><tr className="text-left uppercase tracking-wide" style={{ color: "#8B8C92" }}>{quotations.columns.map((column) => <th key={column} className="px-4 py-3 whitespace-nowrap">{column}</th>)}</tr></thead><tbody>{quotations.rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t" style={{ borderColor: LINE }}>{quotations.columns.map((column, cellIndex) => <td key={`${column}-${cellIndex}`} className="px-4 py-3 whitespace-nowrap" style={{ color: "#30323A" }}>{row[cellIndex] === null || row[cellIndex] === undefined ? "—" : String(row[cellIndex])}</td>)}</tr>)}</tbody></table> : <p className="p-5 text-xs" style={{ color: "#6B6F76" }}>No sales quotations were found in this database.</p>}</section>}</div>;
}

function DatabasePicker({ dcfs, selectedDcf, fdbs, selectedFdb, loading, error, onDcfChange, onFdbChange, onSubmit }) {
  return <section className="rounded-xl border bg-white p-5 mb-5 max-w-2xl" style={{ borderColor: LINE }}><h2 className="text-sm font-semibold" style={{ color: NAVY }}>Open SQL Accounting database</h2><p className="text-xs mt-1 mb-4" style={{ color: "#6B6F76" }}>Choose the DCF file and the company FDB database used by the original BI project.</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs font-medium" style={{ color: "#5C5D63" }}>DCF file<select value={selectedDcf} onChange={(event) => onDcfChange(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ borderColor: LINE }}><option value="">Choose a DCF file</option>{dcfs.map((dcf) => <option key={dcf} value={dcf}>{dcf}</option>)}</select></label><label className="text-xs font-medium" style={{ color: "#5C5D63" }}>FDB database<select value={selectedFdb} onChange={(event) => onFdbChange(event.target.value)} disabled={!selectedDcf || loading} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:bg-[#F6F5F1]" style={{ borderColor: LINE }}><option value="">{loading ? "Loading databases…" : selectedDcf ? "Choose an FDB database" : "Choose a DCF file first"}</option>{fdbs.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label></div>{error && <p className="text-xs mt-3" style={{ color: "#B4690E" }}>{error}</p>}<button type="button" onClick={onSubmit} disabled={!selectedDcf || !selectedFdb || loading} className="mt-4 text-xs font-medium px-4 py-2.5 rounded-lg disabled:opacity-50" style={{ background: NAVY, color: "white" }}>{loading ? "Opening database…" : "Open dashboard"}</button></section>;
}

function ReportsPage({ report, onRefresh }) {
  const data = report.data;
  const columns = data?.columns || [];
  return <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold" style={{ color: NAVY }}>Profit & Loss</h2><p className="text-xs mt-1" style={{ color: "#6B6F76" }}>Read-only Statement of Comprehensive Income from SQL Accounting.</p></div><button onClick={onRefresh} className="text-xs px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={13} /> Refresh report</button></div>
    {report.loading && <div className="rounded-xl border bg-white p-5 text-xs" style={{ borderColor: LINE, color: "#6B6F76" }}>Loading report from Firebird…</div>}
    {report.error && <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#D99A34", background: "#FFF9EE", color: "#8B5A08" }}>Report could not be loaded: {report.error}</div>}
    {data && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{["net_sales", "gross_profit", "net_profit_before_tax", "net_profit_after_tax"].map((key) => <div key={key} className="rounded-xl border bg-white p-4" style={{ borderColor: LINE }}><div className="text-[10px] uppercase tracking-wide" style={{ color: "#8B8C92" }}>{key.replaceAll("_", " ")}</div><div className="text-lg font-semibold mt-1" style={{ color: NAVY }}>{amount(data.summaries?.current?.[key])}</div></div>)}</div>
      <section className="rounded-xl border bg-white overflow-auto" style={{ borderColor: LINE }}><div className="px-5 py-4 border-b" style={{ borderColor: LINE }}><h3 className="text-sm font-semibold" style={{ color: NAVY }}>{data.title}</h3><p className="text-[11px] mt-1" style={{ color: "#8B8C92" }}>{data.filters?.from_date} to {data.filters?.to_date} · {data.date_field}</p></div><table className="w-full min-w-[560px] text-xs"><thead><tr className="text-left uppercase tracking-wide" style={{ color: "#8B8C92" }}><th className="px-5 py-3">Account / Section</th>{columns.map((column) => <th key={column.key} className="px-3 py-3 text-right">{column.label}</th>)}</tr></thead><tbody>{data.sections?.map((section) => <tr key={section.code} className="border-t" style={{ borderColor: LINE }}><td className="px-5 py-3 font-semibold" style={{ color: NAVY }}>{section.label}</td>{columns.map((column) => <td key={column.key} className="px-3 py-3 text-right font-semibold" style={{ color: NAVY }}>{amount(section.totals?.[column.key])}</td>)}</tr>)}{[["Net sales", "net_sales"], ["Gross profit", "gross_profit"], ["Net profit before tax", "net_profit_before_tax"], ["Net profit after tax", "net_profit_after_tax"]].map(([label, metric]) => <tr key={metric} className="border-t" style={{ borderColor: LINE, background: "#F8FAFA" }}><td className="px-5 py-3 font-semibold" style={{ color: TEAL }}>{label}</td>{columns.map((column) => <td key={column.key} className="px-3 py-3 text-right font-semibold" style={{ color: TEAL }}>{amount(data.summaries?.[column.key]?.[metric])}</td>)}</tr>)}</tbody></table></section>
    </>}
  </div>;
}

function InfoCard({ label, value, tint = NAVY }) { return <div className="rounded-xl border bg-white p-4" style={{ borderColor: LINE }}><div className="text-[10px] uppercase tracking-wide" style={{ color: "#8B8C92" }}>{label}</div><div className="text-lg font-semibold mt-1 truncate" style={{ color: tint }}>{value}</div></div>; }

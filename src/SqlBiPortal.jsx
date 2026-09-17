import { useEffect, useState } from "react";
import { BarChart3, Database, FileText, LockKeyhole, LogOut, RefreshCw, Server, Table2 } from "lucide-react";

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
  const [tablePreview, setTablePreview] = useState({ name: "", loading: false, columns: [], rows: [], error: "" });
  const [report, setReport] = useState({ loading: false, data: null, error: "" });
  const [selectedDcf, setSelectedDcf] = useState("");
  const [fdbs, setFdbs] = useState([]);
  const [selection, setSelection] = useState({ fdb: "", loading: false, error: "" });
  const [quotations, setQuotations] = useState({ loading: false, columns: [], rows: [], error: "" });

  const refreshStatus = async () => {
    setStatus({ loading: true, data: null, error: "" });
    try {
      const data = await readApi("/api/access/status");
      if (!data.logged_in) {
        onSignOut();
        return;
      }
      setStatus({ loading: false, data, error: "" });
    }
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
      const result = await readApi("/api/sales-quotations?limit=500");
      setQuotations({ loading: false, columns: result.columns || [], rows: result.rows || [], error: "" });
    } catch (error) { setQuotations({ loading: false, columns: [], rows: [], error: error.message }); }
  };
  const loadTablePreview = async (name) => {
    setTablePreview({ name, loading: true, columns: [], rows: [], error: "" });
    try {
      const result = await readApi(`/api/table/${encodeURIComponent(name)}?limit=100`);
      setTablePreview({ name, loading: false, columns: result.columns || [], rows: result.rows || [], error: "" });
    } catch (error) { setTablePreview({ name, loading: false, columns: [], rows: [], error: error.message }); }
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

  if (!connected) {
    return <DatabaseGate
      status={status}
      selectedDcf={selectedDcf}
      fdbs={fdbs}
      selectedFdb={selection.fdb}
      loading={selection.loading}
      error={selection.error}
      onDcfChange={loadFdbs}
      onFdbChange={(fdb) => setSelection((current) => ({ ...current, fdb, error: "" }))}
      onSubmit={chooseDatabase}
      onRefresh={refreshStatus}
      onSignOut={onSignOut}
    />;
  }

  return <div className="flex min-h-screen" style={{ background: "#F6F5F1", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
    <aside className="w-60 shrink-0 p-3 flex flex-col" style={{ background: NAVY }}>
      <div className="px-2.5 pt-2 pb-5"><div className="text-white font-semibold">SQL Accounting BI</div><div className="text-[11px]" style={{ color: "#7B7E92" }}>Read-only office dashboard</div></div>
      <nav className="flex flex-col gap-1"><NavButton icon={BarChart3} label="Dashboard" active={page === "dashboard"} onClick={() => setPage("dashboard")} /><NavButton icon={FileText} label="Reports" active={page === "reports"} onClick={() => setPage("reports")} /><NavButton icon={FileText} label="SQL Quotations" active={page === "quotations"} onClick={() => setPage("quotations")} /><NavButton icon={Table2} label="Database Tables" active={page === "tables"} onClick={() => setPage("tables")} /></nav>
      <div className="mt-auto border-t pt-3" style={{ borderColor: "#262B45" }}><button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg" style={{ color: "#B7B9C6", background: "#1E2340" }}><LogOut size={13} /> Return to sign in</button></div>
    </aside>
    <main className="flex-1 min-w-0 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-3 mb-6"><div><h1 className="text-xl font-semibold" style={{ color: NAVY }}>SQL Accounting BI</h1><p className="text-xs mt-1" style={{ color: "#6B6F76" }}>Separate, read-only workspace based on the supplied SQL BI project.</p></div><button onClick={refreshStatus} className="text-xs px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={13} /> Refresh connection</button></div>
      {page === "dashboard" && <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><InfoCard label="Connection" value={connected ? "Ready" : "Not connected"} tint={connected ? TEAL : "#B4690E"} /><InfoCard label="Selected database" value={status.data?.fdb || "—"} /><InfoCard label="Access" value="Read-only" tint={TEAL} /><section className="md:col-span-3 rounded-xl border bg-white p-5" style={{ borderColor: LINE }}><h2 className="text-sm font-semibold" style={{ color: NAVY }}>Available BI pages</h2><p className="text-xs mt-2" style={{ color: "#6B6F76" }}>The supplied project contains Profit & Loss, Yearly Sales Analysis, Customer Statement, and database-table views. They will load here through the office server after its safe connection is configured.</p></section></div>}
      {page === "reports" && <ReportsPage report={report} onRefresh={loadReport} />}
      {page === "quotations" && <SqlQuotationsPage quotations={quotations} onRefresh={loadQuotations} />}
      {page === "tables" && <DatabaseTablesPage tables={tables} preview={tablePreview} onOpen={loadTablePreview} />}
    </main>
  </div>;
}

function DatabaseGate({ status, selectedDcf, fdbs, selectedFdb, loading, error, onDcfChange, onFdbChange, onSubmit, onRefresh, onSignOut }) {
  const dcfs = status.data?.dcfs || [];
  const serviceError = status.error;
  const busy = status.loading || loading;

  return <div className="min-h-screen flex items-center justify-center px-5 py-10" style={{ background: "radial-gradient(circle at 78% 22%, #3C2378 0, #17173B 38%, #0B1126 78%)", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
    <div className="fixed inset-0 pointer-events-none opacity-30" style={{ background: "linear-gradient(135deg, transparent 15%, rgba(92,82,210,.35) 46%, transparent 47%), linear-gradient(25deg, transparent 58%, rgba(139,73,222,.22) 59%, transparent 73%)" }} />
    <section className="relative w-full max-w-md rounded-2xl border px-6 py-8 sm:px-9 sm:py-10 shadow-2xl" style={{ background: "rgba(14,18,39,.96)", borderColor: "#465078", color: "white" }}>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border" style={{ borderColor: "#7657E8", background: "rgba(104,75,222,.12)" }}><LockKeyhole size={24} style={{ color: "#F1B64B" }} /></div>
      <p className="text-center text-sm" style={{ color: "#C7CCE0" }}>Welcome to</p>
      <h1 className="mt-1 text-center text-2xl font-bold">SQL Accounting BI</h1>
      <p className="mt-4 text-center text-sm leading-6" style={{ color: "#C7CCE0" }}>Choose a DCF file, then select an FDB database listed inside it.</p>

      {serviceError ? <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "#9D6930", background: "rgba(157,105,48,.12)" }}><div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#F1B64B" }}><Server size={16} /> SQL BI service unavailable</div><p className="mt-1 text-xs leading-5" style={{ color: "#D7D9E4" }}>{serviceError}</p><button type="button" onClick={onRefresh} className="mt-3 text-xs underline" style={{ color: "#BBA8FF" }}>Try connection again</button></div> : <div className="mt-7 flex flex-col gap-4">
        <label className="text-sm" style={{ color: "#E3E5EE" }}>DCF file
          <select value={selectedDcf} onChange={(event) => onDcfChange(event.target.value)} disabled={busy} className="mt-1.5 w-full rounded-lg border px-3 py-3 text-sm outline-none disabled:opacity-60" style={{ borderColor: "#775024", background: "#10121B", color: "white" }}>
            <option value="">{status.loading ? "Loading DCF files…" : dcfs.length ? "Choose a DCF file" : "No DCF files found"}</option>
            {dcfs.map((dcf) => <option key={dcf} value={dcf}>{dcf}</option>)}
          </select>
        </label>
        <label className="text-sm" style={{ color: "#E3E5EE" }}>FDB database
          <select value={selectedFdb} onChange={(event) => onFdbChange(event.target.value)} disabled={!selectedDcf || busy} className="mt-1.5 w-full rounded-lg border px-3 py-3 text-sm outline-none disabled:opacity-55" style={{ borderColor: "#775024", background: "#10121B", color: "white" }}>
            <option value="">{loading ? "Loading databases…" : selectedDcf ? "Choose an FDB database" : "Choose a DCF file first"}</option>
            {fdbs.map((item) => <option key={item.name} value={item.name}>{item.company_name && item.company_name !== "Company name not recorded" ? `${item.company_name} — ${item.name}` : item.name}</option>)}
          </select>
        </label>
        {error && <p className="text-xs" style={{ color: "#F1B64B" }}>{error}</p>}
        <button type="button" onClick={onSubmit} disabled={!selectedDcf || !selectedFdb || busy} className="mt-1 rounded-lg py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45" style={{ background: "linear-gradient(90deg, #5C55E7, #9350EF)", color: "white" }}>{loading && selectedFdb ? "Opening dashboard…" : "Open dashboard"}</button>
      </div>}

      <button type="button" onClick={onSignOut} className="mx-auto mt-6 block text-xs" style={{ color: "#9298AF" }}>Return to sign in</button>
    </section>
    <p className="fixed bottom-4 text-[11px]" style={{ color: "#666C85" }}>© 2026 AMS Portal</p>
  </div>;
}

function SqlQuotationsPage({ quotations, onRefresh }) {
  return <div className="flex flex-col gap-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold" style={{ color: NAVY }}>SQL Accounting Quotations</h2><p className="text-xs mt-1" style={{ color: "#6B6F76" }}>Sales Quotation records only, enriched with Maintain Customer and Customer Branch information.</p></div><button onClick={onRefresh} className="text-xs px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={13} /> Refresh quotations</button></div>{quotations.loading && <div className="rounded-xl border bg-white p-5 text-xs" style={{ borderColor: LINE, color: "#6B6F76" }}>Reading quotations and customer information from Firebird…</div>}{quotations.error && <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#D99A34", background: "#FFF9EE", color: "#8B5A08" }}>Quotations could not be loaded: {quotations.error}</div>}{!quotations.loading && !quotations.error && <DataGrid title="Sales Quotations" columns={quotations.columns} rows={quotations.rows} empty="No sales quotations were found in this database." />}</div>;
}

function DatabaseTablesPage({ tables, preview, onOpen }) {
  const [query, setQuery] = useState("");
  const matches = tables.data.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4">
    <section className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
      <div className="px-4 py-4 border-b" style={{ borderColor: LINE }}><div className="flex items-center justify-between"><h2 className="text-sm font-semibold" style={{ color: NAVY }}>All Firebird Tables</h2><span className="text-xs" style={{ color: "#8B8C92" }}>{tables.loading ? "Loading…" : tables.data.length}</span></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search table name" className="mt-3 w-full rounded-lg border px-3 py-2 text-xs outline-none" style={{ borderColor: LINE }} /></div>
      {tables.error ? <p className="p-4 text-xs" style={{ color: "#B4690E" }}>{tables.error}</p> : <div className="max-h-[70vh] overflow-y-auto p-2">{matches.map((table) => <button type="button" key={table} onClick={() => onOpen(table)} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs" style={{ background: preview.name === table ? "#EEF6F5" : "transparent", color: preview.name === table ? TEAL : "#5C5D63" }}><Database size={13} /> <span className="truncate">{table}</span></button>)}{!matches.length && !tables.loading && <p className="p-3 text-xs" style={{ color: "#8B8C92" }}>No matching table.</p>}</div>}
    </section>
    <section className="min-w-0">{!preview.name ? <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: LINE }}><Database size={28} className="mx-auto" style={{ color: "#A9ABB2" }} /><h3 className="mt-3 text-sm font-semibold" style={{ color: NAVY }}>Choose any Firebird table</h3><p className="mt-1 text-xs" style={{ color: "#6B6F76" }}>A read-only preview of up to 100 rows will appear here.</p></div> : preview.loading ? <div className="rounded-xl border bg-white p-5 text-xs" style={{ borderColor: LINE, color: "#6B6F76" }}>Loading {preview.name}…</div> : preview.error ? <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#D99A34", background: "#FFF9EE", color: "#8B5A08" }}>{preview.error}</div> : <DataGrid title={preview.name} columns={preview.columns} rows={preview.rows} empty="This table has no rows." />}</section>
  </div>;
}

function DataGrid({ title, columns, rows, empty }) {
  return <section className="rounded-xl border bg-white overflow-auto" style={{ borderColor: LINE }}><div className="sticky left-0 px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: LINE }}><h3 className="text-sm font-semibold" style={{ color: NAVY }}>{title}</h3><span className="text-xs" style={{ color: "#8B8C92" }}>{rows.length} records · {columns.length} columns</span></div>{rows.length ? <table className="w-full min-w-max text-xs"><thead><tr className="text-left uppercase tracking-wide" style={{ color: "#8B8C92" }}>{columns.map((column, index) => <th key={`${column}-${index}`} className="px-4 py-3 whitespace-nowrap">{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t" style={{ borderColor: LINE }}>{columns.map((column, cellIndex) => <td key={`${column}-${cellIndex}`} className="max-w-72 truncate px-4 py-3 whitespace-nowrap" title={row[cellIndex] == null ? "" : String(row[cellIndex])} style={{ color: "#30323A" }}>{row[cellIndex] === null || row[cellIndex] === undefined || row[cellIndex] === "" ? "—" : String(row[cellIndex])}</td>)}</tr>)}</tbody></table> : <p className="p-5 text-xs" style={{ color: "#6B6F76" }}>{empty}</p>}</section>;
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

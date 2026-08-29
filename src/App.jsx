import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  LayoutDashboard, FileText, Users, Clock, MessageSquare,
  CalendarDays, BarChart3, Settings as SettingsIcon, Search, Bell, AlertTriangle,
  CheckCircle2, ChevronRight, X, Copy, Plus, Trash2, Pencil, Filter,
  TrendingUp, TrendingDown, CircleSlash, PhoneCall, Mail, UploadCloud,
  Building2, ChevronDown, Check, Globe2, History,
  ArrowRight, RefreshCw, Info, AlertCircle, LogOut, Lock, User, Save
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { browserLocalPersistence, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, FIREBASE_LOGIN_EMAIL } from "./firebase";
import { agentStore, customerStore, phoneStore, quotationStore, templateStore } from "./firestore";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* =========================================================================
  AMS-FOLLOWUP — Quotation Follow-up Console
  Data workflow: PDF quotation → Import Data page →
   mapped, validated, de-duplicated → merged into follow-up records.
   Design: "control tower" — deep ink sidebar, warm paper workspace,
   signal-colored status pills that read as traffic-control at a glance.
   ========================================================================= */

/* ---------------------------- Design tokens ---------------------------- */
const INK = "#12172B";
const PAPER = "#F6F5F1";
const LINE = "#E7E5DE";
const TEAL = "#0F8A82";
const TEAL_SOFT = "#E4F3F1";
const AMBER = "#B4690E";
const AMBER_SOFT = "#FBEEDD";
const RED = "#C23B3B";
const RED_SOFT = "#FBEAEA";
const BLUE = "#3A5FCD";
const BLUE_SOFT = "#E9EEFD";
const GREEN = "#2E7D4F";
const GREEN_SOFT = "#E7F3EC";
const GRAY = "#6B6F76";
const GRAY_SOFT = "#EEEDE8";
const VIOLET = "#7A5AC2";
const VIOLET_SOFT = "#EFEAFA";

const STATUS_STYLE = {
  "Due Today": { fg: AMBER, bg: AMBER_SOFT, icon: Clock },
  "Overdue": { fg: RED, bg: RED_SOFT, icon: AlertTriangle },
  "Upcoming": { fg: BLUE, bg: BLUE_SOFT, icon: CalendarDays },
  "Completed": { fg: GREEN, bg: GREEN_SOFT, icon: CheckCircle2 },
  "Won": { fg: GREEN, bg: GREEN_SOFT, icon: TrendingUp },
  "Lost": { fg: GRAY, bg: GRAY_SOFT, icon: TrendingDown },
  "No Response": { fg: VIOLET, bg: VIOLET_SOFT, icon: CircleSlash },
};

const DEFAULT_APP_NAME = "AMS-FOLLOWUP";

/* ------------------------------ Date utils ------------------------------ */
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYMD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (s) => (s ? parseYMD(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const diffCalendarDays = (a, b) => Math.round((a - b) / (1000 * 60 * 60 * 24));

function isHoliday(date, holidays, state) {
  const s = ymd(date);
  return holidays.some((h) => h.date === s && (h.state === "All" || h.state === state));
}
function isWorkingDay(date, holidays, state) {
  const day = date.getDay();
  if (day === 0) return false;
  if (isHoliday(date, holidays, state)) return false;
  return true;
}
function addWorkingDays(startDate, n, holidays, state) {
  const d = new Date(startDate);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, holidays, state)) count++;
  }
  return d;
}
function computeScheduleDates(docDateStr, stages, holidays, state) {
  let cursor = parseYMD(docDateStr);
  const dates = [];
  for (const stage of stages) {
    cursor = addWorkingDays(cursor, stage.workingDaysAfterPrevious, holidays, state);
    dates.push(new Date(cursor));
  }
  return dates;
}
const money = (n) => `RM ${Number(n || 0).toLocaleString("en-MY")}`;
const uid = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 10000)}`;

/* ------------------------------ Holidays & schedules ------------------------------ */
// Malaysia public holidays for 2026 — national holidays (state: "All") plus the main
// state-specific observances (royal birthdays, Thaipusam, Federal Territory Day, Gawai,
// Kaamatan, etc.), compiled from published 2026 Malaysia holiday calendars. Dates for
// Islamic holidays are subject to official JAKIM moon-sighting confirmation and may shift
// by a day — editable here like any other holiday.
const MY_STATES = ["All", "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Sabah", "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan"];
const DEFAULT_OPERATING_STATE = "Kuala Lumpur";

const DEFAULT_HOLIDAYS = [
  { id: "h01", date: "2026-01-01", name: "New Year's Day", state: "All" },
  { id: "h02", date: "2026-01-14", name: "Birthday of Yang di-Pertuan Besar", state: "Negeri Sembilan" },
  { id: "h03", date: "2026-01-17", name: "Isra and Mi'raj", state: "Kedah" },
  { id: "h04", date: "2026-01-17", name: "Isra and Mi'raj", state: "Negeri Sembilan" },
  { id: "h05", date: "2026-02-01", name: "Thaipusam", state: "Kuala Lumpur" },
  { id: "h06", date: "2026-02-01", name: "Thaipusam", state: "Putrajaya" },
  { id: "h07", date: "2026-02-01", name: "Thaipusam", state: "Selangor" },
  { id: "h08", date: "2026-02-01", name: "Thaipusam", state: "Perak" },
  { id: "h09", date: "2026-02-01", name: "Thaipusam", state: "Penang" },
  { id: "h10", date: "2026-02-01", name: "Thaipusam", state: "Negeri Sembilan" },
  { id: "h11", date: "2026-02-02", name: "Federal Territory Day", state: "Kuala Lumpur" },
  { id: "h12", date: "2026-02-02", name: "Federal Territory Day", state: "Putrajaya" },
  { id: "h13", date: "2026-02-02", name: "Federal Territory Day", state: "Labuan" },
  { id: "h14", date: "2026-02-17", name: "Chinese New Year", state: "All" },
  { id: "h15", date: "2026-02-18", name: "Chinese New Year (Day 2)", state: "All" },
  { id: "h16", date: "2026-02-20", name: "Independence Day Declaration Day", state: "Kedah" },
  { id: "h17", date: "2026-03-04", name: "Anniversary of the Coronation of the Sultan of Terengganu", state: "Terengganu" },
  { id: "h18", date: "2026-03-07", name: "Nuzul Al-Quran", state: "All" },
  { id: "h19", date: "2026-03-21", name: "Hari Raya Aidilfitri (Day 1)", state: "All" },
  { id: "h20", date: "2026-03-23", name: "Hari Raya Aidilfitri (Day 2, observed)", state: "All" },
  { id: "h21", date: "2026-03-23", name: "Birthday of the Sultan of Johor", state: "Johor" },
  { id: "h22", date: "2026-04-26", name: "Birthday of the Sultan of Terengganu", state: "Terengganu" },
  { id: "h23", date: "2026-05-01", name: "Labour Day", state: "All" },
  { id: "h24", date: "2026-05-17", name: "Birthday of the Raja of Perlis", state: "Perlis" },
  { id: "h25", date: "2026-05-22", name: "Pahang State Holiday (Hol Sultan Ahmad Shah)", state: "Pahang" },
  { id: "h26", date: "2026-05-27", name: "Hari Raya Haji", state: "All" },
  { id: "h27", date: "2026-05-28", name: "Hari Raya Haji (Day 2)", state: "Kedah" },
  { id: "h28", date: "2026-05-28", name: "Hari Raya Haji (Day 2)", state: "Perlis" },
  { id: "h29", date: "2026-05-30", name: "Harvest Festival (Kaamatan)", state: "Sabah" },
  { id: "h30", date: "2026-05-31", name: "Harvest Festival (Kaamatan, Day 2)", state: "Sabah" },
  { id: "h31", date: "2026-05-31", name: "Wesak Day", state: "All" },
  { id: "h32", date: "2026-06-01", name: "Yang di-Pertuan Agong's Birthday", state: "All" },
  { id: "h33", date: "2026-06-01", name: "Gawai Dayak", state: "Sarawak" },
  { id: "h34", date: "2026-06-02", name: "Gawai Dayak (Day 2)", state: "Sarawak" },
  { id: "h35", date: "2026-06-17", name: "Awal Muharram (Maal Hijrah)", state: "All" },
  { id: "h36", date: "2026-07-05", name: "Birthday of the Sultan of Kedah", state: "Kedah" },
  { id: "h37", date: "2026-07-07", name: "George Town World Heritage City Day", state: "Penang" },
  { id: "h38", date: "2026-07-11", name: "Penang Governor's Birthday", state: "Penang" },
  { id: "h39", date: "2026-07-21", name: "Almarhum Sultan Iskandar Hol Day", state: "Johor" },
  { id: "h40", date: "2026-07-22", name: "Sarawak Independence Day", state: "Sarawak" },
  { id: "h41", date: "2026-07-31", name: "Birthday of the Sultan of Pahang", state: "Pahang" },
  { id: "h42", date: "2026-08-24", name: "Birthday of the Governor of Malacca", state: "Melaka" },
  { id: "h43", date: "2026-08-25", name: "Maulidur Rasul (Prophet's Birthday)", state: "All" },
  { id: "h44", date: "2026-08-31", name: "Hari Merdeka (National Day)", state: "All" },
  { id: "h45", date: "2026-09-16", name: "Malaysia Day", state: "All" },
  { id: "h46", date: "2026-09-29", name: "Birthday of the Sultan of Kelantan", state: "Kelantan" },
  { id: "h47", date: "2026-09-30", name: "Birthday of the Sultan of Kelantan (observed)", state: "Kelantan" },
  { id: "h48", date: "2026-10-10", name: "Birthday of the Governor of Sarawak", state: "Sarawak" },
  { id: "h49", date: "2026-11-06", name: "Birthday of the Sultan of Perak", state: "Perak" },
  { id: "h50", date: "2026-11-08", name: "Deepavali", state: "All" },
  { id: "h51", date: "2026-12-11", name: "Birthday of the Sultan of Selangor", state: "Selangor" },
  { id: "h52", date: "2026-12-25", name: "Christmas Day", state: "All" },
];
const DEFAULT_AGENTS = [];
const LEGACY_SAMPLE_AGENTS = new Set(["Haziq Idris", "Farah Aziz", "Wei Jian Tan", "Priya Nair"]);
const DEFAULT_DEFAULT_AGENT = "";
const DEFAULT_PHONES = [];
const normalizeCategoryValue = (value) => {
  const category = String(value || "").trim();
  if (category.toLowerCase() === "payroll") return "Payroll";
  if (category.toLowerCase() === "account") return "Account";
  if (/payroll/i.test(category) || /sql\s*payroll/i.test(category)) return "Payroll";
  if (/account/i.test(category) || /sql\s*account/i.test(category)) return "Account";
  return "";
};
const DEFAULT_SCHEDULES = {
  quotation: [
    { id: "q1", stage: 1, code: "day3", label: "1st Follow-up", tag: "Day 3", workingDaysAfterPrevious: 3 },
    { id: "q2", stage: 2, code: "day5", label: "2nd Follow-up", tag: "Day 5", workingDaysAfterPrevious: 2 },
    { id: "q3", stage: 3, code: "day7", label: "3rd Follow-up", tag: "Day 7", workingDaysAfterPrevious: 2 },
    { id: "q4", stage: 4, code: "day10", label: "4th Follow-up", tag: "Day 10", workingDaysAfterPrevious: 3 },
  ],
};

/* ------------------------------ Seed data (labelled as an import batch, not silent mock data) ------------------------------ */
const HISTORY_SEED_NOTE = {
  0: "Sent to customer.",
  1: "Reminder sent, no reply yet.",
  2: "Customer asked for more time to review.",
  3: "Final nudge sent before closing the loop.",
};
function seedHistory(docDateStr, completedStages, stages, holidays, docLabel, state) {
  const dates = computeScheduleDates(docDateStr, stages, holidays, state);
  const events = [{ date: docDateStr, stage: "Sent", label: `${docLabel} Sent`, note: "Document issued to customer." }];
  for (let i = 0; i < completedStages; i++) {
    events.push({ date: ymd(dates[i]), stage: stages[i].label, label: `${stages[i].label} (${stages[i].tag})`, note: HISTORY_SEED_NOTE[i] || "Follow-up completed." });
  }
  return events;
}
/* ------------------------------ Templates ------------------------------ */
const INITIAL_TEMPLATES = [
  { id: "t1", docType: "Quotation", category: "Account", stageCode: "day3", stageTag: "Day 3", language: "English", type: "WhatsApp", title: "Quotation — Day 3 (Account, EN)", message: "Hi {{CustomerName}}, this is {{StaffName}} from our team. Just following up on quotation {{QuotationNo}} ({{Amount}}) sent to {{CompanyName}} on {{QuotationDate}}. Happy to answer any questions — let me know how you'd like to proceed." },
  { id: "t2", docType: "Quotation", category: "Account", stageCode: "day5", stageTag: "Day 5", language: "English", type: "WhatsApp", title: "Quotation — Day 5 (Account, EN)", message: "Hi {{CustomerName}}, checking in again on {{QuotationNo}} for {{CompanyName}}. If it's helpful, I can walk you through the scope on a quick call this week — happy to fit your schedule." },
  { id: "t3", docType: "Quotation", category: "Account", stageCode: "day7", stageTag: "Day 7", language: "English", type: "Email", title: "Quotation — Day 7 (Account, EN)", message: "Dear {{CustomerName}}, I wanted to follow up on quotation {{QuotationNo}} sent on {{QuotationDate}} for {{Amount}}. Please let us know if you need any adjustments to the scope or pricing so we can move this forward for {{CompanyName}}." },
  { id: "t4", docType: "Quotation", category: "Account", stageCode: "day10", stageTag: "Day 10", language: "English", type: "Email", title: "Quotation — Day 10 (Account, EN)", message: "Dear {{CustomerName}}, this is a final check-in on quotation {{QuotationNo}}. If timing isn't right, no problem at all — just let us know and we'll follow up when it suits {{CompanyName}} better." },
  { id: "t5", docType: "Quotation", category: "Payroll", stageCode: "day3", stageTag: "Day 3", language: "English", type: "WhatsApp", title: "Quotation — Day 3 (Payroll, EN)", message: "Hi {{CustomerName}}, following up on the payroll services quotation {{QuotationNo}} sent to {{CompanyName}} on {{QuotationDate}}. Happy to clarify anything on the onboarding timeline or pricing." },
  { id: "t6", docType: "Quotation", category: "Payroll", stageCode: "day5", stageTag: "Day 5", language: "English", type: "WhatsApp", title: "Quotation — Day 5 (Payroll, EN)", message: "Hi {{CustomerName}}, just checking in on {{QuotationNo}}. Would it help if I sent a short summary of what switching payroll providers looks like in practice for {{CompanyName}}?" },
  { id: "t7", docType: "Quotation", category: "Payroll", stageCode: "day7", stageTag: "Day 7", language: "Bahasa Malaysia", type: "WhatsApp", title: "Quotation — Day 7 (Payroll, BM)", message: "Salam {{CustomerName}}, susulan sebutharga {{QuotationNo}} untuk {{CompanyName}} bertarikh {{QuotationDate}}. Sila maklumkan sekiranya ada sebarang pertanyaan mengenai skop atau harga." },
  { id: "t8", docType: "Quotation", category: "Payroll", stageCode: "day10", stageTag: "Day 10", language: "English", type: "Email", title: "Quotation — Day 10 (Payroll, EN)", message: "Dear {{CustomerName}}, closing the loop on quotation {{QuotationNo}} for {{Amount}}. Let us know if {{CompanyName}} would like to proceed or needs a revised proposal." },
];
const renderTemplate = (message, vars) => message.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

/* ------------------------------ Import field maps ------------------------------ */
const QUOTATION_FIELDS = [
  { key: "date", label: "Document Date", required: true, guesses: ["date", "quotation date", "doc date", "document date"] },
  { key: "company", label: "Company Name", required: true, guesses: ["customer", "company", "customer name", "company name"] },
  { key: "contactName", label: "Person in Charge", required: false, guesses: ["person in charge", "contact person", "contact", "attn", "attention"] },
  { key: "phone", label: "Phone Number", required: false, guesses: ["phone", "contact number", "tel", "mobile", "phone number"] },
  { key: "docNo", label: "Document Number", required: true, guesses: ["quotation no", "quotation no.", "qt no", "doc no", "document no", "document number"] },
  { key: "amount", label: "Quotation Total (RM)", required: true, guesses: ["quotation total", "total amount", "amount", "total", "value", "grand total"] },
];
function guessMapping(headers, fields) {
  const map = {};
  fields.forEach((f) => {
    // Prefer an exact (case-insensitive) header match over a partial/contains match.
    const exact = headers.find((h) => f.guesses.includes(String(h).toLowerCase().trim()));
    const partial = headers.find((h) => {
      const lh = String(h).toLowerCase().trim();
      return f.guesses.some((g) => lh.includes(g));
    });
    map[f.key] = exact || partial || "";
  });
  return map;
}

function parseDocumentDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !isNaN(value)) return ymd(value);
  if (typeof value === "number") {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(d)) return ymd(d);
    return null;
  }
  const s = String(value).trim();
  const d = new Date(s);
  if (!isNaN(d)) return ymd(d);
  const m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    const d2 = new Date(Number(yy), Number(mm) - 1, Number(dd));
    if (!isNaN(d2)) return ymd(d2);
  }
  return null;
}

async function extractQuotationRows(file) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    content.items
      .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
      .forEach((item) => { if (item.str.trim()) lines.push(item.str.trim()); });
  }
  const text = lines.join(" ");
  const lineText = lines.join("\n");
  const matchValue = (pattern) => pattern.exec(lineText)?.[1]?.trim() || pattern.exec(text)?.[1]?.trim() || "";
  const datePattern = /[0-9]{1,2}[.\/-][0-9]{1,2}[.\/-][0-9]{2,4}/;
  const dateLabelIndex = lines.findIndex((line) => /^Date\s*:?[\s]*$/i.test(line));
  const dateOnLabelLine = lines.find((line) => /^Date\s*[:#-]?\s*/i.test(line) && datePattern.test(line))?.match(datePattern)?.[0] || "";
  const dateRaw = dateOnLabelLine
    || (dateLabelIndex >= 0 ? lines.slice(dateLabelIndex + 1, dateLabelIndex + 4).find((line) => datePattern.test(line))?.match(datePattern)?.[0] || "" : "");
  const companyPattern = /(?:SDN\.?\s*BHD\.?|ENTERPRISE|ENTERPRIS|SERVICES?|SERVICE|SDN\.?\s*BHd|TRADING|HOLDINGS|CORPORATION|CORP\.?|LIMITED|LTD\.?|PTE\.?\s*LTD\.?|PLT)\b/i;
  const sellerPattern = /AMS\s+SOFTWARE\s+SDN\.?\s+BHD\.?|ACCOUNTING\s+MADE\s+SIMPLE/i;
  const paymentTermPattern = /^(?:C\.\s*O\.\s*D\.?|30\s*DAYS?|45\s*DAYS?|60\s*DAYS?)$/i;
  const postcodePattern = /\b\d{4,5}\b/;
  const addressKeywords = /(jalan|jalan\s|lorong|kampung|lot|plot|no\.|taman|bandar|township|off|persiaran|kawasan|bukit|street|road|estate)/i;
  const isMostlyUppercaseLine = (value = "") => {
    const letters = value.replace(/[^A-Za-z]/g, "");
    if (letters.length < 4) return false;
    const upper = [...letters].filter((char) => /[A-Z]/.test(char)).length;
    const lower = [...letters].filter((char) => /[a-z]/.test(char)).length;
    return upper >= letters.length * 0.8 && lower === 0;
  };
  const quotationNoIndex = lines.findIndex((line) => /quotation\s*no\.?/i.test(line));
  const itemIndex = lines.findIndex((line) => /^Item\b/i.test(line));
  const customerIntroIndex = lines.findIndex((line) => /^(To|Dear|Tel\s*:|Phone\s*:|Attention|Attn)\b/i.test(line));
  const customerBlockStart = Math.max(quotationNoIndex >= 0 ? quotationNoIndex + 1 : 0, customerIntroIndex >= 0 ? customerIntroIndex : 0);
  const firstCustomerBlockCompany = (() => {
    const telIndex = lines.findIndex((line) => /^(Tel\s*:|Phone\s*:)/i.test(line));
    if (telIndex < 0) return "";
    const candidate = [...lines.slice(0, telIndex)].reverse().find((line) => {
      if (!line || /^(?:To|Dear|Attention|Attn|Tel\s*:|Phone\s*:|Fax\s*:|Email\s*:|Website\s*:)/i.test(line)) return false;
      if (/^(?:No\.|Lot|Block|Jalan|Lorong|Kampung|Persiaran|Taman|Bandar|Street|Road|Off|Kawasan|Selangor|Wilayah|Malaysia|P\.O\.|P\.O)/i.test(line)) return false;
      if (postcodePattern.test(line)) return false;
      if (addressKeywords.test(line)) return false;
      return line.length > 2 && !/^(?:C\.O\.D|30\s*DAYS?|45\s*DAYS?|60\s*DAYS?)$/i.test(line);
    });
    return (candidate || "").trim();
  })();

  const companyCandidates = lines
    .map((line, index) => ({ line: line.replace(/^\s*(?:company\s*name|customer)\s*[:#-]?\s*/i, "").trim(), index }))
    .filter(({ line, index }) => {
      if (!line || line.length < 3) return false;
      if (itemIndex >= 0 && index >= itemIndex) return false;
      if (sellerPattern.test(line)) return false;
      if (paymentTermPattern.test(line)) return false;
      const looksLikeCompany = companyPattern.test(line) || isMostlyUppercaseLine(line);
      if (!looksLikeCompany) return false;
      const beforeCustomerBlock = index <= customerBlockStart && !/^(To|Dear|Tel\s*:|Phone\s*:|Attention|Attn)/i.test(line);
      if (beforeCustomerBlock) {
        const nextLine = lines[index + 1] || "";
        const adjacentAddress = postcodePattern.test(nextLine) || addressKeywords.test(nextLine) || /^(?:No\.|Lot|Block|Jalan|Lorong|Kampung|Persiaran|Taman|Bandar|Street|Road|Off|Kawasan)/i.test(nextLine);
        if (!adjacentAddress) return false;
      }

      const neighborhood = lines.slice(Math.max(0, index - 4), Math.min(lines.length, index + 8)).join(" ");
      const isContextualCustomer = /(?:^|\s)(To|Dear|Tel\s*:|Phone\s*:|Attention|Attn)\b/i.test(neighborhood)
        || postcodePattern.test(neighborhood)
        || addressKeywords.test(neighborhood);

      return isContextualCustomer;
    })
    .map(({ line }) => line);

  const company = companyCandidates
    .map((candidate) => {
      const idx = lines.findIndex((line) => line === candidate);
      if (idx === -1) return { candidate: "", distance: Number.MAX_SAFE_INTEGER, idx: Number.MAX_SAFE_INTEGER };
      const addressGap = lines.slice(idx + 1, Math.min(lines.length, idx + 8)).findIndex((nextLine) => {
        if (!nextLine) return false;
        return postcodePattern.test(nextLine) || addressKeywords.test(nextLine) || /^(?:No\.|Lot|Block|Jalan|Lorong|Kampung|Persiaran|Taman|Bandar|Street|Road|Off|Kawasan)/i.test(nextLine);
      });
      const neighborhood = lines.slice(Math.max(0, idx - 5), Math.min(lines.length, idx + 12)).join(" ");
      const hasContext = postcodePattern.test(neighborhood) || /\b(?:Tel|Phone|Dear)\b/i.test(neighborhood) || addressKeywords.test(neighborhood) || isMostlyUppercaseLine(candidate);
      return {
        candidate,
        distance: addressGap >= 0 ? addressGap : hasContext ? 20 : Number.MAX_SAFE_INTEGER,
        idx,
      };
    })
    .sort((a, b) => a.distance - b.distance || a.idx - b.idx)
    .find((item) => item.candidate)?.candidate || companyCandidates[0] || firstCustomerBlockCompany || "";

  const extractDearContactName = () => {
    const dearIndex = lines.findIndex((line) => /^Dear\b/i.test(line));
    const directCandidate = dearIndex >= 0 ? (lines[dearIndex + 1] || "") : "";
    const regexCandidate = matchValue(/\bDear\s+([^\n,;:]+?)(?:\s*[,;:]|\s+\b(?:Sir|Madam)\b|$)/i) || "";
    const candidate = (directCandidate || regexCandidate).trim();
    if (!candidate) return "";
    const cleaned = candidate
      .replace(/^(?:Mr|Mrs|Ms|Mdm|Miss|Dr)\.?\s+/i, "")
      .replace(/\s*[-–—]+\s*$/g, "")
      .trim();
    if (!cleaned) return "";
    if (/^(?:C\.\s*O\.\s*D\.?|30\s*DAYS?|45\s*DAYS?|60\s*DAYS?|Thank\s+you\s+for\s+your\s+enquiry\.?|We\s+are\s+pleased\s+to\s+submit\s+our\s+quote\s+as\s+follows\.?)/i.test(cleaned)) return "";
    if (paymentTermPattern.test(cleaned)) return "";
    if (sellerPattern.test(cleaned)) return "";
    if (companyPattern.test(cleaned)) return "";
    if (/\b(?:Thank\s+you|We\s+are\s+pleased|for\s+your\s+enquiry|quote\s+as\s+follows)\b/i.test(cleaned)) return "";
    if ((cleaned.match(/[A-Za-z]/g) || []).length < 2) return "";
    return cleaned;
  };
  const contactName = extractDearContactName();
  const phone = matchValue(/\bTel\s*[:#-]?\s*([+\d][\d\s().-]{6,})/i);
  const docNo = matchValue(/\bQuotation\s+No\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]*)/i);
  const amount = matchValue(/\bTotal\s+Payable\s+Incl\.?\s+Tax\s*:\s*\(?RM\)?\s*([0-9,]+(?:\.\d{1,2})?)/i);
  const itemDescriptionIndex = lines.findIndex((line) => /^Item\s*Description\b/i.test(line) || /^Description\b/i.test(line));
  const itemDescriptionText = (() => {
    if (itemDescriptionIndex < 0) return "";
    const collected = [];
    for (let i = itemDescriptionIndex + 1; i < lines.length; i += 1) {
      const line = String(lines[i] || "").trim();
      if (!line) continue;
      if (/^(?:Item|Qty|Package|Unit|Unit\s+Price|Date|Disc|Page\s+No|Amount|Total|Quotation\s+No\.|Term|Document\s+Number|Document\s+Date)/i.test(line)) break;
      if (/sql|payroll|account(?:ing)?|support|maintenance|contract|invoice|e-invoice/i.test(line)) collected.push(line);
    }
    return collected.join(" ");
  })();
  const row = {
    "Document Date": dateRaw,
    "Company Name": company || contactName || "",
    "Person in Charge": contactName,
    Phone: phone,
    "Document Number": docNo,
    "Quotation Total (RM)": amount,
  };
  if (Object.values(row).every((value) => !String(value || "").trim())) throw new Error("No readable quotation fields found");
  return { rows: [row], companyCandidates: [...new Set(companyCandidates)], categoryText: itemDescriptionText || text };
}
function parseAmount(value) {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  return cleaned ? parseFloat(cleaned) : NaN;
}
function detectCategoryFromText(text = "") {
  const content = String(text || "");
  const normalized = content.toLowerCase();

  const payrollHit = /sql\s*payroll|payroll\s*sql|\bpayroll\b/i.test(content);
  const accountHit = /sql\s*account(?:ing)?|account(?:ing)?\s*sql|\baccount(?:ing)?\b/i.test(content);

  if (payrollHit && !accountHit) return "Payroll";
  if (accountHit && !payrollHit) return "Account";
  if (payrollHit && accountHit) {
    if (normalized.indexOf("payroll") < normalized.indexOf("account")) return "Payroll";
    return "Account";
  }

  return "";
}

/* ------------------------------ UI atoms ------------------------------ */
function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Upcoming"];
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap" style={{ color: s.fg, background: s.bg }}>
      <Icon size={13} strokeWidth={2.4} /> {status}
    </span>
  );
}
function StatCard({ label, value, tint, sub }) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1 bg-white" style={{ borderColor: LINE }}>
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#8B8C92" }}>{label}</span>
      <span className="text-2xl font-semibold" style={{ color: tint || INK }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: "#9A9AA0" }}>{sub}</span>}
    </div>
  );
}
function NavItem({ icon: Icon, label, active, onClick, count }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-colors"
      style={{ background: active ? "rgba(15,138,130,0.18)" : "transparent", color: active ? "#5FD8CC" : "#B7B9C6" }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <Icon size={16} strokeWidth={2} />
      <span className="flex-1 text-left">{label}</span>
      {count > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: active ? "#5FD8CC" : "#33364F", color: active ? "#0F172A" : "#C7C9D6" }}>{count}</span>}
    </button>
  );
}
function Tag({ children }) { return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: GRAY_SOFT, color: "#6B6C72" }}>{children}</span>; }
function Select({ value, onChange, options, label }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none text-xs font-medium pl-3 pr-8 py-2 rounded-lg border bg-white outline-none cursor-pointer" style={{ borderColor: LINE, color: INK }}>
        {options.map((o) => <option key={o} value={o}>{o === "All" ? `${label}: All` : o}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9A9AA0" }} />
    </div>
  );
}
function Field({ label, value, custom }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "#B0B0B5" }}>{label}</div>
      {custom || <div className="font-medium" style={{ color: INK }}>{value}</div>}
    </div>
  );
}
function IconBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md" style={{ color: danger ? RED : "#5C5D63", background: danger ? RED_SOFT : "#F2F1EC" }}>
      <Icon size={11} /> {label}
    </button>
  );
}

/* ------------------------------ Delete confirmation (password-gated) ------------------------------ */
function DeleteConfirmModal({ request, onCancel, onConfirm }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    setPassword("");
    setError("");
    setShowPassword(false);
  }, []);
  const submit = async () => {
    if (!password.trim()) { setError("Please enter your password to continue."); return; }
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      setError("No active signed-in account found.");
      return;
    }
    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
      onConfirm();
      setPassword("");
      setError("");
      setShowPassword(false);
    } catch (err) {
      setError("Incorrect password.");
    } finally {
      setSubmitting(false);
    }
  };
  const handleKeyDown = (e) => { if (e.key === "Enter") submit(); };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(18,23,43,0.5)" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col gap-3 shadow-2xl">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: RED_SOFT }}><Trash2 size={18} style={{ color: RED }} /></div>
        <div>
          <div className="text-sm font-semibold" style={{ color: INK }}>Confirm deletion</div>
          <div className="text-xs mt-1" style={{ color: "#6B6C72" }}>{request.message}</div>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>Enter password to confirm</label>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 border" style={{ borderColor: error ? RED : LINE }}>
            <Lock size={13} style={{ color: "#9A9AA0" }} />
            <input
              type={showPassword ? "text" : "password"}
              autoFocus
              autoComplete="new-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              data-lpignore="true"
              data-form-type="other"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              placeholder="Password"
              className="flex-1 text-sm outline-none bg-transparent"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[10px] font-medium shrink-0" style={{ color: "#6E7189" }}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {error && <div className="text-xs mt-1 flex items-center gap-1" style={{ color: RED }}><AlertCircle size={11} /> {error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={onCancel} className="text-xs font-medium px-3.5 py-2 rounded-lg border" style={{ borderColor: LINE, color: "#5C5D63" }}>Cancel</button>
          <button onClick={submit} disabled={submitting} className="text-xs font-medium px-3.5 py-2 rounded-lg disabled:opacity-60" style={{ background: RED, color: "white" }}>{submitting ? "Verifying…" : "Delete"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Toast (action feedback) ------------------------------ */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-2xl" style={{ background: INK, color: "white" }}>
      <CheckCircle2 size={15} style={{ color: "#5FD8CC" }} />
      <span className="text-sm">{toast}</span>
    </div>
  );
}

/* ------------------------------ Console (post-login) ------------------------------ */
const STORAGE_KEY = "ams-followup-data";

function LoadingScreen({ label }) {
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: PAPER }}>
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={22} className="animate-spin" style={{ color: TEAL }} />
        <div className="text-sm font-medium" style={{ color: INK }}>{label}</div>
      </div>
    </div>
  );
}

function Console({ appName, setAppName, onSignOut }) {
  const [page, setPage] = useState("dashboard");
  const [holidays, setHolidays] = useState(DEFAULT_HOLIDAYS);
  const [operatingState, setOperatingState] = useState(DEFAULT_OPERATING_STATE);
  const [schedules, setSchedules] = useState(DEFAULT_SCHEDULES);
  const [templates, setTemplates] = useState(INITIAL_TEMPLATES);
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [agents, setAgents] = useState(DEFAULT_AGENTS);
  const [defaultAgentName, setDefaultAgentName] = useState(DEFAULT_DEFAULT_AGENT);
  const [phones, setPhones] = useState(DEFAULT_PHONES);
  const [importHistory, setImportHistory] = useState([]);
  const [activeFollowup, setActiveFollowup] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [importPresetType, setImportPresetType] = useState("Quotation");
  const [deleteRequest, setDeleteRequest] = useState(null); // { message, onConfirm }
  const [toast, setToast] = useState(null);
  const [customerDrill, setCustomerDrill] = useState(null); // { company, name }
  const [batchDrill, setBatchDrill] = useState(null); // batchId
  const [dataLoaded, setDataLoaded] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800); };
  const requestDelete = (message, onConfirm) => setDeleteRequest({ message, onConfirm });
  const confirmDelete = () => { if (deleteRequest) { deleteRequest.onConfirm(); } setDeleteRequest(null); };
  const cancelDelete = () => setDeleteRequest(null);

  // ---- Load dashboard configuration and Firestore collections once on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage?.get(STORAGE_KEY);
        if (res && res.value && !cancelled) {
          const data = JSON.parse(res.value);
          if (data.appName) setAppName(data.appName);
          if (data.operatingState) setOperatingState(data.operatingState);
          if (data.holidays) setHolidays(data.holidays);
          if (data.schedules) setSchedules(data.schedules);
          if (data.defaultAgentName !== undefined) setDefaultAgentName(data.defaultAgentName);
          const hasLegacySample = data.importHistory?.some((batch) => String(batch.batchId || "").startsWith("BATCH-SEED"));
          if (hasLegacySample) {
            setImportHistory([]);
          }
          if (data.customers) setCustomers(data.customers);
          if (data.importHistory && !hasLegacySample) setImportHistory(data.importHistory);
        }
      } catch (err) {
        // Optional local storage is unavailable; Firestore remains the source of truth.
      }
      try {
        const [storedQuotations, storedAgents, storedPhones, storedTemplates, storedCustomers] = await Promise.all([
          quotationStore.list(), agentStore.list(), phoneStore.list(), templateStore.list(), customerStore.list(),
        ]);
        if (!cancelled) {
          if (storedQuotations.length) setQuotations(storedQuotations.map((record) => ({
            ...record,
            date: record.date || record.docDate || "",
            company: record.company || record.companyName || "",
            contactName: record.contactName || record.personInCharge || "",
            phone: record.phone || "",
            amount: record.amount ?? record.totalAmount ?? 0,
            completedStages: record.completedStages ?? record.followupStage ?? 0,
            assignedAgent: record.assignedAgent || record.agent || "",
          })));
          if (storedAgents.length) {
            const userAgents = storedAgents.filter((record) => !((record.id || "").match(/^agent-[1-4]$/) && LEGACY_SAMPLE_AGENTS.has(record.name)));
            setAgents(userAgents.map((record) => ({ ...record, name: record.name || record.agentName || "", active: Boolean(record.active ?? record.activeStatus) })));
            await Promise.all(storedAgents.filter((record) => !userAgents.includes(record)).map((record) => agentStore.remove(record.id)));
          }
          if (storedPhones.length) setPhones(storedPhones.map((record) => ({ ...record, name: record.name || record.phoneName || "", number: record.number || record.phoneNumber || "", active: Boolean(record.active ?? true) })));
          if (storedTemplates.length) setTemplates(storedTemplates.map((record) => ({
            ...record,
            docType: record.docType || record.documentType || "Quotation",
            stageTag: record.stageTag || record.followUpStage || "",
            type: record.type || record.messageType || "",
          })));
          if (storedCustomers.length) setCustomers(storedCustomers.map((record) => ({
            ...record,
            company: record.company || record.companyName || "",
            contactName: record.contactName || record.personInCharge || "",
          })));
        }
      } catch (err) {
        console.error("[Firestore] Dashboard startup load failed", err);
        // Keep the in-memory state so the UI remains usable while the database is unavailable.
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dataLoaded) return;
    const payload = { appName, operatingState, holidays, schedules, customers, importHistory, defaultAgentName };
    const t = setTimeout(() => {
      try {
        window.storage.set(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
      } catch (err) {
        // storage API unavailable — app continues to work in-memory for this session
      }
    }, 500);
    return () => clearTimeout(t);
  }, [appName, operatingState, holidays, schedules, customers, importHistory, dataLoaded]);

  function resetToSampleData() {
    requestDelete("Reset AMS-FOLLOWUP back to the original sample dataset? This clears everything imported, edited, or deleted — including data saved in storage — and cannot be undone.", async () => {
      try { await window.storage.delete(STORAGE_KEY); } catch (err) { /* nothing saved yet */ }
      setAppName(DEFAULT_APP_NAME);
      setOperatingState(DEFAULT_OPERATING_STATE);
      setHolidays(DEFAULT_HOLIDAYS);
      setSchedules(DEFAULT_SCHEDULES);
      setTemplates(INITIAL_TEMPLATES);
      setQuotations([]);
      setCustomers([]);
      setAgents(DEFAULT_AGENTS);
      setPhones(DEFAULT_PHONES);
      setImportHistory([]);
      showToast("All quotation data was cleared.");
    });
  }

  const deriveDoc = (doc, docType) => {
    const stages = schedules.quotation;
    const dates = computeScheduleDates(doc.date, stages, holidays, operatingState);
    const totalStages = stages.length;
    const idx = doc.completedStages;
    const scheduledNext = idx < totalStages ? dates[idx] : null;
    const nextDate = doc.rescheduleDate && idx < totalStages ? parseYMD(doc.rescheduleDate) : scheduledNext;
    const currentStage = idx < totalStages ? stages[idx] : null;
    const daysSince = diffCalendarDays(TODAY, parseYMD(doc.date));
    let status;
    if (doc.manualStatus) status = doc.manualStatus;
    else if (!nextDate) status = "Completed";
    else {
      const diff = diffCalendarDays(nextDate, TODAY);
      status = diff === 0 ? "Due Today" : diff < 0 ? "Overdue" : "Upcoming";
    }
    const lastFollowupDate = idx > 0 ? ymd(dates[idx - 1]) : null;
    return {
      ...doc, docType, stages, dates, totalStages, idx, nextDate, currentStage, daysSince, status, lastFollowupDate,
      customer: { name: doc.contactName || doc.company, company: doc.company, phone: doc.phone, email: doc.email },
    };
  };

  const allQuotations = useMemo(() => quotations.map((q) => deriveDoc(q, "Quotation")), [quotations, schedules, holidays, operatingState]);
  const allDocs = useMemo(() => allQuotations, [allQuotations]);

  if (!dataLoaded) return <LoadingScreen label="Loading your data…" />;

  const todaysFollowups = allDocs.filter((d) => d.status === "Due Today" || d.status === "Overdue")
    .sort((a, b) => (a.status === "Overdue" && b.status !== "Overdue" ? -1 : a.status !== "Overdue" && b.status === "Overdue" ? 1 : 0));
  const counts = {
    dueToday: allDocs.filter((d) => d.status === "Due Today").length,
    overdue: allDocs.filter((d) => d.status === "Overdue").length,
    upcoming: allDocs.filter((d) => d.status === "Upcoming").length,
    completedToday: allDocs.filter((d) => d.lastFollowupDate === ymd(TODAY)).length,
  };

  function applyAction(doc, docType, action, extra) {
    const setFn = setQuotations;
    const stages = schedules.quotation;
    const stageInfo = stages[doc.completedStages];
    const template = templates.find((t) => t.docType === docType && t.category === doc.category && t.stageCode === stageInfo?.code);
    const rescheduleDate = extra && extra.rescheduleDate;
    setFn((prev) => prev.map((d) => {
      if (d.id !== doc.id) return d;
      const newHistoryEvent = {
        date: ymd(TODAY), stage: stageInfo ? stageInfo.label : "Follow-up", label: `${stageInfo ? stageInfo.label : "Follow-up"} (${stageInfo ? stageInfo.tag : ""})`.trim(),
        note: action === "Completed" ? "Marked as completed by " + d.staff
          : action === "Customer Responded" ? "Customer responded."
          : action === "Rescheduled" ? `Follow-up rescheduled to ${fmtDate(rescheduleDate)}.`
          : action === "Won" ? "Deal marked as Won."
          : action === "Lost" ? "Deal marked as Lost."
          : action === "No Response" ? "No response from customer." : action,
        template: template ? template.title : null,
      };
      const isTerminal = ["Won", "Lost", "No Response"].includes(action);
      const updated = {
        ...d,
        assignedAgent: extra?.agentName || d.assignedAgent || d.staff || "",
        sendingPhoneId: extra?.phoneId || d.sendingPhoneId || null,
        completedStages: action === "Rescheduled" ? d.completedStages : Math.min(d.completedStages + 1, stages.length),
        manualStatus: isTerminal ? action : d.manualStatus,
        rescheduleDate: action === "Rescheduled" ? rescheduleDate : null,
        history: [...d.history, newHistoryEvent],
      };
      quotationStore.update(updated.id, updated).catch((error) => console.error("[Firestore] Follow-up update failed", error));
      return updated;
    }));
    setActiveFollowup(null);
    showToast(`${action} recorded for ${doc.customer?.company || doc.company}.`);
  }

  function deleteDoc(doc) {
    const setFn = setQuotations;
    requestDelete(`Delete ${doc.docType} ${doc.docNo} (${doc.company})? Its follow-up history will be permanently removed.`, () => {
      setFn((prev) => prev.filter((d) => d.id !== doc.id));
      quotationStore.remove(doc.id).catch((error) => console.error("[Firestore] Quotation delete failed", error));
      if (activeFollowup && activeFollowup.id === doc.id) setActiveFollowup(null);
      if (detailDoc && detailDoc.id === doc.id) setDetailDoc(null);
      showToast(`${doc.docType} ${doc.docNo} deleted.`);
    });
  }
  function bulkDeleteDocs(docs) {
    if (!docs.length) return;
    const quoteIds = new Set(docs.filter((d) => d.docType === "Quotation").map((d) => d.id));
    requestDelete(`Delete ${docs.length} selected record${docs.length !== 1 ? "s" : ""}? Their follow-up history will be permanently removed. This cannot be undone.`, () => {
      if (quoteIds.size) {
        setQuotations((prev) => prev.filter((d) => !quoteIds.has(d.id)));
        quoteIds.forEach((id) => quotationStore.remove(id).catch((error) => console.error("[Firestore] Quotation delete failed", error)));
      }
      if (activeFollowup && docs.some((d) => d.id === activeFollowup.id)) setActiveFollowup(null);
      if (detailDoc && docs.some((d) => d.id === detailDoc.id)) setDetailDoc(null);
      showToast(`${docs.length} record${docs.length !== 1 ? "s" : ""} deleted.`);
    });
  }
  function deleteCustomer(customer) {
    requestDelete(`Delete customer record "${customer.company}"? This only removes the imported customer master record, not any quotations.`, () => {
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      customerStore.remove(customer.id).catch((error) => console.error("[Firestore] Customer delete failed", error));
      showToast(`Customer "${customer.company}" deleted.`);
    });
  }
  function bulkDeleteCustomers(list) {
    if (!list.length) return;
    const ids = new Set(list.map((c) => c.id));
    requestDelete(`Delete ${list.length} selected customer record${list.length !== 1 ? "s" : ""}? This only removes the imported customer master records, not any quotations.`, () => {
      setCustomers((prev) => prev.filter((c) => !ids.has(c.id)));
      ids.forEach((id) => customerStore.remove(id).catch((error) => console.error("[Firestore] Customer delete failed", error)));
      showToast(`${list.length} customer record${list.length !== 1 ? "s" : ""} deleted.`);
    });
  }
  function deleteTemplate(tpl) {
    requestDelete(`Delete template "${tpl.title}"?`, () => {
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      templateStore.remove(tpl.id).catch((error) => console.error("[Firestore] Message template delete failed", error));
    });
  }

  // ---- PDF quotation and customer import merge logic ----
  function commitImport({ docType, fileName, rows, resolutions, agentName, categoryOverride }) {
    const batchId = uid("BATCH-");
    const importDate = new Date().toISOString();
    let newCount = 0, updatedCount = 0, skippedCount = 0;
    const fallbackCategory = normalizeCategoryValue(categoryOverride) || "Account";

    if (docType === "Customer") {
      setCustomers((prev) => {
        let next = [...prev];
        rows.forEach((row) => {
          const keyVal = row.company.trim().toLowerCase();
          const existingIdx = next.findIndex((c) => c.company.trim().toLowerCase() === keyVal);
          const resolution = existingIdx !== -1 ? (resolutions[row.company] || "skip") : "new";
          if (existingIdx !== -1 && resolution === "skip") { skippedCount++; return; }
          if (existingIdx !== -1 && resolution === "update") {
            next[existingIdx] = {
              ...next[existingIdx], company: row.company, contactName: row.contactName, phone: row.phone, email: row.email,
              category: row.category || next[existingIdx].category, source: "PDF Quotation Import", importDate, importFileName: fileName, importBatchId: batchId,
            };
            customerStore.update(next[existingIdx].id, next[existingIdx]).catch((error) => console.error("[Firestore] Customer update failed", error));
            updatedCount++; return;
          }
          const customer = { id: uid("CUST"), company: row.company, contactName: row.contactName, phone: row.phone, email: row.email, category: row.category || "", source: "PDF Quotation Import", importDate, importFileName: fileName, importBatchId: batchId };
          next.push(customer);
          customerStore.create(customer).catch((error) => console.error("[Firestore] Customer create failed", error));
          newCount++;
        });
        return next;
      });
    } else {
      const stages = schedules.quotation;
      const setFn = setQuotations;
      setFn((prev) => {
        let next = [...prev];
        rows.forEach((row) => {
          const key = `${docType}:${row.docNo}`;
          const existingIdx = next.findIndex((d) => d.id === key);
          const resolution = existingIdx !== -1 ? (resolutions[row.docNo] || "skip") : "new";

          if (existingIdx !== -1 && resolution === "skip") { skippedCount++; return; }

          if (existingIdx !== -1 && resolution === "update") {
            next[existingIdx] = {
              ...next[existingIdx],
              company: row.company, contactName: row.contactName, phone: row.phone, email: row.email,
              category: normalizeCategoryValue(row.category) || normalizeCategoryValue(next[existingIdx].category) || fallbackCategory, amount: row.amount, date: row.date,
              staff: row.staff || next[existingIdx].staff, assignedAgent: agentName || row.agentName || next[existingIdx].assignedAgent || next[existingIdx].staff, sendingPhoneId: row.phoneId || next[existingIdx].sendingPhoneId || null, docStatus: row.docStatus || next[existingIdx].docStatus,
              source: "PDF Quotation Import", importDate, importFileName: fileName, importBatchId: batchId,
              // follow-up progress (completedStages / manualStatus / notes / history / rescheduleDate) preserved untouched
            };
            quotationStore.update(next[existingIdx].id, next[existingIdx]).catch((error) => console.error("[Firestore] Quotation update failed", error));
            updatedCount++;
            return;
          }

          const id = existingIdx !== -1 && resolution === "new" ? `${key}-${uid("DUP")}` : key;
          const rec = {
            id, docType, docNo: row.docNo, company: row.company, contactName: row.contactName, phone: row.phone, email: row.email,
            category: normalizeCategoryValue(row.category) || fallbackCategory, date: row.date, amount: row.amount, staff: agentName || row.agentName || row.staff || defaultAgentName || agents.find((agent) => agent.active)?.name || "Unassigned", assignedAgent: agentName || row.agentName || row.staff || defaultAgentName || agents.find((agent) => agent.active)?.name || "Unassigned", sendingPhoneId: row.phoneId || null, docStatus: row.docStatus || "Open",
            source: "PDF Quotation Import", importDate, importFileName: fileName, importBatchId: batchId,
            completedStages: 0, manualStatus: null, notes: "", rescheduleDate: null,
            history: seedHistory(row.date, 0, stages, holidays, docType, operatingState),
          };
          quotationStore.create(rec).catch((error) => console.error("[Firestore] Quotation create failed", error));
          next.push(rec);
          newCount++;
        });
        return next;
      });
    }

    setImportHistory((prev) => [
      { id: batchId, batchId, docType, fileName, importDate, totalRows: rows.length, newRecords: newCount, updated: updatedCount, skipped: skippedCount, errors: 0 },
      ...prev,
    ]);
    showToast(`Import complete — ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped.`);
    return { batchId, newCount, updatedCount, skippedCount };
  }

  function updateCategory(doc, docType, newCategory) {
    const setFn = setQuotations;
    setFn((prev) => prev.map((d) => (d.id === doc.id ? { ...d, category: newCategory } : d)));
    setDetailDoc((prev) => (prev && prev.id === doc.id ? { ...prev, category: newCategory } : prev));
  }

  const lastImport = importHistory[0];
  const totalRecords = quotations.length;
  const batchMeta = batchDrill ? importHistory.find((b) => b.batchId === batchDrill) : null;
  const batchRecords = batchDrill
    ? (batchMeta?.docType === "Customer" ? customers.filter((c) => c.importBatchId === batchDrill) : allDocs.filter((d) => d.importBatchId === batchDrill))
    : [];
  const drillDocs = customerDrill ? allDocs.filter((d) => d.company === customerDrill.company && d.contactName === customerDrill.name) : [];

  return (
    <div className="flex h-full w-full" style={{ background: PAPER, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <aside className="w-60 shrink-0 flex flex-col py-5 px-3" style={{ background: INK }}>
        <div className="px-2.5 mb-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: TEAL, color: "#08201D" }}>
            {appName.replace(/[^A-Z]/g, "").slice(0, 2) || appName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight">{appName}</div>
            <div className="text-[11px] leading-tight" style={{ color: "#7B7E92" }}>Follow-up Console</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          <NavItem icon={LayoutDashboard} label="Dashboard" active={page === "dashboard"} onClick={() => setPage("dashboard")} />
          <NavItem icon={UploadCloud} label="Import Data" active={page === "import"} onClick={() => setPage("import")} />
          <NavItem icon={Clock} label="Follow-ups" active={page === "followups"} onClick={() => setPage("followups")} count={counts.dueToday + counts.overdue} />
          <NavItem icon={Users} label="Customers" active={page === "customers"} onClick={() => setPage("customers")} />
          <NavItem icon={MessageSquare} label="Message Templates" active={page === "templates"} onClick={() => setPage("templates")} />
          <NavItem icon={CalendarDays} label="Holiday Calendar" active={page === "holidays"} onClick={() => setPage("holidays")} />
          <NavItem icon={History} label="Import History" active={page === "importhistory"} onClick={() => setPage("importhistory")} />
          <NavItem icon={BarChart3} label="Reports" active={page === "reports"} onClick={() => setPage("reports")} />
          <NavItem icon={SettingsIcon} label="Settings" active={page === "settings"} onClick={() => setPage("settings")} />
        </nav>
        <div className="mt-auto px-2.5 pt-4 border-t" style={{ borderColor: "#262B45" }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[11px]" style={{ color: "#6E7189" }}>Signed in as</div>
              <div className="text-sm text-white font-medium">AMS</div>
              <div className="text-[11px]" style={{ color: "#6E7189" }}>Consulting Team</div>
            </div>
          </div>
          <button onClick={onSignOut} className="w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg" style={{ background: "#1E2340", color: "#B7B9C6" }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <TopBar counts={counts} today={TODAY} appName={appName} />
        <div className="px-8 py-6">
          {page === "dashboard" && (
            <Dashboard counts={counts} allQuotations={allQuotations} todaysFollowups={todaysFollowups}
              onOpenFollowup={setActiveFollowup} onOpenDetail={setDetailDoc} lastImport={lastImport} totalRecords={totalRecords}
              onGoImport={() => setPage("import")} />
          )}
          {page === "import" && (
            <ImportPage schedules={schedules} holidays={holidays} presetType={importPresetType} setPresetType={setImportPresetType}
              existingQuotations={quotations} agents={agents} defaultAgentName={defaultAgentName} onCommit={commitImport} />
          )}
          {page === "customers" && <CustomersPage allDocs={allDocs} customers={customers} onDeleteCustomer={deleteCustomer} onBulkDeleteCustomers={bulkDeleteCustomers} onOpenCustomerDocs={(company, name) => setCustomerDrill({ company, name })} />}
          {page === "followups" && <DocListPage title="All Follow-ups" docs={allDocs} agents={agents} onOpenFollowup={setActiveFollowup} onOpenDetail={setDetailDoc} onDeleteDoc={deleteDoc} onBulkDelete={bulkDeleteDocs} />}
          {page === "templates" && <TemplatesPage templates={templates} setTemplates={setTemplates} onDeleteTemplate={deleteTemplate} />}
          {page === "holidays" && <HolidaysPage holidays={holidays} setHolidays={setHolidays} operatingState={operatingState} setOperatingState={setOperatingState} requestDelete={requestDelete} />}
          {page === "importhistory" && <ImportHistoryPage importHistory={importHistory} appName={appName} onOpenBatch={setBatchDrill} />}
          {page === "reports" && <ReportsPage allDocs={allDocs} />}
          {page === "settings" && <SettingsPage schedules={schedules} setSchedules={setSchedules} appName={appName} setAppName={setAppName} agents={agents} setAgents={setAgents} defaultAgentName={defaultAgentName} setDefaultAgentName={setDefaultAgentName} phones={phones} setPhones={setPhones} onResetData={resetToSampleData} onSaved={showToast} />}
        </div>
      </main>

      {activeFollowup && <FollowupPanel doc={activeFollowup} templates={templates} agents={agents} phones={phones} onClose={() => setActiveFollowup(null)} onAction={(action, extra) => applyAction(activeFollowup, activeFollowup.docType, action, extra)} />}
      {detailDoc && <DetailDrawer doc={detailDoc} onClose={() => setDetailDoc(null)} onOpenFollowup={(d) => { setDetailDoc(null); setActiveFollowup(d); }} onUpdateCategory={(cat) => updateCategory(detailDoc, detailDoc.docType, cat)} />}
      {customerDrill && (
        <CustomerDocsDrawer customer={customerDrill} docs={drillDocs} onClose={() => setCustomerDrill(null)}
          onOpenDetail={(d) => { setCustomerDrill(null); setDetailDoc(d); }} />
      )}
      {batchDrill && (
        <BatchDrawer batchId={batchDrill} batch={batchMeta} records={batchRecords}
          recordType={batchMeta?.docType === "Customer" ? "customer" : "document"}
          onClose={() => setBatchDrill(null)} onOpenDetail={(d) => { setBatchDrill(null); setDetailDoc(d); }}
          onOpenCustomer={(c) => { setBatchDrill(null); setCustomerDrill({ company: c.company, name: c.contactName }); }} />
      )}
      {deleteRequest && <DeleteConfirmModal request={deleteRequest} onCancel={cancelDelete} onConfirm={confirmDelete} />}
      <Toast toast={toast} />
    </div>
  );
}

/* ------------------------------ Auth ------------------------------ */
const LOGIN_USERNAME = "ams";

function LoginPage({ appName, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    setError("");
    if (username.trim().toLowerCase() !== LOGIN_USERNAME) {
      setError("Incorrect username or password. Please try again.");
      return;
    }
    setIsSubmitting(true);
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, FIREBASE_LOGIN_EMAIL, password);
      setError("");
      onLogin();
    } catch (err) {
      setError("Incorrect username or password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleKeyDown = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: INK }}>
      <div className="w-full max-w-sm mx-4">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg" style={{ background: TEAL, color: "#08201D" }}>
            {appName.replace(/[^A-Z]/g, "").slice(0, 2) || appName.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-white text-lg font-semibold">{appName}</div>
          <div className="text-xs" style={{ color: "#7B7E92" }}>Follow-up Console</div>
        </div>

        <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "#1B2140", border: "1px solid #262B45" }}>
          <div>
            <div className="text-sm font-semibold text-white mb-1">Sign in</div>
            <div className="text-xs" style={{ color: "#7B7E92" }}>Enter your AMS-FOLLOWUP credentials to continue.</div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#B7B9C6" }}>Username</label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "#12172B", border: "1px solid #2C3155" }}>
              <User size={14} style={{ color: "#6E7189" }} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Username"
                autoComplete="username"
                className="flex-1 text-sm outline-none bg-transparent text-white placeholder:text-[#5B5F78]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "#B7B9C6" }}>Password</label>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "#12172B", border: "1px solid #2C3155" }}>
              <Lock size={14} style={{ color: "#6E7189" }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Password"
                autoComplete="current-password"
                className="flex-1 text-sm outline-none bg-transparent text-white placeholder:text-[#5B5F78]"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[10px] font-medium shrink-0" style={{ color: "#6E7189" }}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs rounded-lg px-3 py-2 flex items-center gap-1.5" style={{ background: "rgba(194,59,59,0.15)", color: "#F0A0A0" }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <button type="button" onClick={submit} disabled={isSubmitting} className="text-sm font-medium py-2.5 rounded-lg disabled:opacity-60" style={{ background: TEAL, color: "#08201D" }}>
            {isSubmitting ? "Signing In..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ App (login gate) ------------------------------ */
export default function App() {
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => { document.title = appName; }, [appName]);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setIsAuthenticated(Boolean(user));
    setAuthLoading(false);
  }), []);

  if (authLoading) return <LoadingScreen label="Checking your session..." />;
  if (!isAuthenticated) {
    return <LoginPage appName={appName} onLogin={() => setIsAuthenticated(true)} />;
  }
  return <Console appName={appName} setAppName={setAppName} onSignOut={() => signOut(auth)} />;
}

/* ------------------------------ Top bar ------------------------------ */
function TopBar({ counts, today, appName }) {
  return (
    <div className="sticky top-0 z-10 border-b px-8 py-4 flex items-center justify-between" style={{ background: "rgba(246,245,241,0.9)", backdropFilter: "blur(6px)", borderColor: LINE }}>
      <div>
        <h1 className="text-lg font-semibold" style={{ color: INK }}>Good morning, AMS</h1>
        <p className="text-xs" style={{ color: "#8B8C92" }}>{today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {appName}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge icon={Bell} label="Due Today" value={counts.dueToday} fg={AMBER} bg={AMBER_SOFT} />
        <Badge icon={AlertTriangle} label="Overdue" value={counts.overdue} fg={RED} bg={RED_SOFT} />
        <Badge icon={CalendarDays} label="Upcoming" value={counts.upcoming} fg={BLUE} bg={BLUE_SOFT} />
        <Badge icon={CheckCircle2} label="Completed Today" value={counts.completedToday} fg={GREEN} bg={GREEN_SOFT} />
      </div>
    </div>
  );
}
function Badge({ icon: Icon, label, value, fg, bg }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: bg }}>
      <Icon size={13} style={{ color: fg }} />
      <span className="text-xs font-semibold" style={{ color: fg }}>{value}</span>
      <span className="text-xs" style={{ color: fg }}>{label}</span>
    </div>
  );
}

/* ------------------------------ Dashboard ------------------------------ */
function Dashboard({ counts, allQuotations, todaysFollowups, onOpenFollowup, onOpenDetail, lastImport, totalRecords, onGoImport }) {
  const totalActive = allQuotations.filter((q) => !["Won", "Lost"].includes(q.status)).length;
  const accountQ = allQuotations.filter((q) => q.category === "Account").length;
  const payrollQ = allQuotations.filter((q) => q.category === "Payroll").length;
  const won = allQuotations.filter((d) => d.status === "Won").length;
  const lost = allQuotations.filter((d) => d.status === "Lost").length;

  return (
    <div className="flex flex-col gap-6">
      {lastImport ? (
        <div className="rounded-xl border bg-white px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderColor: LINE }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: TEAL_SOFT }}><FileText size={18} style={{ color: TEAL }} /></div>
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>Last Data Import</div>
              <div className="text-sm font-semibold" style={{ color: INK }}>{fmtDateTime(new Date(lastImport.importDate))}</div>
            </div>
            <div className="w-px h-8" style={{ background: LINE }} />
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>Source</div>
              <div className="text-sm font-medium" style={{ color: INK }}>PDF Quotation</div>
            </div>
            <div className="w-px h-8" style={{ background: LINE }} />
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>Records Imported</div>
              <div className="text-sm font-medium" style={{ color: INK }}>{lastImport.newRecords + lastImport.updated}<span className="text-xs font-normal" style={{ color: "#9A9AA0" }}> of {lastImport.totalRows} rows · {lastImport.docType}</span></div>
            </div>
            <div className="w-px h-8" style={{ background: LINE }} />
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>Records on File</div>
              <div className="text-sm font-medium" style={{ color: INK }}>{totalRecords}</div>
            </div>
          </div>
          <button onClick={onGoImport} className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg" style={{ background: INK, color: "white" }}>
            <UploadCloud size={14} /> Import Latest PDF
          </button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-6 flex items-center justify-between" style={{ borderColor: LINE }}>
          <div className="flex items-center gap-3">
            <Info size={18} style={{ color: "#9A9AA0" }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: INK }}>No data imported yet</div>
              <div className="text-xs" style={{ color: "#9A9AA0" }}>Import a quotation PDF to build your follow-up list.</div>
            </div>
          </div>
          <button onClick={onGoImport} className="text-xs font-medium px-3.5 py-2 rounded-lg" style={{ background: INK, color: "white" }}>Import PDF</button>
        </div>
      )}

      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard label="Active Quotations" value={totalActive} />
        <StatCard label="Due Today" value={counts.dueToday} tint={AMBER} />
        <StatCard label="Overdue" value={counts.overdue} tint={RED} />
        <StatCard label="Upcoming" value={counts.upcoming} tint={BLUE} />
        <StatCard label="Account Quotations" value={accountQ} />
        <StatCard label="Payroll Quotations" value={payrollQ} />
        <StatCard label="Won · Lost" value={`${won} · ${lost}`} tint={GREEN} />
      </div>

      <div className="rounded-xl border bg-white" style={{ borderColor: LINE }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: LINE }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: INK }}>Today's Follow-ups</h2>
            <p className="text-xs" style={{ color: "#9A9AA0" }}>Overdue first, then due-today. This is your morning list.</p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: TEAL_SOFT, color: TEAL }}>{todaysFollowups.length} to action</span>
        </div>
        {todaysFollowups.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: "#9A9AA0" }}>Nothing due today or overdue — you're all caught up.</div>
        ) : (
          <FollowupTable docs={todaysFollowups} onOpenFollowup={onOpenFollowup} onOpenDetail={onOpenDetail} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Shared table ------------------------------ */
function FollowupTable({ docs, onOpenFollowup, onOpenDetail, onDeleteDoc, selectable, selectedKeys, onToggleOne, onToggleAll }) {
  const keyOf = (d) => `${d.docType}:${d.id}`;
  const allSelected = selectable && docs.length > 0 && docs.every((d) => selectedKeys.has(keyOf(d)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>
            {selectable && (
              <th className="px-5 py-2.5 font-medium w-8">
                <input type="checkbox" checked={allSelected} onChange={() => onToggleAll(docs)} />
              </th>
            )}
            <th className="px-3 py-2.5 font-medium">Doc Date</th>
            <th className="px-5 py-2.5 font-medium">Company Name</th>
            <th className="px-3 py-2.5 font-medium">Person in Charge</th>
            <th className="px-3 py-2.5 font-medium">Phone</th>
            <th className="px-3 py-2.5 font-medium">Doc No.</th>
            <th className="px-3 py-2.5 font-medium">Total Amount</th>
            <th className="px-3 py-2.5 font-medium">Follow-up Stage</th>
            <th className="px-3 py-2.5 font-medium">Next Follow-up</th>
            <th className="px-3 py-2.5 font-medium">Agent</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.docType + d.id} className="border-t hover:bg-[#FBFAF7]" style={{ borderColor: LINE, background: selectable && selectedKeys.has(keyOf(d)) ? "#FBFAF7" : undefined }}>
              {selectable && (
                <td className="px-5 py-3">
                  <input type="checkbox" checked={selectedKeys.has(keyOf(d))} onChange={() => onToggleOne(d)} />
                </td>
              )}
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{fmtDate(d.date)}</td>
              <td className="px-5 py-3"><button className="text-left" onClick={() => onOpenDetail(d)}><div className="font-medium" style={{ color: INK }}>{d.company}</div></button></td>
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{d.contactName || "—"}</td>
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{d.phone || "—"}</td>
              <td className="px-3 py-3 font-mono text-xs" style={{ color: INK }}>{d.docNo}</td>
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{money(d.amount)}</td>
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{d.currentStage ? `${d.currentStage.label} (${d.currentStage.tag})` : "Completed"}</td>
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{d.nextDate ? fmtDate(ymd(d.nextDate)) : "—"}</td>
              <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{d.assignedAgent || d.staff || "Unassigned"}</td>
              <td className="px-3 py-3"><StatusPill status={d.status} /></td>
              <td className="px-5 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => onOpenFollowup(d)} className="text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={{ background: INK, color: "white" }}>Follow Up <ChevronRight size={13} /></button>
                  {onDeleteDoc && (
                    <button onClick={() => onDeleteDoc(d)} title="Delete" className="p-1.5 rounded-lg" style={{ color: RED, background: RED_SOFT }}><Trash2 size={13} /></button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ------------------------------ Doc list page ------------------------------ */
const EMPTY_FILTERS = { search: "", category: "All", status: "All", agent: "All", year: "All", month: "All" };

function DocListPage({ title, docs, agents = DEFAULT_AGENTS, onOpenFollowup, onOpenDetail, onDeleteDoc, onBulkDelete }) {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const years = Array.from(new Set(docs.map((d) => parseYMD(d.date).getFullYear()))).sort((a, b) => b - a);

  const filtered = docs.filter((d) => {
    if (applied.category !== "All" && d.category !== applied.category) return false;
    if (applied.status !== "All" && d.status !== applied.status) return false;
    if (applied.agent !== "All" && (d.assignedAgent || d.staff) !== applied.agent) return false;
    const dDate = parseYMD(d.date);
    if (applied.year !== "All" && String(dDate.getFullYear()) !== applied.year) return false;
    if (applied.month !== "All" && MONTH_NAMES[dDate.getMonth()] !== applied.month) return false;
    if (applied.search) {
      const q = applied.search.toLowerCase();
      const hay = `${d.customer?.name} ${d.customer?.company} ${d.docNo}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const statuses = ["All", "Due Today", "Overdue", "Upcoming", "Completed", "Won", "Lost", "No Response"];
  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const isFilteredAtAll = Object.entries(applied).some(([k, v]) => v !== EMPTY_FILTERS[k]);

  const runFilter = () => { setApplied(draft); setSelectedKeys(new Set()); };
  const resetFilters = () => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setSelectedKeys(new Set()); };
  const keyOf = (d) => `${d.docType}:${d.id}`;
  const toggleOne = (d) => setSelectedKeys((prev) => { const next = new Set(prev); const k = keyOf(d); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  const toggleAll = (visibleDocs) => setSelectedKeys((prev) => {
    const allSelected = visibleDocs.length > 0 && visibleDocs.every((d) => prev.has(keyOf(d)));
    if (allSelected) return new Set();
    return new Set(visibleDocs.map(keyOf));
  });
  const selectedDocs = filtered.filter((d) => selectedKeys.has(keyOf(d)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ color: INK }}>{title}</h2>
        <span className="text-xs" style={{ color: "#9A9AA0" }}>{filtered.length} of {docs.length}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white flex-1 min-w-[220px]" style={{ borderColor: LINE }}>
          <Search size={14} style={{ color: "#9A9AA0" }} />
          <input value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") runFilter(); }} placeholder="Search customer, company, or document no." className="text-sm outline-none flex-1 bg-transparent" />
        </div>
        <Select value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} options={["All", "Account", "Payroll"]} label="Category" />
        <Select value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })} options={statuses} label="Status" />
        <Select value={draft.agent} onChange={(v) => setDraft({ ...draft, agent: v })} options={["All", ...agents.map((agent) => agent.name)]} label="Agent" />
        <Select value={draft.year} onChange={(v) => setDraft({ ...draft, year: v })} options={["All", ...years.map(String)]} label="Year" />
        <Select value={draft.month} onChange={(v) => setDraft({ ...draft, month: v })} options={["All", ...MONTH_NAMES]} label="Month" />
        <button onClick={runFilter} className="text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5" style={{ background: isDirty ? INK : "#3A3B41", color: "white" }}>
          <Filter size={13} /> Filter
        </button>
        {isFilteredAtAll && (
          <button onClick={resetFilters} className="text-xs font-medium px-3 py-2 rounded-lg border" style={{ borderColor: LINE, color: "#5C5D63" }}>Reset</button>
        )}
      </div>

      {selectedKeys.size > 0 && onBulkDelete && (
        <div className="rounded-xl border px-4 py-2.5 flex items-center justify-between" style={{ borderColor: RED, background: RED_SOFT }}>
          <span className="text-xs font-medium" style={{ color: RED }}>{selectedKeys.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedKeys(new Set())} className="text-xs font-medium px-2 py-1 rounded-md" style={{ color: "#8A3B3B" }}>Clear</button>
            <button onClick={() => { onBulkDelete(selectedDocs); setSelectedKeys(new Set()); }} className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: RED, color: "white" }}>
              <Trash2 size={13} /> Delete Selected
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
        {docs.length === 0 ? (
          <EmptyImportState />
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: "#9A9AA0" }}>No records match these filters.</div>
        ) : (
          <FollowupTable docs={filtered} onOpenFollowup={onOpenFollowup} onOpenDetail={onOpenDetail} onDeleteDoc={onDeleteDoc}
            selectable={!!onBulkDelete} selectedKeys={selectedKeys} onToggleOne={toggleOne} onToggleAll={toggleAll} />
        )}
      </div>
    </div>
  );
}
function EmptyImportState() {
  return (
    <div className="px-5 py-14 text-center flex flex-col items-center gap-2">
      <UploadCloud size={22} style={{ color: "#C7C6BE" }} />
      <div className="text-sm font-medium" style={{ color: INK }}>No records yet</div>
      <div className="text-xs" style={{ color: "#9A9AA0" }}>Import a quotation PDF to get started.</div>
    </div>
  );
}

/* ------------------------------ Customers page ------------------------------ */
function CustomersPage({ allDocs, customers, onDeleteCustomer, onBulkDeleteCustomers, onOpenCustomerDocs }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleOne = (id) => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelectedIds((prev) => (prev.size === customers.length ? new Set() : new Set(customers.map((c) => c.id))));
  const map = new Map();
  allDocs.forEach((d) => {
    const key = `${d.company}|${d.contactName}`;
    if (!map.has(key)) map.set(key, { company: d.company, name: d.contactName, phone: d.phone, email: d.email, docs: [] });
    map.get(key).docs.push(d);
  });
  const docCustomers = Array.from(map.values());
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold" style={{ color: INK }}>Customer Master (Imported)</h2>
          <span className="text-xs" style={{ color: "#9A9AA0" }}>{customers.length} imported</span>
        </div>
        {selectedIds.size > 0 && onBulkDeleteCustomers && (
          <div className="rounded-xl border px-4 py-2.5 flex items-center justify-between mb-2" style={{ borderColor: RED, background: RED_SOFT }}>
            <span className="text-xs font-medium" style={{ color: RED }}>{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedIds(new Set())} className="text-xs font-medium px-2 py-1 rounded-md" style={{ color: "#8A3B3B" }}>Clear</button>
              <button onClick={() => { onBulkDeleteCustomers(customers.filter((c) => selectedIds.has(c.id))); setSelectedIds(new Set()); }} className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: RED, color: "white" }}>
                <Trash2 size={13} /> Delete Selected
              </button>
            </div>
          </div>
        )}
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
          {customers.length === 0 ? (
            <div className="px-5 py-8 text-center flex flex-col items-center gap-2">
              <UploadCloud size={20} style={{ color: "#C7C6BE" }} />
              <div className="text-xs" style={{ color: "#9A9AA0" }}>No customer master data imported yet. Use Import Data → Customer Import.</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>
                  <th className="px-5 py-2.5 font-medium w-8"><input type="checkbox" checked={selectedIds.size === customers.length} onChange={toggleAll} /></th>
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: LINE, background: selectedIds.has(c.id) ? "#FBFAF7" : undefined }}>
                    <td className="px-5 py-3"><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} /></td>
                    <td className="px-3 py-3 font-medium flex items-center gap-1.5" style={{ color: INK }}><Building2 size={12} />{c.company}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{c.contactName || "—"}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{c.phone || "—"}</td>
                    <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{c.email || "—"}</td>
                    <td className="px-3 py-3 text-xs">{c.category ? <Tag>{c.category}</Tag> : "—"}</td>
                    <td className="px-3 py-3 text-[11px]" style={{ color: "#9A9AA0" }}>{fmtDate(ymd(new Date(c.importDate)))}</td>
                    <td className="px-5 py-3 text-right"><IconBtn icon={Trash2} label="Delete" onClick={() => onDeleteCustomer(c)} danger /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-2" style={{ color: INK }}>Customers in Documents</h2>
        <p className="text-xs mb-2" style={{ color: "#9A9AA0" }}>Derived from quotations. Click "Open Docs" to see everything for that customer.</p>
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
          {docCustomers.length === 0 ? <EmptyImportState /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>
                  <th className="px-5 py-2.5 font-medium">Contact</th>
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Phone</th>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Open Docs</th>
                  <th className="px-3 py-2.5 font-medium">Won</th>
                </tr>
              </thead>
              <tbody>
                {docCustomers.map((c, i) => {
                  const open = c.docs.filter((d) => !["Won", "Lost"].includes(d.status)).length;
                  const won = c.docs.filter((d) => d.status === "Won").length;
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: LINE }}>
                      <td className="px-5 py-3 font-medium" style={{ color: INK }}>{c.name}</td>
                      <td className="px-3 py-3 text-xs flex items-center gap-1.5" style={{ color: "#5C5D63" }}><Building2 size={12} />{c.company}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}><PhoneCall size={12} className="inline mr-1" />{c.phone}</td>
                      <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}><Mail size={12} className="inline mr-1" />{c.email}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => onOpenCustomerDocs(c.company, c.name)} className="text-xs font-medium underline decoration-dotted" style={{ color: TEAL }}>{open} open</button>
                      </td>
                      <td className="px-3 py-3 text-xs" style={{ color: GREEN }}>{won}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Customer docs drill-down drawer ------------------------------ */
function CustomerDocsDrawer({ customer, docs, onClose, onOpenDetail }) {
  return (
    <div className="fixed inset-0 z-25 flex items-center justify-end" style={{ background: "rgba(18,23,43,0.4)" }}>
      <div className="h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: LINE }}>
          <div>
            <div className="text-xs font-medium" style={{ color: "#9A9AA0" }}>Customer</div>
            <h3 className="text-lg font-semibold" style={{ color: INK }}>{customer.name}</h3>
            <div className="text-xs" style={{ color: "#9A9AA0" }}>{customer.company}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F2F1EC]"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9A9AA0" }}>{docs.length} document{docs.length !== 1 ? "s" : ""}</div>
          {docs.length === 0 ? (
            <div className="text-sm text-center py-10" style={{ color: "#9A9AA0" }}>No quotations for this customer.</div>
          ) : (
            docs.map((d) => (
              <button key={d.docType + d.id} onClick={() => onOpenDetail(d)} className="text-left rounded-lg border p-3 flex items-center justify-between hover:bg-[#FBFAF7]" style={{ borderColor: LINE }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: INK }}>{d.docNo} <span className="text-xs font-normal" style={{ color: "#9A9AA0" }}>· {d.docType} · {d.category}</span></div>
                  <div className="text-xs" style={{ color: "#9A9AA0" }}>{fmtDate(d.date)} · {money(d.amount)} · {d.staff}</div>
                </div>
                <StatusPill status={d.status} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Import batch drill-down drawer ------------------------------ */
function BatchDrawer({ batch, records, recordType, onClose, onOpenDetail, onOpenCustomer }) {
  return (
    <div className="fixed inset-0 z-25 flex items-center justify-end" style={{ background: "rgba(18,23,43,0.4)" }}>
      <div className="h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: LINE }}>
          <div>
            <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#9A9AA0" }}><FileText size={13} style={{ color: TEAL }} /> Import Batch</div>
            <h3 className="text-lg font-semibold" style={{ color: INK }}>{batch ? batch.fileName : "Batch"}</h3>
            {batch && <div className="text-xs" style={{ color: "#9A9AA0" }}>{fmtDateTime(new Date(batch.importDate))} · {batch.docType}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F2F1EC]"><X size={18} /></button>
        </div>
        {batch && (
          <div className="px-6 py-4 border-b grid grid-cols-4 gap-3" style={{ borderColor: LINE }}>
            <MiniStat label="New" value={batch.newRecords} tint={GREEN} />
            <MiniStat label="Updated" value={batch.updated} tint={BLUE} />
            <MiniStat label="Skipped" value={batch.skipped} tint={GRAY} />
            <MiniStat label="Errors" value={batch.errors} tint={RED} />
          </div>
        )}
        <div className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9A9AA0" }}>{records.length} record{records.length !== 1 ? "s" : ""} currently on file from this batch</div>
          {records.length === 0 ? (
            <div className="text-sm text-center py-10" style={{ color: "#9A9AA0" }}>No records from this batch remain (they may have been updated by a later import or deleted).</div>
          ) : recordType === "customer" ? (
            records.map((c) => (
              <button key={c.id} onClick={() => onOpenCustomer(c)} className="text-left rounded-lg border p-3 flex items-center justify-between hover:bg-[#FBFAF7]" style={{ borderColor: LINE }}>
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: INK }}><Building2 size={12} />{c.company}</div>
                  <div className="text-xs" style={{ color: "#9A9AA0" }}>{c.contactName || "—"} · {c.phone || "—"} · {c.email || "—"}</div>
                </div>
                {c.category && <Tag>{c.category}</Tag>}
              </button>
            ))
          ) : (
            records.map((d) => (
              <button key={d.docType + d.id} onClick={() => onOpenDetail(d)} className="text-left rounded-lg border p-3 flex items-center justify-between hover:bg-[#FBFAF7]" style={{ borderColor: LINE }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: INK }}>{d.docNo} <span className="text-xs font-normal" style={{ color: "#9A9AA0" }}>· {d.company}</span></div>
                  <div className="text-xs" style={{ color: "#9A9AA0" }}>{fmtDate(d.date)} · {money(d.amount)}</div>
                </div>
                <StatusPill status={d.status} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Follow-up Action Panel ------------------------------ */
function FollowupPanel({ doc, templates, agents, phones, onClose, onAction }) {
  const stageInfo = doc.currentStage;
  const template = templates.find((t) => t.docType === doc.docType && t.category === doc.category && t.stageCode === stageInfo?.code) || templates.find((t) => t.docType === doc.docType && t.stageCode === stageInfo?.code);
  const vars = { CustomerName: (doc.customer?.name || "").split(" ")[0], CompanyName: doc.customer?.company, QuotationNo: doc.docNo, QuotationDate: fmtDate(doc.date), Amount: money(doc.amount), StaffName: (doc.staff || "").split(" ")[0] };
  const [message, setMessage] = useState(template ? renderTemplate(template.message, vars) : "");
  const [agentName, setAgentName] = useState(doc.assignedAgent || doc.staff || agents.find((agent) => agent.active)?.name || "");
  const [phoneId, setPhoneId] = useState(doc.sendingPhoneId || "");
  const [copied, setCopied] = useState(false);
  const [reschedulingOpen, setReschedulingOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(doc.nextDate ? ymd(doc.nextDate) : "");
  const copy = () => { navigator.clipboard?.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const confirmReschedule = () => { if (rescheduleDate) onAction("Rescheduled", { rescheduleDate, agentName, phoneId }); };
  const submitAction = (action) => onAction(action, { agentName, phoneId });
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-end" style={{ background: "rgba(18,23,43,0.45)" }}>
      <div className="h-full w-full max-w-md bg-white flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: LINE }}>
          <div>
            <div className="text-xs font-medium" style={{ color: "#9A9AA0" }}>{doc.docType} · {doc.category}</div>
            <h3 className="text-base font-semibold" style={{ color: INK }}>{doc.customer?.name}</h3>
            <div className="text-xs" style={{ color: "#9A9AA0" }}>{doc.customer?.company}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F2F1EC]"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Document No." value={doc.docNo} />
            <Field label="Follow-up Stage" value={stageInfo ? `${stageInfo.label} (${stageInfo.tag})` : "Completed"} />
            <Field label="Document Date" value={fmtDate(doc.date)} />
            <Field label="Amount" value={money(doc.amount)} />
            <div><div className="text-[11px] mb-1" style={{ color: "#9A9AA0" }}>Agent</div><select value={agentName} onChange={(e) => setAgentName(e.target.value)} className="w-full text-xs rounded-md border px-2 py-1.5 bg-white" style={{ borderColor: LINE }}><option value="">Select agent</option>{agents.filter((agent) => agent.active || agent.name === agentName).map((agent) => <option key={agent.id} value={agent.name}>{agent.name}</option>)}</select></div>
            <div><div className="text-[11px] mb-1" style={{ color: "#9A9AA0" }}>Sending phone</div><select value={phoneId} onChange={(e) => setPhoneId(e.target.value)} className="w-full text-xs rounded-md border px-2 py-1.5 bg-white" style={{ borderColor: LINE }}><option value="">Select phone</option>{phones.filter((phone) => phone.active || phone.id === phoneId).map((phone) => <option key={phone.id} value={phone.id}>{phone.name} · {phone.number}</option>)}</select></div>
            <Field label="Status" custom={<StatusPill status={doc.status} />} />
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: LINE, background: "#FBFAF7" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: INK }}>Recommended message</span>
              {template && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: TEAL_SOFT, color: TEAL }}>{template.type} · {template.language}</span>}
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className="w-full text-sm rounded-md border p-2.5 outline-none resize-none" style={{ borderColor: LINE, color: "#3A3B41" }} />
            <button onClick={copy} className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-lg" style={{ background: copied ? GREEN_SOFT : TEAL_SOFT, color: copied ? GREEN : TEAL }}>
              <Copy size={13} /> {copied ? "Copied to clipboard" : "Copy Message"}
            </button>
          </div>

          {reschedulingOpen && (
            <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: BLUE, background: BLUE_SOFT }}>
              <div className="text-xs font-semibold" style={{ color: BLUE }}>Pick a new follow-up date</div>
              <div className="flex items-center gap-2">
                <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className="flex-1 text-sm rounded-md border px-2.5 py-2 outline-none bg-white" style={{ borderColor: LINE }} />
                <button onClick={confirmReschedule} className="text-xs font-medium px-3 py-2 rounded-lg" style={{ background: BLUE, color: "white" }}>Confirm</button>
                <button onClick={() => setReschedulingOpen(false)} className="text-xs font-medium px-2 py-2 rounded-lg" style={{ color: "#5C5D63" }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="text-[11px] rounded-lg border p-2.5 flex items-start gap-1.5" style={{ borderColor: LINE, color: "#9A9AA0" }}>
            <Info size={12} className="mt-0.5 shrink-0" />
            Source data (customer, amount, date) comes from SQL Accounting. This action only updates follow-up progress, never the imported document.
          </div>
          {doc.notes && <div className="text-xs rounded-lg border p-3" style={{ borderColor: LINE }}><span className="font-semibold block mb-1" style={{ color: INK }}>Notes</span><span style={{ color: "#5C5D63" }}>{doc.notes}</span></div>}
        </div>
        <div className="px-5 py-4 border-t grid grid-cols-2 gap-2" style={{ borderColor: LINE }}>
          <ActionBtn label="Mark as Completed" onClick={() => submitAction("Completed")} primary />
          <ActionBtn label="Customer Responded" onClick={() => submitAction("Customer Responded")} />
          <ActionBtn label="Reschedule" onClick={() => setReschedulingOpen((v) => !v)} />
          <ActionBtn label="No Response" onClick={() => submitAction("No Response")} />
          <ActionBtn label="Won" onClick={() => submitAction("Won")} tint={GREEN} />
          <ActionBtn label="Lost" onClick={() => submitAction("Lost")} tint={GRAY} />
        </div>
      </div>
    </div>
  );
}
function ActionBtn({ label, onClick, primary, tint }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-medium py-2.5 rounded-lg border"
      style={primary ? { background: INK, color: "white", borderColor: INK } : tint ? { background: "white", color: tint, borderColor: tint } : { background: "white", color: "#3A3B41", borderColor: LINE }}>
      {label}
    </button>
  );
}

/* ------------------------------ Detail Drawer ------------------------------ */
function DetailDrawer({ doc, onClose, onOpenFollowup, onUpdateCategory }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-end" style={{ background: "rgba(18,23,43,0.4)" }}>
      <div className="h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: LINE }}>
          <div>
            <div className="text-xs font-medium" style={{ color: "#9A9AA0" }}>{doc.docType} · {doc.docNo}</div>
            <h3 className="text-lg font-semibold" style={{ color: INK }}>{doc.customer?.company}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F2F1EC]"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 flex flex-col gap-6">
          <section>
            <SectionTitle>Customer Information</SectionTitle>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Contact Person" value={doc.customer?.name} />
              <Field label="Company" value={doc.customer?.company} />
              <Field label="Phone" value={doc.customer?.phone} />
              <Field label="Email" value={doc.customer?.email} />
            </div>
          </section>
          <section>
            <SectionTitle>{doc.docType} Information</SectionTitle>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Document No." value={doc.docNo} />
              <Field label="Date" value={fmtDate(doc.date)} />
              <Field label="Amount" value={money(doc.amount)} />
              <Field label="Category" custom={
                <select value={doc.category} onChange={(e) => onUpdateCategory(e.target.value)} className="text-sm font-medium rounded-md border px-1.5 py-1 outline-none bg-white" style={{ borderColor: LINE, color: INK }}>
                  <option value="Account">Account</option>
                  <option value="Payroll">Payroll</option>
                </select>
              } />
              <Field label="Agent" value={doc.assignedAgent || doc.staff || "Unassigned"} />
              <Field label="Status" custom={<StatusPill status={doc.status} />} />
            </div>
          </section>
          <section>
            <SectionTitle>Data Source</SectionTitle>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Source" value={doc.source} />
              <Field label="Import Date" value={doc.importDate ? fmtDateTime(new Date(doc.importDate)) : "—"} />
              <Field label="Original File" value={doc.importFileName} />
              <Field label="Import Batch" value={doc.importBatchId} />
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-2">
              <SectionTitle noMargin>Follow-up Timeline</SectionTitle>
              {!["Won", "Lost"].includes(doc.status) && <button onClick={() => onOpenFollowup(doc)} className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: INK, color: "white" }}>Follow Up</button>}
            </div>
            <Timeline events={doc.history} />
          </section>
          {doc.notes && <section><SectionTitle>Notes</SectionTitle><p className="text-sm rounded-lg border p-3" style={{ borderColor: LINE, color: "#5C5D63" }}>{doc.notes}</p></section>}
        </div>
      </div>
    </div>
  );
}
function SectionTitle({ children, noMargin }) { return <h4 className={`text-xs font-semibold uppercase tracking-wide ${noMargin ? "" : "mb-2"}`} style={{ color: "#9A9AA0" }}>{children}</h4>; }
function Timeline({ events }) {
  return (
    <div className="flex flex-col">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: i === events.length - 1 ? TEAL : "#D8D6CE" }} />
            {i < events.length - 1 && <div className="w-px flex-1" style={{ background: LINE }} />}
          </div>
          <div className="pb-4">
            <div className="text-xs font-semibold" style={{ color: INK }}>{e.label} <span className="font-normal" style={{ color: "#9A9AA0" }}>· {fmtDate(e.date)}</span></div>
            <div className="text-xs" style={{ color: "#7C7D82" }}>{e.note}</div>
            {e.template && <div className="text-[11px] mt-0.5" style={{ color: TEAL }}>Template: {e.template}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Templates page ------------------------------ */
function TemplatesPage({ templates, setTemplates }) {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("All");
  const [category, setCategory] = useState("All");
  const [editing, setEditing] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const filtered = templates.filter((t) => {
    if (docType !== "All" && t.docType !== docType) return false;
    if (category !== "All" && t.category !== category) return false;
    if (search && !`${t.title} ${t.message}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const save = (tpl) => {
    const exists = templates.some((p) => p.id === tpl.id);
    setTemplates((prev) => (exists ? prev.map((p) => (p.id === tpl.id ? tpl : p)) : [...prev, tpl]));
    const operation = exists ? templateStore.update(tpl.id, tpl) : templateStore.create(tpl);
    operation.catch((error) => console.error("[Firestore] Message template save failed", error));
    setEditing(null);
  };
  const remove = (id) => {
    setTemplates((prev) => prev.filter((p) => p.id !== id));
    templateStore.remove(id).catch((error) => console.error("[Firestore] Message template delete failed", error));
  };
  const duplicate = (tpl) => {
    const copy = { ...tpl, id: uid("t"), title: tpl.title + " (Copy)" };
    setTemplates((prev) => [...prev, copy]);
    templateStore.create(copy).catch((error) => console.error("[Firestore] Message template create failed", error));
  };
  const sampleVars = { CustomerName: "Michelle", CompanyName: "ABC Sdn Bhd", QuotationNo: "QT-000123", QuotationDate: "24 Aug 2026", Amount: "RM 4,800", StaffName: "AMS" };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: INK }}>Message Templates</h2>
          <p className="text-xs" style={{ color: "#9A9AA0" }}>Reusable shortcut messages by document type, category, follow-up stage, and language.</p>
        </div>
        <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg" style={{ background: INK, color: "white" }}><Plus size={14} /> Create Template</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white flex-1 min-w-[220px]" style={{ borderColor: LINE }}>
          <Search size={14} style={{ color: "#9A9AA0" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className="text-sm outline-none flex-1 bg-transparent" />
        </div>
        <Select value={docType} onChange={setDocType} options={["All", "Quotation"]} label="Type" />
        <Select value={category} onChange={setCategory} options={["All", "Account", "Payroll"]} label="Category" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((t) => (
          <div key={t.id} className="rounded-xl border bg-white p-4 flex flex-col gap-2" style={{ borderColor: LINE }}>
            <div>
              <div className="text-sm font-semibold" style={{ color: INK }}>{t.title}</div>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <Tag>{t.docType}</Tag><Tag>{t.category}</Tag><Tag>{t.stageTag}</Tag><Tag><Globe2 size={10} className="inline mr-0.5" />{t.language}</Tag><Tag>{t.type}</Tag>
              </div>
            </div>
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "#6B6C72" }}>{previewId === t.id ? renderTemplate(t.message, sampleVars) : t.message}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <IconBtn icon={Pencil} label="Edit" onClick={() => setEditing(t)} />
              <IconBtn icon={Copy} label="Duplicate" onClick={() => duplicate(t)} />
              <IconBtn icon={Search} label={previewId === t.id ? "Hide Preview" : "Preview"} onClick={() => setPreviewId(previewId === t.id ? null : t.id)} />
              <IconBtn icon={Trash2} label="Delete" onClick={() => remove(t.id)} danger />
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-2 text-center text-sm py-10" style={{ color: "#9A9AA0" }}>No templates match these filters.</div>}
      </div>
      {editing && <TemplateEditor tpl={editing === "new" ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}
function TemplateEditor({ tpl, onSave, onClose }) {
  const [form, setForm] = useState(tpl || { id: uid("t"), docType: "Quotation", category: "Account", stageCode: "day3", stageTag: "Day 3", language: "English", type: "WhatsApp", title: "", message: "" });
  const stageOptions = [{ code: "day3", tag: "Day 3" }, { code: "day5", tag: "Day 5" }, { code: "day7", tag: "Day 7" }, { code: "day10", tag: "Day 10" }, { code: "day15", tag: "Day 15" }];
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center" style={{ background: "rgba(18,23,43,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-3 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold" style={{ color: INK }}>{tpl ? "Edit Template" : "Create Template"}</h3><button onClick={onClose}><X size={16} /></button></div>
        <LabeledInput label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledSelect label="Document Type" value={form.docType} onChange={(v) => setForm({ ...form, docType: v })} options={["Quotation"]} />
          <LabeledSelect label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={["Account", "Payroll"]} />
          <LabeledSelect label="Follow-up Stage" value={form.stageCode} onChange={(v) => setForm({ ...form, stageCode: v, stageTag: stageOptions.find((s) => s.code === v).tag })} options={stageOptions.map((s) => s.code)} display={(v) => stageOptions.find((s) => s.code === v).tag} />
          <LabeledSelect label="Language" value={form.language} onChange={(v) => setForm({ ...form, language: v })} options={["English", "Bahasa Malaysia", "Mandarin"]} />
          <LabeledSelect label="Message Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={["WhatsApp", "Email", "SMS"]} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>Message</label>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={5} className="w-full text-sm rounded-lg border p-2.5 outline-none resize-none" style={{ borderColor: LINE }} placeholder="Hi {{CustomerName}}, following up on {{QuotationNo}}..." />
          <p className="text-[10px] mt-1" style={{ color: "#B0B0B5" }}>Variables: {"{{CustomerName}} {{CompanyName}} {{QuotationNo}} {{QuotationDate}} {{Amount}} {{StaffName}}"}</p>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="text-xs font-medium px-3 py-2 rounded-lg border" style={{ borderColor: LINE, color: "#5C5D63" }}>Cancel</button>
          <button onClick={() => onSave(form)} className="text-xs font-medium px-3 py-2 rounded-lg" style={{ background: INK, color: "white" }}>Save Template</button>
        </div>
      </div>
    </div>
  );
}
function LabeledInput({ label, value, onChange }) {
  return (<div><label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm rounded-lg border px-2.5 py-2 outline-none" style={{ borderColor: LINE }} /></div>);
}
function LabeledSelect({ label, value, onChange, options, display }) {
  return (<div><label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>{label}</label><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm rounded-lg border px-2.5 py-2 outline-none bg-white" style={{ borderColor: LINE }}>{options.map((o) => <option key={o} value={o}>{display ? display(o) : o}</option>)}</select></div>);
}

/* ------------------------------ Holidays page ------------------------------ */
function HolidaysPage({ holidays, setHolidays, operatingState, setOperatingState, requestDelete }) {
  const [form, setForm] = useState({ date: "", name: "", state: "All" });
  const [editingId, setEditingId] = useState(null);
  const [viewState, setViewState] = useState("All");
  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const visible = viewState === "All" ? sorted : sorted.filter((h) => h.state === "All" || h.state === viewState);

  const addOrUpdate = () => {
    if (!form.date || !form.name) return;
    if (editingId) { setHolidays((prev) => prev.map((h) => (h.id === editingId ? { ...h, ...form } : h))); setEditingId(null); }
    else setHolidays((prev) => [...prev, { id: uid("h"), ...form }]);
    setForm({ date: "", name: "", state: "All" });
  };
  const edit = (h) => { setForm({ date: h.date, name: h.name, state: h.state }); setEditingId(h.id); };
  const remove = (h) => requestDelete(`Delete "${h.name}" (${fmtDate(h.date)})? This holiday will no longer be excluded from working-day calculations.`, () => setHolidays((prev) => prev.filter((x) => x.id !== h.id)));
  const restoreDefaults = () => setHolidays((prev) => {
    const existing = new Set(prev.map((h) => h.date + h.name + h.state));
    const toAdd = DEFAULT_HOLIDAYS.filter((h) => !existing.has(h.date + h.name + h.state)).map((h) => ({ ...h, id: uid("h") }));
    return [...prev, ...toAdd];
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-semibold" style={{ color: INK }}>Malaysian Public Holiday Calendar</h2><p className="text-xs" style={{ color: "#9A9AA0" }}>Real 2026 national and state holidays. Working-day follow-up dates skip weekends and every holiday that applies to your operating state.</p></div>
        <button onClick={restoreDefaults} className="text-xs font-medium px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={12} /> Restore Full 2026 Calendar</button>
      </div>

      <div className="rounded-xl border p-4 flex items-center justify-between flex-wrap gap-3" style={{ borderColor: TEAL, background: TEAL_SOFT }}>
        <div className="flex items-center gap-2">
          <Info size={15} style={{ color: TEAL }} />
          <div className="text-xs" style={{ color: TEAL }}>
            <div className="font-semibold">Operating State</div>
            <div>Follow-up dates skip national holidays plus holidays for this state.</div>
          </div>
        </div>
        <select value={operatingState} onChange={(e) => setOperatingState(e.target.value)} className="text-xs font-medium rounded-lg border px-3 py-2 outline-none bg-white" style={{ borderColor: TEAL, color: INK }}>
          {MY_STATES.filter((s) => s !== "All").map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="rounded-xl border bg-white p-4 grid grid-cols-4 gap-3 items-end" style={{ borderColor: LINE }}>
        <div><label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full text-sm rounded-lg border px-2.5 py-2 outline-none" style={{ borderColor: LINE }} /></div>
        <div><label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>Holiday Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hari Raya Haji" className="w-full text-sm rounded-lg border px-2.5 py-2 outline-none" style={{ borderColor: LINE }} /></div>
        <div><label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>State</label><select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full text-sm rounded-lg border px-2.5 py-2 outline-none bg-white" style={{ borderColor: LINE }}>{MY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <button onClick={addOrUpdate} className="text-xs font-medium px-3 py-2 rounded-lg flex items-center justify-center gap-1.5" style={{ background: INK, color: "white" }}>{editingId ? <Check size={13} /> : <Plus size={13} />} {editingId ? "Update Holiday" : "Add Holiday"}</button>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs font-medium" style={{ color: "#6B6C72" }}>{visible.length} of {holidays.length} holidays shown</div>
        <Select value={viewState} onChange={setViewState} options={MY_STATES} label="View" />
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}><th className="px-5 py-2.5 font-medium">Date</th><th className="px-3 py-2.5 font-medium">Holiday</th><th className="px-3 py-2.5 font-medium">State</th><th className="px-5 py-2.5 font-medium text-right">Actions</th></tr></thead>
          <tbody>
            {visible.map((h) => (
              <tr key={h.id} className="border-t" style={{ borderColor: LINE }}>
                <td className="px-5 py-3 text-xs" style={{ color: "#5C5D63" }}>{fmtDate(h.date)}</td>
                <td className="px-3 py-3 font-medium" style={{ color: INK }}>{h.name}</td>
                <td className="px-3 py-3"><Tag>{h.state}</Tag></td>
                <td className="px-5 py-3 text-right flex justify-end gap-1.5"><IconBtn icon={Pencil} label="Edit" onClick={() => edit(h)} /><IconBtn icon={Trash2} label="Delete" onClick={() => remove(h)} danger /></td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-xs" style={{ color: "#9A9AA0" }}>No holidays for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Import Data page ------------------------------ */
function ImportPage({ schedules, holidays, presetType, setPresetType, existingQuotations, agents, defaultAgentName, onCommit }) {
  const [step, setStep] = useState("upload"); // upload | importing | preview | duplicates | confirm | failed | done
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]); // array of objects keyed by original header
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [validRows, setValidRows] = useState([]);
  const [errorRows, setErrorRows] = useState([]);
  const [duplicates, setDuplicates] = useState([]); // rows that clash with an existing record
  const [resolutions, setResolutions] = useState({}); // keyValue -> skip|update|new
  const [result, setResult] = useState(null);
  const [fileError, setFileError] = useState("");
  const [importingLabel, setImportingLabel] = useState("Reading file...");
  const [dragActive, setDragActive] = useState(false);
  const [importAgent, setImportAgent] = useState(defaultAgentName || "");
  const [importCategory, setImportCategory] = useState("Account");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setImportAgent(defaultAgentName || "");
  }, [defaultAgentName]);

  const isCustomer = false;
  const fields = QUOTATION_FIELDS;
  const existingList = existingQuotations;
  const keyLabel = "Document";
  const targetLabel = "Quotations";

  const reset = () => { setStep("upload"); setFileName(""); setRawRows([]); setHeaders([]); setMapping({}); setValidRows([]); setErrorRows([]); setDuplicates([]); setResolutions({}); setResult(null); setFileError(""); setImportAgent(defaultAgentName || ""); setImportCategory("Account"); if (fileInputRef.current) fileInputRef.current.value = ""; };

  function handleFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "pdf") {
      setFileName(file.name);
      setFileError(`"${file.name}" is a .${ext} file. Please upload a quotation PDF.`);
      setStep("failed");
      return;
    }
    setFileName(file.name);
    setImportingLabel(`Reading "${file.name}"...`);
    setStep("importing");
    setTimeout(async () => {
      try {
        const extracted = await extractQuotationRows(file);
        const rows = extracted.rows.map((row) => ({
          ...row,
          "Document Date": parseDocumentDate(row["Document Date"]) || ymd(new Date()),
        }));
        const detectedCategory = detectCategoryFromText(extracted.categoryText || extracted.companyCandidates?.join(" ") || JSON.stringify(rows)) || "Account";
        const hdrs = Object.keys(rows[0]);
        setRawRows(rows);
        setHeaders(hdrs);
        setMapping(guessMapping(hdrs, fields));
        setImportCategory(detectedCategory);
        setStep("preview");
      } catch (err) {
        setFileError(`Could not read "${file.name}". The PDF may be scanned, password-protected, or have no selectable text.`);
        setStep("failed");
      }
    }, 350);
  }

  function runValidation() {
    setImportingLabel("Validating rows against required fields...");
    setStep("importing");
    setTimeout(() => {
      const valid = [];
      const errors = [];
      rawRows.forEach((row, i) => {
        const get = (key) => (mapping[key] ? row[mapping[key]] : "");
        const company = String(get("company") || "").trim();
        const categoryRaw = normalizeCategoryValue(String(get("category") || ""));
        const category = categoryRaw || normalizeCategoryValue(importCategory) || "Account";

        if (isCustomer) {
          const issues = [];
          if (!company) issues.push("Missing company name");
          const rec = {
            rowIndex: i + 2, keyValue: company, company, contactName: String(get("contactName") || "").trim(),
            phone: String(get("phone") || "").trim(), email: String(get("email") || "").trim(), category,
          };
          if (issues.length) errors.push({ ...rec, issues });
          else valid.push(rec);
          return;
        }

        const docNo = String(get("docNo") || "").trim();
        const dateRaw = get("date");
        const dateYMD = parseDocumentDate(dateRaw);
        const amountRaw = get("amount");
        const amount = parseAmount(amountRaw);
        const issues = [];
        if (!docNo) issues.push("Missing document number");
        if (!dateYMD) issues.push("Invalid document date");
        if (!company) issues.push("Missing customer/company name");
        if (isNaN(amount)) issues.push("Invalid amount");
        const rec = {
          rowIndex: i + 2, keyValue: docNo, docNo, date: dateYMD, company, contactName: String(get("contactName") || "").trim(),
          phone: String(get("phone") || "").trim(), email: String(get("email") || "").trim(),
          category, amount: isNaN(amount) ? 0 : amount, docStatus: String(get("docStatus") || "").trim(), staff: String(get("staff") || "").trim(),
          categoryMissing: !normalizeCategoryValue(String(get("category") || "")),
        };
        if (issues.length) errors.push({ ...rec, issues });
        else valid.push(rec);
      });

      if (!valid.length) {
        setFileError(`All ${errors.length} row(s) in "${fileName}" failed validation. Fix the file (see the issues below) and re-upload.`);
        setErrorRows(errors);
        setStep("failed");
        return;
      }

      setValidRows(valid);
      setErrorRows(errors);
      const dupes = valid.filter((r) => existingList.some((d) => (isCustomer ? d.company.trim().toLowerCase() === r.company.trim().toLowerCase() : d.docNo === r.docNo)));
      setDuplicates(dupes);
      const initialRes = {};
      dupes.forEach((d) => { initialRes[d.keyValue] = "skip"; });
      setResolutions(initialRes);
      setStep(dupes.length ? "duplicates" : "confirm");
    }, 400);
  }

  function finalizeImport() {
    setImportingLabel(`Importing ${validRows.length} record${validRows.length !== 1 ? "s" : ""} into ${targetLabel}...`);
    setStep("importing");
    setTimeout(() => {
      try {
        const res = onCommit({ docType: presetType, fileName, rows: validRows, resolutions, agentName: importAgent, categoryOverride: importCategory });
        setResult({ ...res, totalRows: rawRows.length, errorCount: errorRows.length });
        setStep("done");
      } catch (err) {
        setFileError("The import could not be completed. No records were changed. Please try again.");
        setStep("failed");
      }
    }, 500);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold" style={{ color: INK }}>Import Data</h2>
        <p className="text-xs" style={{ color: "#9A9AA0" }}>Upload a quotation PDF. The importer catches fields in the order shown below, then validates and merges the quotation.</p>
      </div>

      <div className="flex items-center gap-2">
        <ImportTypeTab active={presetType === "Quotation"} label="Quotation Import" onClick={() => { setPresetType("Quotation"); reset(); }} />
      </div>
      <div className="rounded-xl border bg-white p-4 flex flex-wrap items-center gap-3" style={{ borderColor: LINE }}>
        <label className="text-xs font-medium" style={{ color: INK }}>Category</label>
        <select value={importCategory} onChange={(e) => setImportCategory(e.target.value)} className="text-xs rounded-md border px-2 py-1.5 bg-white" style={{ borderColor: LINE }}>
          <option value="Account">Account</option>
          <option value="Payroll">Payroll</option>
        </select>
        <span className="text-[11px]" style={{ color: "#9A9AA0" }}>Auto-detected from the PDF when available; adjust if needed.</span>
        <div className="h-4 w-px" style={{ background: LINE }} />
        <label className="text-xs font-medium" style={{ color: INK }}>Assign imported quotation to agent</label>
        <select value={importAgent} onChange={(e) => setImportAgent(e.target.value)} className="text-xs rounded-md border px-2 py-1.5 bg-white" style={{ borderColor: LINE }}>
          <option value="">---</option>
          {agents.filter((agent) => agent.active).map((agent) => <option key={agent.id} value={agent.name}>{agent.name}</option>)}
        </select>
      </div>

      <StepBar step={step} />

      {step === "upload" && (
        <div
          className="rounded-xl border-2 border-dashed bg-white p-10 flex flex-col items-center justify-center gap-3 text-center"
          style={{ borderColor: dragActive ? TEAL : LINE, background: dragActive ? TEAL_SOFT : "white" }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
        >
          <UploadCloud size={26} style={{ color: TEAL }} />
          <div className="text-sm font-semibold" style={{ color: INK }}>Upload {targetLabel} export</div>
          <div className="text-xs max-w-sm" style={{ color: "#9A9AA0" }}>Accepts text-based .pdf quotation files. Scanned PDFs need OCR before their fields can be read. Drag a file here, or:</div>
          <input
            ref={fileInputRef}
            id="ams-import-file-input"
            type="file"
            accept=".pdf,application/pdf"
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
            onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <label htmlFor="ams-import-file-input" className="text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer inline-block" style={{ background: INK, color: "white" }}>
            Choose File
          </label>
        </div>
      )}

      {step === "importing" && (
        <div className="rounded-xl border bg-white p-10 flex flex-col items-center justify-center gap-3 text-center" style={{ borderColor: LINE }}>
          <RefreshCw size={22} className="animate-spin" style={{ color: TEAL }} />
          <div className="text-sm font-semibold" style={{ color: INK }}>{importingLabel}</div>
          <div className="text-xs" style={{ color: "#9A9AA0" }}>{fileName}</div>
        </div>
      )}

      {step === "failed" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border p-8 flex flex-col items-center text-center gap-3" style={{ borderColor: RED, background: RED_SOFT }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "white" }}><AlertCircle size={22} style={{ color: RED }} /></div>
            <div className="text-base font-semibold" style={{ color: RED }}>Import failed</div>
            <div className="text-xs max-w-md" style={{ color: "#8A3B3B" }}>{fileError}</div>
          </div>
          {errorRows.length > 0 && (
            <div className="rounded-xl border bg-white p-4" style={{ borderColor: LINE }}>
              <div className="text-xs font-semibold mb-2" style={{ color: INK }}>Row-level validation errors</div>
              <ul className="text-xs flex flex-col gap-1" style={{ color: "#8A3B3B" }}>
                {errorRows.slice(0, 10).map((r, i) => <li key={i}>Row {r.rowIndex} ({r.keyValue || (isCustomer ? "no company" : "no doc no.")}): {r.issues.join(", ")}</li>)}
                {errorRows.length > 10 && <li>…and {errorRows.length - 10} more.</li>}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={reset} className="text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5" style={{ background: INK, color: "white" }}><RefreshCw size={12} /> Fix File & Try Again</button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border bg-white p-4" style={{ borderColor: LINE }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: INK }}><FileText size={15} style={{ color: TEAL }} /> {fileName}</div>
              <span className="text-xs" style={{ color: "#9A9AA0" }}>{rawRows.length} rows detected</span>
            </div>
            <div className="text-xs mb-2 font-medium" style={{ color: "#6B6C72" }}>Detected PDF fields in import sequence. Check and correct them before continuing.</div>
            <div className="grid grid-cols-2 gap-2.5">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <div className="w-40 text-xs shrink-0" style={{ color: INK }}>{f.label}{f.required && <span style={{ color: RED }}> *</span>}</div>
                  <ArrowRight size={12} style={{ color: "#C7C6BE" }} />
                  <input type={f.key === "date" ? "date" : "text"} value={mapping[f.key] ? (f.key === "date" ? parseDocumentDate(rawRows[0]?.[mapping[f.key]]) || "" : rawRows[0]?.[mapping[f.key]] || "") : ""} onChange={(e) => setRawRows((prev) => prev.map((row, i) => i === 0 ? { ...row, [mapping[f.key]]: e.target.value } : row))} className="flex-1 text-xs rounded-md border px-2 py-1.5 outline-none bg-white" style={{ borderColor: LINE }} placeholder={`Enter ${f.label.toLowerCase()}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
            <div className="px-4 py-2.5 border-b text-xs font-medium" style={{ borderColor: LINE, color: "#6B6C72" }}>Preview (first 5 rows)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "#9A9AA0" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {rawRows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: LINE }}>{headers.map((h) => <td key={h} className="px-3 py-2" style={{ color: "#5C5D63" }}>{String(r[h])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={reset} className="text-xs font-medium px-3.5 py-2 rounded-lg border" style={{ borderColor: LINE, color: "#5C5D63" }}>Cancel</button>
            <button onClick={runValidation} className="text-xs font-medium px-3.5 py-2 rounded-lg" style={{ background: INK, color: "white" }}>Validate & Continue</button>
          </div>
        </div>
      )}

      {(step === "duplicates" || step === "confirm") && (
        <div className="flex flex-col gap-4">
          {errorRows.length > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: RED, background: RED_SOFT }}>
              <div className="flex items-center gap-1.5 text-sm font-semibold mb-2" style={{ color: RED }}><AlertCircle size={15} /> {errorRows.length} row{errorRows.length > 1 ? "s" : ""} have validation errors and will be skipped</div>
              <ul className="text-xs flex flex-col gap-1" style={{ color: "#8A3B3B" }}>
                {errorRows.slice(0, 8).map((r, i) => <li key={i}>Row {r.rowIndex} ({r.keyValue || (isCustomer ? "no company" : "no doc no.")}): {r.issues.join(", ")}</li>)}
                {errorRows.length > 8 && <li>…and {errorRows.length - 8} more. Fix the file and re-upload to include them.</li>}
              </ul>
            </div>
          )}

          {validRows.some((r) => r.categoryMissing) && (
            <div className="rounded-xl border p-3 text-xs flex items-start gap-2" style={{ borderColor: LINE, background: AMBER_SOFT, color: AMBER }}>
              <Info size={13} className="mt-0.5 shrink-0" />
              {validRows.filter((r) => r.categoryMissing).length} row(s) have no Category in the file — they'll import as "Account" by default. You can reassign category from the document detail page after import.
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: LINE }}>
                <div className="text-sm font-semibold" style={{ color: INK }}>{duplicates.length} {isCustomer ? "customer" : "document"}{duplicates.length > 1 ? "s" : ""} already exist</div>
                <div className="flex gap-1.5">
                  <button onClick={() => setResolutions(Object.fromEntries(duplicates.map((d) => [d.keyValue, "skip"])))} className="text-[11px] font-medium px-2 py-1 rounded-md" style={{ background: GRAY_SOFT, color: "#5C5D63" }}>Set all: Skip</button>
                  <button onClick={() => setResolutions(Object.fromEntries(duplicates.map((d) => [d.keyValue, "update"])))} className="text-[11px] font-medium px-2 py-1 rounded-md" style={{ background: TEAL_SOFT, color: TEAL }}>Set all: Update</button>
                  <button onClick={() => setResolutions(Object.fromEntries(duplicates.map((d) => [d.keyValue, "new"])))} className="text-[11px] font-medium px-2 py-1 rounded-md" style={{ background: BLUE_SOFT, color: BLUE }}>Set all: Import as New</button>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="text-left" style={{ color: "#9A9AA0" }}><th className="px-4 py-2 font-medium">{keyLabel}</th>{!isCustomer && <th className="px-3 py-2 font-medium">Company</th>}<th className="px-3 py-2 font-medium">Resolution</th></tr></thead>
                <tbody>
                  {duplicates.map((d) => (
                    <tr key={d.keyValue} className="border-t" style={{ borderColor: LINE }}>
                      <td className="px-4 py-2 font-mono" style={{ color: INK }}>{isCustomer ? d.company : d.docNo}</td>
                      {!isCustomer && <td className="px-3 py-2" style={{ color: "#5C5D63" }}>{d.company}</td>}
                      <td className="px-3 py-2">
                        <select value={resolutions[d.keyValue] || "skip"} onChange={(e) => setResolutions({ ...resolutions, [d.keyValue]: e.target.value })} className="text-xs rounded-md border px-2 py-1 outline-none bg-white" style={{ borderColor: LINE }}>
                          <option value="skip">Skip (default)</option>
                          <option value="update">Update existing record</option>
                          <option value="new">Import as new record</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[11px]" style={{ color: "#9A9AA0", background: "#FBFAF7" }}>{isCustomer ? '"ABC Sdn Bhd" already exists" → default is Skip. Choosing Update refreshes contact details only.' : '"QT-00123" already exists" → default is Skip. Choosing Update keeps all existing follow-up history and notes, only refreshing source data.'}</div>
            </div>
          )}

          <div className="rounded-xl border bg-white p-4 flex items-center justify-between" style={{ borderColor: LINE }}>
            <div className="text-xs" style={{ color: "#5C5D63" }}>
              Ready to import <strong style={{ color: INK }}>{validRows.length}</strong> valid row{validRows.length !== 1 ? "s" : ""}
              {duplicates.length > 0 && <> · <strong style={{ color: INK }}>{duplicates.filter((d) => (resolutions[d.keyValue] || "skip") !== "skip").length}</strong> will update/duplicate, <strong style={{ color: INK }}>{duplicates.filter((d) => (resolutions[d.keyValue] || "skip") === "skip").length}</strong> will be skipped</>}
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="text-xs font-medium px-3.5 py-2 rounded-lg border" style={{ borderColor: LINE, color: "#5C5D63" }}>Cancel</button>
              <button onClick={finalizeImport} className="text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5" style={{ background: INK, color: "white" }}><UploadCloud size={13} /> Import {validRows.length} Records</button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="rounded-xl border bg-white p-8 flex flex-col items-center text-center gap-3" style={{ borderColor: LINE }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: GREEN_SOFT }}><CheckCircle2 size={22} style={{ color: GREEN }} /></div>
          <div className="text-base font-semibold" style={{ color: INK }}>Import successful</div>
          <div className="grid grid-cols-4 gap-4 mt-2">
            <MiniStat label="New" value={result.newCount} tint={GREEN} />
            <MiniStat label="Updated" value={result.updatedCount} tint={BLUE} />
            <MiniStat label="Skipped" value={result.skippedCount} tint={GRAY} />
            <MiniStat label="Errors" value={result.errorCount} tint={RED} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={reset} className="text-xs font-medium px-3.5 py-2 rounded-lg border" style={{ borderColor: LINE, color: "#5C5D63" }}><RefreshCw size={12} className="inline mr-1" />Import Another File</button>
          </div>
        </div>
      )}
    </div>
  );
}
function ImportTypeTab({ active, label, onClick }) {
  return (
    <button onClick={onClick} className="text-xs font-medium px-3.5 py-2 rounded-lg border" style={active ? { background: INK, color: "white", borderColor: INK } : { background: "white", color: "#5C5D63", borderColor: LINE }}>{label}</button>
  );
}
function StepBar({ step }) {
  const steps = [
    { key: "upload", label: "Upload" }, { key: "preview", label: "Map Columns" }, { key: "duplicates", label: "Validate & Duplicates" }, { key: "done", label: "Done" },
  ];
  const order = ["upload", "preview", "duplicates", "confirm", "done"];
  const currentIdx = order.indexOf(step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const idx = order.indexOf(s.key === "duplicates" ? "duplicates" : s.key);
        const isActive = step === s.key || (s.key === "duplicates" && step === "confirm");
        const isPast = currentIdx > idx || (s.key === "duplicates" && (step === "confirm" || step === "done"));
        return (
          <React.Fragment key={s.key}>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: isActive ? TEAL : isPast ? GREEN : GRAY_SOFT, color: isActive || isPast ? "white" : "#9A9AA0" }}>{isPast ? <Check size={11} /> : i + 1}</div>
              <span className="text-xs font-medium" style={{ color: isActive ? INK : "#9A9AA0" }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="w-8 h-px" style={{ background: LINE }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
function MiniStat({ label, value, tint }) {
  return (<div className="flex flex-col items-center"><div className="text-xl font-semibold" style={{ color: tint }}>{value}</div><div className="text-[10px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>{label}</div></div>);
}

/* ------------------------------ Import History page ------------------------------ */
function ImportHistoryPage({ importHistory, appName, onOpenBatch }) {
  return (
    <div className="flex flex-col gap-4">
      <div><h2 className="text-base font-semibold" style={{ color: INK }}>Import History</h2><p className="text-xs" style={{ color: "#9A9AA0" }}>Every PDF batch imported into {appName}, with new, updated, skipped, and error counts. Click a row to see which records came from it.</p></div>
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
        {importHistory.length === 0 ? <EmptyImportState /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}>
                <th className="px-5 py-2.5 font-medium">File Name</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Import Date</th>
                <th className="px-3 py-2.5 font-medium">Rows</th>
                <th className="px-3 py-2.5 font-medium">New</th>
                <th className="px-3 py-2.5 font-medium">Updated</th>
                <th className="px-3 py-2.5 font-medium">Skipped</th>
                <th className="px-3 py-2.5 font-medium">Errors</th>
                <th className="px-5 py-2.5 font-medium text-right">Records</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.map((b) => (
                <tr key={b.id} className="border-t hover:bg-[#FBFAF7] cursor-pointer" style={{ borderColor: LINE }} onClick={() => onOpenBatch(b.batchId)}>
                  <td className="px-5 py-3 font-medium flex items-center gap-1.5" style={{ color: INK }}><FileText size={13} style={{ color: TEAL }} />{b.fileName}</td>
                  <td className="px-3 py-3"><Tag>{b.docType}</Tag></td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{fmtDateTime(new Date(b.importDate))}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#5C5D63" }}>{b.totalRows}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: GREEN }}>{b.newRecords}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: BLUE }}>{b.updated}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: "#9A9AA0" }}>{b.skipped}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: b.errors > 0 ? RED : "#9A9AA0" }}>{b.errors}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); onOpenBatch(b.batchId); }} className="text-xs font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={{ background: INK, color: "white" }}>View <ChevronRight size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Reports page ------------------------------ */
function ReportsPage({ allDocs }) {
  const byStatus = ["Due Today", "Overdue", "Upcoming", "Completed", "Won", "Lost", "No Response"].map((s) => ({ name: s, value: allDocs.filter((d) => d.status === s).length })).filter((x) => x.value > 0);
  const byCategory = ["Account", "Payroll"].map((c) => ({ name: c, value: allDocs.filter((d) => d.category === c).length }));
  const wonLost = [{ name: "Won", value: allDocs.filter((d) => d.status === "Won").length }, { name: "Lost", value: allDocs.filter((d) => d.status === "Lost").length }];
  const weeks = [4, 3, 2, 1, 0].map((w) => {
    const label = w === 0 ? "This week" : `${w}w ago`;
    const count = allDocs.reduce((sum, d) => sum + d.history.filter((h) => { const hd = parseYMD(h.date); const weeksAgo = Math.floor(diffCalendarDays(TODAY, hd) / 7); return weeksAgo === w && h.stage !== "Sent"; }).length, 0);
    return { name: label, value: count };
  });
  const PIE_COLORS = [AMBER, RED, BLUE, GREEN, TEAL, GRAY, VIOLET];

  const years = Array.from(new Set(allDocs.map((d) => parseYMD(d.date).getFullYear()))).sort((a, b) => a - b);
  const [year, setYear] = useState(years.length ? String(years[years.length - 1]) : String(TODAY.getFullYear()));
  const byYear = years.map((y) => ({ name: String(y), value: allDocs.filter((d) => parseYMD(d.date).getFullYear() === y).length }));
  const byMonth = MONTH_NAMES.map((m, i) => ({ name: m.slice(0, 3), value: allDocs.filter((d) => { const dt = parseYMD(d.date); return String(dt.getFullYear()) === year && dt.getMonth() === i; }).length }));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold" style={{ color: INK }}>Reports</h2>
      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Follow-ups by Status">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>{byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Quotations & Orders by Category">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byCategory}><CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill={TEAL} radius={[6, 6, 0, 0]} barSize={60} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Won vs Lost">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={wonLost}><CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={60}><Cell fill={GREEN} /><Cell fill={GRAY} /></Bar></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Follow-ups Completed per Week">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={weeks}><CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="value" stroke={TEAL} strokeWidth={2.5} dot={{ r: 4 }} /></LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Documents by Year">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byYear}><CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill={BLUE} radius={[6, 6, 0, 0]} barSize={50} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Documents by Month" action={
          <Select value={year} onChange={setYear} options={years.length ? years.map(String) : [String(TODAY.getFullYear())]} label="Year" />
        }>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth}><CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill={TEAL} radius={[6, 6, 0, 0]} barSize={20} /></BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
function ChartCard({ title, children, action }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: LINE }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9A9AA0" }}>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------ Settings page ------------------------------ */
function SettingsPage({ schedules, setSchedules, appName, setAppName, agents, setAgents, defaultAgentName, setDefaultAgentName, phones, setPhones, onResetData, onSaved }) {
  const [nameDraft, setNameDraft] = useState(appName);
  const [saved, setSaved] = useState(false);
  const update = (docKey, stageId, field, value) => setSchedules((prev) => ({ ...prev, [docKey]: prev[docKey].map((s) => (s.id === stageId ? { ...s, [field]: field === "workingDaysAfterPrevious" ? Number(value) : value } : s)) }));
  const saveName = () => { setAppName(nameDraft.trim() || DEFAULT_APP_NAME); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  const addAgent = () => {
    const agent = { id: uid("agent-"), name: "New Agent", phone: "", active: true };
    setAgents((prev) => [...prev, agent]);
    agentStore.create(agent).catch((error) => console.error("[Firestore] Agent create failed", error));
  };
  const updateAgent = (agent, changes) => {
    const updated = { ...agent, ...changes };
    setAgents((prev) => prev.map((item) => item.id === agent.id ? updated : item));
    agentStore.update(agent.id, updated).catch((error) => console.error("[Firestore] Agent update failed", error));
  };
  const removeAgent = (agent) => {
    setAgents((prev) => prev.filter((item) => item.id !== agent.id));
    if (defaultAgentName === agent.name) setDefaultAgentName("");
    agentStore.remove(agent.id).catch((error) => console.error("[Firestore] Agent delete failed", error));
  };
  const addPhone = () => {
    const phone = { id: uid("phone-"), name: "New Phone", number: "", active: true };
    setPhones((prev) => [...prev, phone]);
    phoneStore.create(phone).catch((error) => console.error("[Firestore] Sending phone create failed", error));
  };
  const updatePhone = (phone, changes) => {
    const updated = { ...phone, ...changes };
    setPhones((prev) => prev.map((item) => item.id === phone.id ? updated : item));
    phoneStore.update(phone.id, updated).catch((error) => console.error("[Firestore] Sending phone update failed", error));
  };
  const removePhone = (phone) => {
    setPhones((prev) => prev.filter((item) => item.id !== phone.id));
    phoneStore.remove(phone.id).catch((error) => console.error("[Firestore] Sending phone delete failed", error));
  };
  const saveAgent = async (agent) => {
    try { await agentStore.update(agent.id, agent); onSaved("Agent saved successfully."); }
    catch (error) { console.error("[Firestore] Agent save failed", error); }
  };
  const savePhone = async (phone) => {
    try { await phoneStore.update(phone.id, phone); onSaved("Sending phone saved successfully."); }
    catch (error) { console.error("[Firestore] Sending phone save failed", error); }
  };

  const ScheduleTable = ({ docKey, title }) => (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: LINE }}><h4 className="text-sm font-semibold" style={{ color: INK }}>{title}</h4></div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "#9A9AA0" }}><th className="px-5 py-2 font-medium">Stage</th><th className="px-3 py-2 font-medium">Label</th><th className="px-3 py-2 font-medium">Tag</th><th className="px-3 py-2 font-medium">Working Days After Previous</th></tr></thead>
        <tbody>
          {schedules[docKey].map((s) => (
            <tr key={s.id} className="border-t" style={{ borderColor: LINE }}>
              <td className="px-5 py-2.5 font-medium" style={{ color: INK }}>{s.stage}</td>
              <td className="px-3 py-2.5"><input value={s.label} onChange={(e) => update(docKey, s.id, "label", e.target.value)} className="text-sm rounded-md border px-2 py-1 outline-none w-40" style={{ borderColor: LINE }} /></td>
              <td className="px-3 py-2.5"><input value={s.tag} onChange={(e) => update(docKey, s.id, "tag", e.target.value)} className="text-sm rounded-md border px-2 py-1 outline-none w-20" style={{ borderColor: LINE }} /></td>
              <td className="px-3 py-2.5"><input type="number" min={1} value={s.workingDaysAfterPrevious} onChange={(e) => update(docKey, s.id, "workingDaysAfterPrevious", e.target.value)} className="text-sm rounded-md border px-2 py-1 outline-none w-20" style={{ borderColor: LINE }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold" style={{ color: INK }}>Settings</h2>
        <p className="text-xs" style={{ color: "#9A9AA0" }}>Application name, follow-up schedules, and general configuration.</p>
      </div>

      <div className="rounded-xl border bg-white p-5 flex items-end gap-3" style={{ borderColor: LINE }}>
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>Application Name</label>
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="w-full text-sm rounded-lg border px-3 py-2 outline-none" style={{ borderColor: LINE }} />
          <p className="text-[11px] mt-1" style={{ color: "#9A9AA0" }}>Shown in the sidebar, header, and browser tab title.</p>
        </div>
        <button onClick={saveName} className="text-xs font-medium px-3.5 py-2 rounded-lg" style={{ background: saved ? GREEN : INK, color: "white" }}>{saved ? "Saved" : "Save Name"}</button>
      </div>

      <div className="rounded-xl border bg-white p-5 flex items-end gap-3" style={{ borderColor: LINE }}>
        <div className="flex-1">
          <label className="text-xs font-medium block mb-1" style={{ color: "#6B6C72" }}>Default Agent</label>
          <select value={defaultAgentName} onChange={(e) => setDefaultAgentName(e.target.value)} className="w-full text-sm rounded-lg border px-3 py-2 outline-none bg-white" style={{ borderColor: LINE }}>
            <option value="">No default selected</option>
            {agents.filter((agent) => agent.active || agent.name === defaultAgentName).map((agent) => <option key={agent.id} value={agent.name}>{agent.name}</option>)}
          </select>
          <p className="text-[11px] mt-1" style={{ color: "#9A9AA0" }}>Used automatically whenever a record is imported without an assigned agent.</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>Follow-up Schedule</h3>
        <p className="text-xs mb-2" style={{ color: "#9A9AA0" }}>Configure the working-day gap for each stage — no code changes needed. Changes recalculate every follow-up date immediately.</p>
      </div>
      <ScheduleTable docKey="quotation" title="Quotation Follow-up Schedule" />
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: LINE }}><h4 className="text-sm font-semibold" style={{ color: INK }}>Agents</h4><button onClick={addAgent} className="text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ background: INK, color: "white" }}><Plus size={12} className="inline mr-1" />Add Agent</button></div>
          <div className="p-4 flex flex-col gap-2">{agents.map((agent) => <div key={agent.id} className="flex items-center gap-2"><input value={agent.name} onChange={(e) => updateAgent(agent, { name: e.target.value })} className="flex-1 text-xs rounded-md border px-2 py-1.5" style={{ borderColor: LINE }} /><label className="text-xs flex items-center gap-1" style={{ color: "#5C5D63" }}><input type="checkbox" checked={agent.active} onChange={(e) => updateAgent(agent, { active: e.target.checked })} /> Active</label><button onClick={() => saveAgent(agent)} title="Save agent" className="p-1 rounded" style={{ color: TEAL }}><Save size={13} /></button><button onClick={() => removeAgent(agent)} title="Delete agent" className="p-1 rounded" style={{ color: RED }}><Trash2 size={13} /></button></div>)}</div>
        </div>
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: LINE }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: LINE }}><h4 className="text-sm font-semibold" style={{ color: INK }}>Sending Phones</h4><button onClick={addPhone} className="text-xs font-medium px-2.5 py-1.5 rounded-lg" style={{ background: INK, color: "white" }}><Plus size={12} className="inline mr-1" />Add Phone</button></div>
          <div className="p-4 flex flex-col gap-2">{phones.map((phone) => <div key={phone.id} className="flex items-center gap-2"><input value={phone.name} onChange={(e) => updatePhone(phone, { name: e.target.value })} className="w-1/3 text-xs rounded-md border px-2 py-1.5" style={{ borderColor: LINE }} placeholder="Phone name" /><input value={phone.number} onChange={(e) => updatePhone(phone, { number: e.target.value })} className="flex-1 text-xs rounded-md border px-2 py-1.5" style={{ borderColor: LINE }} placeholder="Phone number" /><label className="text-xs flex items-center gap-1" style={{ color: "#5C5D63" }}><input type="checkbox" checked={phone.active} onChange={(e) => updatePhone(phone, { active: e.target.checked })} /> Active</label><button onClick={() => savePhone(phone)} title="Save phone" className="p-1 rounded" style={{ color: TEAL }}><Save size={13} /></button><button onClick={() => removePhone(phone)} title="Delete phone" className="p-1 rounded" style={{ color: RED }}><Trash2 size={13} /></button></div>)}</div>
        </div>
      </div>
      <div className="rounded-xl border p-4 text-xs flex items-start gap-2" style={{ borderColor: LINE, background: TEAL_SOFT, color: TEAL }}>
        <Filter size={14} className="mt-0.5 shrink-0" />
        Working days exclude Sundays and every date listed in the Holiday Calendar. Stage dates are cumulative — each stage's gap is counted from the previous stage (or the document date for Stage 1).
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: INK }}>Data Storage</h3>
        <p className="text-xs mb-2" style={{ color: "#9A9AA0" }}>Quotations, customers, templates, holidays, and schedules are saved automatically as you work, and are still here the next time you sign in.</p>
      </div>
      <div className="rounded-xl border bg-white p-5 flex items-center justify-between gap-3" style={{ borderColor: LINE }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: "#5C5D63" }}>
          <CheckCircle2 size={14} style={{ color: GREEN }} /> Autosave is on — changes are saved a moment after you make them.
        </div>
        <button onClick={onResetData} className="text-xs font-medium px-3.5 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: RED, color: RED }}>
          <RefreshCw size={12} /> Clear Quotation Data
        </button>
      </div>
    </div>
  );
}

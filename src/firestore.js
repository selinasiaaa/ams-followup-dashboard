import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase.js";

export const COLLECTIONS = {
  quotations: "quotations-followups",
  customers: "customers",
  agents: "agents",
  phones: "sending phone",
  templates: "messageTemplates",
};

const readCollection = async (name) => {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

const writeCollection = async (name, records, toFirestore) => {
  const existing = await readCollection(name);
  const ids = new Set(records.map((record) => record.id).filter(Boolean));
  await Promise.all(existing.filter((record) => !ids.has(record.id)).map((record) => deleteDoc(doc(db, name, record.id))));
  await Promise.all(records.map((record) => {
    const reference = record.id ? doc(db, name, record.id) : doc(collection(db, name));
    return setDoc(reference, { ...toFirestore(record), updatedAt: serverTimestamp() }, { merge: true });
  }));
};

const reportError = (operation, error) => {
  console.error(`[Firestore] ${operation} failed`, error);
  throw error;
};

const run = (operation, callback) => callback().catch((error) => reportError(operation, error));

const MANUAL_STATUS_VALUES = ["No Response", "Follow Up Later", "Won", "Lost"];

const normalizeManualStatus = (value) => {
  const next = String(value ?? "").trim();
  return MANUAL_STATUS_VALUES.includes(next) ? next : null;
};

const quotationFields = (record = {}) => {
  const output = {};
  const includeIfPresent = (key, transform) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      output[key] = transform(record[key]);
    }
  };

  includeIfPresent("docDate", (value) => value ?? "");
  includeIfPresent("companyName", (value) => value ?? "");
  includeIfPresent("personInCharge", (value) => value ?? "");
  includeIfPresent("phone", (value) => value ?? "");
  includeIfPresent("docNo", (value) => value ?? "");
  includeIfPresent("totalAmount", (value) => Number(value ?? 0));
  includeIfPresent("followupStage", (value) => Number(value ?? 0));
  includeIfPresent("nextFollowup", (value) => value ?? null);
  includeIfPresent("lastFollowupDate", (value) => value ?? null);
  includeIfPresent("agent", (value) => value ?? "");
  includeIfPresent("manualStatus", (value) => normalizeManualStatus(value));
  includeIfPresent("category", (value) => value ?? "");
  includeIfPresent("history", (value) => Array.isArray(value) ? value : []);

  if (Object.prototype.hasOwnProperty.call(record, "amount") || Object.prototype.hasOwnProperty.call(record, "totalAmount")) {
    output.totalAmount = Number(record.amount ?? record.totalAmount ?? 0);
  }
  if (Object.prototype.hasOwnProperty.call(record, "date") || Object.prototype.hasOwnProperty.call(record, "docDate")) {
    output.docDate = record.date ?? record.docDate ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(record, "company") || Object.prototype.hasOwnProperty.call(record, "companyName")) {
    output.companyName = record.company ?? record.companyName ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(record, "contactName") || Object.prototype.hasOwnProperty.call(record, "personInCharge")) {
    output.personInCharge = record.contactName ?? record.personInCharge ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(record, "assignedAgent") || Object.prototype.hasOwnProperty.call(record, "agent") || Object.prototype.hasOwnProperty.call(record, "staff")) {
    output.agent = record.assignedAgent ?? record.agent ?? record.staff ?? "";
  }
  if (Object.prototype.hasOwnProperty.call(record, "completedStages") || Object.prototype.hasOwnProperty.call(record, "followupStage")) {
    output.followupStage = Number(record.completedStages ?? record.followupStage ?? 0);
  }
  if (Object.prototype.hasOwnProperty.call(record, "rescheduleDate") || Object.prototype.hasOwnProperty.call(record, "nextFollowup")) {
    output.nextFollowup = record.rescheduleDate ?? record.nextFollowup ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(record, "manualStatus")) {
    output.manualStatus = normalizeManualStatus(record.manualStatus);
  }

  return Object.fromEntries(Object.entries(output).filter(([, value]) => value !== undefined && value !== null && !(typeof value === "string" && value === "")));
};

const agentFields = (record) => ({ name: record.name || "", active: Boolean(record.active) });
const phoneFields = (record) => ({ phoneName: record.name || record.phoneName || "", phoneNumber: record.number || record.phoneNumber || "", active: Boolean(record.active ?? true) });
const customerFields = (record) => ({ companyName: record.company || record.companyName || "", personInCharge: record.contactName || record.personInCharge || "", phone: record.phone || "", email: record.email || "", category: record.category || "" });
const templateFields = (record) => ({
  title: record.title || "",
  documentType: record.docType || record.documentType || "Quotation",
  category: record.category || "",
  followUpStage: record.stageTag || record.followUpStage || "",
  language: record.language || "",
  messageType: record.type || record.messageType || "",
  message: record.message || "",
});

export const quotationStore = {
  list: () => run("list quotations", () => readCollection(COLLECTIONS.quotations)),
  saveAll: (records) => run("save quotations", () => writeCollection(COLLECTIONS.quotations, records, quotationFields)),
  create: (record) => run("create quotation", () => setDoc(doc(db, COLLECTIONS.quotations, record.id), { ...quotationFields(record), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })),
  update: (id, changes) => run("update quotation", async () => {
    const patch = quotationFields(changes);
    const payload = Object.keys(patch).length ? { ...patch, updatedAt: serverTimestamp() } : { updatedAt: serverTimestamp() };
    await setDoc(doc(db, COLLECTIONS.quotations, id), payload, { merge: true });
  }),
  remove: (id) => run("delete quotation", () => deleteDoc(doc(db, COLLECTIONS.quotations, id))),
};

export const agentStore = {
  list: () => run("list agents", () => readCollection(COLLECTIONS.agents)),
  saveAll: (records) => run("save agents", () => writeCollection(COLLECTIONS.agents, records, agentFields)),
  create: (record) => run("create agent", () => setDoc(doc(db, COLLECTIONS.agents, record.id), { ...agentFields(record), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })),
  update: (id, changes) => run("update agent", () => setDoc(doc(db, COLLECTIONS.agents, id), { name: changes.name || "", active: Boolean(changes.active), updatedAt: serverTimestamp() }, { merge: true })),
  remove: (id) => run("delete agent", () => deleteDoc(doc(db, COLLECTIONS.agents, id))),
};

export const customerStore = {
  list: () => run("list customers", () => readCollection(COLLECTIONS.customers)),
  create: (record) => run("create customer", () => setDoc(doc(db, COLLECTIONS.customers, record.id), { ...customerFields(record), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })),
  update: (id, changes) => run("update customer", () => setDoc(doc(db, COLLECTIONS.customers, id), { ...customerFields(changes), updatedAt: serverTimestamp() }, { merge: true })),
  remove: (id) => run("delete customer", () => deleteDoc(doc(db, COLLECTIONS.customers, id))),
};

export const phoneStore = {
  list: () => run("list sending phones", () => readCollection(COLLECTIONS.phones)),
  saveAll: (records) => run("save sending phones", () => writeCollection(COLLECTIONS.phones, records, phoneFields)),
  create: (record) => run("create sending phone", () => setDoc(doc(db, COLLECTIONS.phones, record.id), { ...phoneFields(record), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })),
  update: (id, changes) => run("update sending phone", () => setDoc(doc(db, COLLECTIONS.phones, id), { phoneName: changes.name || "", phoneNumber: changes.number || "", active: Boolean(changes.active), updatedAt: serverTimestamp() }, { merge: true })),
  remove: (id) => run("delete sending phone", () => deleteDoc(doc(db, COLLECTIONS.phones, id))),
};

export const templateStore = {
  list: () => run("list message templates", () => readCollection(COLLECTIONS.templates)),
  saveAll: (records) => run("save message templates", () => writeCollection(COLLECTIONS.templates, records, templateFields)),
  create: (record) => run("create message template", () => setDoc(doc(db, COLLECTIONS.templates, record.id), { ...templateFields(record), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })),
  update: (id, changes) => run("update message template", () => setDoc(doc(db, COLLECTIONS.templates, id), { ...templateFields(changes), updatedAt: serverTimestamp() }, { merge: true })),
  remove: (id) => run("delete message template", () => deleteDoc(doc(db, COLLECTIONS.templates, id))),
};

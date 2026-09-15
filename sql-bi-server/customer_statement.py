"""Read-only customer statement endpoints for the SQL Accounting dashboard."""
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
import re

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from firebird_db import get_connection, get_table_columns, get_table_names, quote_identifier, _text

router = APIRouter(prefix="/api/customer-statements", tags=["customer-statements"])


class StatementCriteria(BaseModel):
    start: date
    end: date
    statement_date: date | None = None
    customers: list[str] = Field(default_factory=list)
    agents: list[str] = Field(default_factory=list)
    areas: list[str] = Field(default_factory=list)
    projects: list[str] = Field(default_factory=list)
    currencies: list[str] = Field(default_factory=list)
    include_zero: bool = False
    months: int = 6


def _columns(table):
    return {name.upper(): name for name in get_table_columns(table)}


def _value(value):
    if isinstance(value, (bytes, bytearray)):
        return _text(value).strip()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _in(where, params, column, values):
    values = [value for value in values if value and value != "----"]
    if values:
        where.append(f'"{column}" IN (' + ", ".join("?" for _ in values) + ")")
        params.extend(values)


def _source_rows(table, label, direction, criteria):
    """Return document transactions with debit positive and credit negative."""
    if table not in get_table_names():
        return []
    cols = _columns(table)
    required = ("CODE", "DOCDATE")
    if any(item not in cols for item in required):
        return []
    amount = cols.get("LOCALDOCAMT") or cols.get("DOCAMT")
    if not amount:
        return []
    docno = cols.get("DOCNO")
    description = cols.get("DESCRIPTION")
    agent = cols.get("AGENT")
    area = cols.get("AREA")
    project = cols.get("PROJECT")
    currency = cols.get("CURRENCYCODE")
    cancelled = cols.get("CANCELLED")
    fields = [
        f'"{cols["CODE"]}"',
        f'"{cols["DOCDATE"]}"',
        f'"{docno}"' if docno else "NULL",
        f'"{description}"' if description else "NULL",
        f'"{agent}"' if agent else "NULL",
        f'"{area}"' if area else "NULL",
        f'"{project}"' if project else "NULL",
        f'"{currency}"' if currency else "NULL",
        f'"{amount}"',
    ]
    where, params = [f'"{cols["DOCDATE"]}" <= ?'], [criteria.end]
    if cancelled:
        where.append(f'COALESCE("{cancelled}", FALSE) = FALSE')
    _in(where, params, cols["CODE"], criteria.customers)
    if agent: _in(where, params, agent, criteria.agents)
    if area: _in(where, params, area, criteria.areas)
    if project: _in(where, params, project, criteria.projects)
    if currency: _in(where, params, currency, criteria.currencies)
    sql = f"SELECT {', '.join(fields)} FROM {quote_identifier(table)} WHERE {' AND '.join(where)}"
    con = get_connection()
    try:
        cur = con.cursor()
        try:
            cur.execute(sql, params)
            return [
                {"customer_code": _value(row[0]), "date": _value(row[1]), "reference": _value(row[2]),
                 "description": _value(row[3]) or label, "agent": _value(row[4]), "area": _value(row[5]),
                 "project": _value(row[6]), "currency": _value(row[7]) or "RM", "type": label,
                 "amount": float(Decimal(str(row[8] or 0)) * direction)}
                for row in cur.fetchall()
            ]
        finally: cur.close()
    finally: con.close()


def _customers(criteria):
    cols = _columns("AR_CUSTOMER")
    fields = [cols.get("CODE"), cols.get("COMPANYNAME"), cols.get("AGENT"), cols.get("AREA"), cols.get("CURRENCYCODE"), cols.get("CREDITTERM"), cols.get("OUTSTANDING")]
    if not fields[0]:
        return {}
    selected = [f'"{field}"' if field else "NULL" for field in fields]
    where, params = ["1=1"], []
    _in(where, params, cols["CODE"], criteria.customers)
    if cols.get("AGENT"): _in(where, params, cols["AGENT"], criteria.agents)
    if cols.get("AREA"): _in(where, params, cols["AREA"], criteria.areas)
    if cols.get("CURRENCYCODE"): _in(where, params, cols["CURRENCYCODE"], criteria.currencies)
    con = get_connection()
    try:
        cur = con.cursor(); cur.execute(f"SELECT {', '.join(selected)} FROM AR_CUSTOMER WHERE {' AND '.join(where)}", params)
        return {str(_value(row[0])): {"code": _value(row[0]), "name": _value(row[1]), "agent": _value(row[2]), "area": _value(row[3]), "currency": _value(row[4]) or "RM", "terms": _value(row[5]), "outstanding": float(row[6] or 0)} for row in cur.fetchall()}
    finally:
        cur.close(); con.close()


def _branch_emails(customer_codes):
    """Use Billing branch contacts as the official statement recipient source."""
    if not customer_codes or "AR_CUSTOMERBRANCH" not in get_table_names():
        return {}
    cols = _columns("AR_CUSTOMERBRANCH")
    if "CODE" not in cols or "EMAIL" not in cols:
        return {}
    attention, branch_type = cols.get("ATTENTION"), cols.get("BRANCHTYPE")
    selected = [f'"{cols["CODE"]}"', f'"{cols["EMAIL"]}"', f'"{attention}"' if attention else "NULL", f'"{branch_type}"' if branch_type else "NULL"]
    placeholders = ", ".join("?" for _ in customer_codes)
    con = get_connection()
    try:
        cur = con.cursor()
        try:
            cur.execute(f"SELECT {', '.join(selected)} FROM AR_CUSTOMERBRANCH WHERE \"{cols['CODE']}\" IN ({placeholders})", list(customer_codes))
            chosen = {}
            for row in cur.fetchall():
                code, email, contact, kind = (_value(value) for value in row)
                email = str(email or "").strip()
                if email and (code not in chosen or str(kind or "").upper() == "B"):
                    chosen[str(code)] = {"email": email, "attention": contact or ""}
            return chosen
        finally: cur.close()
    finally: con.close()


def build(criteria):
    customers = _customers(criteria)
    branch_emails = _branch_emails(customers.keys())
    for code, customer in customers.items():
        branch = branch_emails.get(code, {})
        customer["email"] = branch.get("email", "")
        customer["attention"] = branch.get("attention", "")
        customer["email_valid"] = bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", customer["email"]))
    sources = [("AR_IV", "Sales Invoice", 1), ("AR_DN", "Debit Note", 1), ("AR_PM", "Customer Payment", -1), ("AR_CN", "Credit Note", -1), ("AR_CF", "Customer Refund", 1)]
    rows = [row for table, label, direction in sources for row in _source_rows(table, label, direction, criteria)]
    grouped = defaultdict(list)
    for row in rows:
        if row["customer_code"] in customers:
            grouped[row["customer_code"]].append(row)
    statements = []
    for code, customer in customers.items():
        ledger, running, debit, credit = [], Decimal(0), Decimal(0), Decimal(0)
        for row in sorted(grouped[code], key=lambda item: (item["date"] or "", item["reference"] or "")):
            amount = Decimal(str(row["amount"]))
            if amount >= 0: debit += amount
            else: credit += -amount
            running += amount
            if row["date"] and row["date"] >= criteria.start.isoformat():
                ledger.append({**row, "debit": float(amount) if amount >= 0 else 0, "credit": float(-amount) if amount < 0 else 0, "balance": float(running)})
        opening = float(running - sum(Decimal(str(item["amount"])) for item in ledger))
        closing = float(running)
        if criteria.include_zero or ledger or closing:
            statements.append({**customer, "opening": opening, "total_debit": float(debit), "total_credit": float(credit), "closing": closing, "transactions": ledger})
    statements.sort(key=lambda item: (item["name"] or "", item["code"] or ""))
    recipients = [{"code": item["code"], "name": item["name"], "email": item["email"]} for item in statements if item["email_valid"]]
    failures = [{"code": item["code"], "name": item["name"], "reason": "No Billing branch email" if not item["email"] else "Invalid email address"} for item in statements if not item["email_valid"]]
    return {"criteria": criteria.model_dump(mode="json"), "statements": statements, "total_balance": float(sum(Decimal(str(item["closing"])) for item in statements)), "email_recipients": recipients, "email_failures": failures}


@router.get("/options")
def options():
    cols = _columns("AR_CUSTOMER")
    con = get_connection()
    try:
        cur = con.cursor()
        result = {}
        customer_code, customer_name = cols.get("CODE"), cols.get("COMPANYNAME")
        if customer_code:
            cur.execute(f'SELECT "{customer_code}", "{customer_name}" FROM AR_CUSTOMER WHERE "{customer_code}" IS NOT NULL ORDER BY "{customer_code}"')
            result["customers"] = [
                {"value": str(_value(row[0])), "label": f"{_value(row[0])} - {_value(row[1]) or 'Unnamed customer'}"}
                for row in cur.fetchall() if _value(row[0]) not in (None, "----")
            ]
        else:
            result["customers"] = []
        for key, column in (("agents", cols.get("AGENT")), ("areas", cols.get("AREA")), ("currencies", cols.get("CURRENCYCODE"))):
            if not column: result[key] = []; continue
            cur.execute(f'SELECT DISTINCT "{column}" FROM AR_CUSTOMER WHERE "{column}" IS NOT NULL ORDER BY "{column}"')
            result[key] = [str(_value(row[0])) for row in cur.fetchall() if _value(row[0]) not in (None, "----")]
        if "PROJECT" in _columns("AR_IV"):
            cur.execute('SELECT DISTINCT "PROJECT" FROM AR_IV WHERE "PROJECT" IS NOT NULL ORDER BY "PROJECT"')
            result["projects"] = [str(_value(row[0])) for row in cur.fetchall() if _value(row[0]) not in (None, "----")]
        else: result["projects"] = []
        return result
    finally:
        cur.close(); con.close()


@router.post("")
def statement(criteria: StatementCriteria):
    try: return build(criteria)
    except Exception as exc: raise HTTPException(status_code=500, detail=str(exc))

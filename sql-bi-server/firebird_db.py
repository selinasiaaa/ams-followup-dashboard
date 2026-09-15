"""Read-only access helpers for the SQL Account Firebird database."""
import os
from collections import defaultdict
from decimal import Decimal
from firebird.driver import connect
DB_PATH = os.getenv("AMS_SQL_BI_DB_PATH", "")
DB_HOST = os.getenv("AMS_SQL_BI_DB_HOST", "localhost/3050")
DB_USER = os.getenv("AMS_SQL_BI_DB_USER", "")
DB_PASSWORD = os.getenv("AMS_SQL_BI_DB_PASSWORD", "")


def configure_database_path(path):
    """Set the database selected by the local gateway after DCF validation."""
    global DB_PATH
    DB_PATH = str(path)

# Published SQL Account Biz Object names.  Others stay visible but unlabelled.
TABLE_CATEGORIES = {
    "Customer": {"AR_CUSTOMER", "AR_PM", "AR_IV", "AR_DN", "AR_CN"},
    "Supplier": {"AP_SUPPLIER", "AP_SP", "AP_PI", "AP_SD", "AP_SC"},
    "Sales": {"SL_IV", "SL_CS", "SL_CN", "SL_DN", "SL_SO", "SL_DO", "SL_QT"},
    "Purchase": {"PH_PI", "PH_CP", "PH_SC", "PH_SD", "PH_PO", "PH_PR", "PH_GRN"},
}

# Names used in the dashboard.  These follow SQL Account's module wording,
# rather than exposing implementation names such as AR_CN or SL_IVDTL.
TABLE_LABELS = {

    # =========================
    # CUSTOMER / AR
    # =========================

    "AR_CUSTOMER": ("Customer", "Maintain Customer"),
    "AR_CUSTOMERBRANCH": ("Customer", "Customer Branch"),
    "AR_CUSTOMERBANKACC": ("Customer", "Customer Bank Account"),
    "AR_CUSTOMERCRCTRL": ("Customer", "Customer Credit Control"),
    "AR_CUSTOMERTARIFF": ("Customer", "Customer Tariff"),

    "AR_IV": ("Customer", "Customer Invoice"),
    "AR_DN": ("Customer", "Customer Debit Note"),
    "AR_CN": ("Customer", "Customer Credit Note"),
    "AR_PM": ("Customer", "Customer Payment"),
    "AR_CF": ("Customer", "Customer Refund"),
    "AR_CT": ("Customer", "Customer Contra"),
    "AR_DP": ("Customer", "Customer Deposit"),
    "AR_KNOCKOFF": ("Customer", "Customer Knock-Off"),

    "AR_IVDTL": ("Customer", "Customer Invoice Detail"),
    "AR_DNDTL": ("Customer", "Customer Debit Note Detail"),
    "AR_CNDTL": ("Customer", "Customer Credit Note Detail"),
    "AR_DPDTL": ("Customer", "Customer Deposit Detail"),


    # =========================
    # SUPPLIER / AP
    # =========================

    "AP_SUPPLIER": ("Supplier", "Maintain Supplier"),
    "AP_SUPPLIERBRANCH": ("Supplier", "Supplier Branch"),
    "AP_SUPPLIERBANKACC": ("Supplier", "Supplier Bank Account"),
    "AP_SUPPLIERCRCTRL": ("Supplier", "Supplier Credit Control"),
    "AP_SUPPLIERTARIFF": ("Supplier", "Supplier Tariff"),

    "AP_PI": ("Supplier", "Supplier Invoice"),
    "AP_SD": ("Supplier", "Supplier Debit Note"),
    "AP_SC": ("Supplier", "Supplier Credit Note"),
    "AP_SP": ("Supplier", "Supplier Payment"),
    "AP_SF": ("Supplier", "Supplier Refund"),
    "AP_ST": ("Supplier", "Supplier Contra"),


    # =========================
    # SALES
    # =========================

    "SL_QT": ("Sales", "Sales Quotation"),
    "SL_SO": ("Sales", "Sales Order"),
    "SL_DO": ("Sales", "Delivery Order"),
    "SL_IV": ("Sales", "Sales Invoice"),
    "SL_CS": ("Sales", "Cash Sales"),
    "SL_CN": ("Sales", "Sales Credit Note"),
    "SL_DN": ("Sales", "Sales Debit Note"),
    "SL_CC": ("Sales", "Sales Cancelled Note"),

    "SL_QTDTL": ("Sales", "Sales Quotation Detail"),
    "SL_SODTL": ("Sales", "Sales Order Detail"),
    "SL_DODTL": ("Sales", "Delivery Order Detail"),
    "SL_IVDTL": ("Sales", "Sales Invoice Detail"),
    "SL_CSDTL": ("Sales", "Cash Sales Detail"),
    "SL_CNDTL": ("Sales", "Sales Credit Note Detail"),
    "SL_DNDTL": ("Sales", "Sales Debit Note Detail"),


    # =========================
    # PURCHASE
    # =========================

    "PH_PQ": ("Purchase", "Purchase Request"),
    "PH_PR": ("Purchase", "Purchase Request"),
    "PH_PO": ("Purchase", "Purchase Order"),
    "PH_GR": ("Purchase", "Goods Received"),
    "PH_GRN": ("Purchase", "Goods Received Note"),
    "PH_PI": ("Purchase", "Purchase Invoice"),
    "PH_CP": ("Purchase", "Cash Purchase"),
    "PH_SD": ("Purchase", "Purchase Debit Note"),
    "PH_SC": ("Purchase", "Purchase Return / Credit Note"),
    "PH_PC": ("Purchase", "Purchase Cancelled Note"),

    "PH_PQDTL": ("Purchase", "Purchase Request Detail"),
    "PH_PRDTL": ("Purchase", "Purchase Request Detail"),
    "PH_PODTL": ("Purchase", "Purchase Order Detail"),
    "PH_GRDTL": ("Purchase", "Goods Received Detail"),
    "PH_GRNDTL": ("Purchase", "Goods Received Detail"),
    "PH_PIDTL": ("Purchase", "Purchase Invoice Detail"),
    "PH_CPDTL": ("Purchase", "Cash Purchase Detail"),
    "PH_SDDTL": ("Purchase", "Purchase Debit Note Detail"),
    "PH_SCDTL": ("Purchase", "Purchase Return Detail"),


    # =========================
    # GENERAL LEDGER
    # =========================

    "GL_ACCOUNT": ("General Ledger", "Chart of Accounts"),

    "GL_JE": ("General Ledger", "Journal Entry"),
    "GL_JV": ("General Ledger", "Journal Entry"),

    "GL_PV": ("General Ledger", "Payment Voucher"),
    "GL_OR": ("General Ledger", "Official Receipt"),
    "GL_CB": ("General Ledger", "Cash Book Entry"),

    "GL_JEDTL": ("General Ledger", "Journal Entry Detail"),
    "GL_JVDTL": ("General Ledger", "Journal Entry Detail"),
    "GL_PVDTL": ("General Ledger", "Payment Voucher Detail"),
    "GL_ORDTL": ("General Ledger", "Official Receipt Detail"),
    "GL_CBDTL": ("General Ledger", "Cash Book Detail"),


    # =========================
    # STOCK
    # =========================

    "ST_ITEM": ("Stock", "Maintain Stock Item"),
    "ST_GROUP": ("Stock", "Stock Group"),
    "ST_LOCATION": ("Stock", "Stock Location"),

    "ST_AJ": ("Stock", "Stock Adjustment"),
    "ST_AS": ("Stock", "Stock Assembly"),
    "ST_DS": ("Stock", "Stock Disassembly"),
    "ST_IS": ("Stock", "Stock Issue"),
    "ST_RC": ("Stock", "Stock Received"),
    "ST_XF": ("Stock", "Stock Transfer"),
    "ST_TRANSFER": ("Stock", "Stock Transfer"),


    # =========================
    # MASTER DATA
    # =========================

    "AREA": ("Master Data", "Area"),
    "COMPANYCATEGORY": ("Master Data", "Company Category"),
    "CURRENCY": ("Master Data", "Currency"),
    "CURRENCYRATE": ("Master Data", "Currency Rate"),
}

DOCUMENT_DETAIL_MAP = {

    "AR_IV": ["AR_IVDTL"],
    "AR_DN": ["AR_DNDTL"],
    "AR_CN": ["AR_CNDTL"],
    "AR_DP": ["AR_DPDTL"],

    "SL_QT": ["SL_QTDTL"],
    "SL_SO": ["SL_SODTL"],
    "SL_DO": ["SL_DODTL"],
    "SL_IV": ["SL_IVDTL"],
    "SL_CS": ["SL_CSDTL"],
    "SL_CN": ["SL_CNDTL"],
    "SL_DN": ["SL_DNDTL"],

    "PH_PQ": ["PH_PQDTL"],
    "PH_PR": ["PH_PRDTL"],
    "PH_PO": ["PH_PODTL"],
    "PH_GR": ["PH_GRDTL"],
    "PH_GRN": ["PH_GRNDTL"],
    "PH_PI": ["PH_PIDTL"],
    "PH_CP": ["PH_CPDTL"],
    "PH_SD": ["PH_SDDTL"],
    "PH_SC": ["PH_SCDTL"],

    "GL_JE": ["GL_JEDTL", "GL_JVDTL"],
    "GL_JV": ["GL_JVDTL", "GL_JEDTL"],
    "GL_PV": ["GL_PVDTL"],
    "GL_OR": ["GL_ORDTL"],
    "GL_CB": ["GL_CBDTL"],
}


DOCUMENT_TABLES = set(DOCUMENT_DETAIL_MAP) | {
    "AR_PM",
    "AR_CF",
    "AR_CT",

    "AP_SP",
    "AP_SF",
    "AP_ST",

    "PH_PC",
    "SL_CC",
}

GL_FALLBACK_TABLES = [
    ("GL_ACCOUNT", "Chart of Accounts"),
    ("GL_JV", "Journal Entry"),
    ("GL_PV", "Payment Voucher"),
    ("GL_OR", "Official Receipt"),
    ("CB_ENTRY", "Cash Book Entry"),
]

def table_label(table_name):
    """Return a menu label only for an approved, user-facing table."""
    return TABLE_LABELS.get(table_name.upper())

def get_connection():
    # SQL Accounting databases can contain legacy fields with mixed encodings.
    # Request raw bytes and decode them safely in _text instead of letting the
    # driver fail with a charmap decoding error while reading an entire row.
    if not all((DB_PATH, DB_USER, DB_PASSWORD)):
        raise RuntimeError("SQL BI database settings are not configured on this server.")
    return connect(f"{DB_HOST}:{DB_PATH}", user=DB_USER, password=DB_PASSWORD, charset="NONE")

def _text(value):
    """Decode database bytes without losing a legacy value or crashing a report."""
    # Firebird returns BLOB SUB_TYPE 0 values as readers.  Read their raw
    # bytes first so legacy account descriptions can be decoded safely.
    if hasattr(value, "read"):
        return _text(value.read())
    if not isinstance(value, (bytes, bytearray)):
        return str(value)
    for encoding in ("utf-8", "cp1252", "latin1"):
        try:
            return bytes(value).decode(encoding)
        except UnicodeDecodeError:
            continue
    return bytes(value).decode("latin1", errors="replace")

def get_table_names():
    """
    Return user-facing SQL Accounting tables.

    T_01_..., T_02_..., etc. are internal/generated tables
    and are intentionally hidden from the dashboard.
    """

    con = get_connection()

    try:

        cur = con.cursor()

        try:

            cur.execute("""
                SELECT TRIM(RDB$RELATION_NAME)
                FROM RDB$RELATIONS
                WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
                  AND RDB$VIEW_BLR IS NULL
                ORDER BY RDB$RELATION_NAME
            """)

            tables = []

            for row in cur.fetchall():

                if not row or not row[0]:
                    continue

                name = _text(row[0]).strip()

                # Hide internal/generated tables
                if name.upper().startswith("T_"):
                    continue

                tables.append(name)

            return tables

        finally:
            cur.close()

    finally:
        con.close()

def quote_identifier(name):
    if name not in set(get_table_names()):
        raise ValueError("Unknown table")
    return '"' + name.replace('"', '""') + '"'

def get_table_columns(table_name):
    con = get_connection()
    try:
        cur = con.cursor()
        try:
            cur.execute(f"SELECT * FROM {quote_identifier(table_name.strip())} WHERE 1 = 0")
            return [_text(col[0]).strip() for col in cur.description]
        finally: cur.close()
    finally: con.close()

def get_table_preview(table_name, limit=100):
    limit = max(1, min(int(limit), 500))
    con = get_connection()
    try:
        cur = con.cursor()
        try:
            table = quote_identifier(table_name.strip())
            available = {name.upper() for name in get_table_columns(table_name)}
            order_column = "CODE" if "CODE" in available else ("DOCNO" if "DOCNO" in available else ("DOCKEY" if "DOCKEY" in available else None))
            order_clause = f' ORDER BY "{order_column}"' if order_column else ""
            cur.execute(f"SELECT FIRST {limit} * FROM {table}{order_clause}")
            columns = [_text(col[0]).strip() for col in cur.description]
            try:
                return columns, cur.fetchall()
            except Exception:
                # A few legacy records contain text that the Firebird driver cannot
                # decode. Keep the table browsable by skipping only unreadable rows.
                rows = []
                for offset in range(limit * 10):
                    try:
                        safe_con = get_connection()
                        safe_cur = safe_con.cursor()
                        safe_cur.execute(f"SELECT FIRST 1 SKIP {offset} * FROM {table}{order_clause}")
                        row = safe_cur.fetchone()
                        safe_cur.close()
                        safe_con.close()
                        if row is not None:
                            rows.append(row)
                    except Exception:
                        try:
                            safe_cur.close()
                            safe_con.close()
                        except Exception:
                            pass
                        continue
                    if len(rows) >= limit:
                        break
                return columns, rows
        finally: cur.close()
    finally: con.close()

def _first_column(columns, *candidates):

    lookup = {
        column.upper(): column
        for column in columns
    }

    for candidate in candidates:

        if candidate.upper() in lookup:
            return lookup[candidate.upper()]

    return None

def _find_detail_table(header_table):

    available = {
        name.upper(): name
        for name in get_table_names()
    }

    candidates = DOCUMENT_DETAIL_MAP.get(
        header_table.upper(),
        []
    )

    candidates += [
        header_table.upper() + "DTL"
    ]

    for candidate in candidates:

        if candidate.upper() in available:
            return available[candidate.upper()]

    return None

def _document_columns(columns):

    return {

        "docno": _first_column(
            columns,
            "DOCNO",
            "DOCNOEX",
            "INVOICENO",
            "DOCNUMBER",
            "DOCNUM"
        ),

        "date": _first_column(
            columns,
            "DOCDATE",
            "INVOICEDATE",
            "DATE",
            "TRANSDATE",
            "POSTDATE"
        ),

        "key": _first_column(
            columns,
            "DOCKEY",
            "DOC_KEY",
            "DOCID",
            "DOC_ID",
            "ID",
            "KEY"
        ),

        "name": _first_column(
            columns,
            "COMPANYNAME",
            "CUSTOMERNAME",
            "SUPPLIERNAME",
            "CUSTOMER",
            "SUPPLIER"
        ),

        "amount": _first_column(
            columns,
            "LOCALDOCAMT",
            "DOCAMT",
            "LOCALAMOUNT",
            "AMOUNT",
            "TOTAL"
        ),
    }

def is_document_table(table_name):

    return table_name.upper() in {
        name.upper()
        for name in DOCUMENT_TABLES
    }

def get_document_listing(table_name, limit=500):

    table_name = table_name.strip()

    if table_name.upper() not in {
        name.upper()
        for name in get_table_names()
    }:
        raise ValueError("Unknown table")

    columns = get_table_columns(table_name)

    info = _document_columns(columns)

    if not info["docno"]:

        return None, (
            "This table has no recognizable "
            "document number column."
        )

    display = [
        info["docno"]
    ]

    for key in [
        "date",
        "name",
        "amount"
    ]:

        col = info[key]

        if col and col not in display:
            display.append(col)

    preferred = [

        "DESCRIPTION",
        "DOCREF1",
        "AGENT",
        "AREA",
        "PROJECT",
        "CURRENCYCODE",
        "CURRENCY",
        "CANCELLED",
        "STATUS",
        "IRBM_STATUS",
    ]

    for candidate in preferred:

        col = _first_column(
            columns,
            candidate
        )

        if col and col not in display:
            display.append(col)

    display = display[:12]

    text_columns = {
        info["docno"],
        info["name"],
        "DESCRIPTION",
        "DOCREF1",
        "AGENT",
        "AREA",
        "PROJECT",
        "CURRENCYCODE",
        "CURRENCY",
        "STATUS",
        "IRBM_STATUS",
    }

    selected_columns = [
        (
            f'CAST("{col}" AS VARCHAR(8191) CHARACTER SET OCTETS) AS "{col}"'
            if col in text_columns
            else f'"{col}"'
        )
        for col in display
    ]

    sql = (
        f"SELECT FIRST {max(1, min(int(limit), 1000))} "
        + ", ".join(selected_columns)
        + f" FROM {quote_identifier(table_name)}"
    )

    if info["date"]:

        sql += (
            f' ORDER BY "{info["date"]}" DESC'
        )

    con = get_connection()

    try:

        cur = con.cursor()

        try:

            cur.execute(sql)

            return {
                "table": table_name,
                "columns": display,
                "rows": cur.fetchall(),
                "docno_column": info["docno"],
            }, None

        finally:
            cur.close()

    finally:
        con.close()

def get_document_detail(table_name, docno):

    table_name = table_name.strip()

    available = {
        name.upper(): name
        for name in get_table_names()
    }

    actual_table = available.get(
        table_name.upper()
    )

    if not actual_table:

        return None, "Unknown document table."

    header_columns = get_table_columns(
        actual_table
    )

    info = _document_columns(
        header_columns
    )

    if not info["docno"]:

        return None, (
            "No recognizable document "
            "number column was found."
        )

    # =========================
    # GET HEADER
    # =========================

    con = get_connection()

    try:

        cur = con.cursor()

        try:

            sql = (
                f'SELECT FIRST 1 * '
                f'FROM {quote_identifier(actual_table)} '
                f'WHERE "{info["docno"]}" = ?'
            )

            cur.execute(
                sql,
                [docno]
            )

            header_row = cur.fetchone()

            result_columns = [
                _text(col[0]).strip()
                for col in cur.description
            ]

        finally:
            cur.close()

    finally:
        con.close()

    if header_row is None:

        return None, (
            f"Document {docno} was not found."
        )

    # =========================
    # FIND DETAIL TABLE
    # =========================

    detail_table = _find_detail_table(
        actual_table
    )

    detail_columns = []
    detail_rows = []

    if detail_table:

        detail_columns = get_table_columns(
            detail_table
        )

        detail_info = _document_columns(
            detail_columns
        )

        detail_link = None
        header_key_value = None

        # Try DOCKEY / internal key first

        if (
            info["key"]
            and info["key"].upper()
            in {
                c.upper()
                for c in detail_columns
            }
        ):

            detail_link = next(
                c
                for c in detail_columns
                if c.upper()
                == info["key"].upper()
            )

            header_map = {
                name.upper(): value
                for name, value
                in zip(
                    result_columns,
                    header_row
                )
            }

            header_key_value = header_map.get(
                info["key"].upper()
            )

        # =========================
        # QUERY DETAIL
        # =========================

        if (
            detail_link
            and header_key_value is not None
        ):

            sql = (
                f'SELECT * '
                f'FROM {quote_identifier(detail_table)} '
                f'WHERE "{detail_link}" = ?'
            )

            params = [
                header_key_value
            ]

        elif detail_info["docno"]:

            detail_link = (
                detail_info["docno"]
            )

            sql = (
                f'SELECT * '
                f'FROM {quote_identifier(detail_table)} '
                f'WHERE "{detail_link}" = ?'
            )

            params = [docno]

        else:

            sql = None
            params = []

        if sql:

            con = get_connection()

            try:

                cur = con.cursor()

                try:

                    cur.execute(
                        sql,
                        params
                    )

                    detail_columns = [
                        _text(col[0]).strip()
                        for col in cur.description
                    ]

                    detail_rows = cur.fetchall()

                finally:
                    cur.close()

            finally:
                con.close()

    return {

        "table": actual_table,

        "docno": docno,

        "header_columns":
            result_columns,

        "header_row":
            header_row,

        "detail_table":
            detail_table,

        "detail_columns":
            detail_columns,

        "detail_rows":
            detail_rows,

    }, None

def json_value(value):

    if isinstance(
        value,
        (bytes, bytearray)
    ):
        return _text(value)

    if isinstance(value, Decimal):
        return float(value)

    if hasattr(value, "isoformat"):
        return value.isoformat()

    return value


# =========================================================
# PROFIT AND LOSS
# =========================================================

PNL_GROUPS = (
    ("SL", "SALES", "income"),
    ("SA", "SALES ADJUSTMENT", "income"),
    ("CO", "COST OF GOODS SOLD", "expense"),
    ("OI", "OTHER INCOME", "income"),
    ("EO", "EXTRA ORDINARY INCOME", "income"),
    ("EP", "EXPENSES", "expense"),
    ("TX", "TAXATION", "expense"),
)


def _pnl_date(value):
    """Return a date object from FastAPI's ISO date query value."""
    from datetime import date

    if isinstance(value, date):
        return value

    return date.fromisoformat(str(value))


def _pnl_column(columns, *candidates):
    return _first_column(columns, *candidates)


def _pnl_rows(date_from, date_to, date_field="POSTDATE", currency="local", document_types=None, project=None, agent=None, area=None):
    """Read only P&L postings from SQL Account's GL account and transaction tables."""
    date_from = _pnl_date(date_from)
    date_to = _pnl_date(date_to)
    if date_from > date_to:
        raise ValueError("The From date must be on or before the To date.")

    catalog = get_schema_catalog()
    account_table = next((name for name in catalog if name.upper() == "GL_ACC"), None)
    transaction_table = next((name for name in catalog if name.upper() == "GL_TRANS"), None)
    if not account_table or not transaction_table:
        raise ValueError("GL_ACC and GL_TRANS are required to create the Profit & Loss report.")

    account_columns = catalog[account_table]
    transaction_columns = catalog[transaction_table]
    account_code = _pnl_column(account_columns, "CODE")
    account_description = _pnl_column(account_columns, "DESCRIPTION")
    account_description2 = _pnl_column(account_columns, "DESCRIPTION2")
    account_type = _pnl_column(account_columns, "ACCTYPE")
    transaction_code = _pnl_column(transaction_columns, "CODE")
    transaction_date = _pnl_column(transaction_columns, date_field.upper())
    if not transaction_date:
        transaction_date = _pnl_column(transaction_columns, "POSTDATE", "DOCDATE")
    cancelled = _pnl_column(transaction_columns, "CANCELLED")
    document_type = _pnl_column(transaction_columns, "FROMDOCTYPE")
    project_column = _pnl_column(transaction_columns, "PROJECT")
    agent_column = _pnl_column(transaction_columns, "AGENT")
    area_column = _pnl_column(transaction_columns, "AREA")
    if currency == "original":
        debit = _pnl_column(transaction_columns, "DR")
        credit = _pnl_column(transaction_columns, "CR")
    else:
        debit = _pnl_column(transaction_columns, "LOCALDR", "DR")
        credit = _pnl_column(transaction_columns, "LOCALCR", "CR")

    if not all((account_code, account_description, account_type, transaction_code, transaction_date, debit, credit)):
        raise ValueError("The GL tables are missing one or more required P&L fields.")

    sql = f'''
        SELECT A."{account_code}", A."{account_description}", {f'A."{account_description2}"' if account_description2 else 'NULL'}, A."{account_type}",
               T."{transaction_date}", T."{debit}", T."{credit}"
        FROM {quote_identifier(transaction_table)} T
        JOIN {quote_identifier(account_table)} A
          ON A."{account_code}" = T."{transaction_code}"
        WHERE T."{transaction_date}" >= ?
          AND T."{transaction_date}" <= ?
          AND A."{account_type}" IN ({", ".join("?" for _ in PNL_GROUPS)})
    '''
    params = [date_from, date_to, *[code for code, _, _ in PNL_GROUPS]]
    if cancelled:
        sql += f' AND COALESCE(T."{cancelled}", FALSE) = FALSE'
    clean_document_types = [item.strip().upper() for item in (document_types or []) if item and item.strip()]
    if clean_document_types and document_type:
        sql += f' AND UPPER(T."{document_type}") IN ({", ".join("?" for _ in clean_document_types)})'
        params.extend(clean_document_types)
    for field, value in ((project_column, project), (agent_column, agent), (area_column, area)):
        if field and value and str(value).strip():
            sql += f' AND UPPER(T."{field}") = ?'
            params.append(str(value).strip().upper())
    sql += f' ORDER BY A."{account_type}", A."{account_code}"'

    con = get_connection()
    try:
        cur = con.cursor()
        try:
            cur.execute(sql, params)
            return cur.fetchall()
        finally:
            cur.close()
    finally:
        con.close()


def _pnl_amount(account_type, debit, credit):
    """Use SQL Account's normal P&L signs for a readable income statement."""
    debit = Decimal(debit or 0)
    credit = Decimal(credit or 0)
    return credit - debit if account_type in {"SL", "SA", "OI", "EO"} else debit - credit


def _pnl_period(date_from, date_to, date_field, currency, document_types, project, agent, area):
    grouped = defaultdict(lambda: {"accounts": {}, "total": Decimal(0)})
    for code, description, description2, account_type, _, debit, credit in _pnl_rows(
        date_from, date_to, date_field, currency, document_types, project, agent, area
    ):
        amount = _pnl_amount(str(account_type).strip(), debit, credit)
        account = grouped[str(account_type).strip()]["accounts"].setdefault(
            str(code).strip(), {"code": str(code).strip(), "description": _text(description).strip(), "description2": _text(description2).strip() if description2 else "", "amount": Decimal(0)}
        )
        account["amount"] += amount
        grouped[str(account_type).strip()]["total"] += amount
    return grouped


def get_profit_loss(date_from, date_to, columns=None, date_field="POSTDATE", currency="local", document_types=None, project=None, agent=None, area=None):
    """Create a configurable, read-only Statement of Comprehensive Income."""
    from datetime import timedelta

    date_from = _pnl_date(date_from)
    date_to = _pnl_date(date_to)
    selected = [item for item in (columns or ["current", "ytd"]) if item in {"current", "mtd", "ytd", "previous_period", "last_month", "last_year"}]
    if not selected:
        selected = ["current"]

    month_start = date_from.replace(day=1)
    last_month_end = month_start - timedelta(days=1)
    previous_length = (date_to - date_from).days + 1
    definitions = {
        "current": ("Current Period", date_from, date_to),
        "mtd": ("Month To Date", month_start, date_to),
        "ytd": ("Year To Date", date_from.replace(month=1, day=1), date_to),
        "previous_period": ("Previous Period", date_from - timedelta(days=previous_length), date_from - timedelta(days=1)),
        "last_month": ("Last Month", last_month_end.replace(day=1), last_month_end),
        "last_year": ("Last Year", date_from.replace(year=date_from.year - 1), date_to.replace(year=date_to.year - 1)),
    }
    periods = {key: _pnl_period(start, end, date_field, currency, document_types, project, agent, area) for key, (_, start, end) in definitions.items() if key in selected}
    output_columns = [{"key": key, "label": definitions[key][0], "from_date": definitions[key][1].isoformat(), "to_date": definitions[key][2].isoformat()} for key in selected]

    sections, section_totals = [], {}
    for group_code, label, kind in PNL_GROUPS:
        account_codes = sorted({code for period in periods.values() for code in period[group_code]["accounts"]})
        if not account_codes:
            continue
        accounts = []
        for code in account_codes:
            source = next(period[group_code]["accounts"].get(code) for period in periods.values() if code in period[group_code]["accounts"])
            accounts.append({"code": code, "description": source["description"], "description2": source["description2"], "values": {key: float(periods[key][group_code]["accounts"].get(code, {}).get("amount", 0)) for key in selected}})
        totals = {key: float(periods[key][group_code]["total"]) for key in selected}
        section_totals[group_code] = totals
        sections.append({"code": group_code, "label": label, "kind": kind, "accounts": accounts, "totals": totals})

    def total(code, key):
        return Decimal(str(section_totals.get(code, {}).get(key, 0)))

    summaries = {}
    for key in selected:
        net_sales = total("SL", key) + total("SA", key)
        gross_profit = net_sales - total("CO", key)
        net_profit_before_tax = gross_profit + total("OI", key) + total("EO", key) - total("EP", key)
        summaries[key] = {"net_sales": float(net_sales), "gross_profit": float(gross_profit), "net_profit_before_tax": float(net_profit_before_tax), "net_profit_after_tax": float(net_profit_before_tax - total("TX", key))}

    return {"title": "Statement Of Comprehensive Income", "currency": currency, "date_field": date_field, "columns": output_columns, "sections": sections, "summaries": summaries, "filters": {"from_date": date_from.isoformat(), "to_date": date_to.isoformat(), "document_types": document_types or [], "project": project or "", "agent": agent or "", "area": area or ""}}

def categorize_tables():
    """
    Return all visible SQL Accounting tables.

    Known tables:
        Use official/friendly SQL Accounting names.

    Unknown tables:
        Keep the physical table name unchanged.

    T_* tables:
        Already removed by get_table_names().
    """

    groups = defaultdict(list)

    available_tables = get_table_names()

    for table in available_tables:

        label = table_label(table)

        if label:

            category, title = label

        else:

            # We do NOT guess unknown table meanings.
            category = "Other / Unmapped"
            title = table

        groups[category].append({
            "table": table,
            "title": title
        })

    return {
        category: sorted(
            tables,
            key=lambda item: item["table"].upper()
        )
        for category, tables in sorted(
            groups.items(),
            key=lambda item: item[0]
        )
    }

def get_schema_catalog():
    # One metadata query is much faster than opening every table just to find
    # its columns; this also works when table names are generated (T_01_...).
    con = get_connection()
    try:
        cur = con.cursor()
        try:
            cur.execute("""SELECT TRIM(R.RDB$RELATION_NAME), TRIM(F.RDB$FIELD_NAME)
                FROM RDB$RELATIONS R
                JOIN RDB$RELATION_FIELDS F ON F.RDB$RELATION_NAME = R.RDB$RELATION_NAME
                WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0 AND R.RDB$VIEW_BLR IS NULL
                ORDER BY R.RDB$RELATION_NAME, F.RDB$FIELD_POSITION""")
            catalog = defaultdict(list)
            for table, column in cur.fetchall():
                catalog[_text(table).strip()].append(_text(column).strip())
            return dict(catalog)
        finally: cur.close()
    finally: con.close()

def financial_candidates():
    """Find likely report sources from fields, never from an opaque table name."""
    results = []
    for table, columns in get_schema_catalog().items():
        fields = {column.upper() for column in columns}
        score = 0
        if fields & {"DEBIT", "DR", "LOCALDEBIT"}: score += 2
        if fields & {"CREDIT", "CR", "LOCALCREDIT"}: score += 2
        if fields & {"DOCDATE", "TRANSDATE", "POSTDATE", "DATE"}: score += 1
        if fields & {"ACCOUNTCODE", "ACCTNO", "ACCOUNT", "CODE"}: score += 1
        if fields & {"ACCOUNTTYPE", "ACCTTYPE", "ACCOUNTGROUP", "GROUPTYPE"}: score += 2
        if score >= 2:
            results.append({"table": table, "score": score, "columns": columns})
    return sorted(results, key=lambda item: (-item["score"], item["table"]))

def _first_column(columns, *candidates):
    lookup = {column.upper(): column for column in columns}
    return next((lookup[item] for item in candidates if item in lookup), None)

def get_gl_ledger(date_from=None, date_to=None, limit=500):
    """Detect a GL journal table from its fields, including generated table names."""
    catalog = get_schema_catalog()
    table = None
    for candidate in financial_candidates():
        fields = {column.upper() for column in candidate["columns"]}
        has_debit = bool(fields & {"DEBIT", "DR", "LOCALDEBIT"})
        has_credit = bool(fields & {"CREDIT", "CR", "LOCALCREDIT"})
        has_date = bool(fields & {"DOCDATE", "TRANSDATE", "POSTDATE", "DATE"})
        has_account = bool(fields & {"ACCOUNTCODE", "ACCTNO", "ACCOUNT", "CODE"})
        if has_debit and has_credit and has_date and has_account:
            table = candidate["table"]
            break
    if not table:
        return None, "No table has the four required GL fields: date, account, debit and credit."
    columns = catalog[table]
    date_col = _first_column(columns, "DOCDATE", "TRANSDATE", "DATE")
    account_col = _first_column(columns, "ACCOUNTCODE", "ACCTNO", "ACCOUNT", "CODE")
    debit_col = _first_column(columns, "DEBIT", "DR", "LOCALDEBIT")
    credit_col = _first_column(columns, "CREDIT", "CR", "LOCALCREDIT")
    if not all((date_col, account_col, debit_col, credit_col)):
        return None, f"{table} does not have the expected date, account, debit and credit columns."
    where, params = [], []
    if date_from: where.append(f'"{date_col}" >= ?'); params.append(date_from)
    if date_to: where.append(f'"{date_col}" <= ?'); params.append(date_to)
    clause = " WHERE " + " AND ".join(where) if where else ""
    sql = f'''SELECT FIRST {max(1, min(int(limit), 1000))} "{date_col}", "{account_col}", "{debit_col}", "{credit_col}"
              FROM {quote_identifier(table)}{clause} ORDER BY "{date_col}" DESC'''
    con = get_connection()
    try:
        cur = con.cursor()
        try:
            cur.execute(sql, params)
            return {"table": table, "columns": [date_col, account_col, debit_col, credit_col], "rows": cur.fetchall()}, None
        finally: cur.close()
    finally: con.close()

def _candidate_column(columns, *names):
    return _first_column(columns, *names)

def detect_project_invoice_source():
    """Find an invoice-like table from its fields, not an assumed table name."""
    best = None
    for table, columns in get_schema_catalog().items():
        project = _candidate_column(columns, "PROJECT", "PROJECTCODE", "PROJECTNO")
        document = _candidate_column(columns, "DOCNO", "INVOICENO", "DOCNUMBER")
        if not project or not document:
            continue
        score = 10
        score += bool(_candidate_column(columns, "DOCDATE", "INVOICEDATE", "DATE"))
        score += bool(_candidate_column(columns, "DOCAMT", "LOCALAMOUNT", "AMOUNT", "TOTAL"))
        score += bool(_candidate_column(columns, "CODE", "CUSTOMERCODE", "COMPANYNAME", "CUSTOMER"))
        # A known SQL Account Sales Invoice table is preferred when available.
        score += 10 if table.upper() == "SL_IV" else 0
        item = {"table": table, "columns": columns, "project": project, "document": document, "score": score}
        if best is None or item["score"] > best["score"]:
            best = item
    return best

def get_project_invoices(project=None, limit=1000):
    # A project report must never mix purchase orders, GL, or random tables.
    # These are the published SQL Account Sales document Biz Object names.
    sales_sources = {
        "SL_IV": "Sales Invoice", "SL_CN": "Sales Credit Note",
        "SL_DN": "Sales Debit Note", "SL_CS": "Cash Sales",
    }
    catalog = get_schema_catalog()
    results, used = [], []
    for table, document_type in sales_sources.items():
        columns = catalog.get(table)
        if not columns:
            continue
        project_col = _candidate_column(columns, "PROJECT", "PROJECTCODE", "PROJECTNO")
        document_col = _candidate_column(columns, "DOCNO", "INVOICENO", "DOCNUMBER")
        if not project_col or not document_col:
            continue
        date_col = _candidate_column(columns, "DOCDATE", "INVOICEDATE", "DATE")
        # SQL Account sales headers contain the customer and local document
        # amount. We select those fields directly from each header; the UI
        # never exposes table joins, document keys, or relationships.
        customer_col = _candidate_column(columns, "COMPANYNAME", "CUSTOMERNAME", "CUSTOMER", "CODE")
        amount_col = _candidate_column(columns, "LOCALDOCAMT", "LOCALAMOUNT", "DOCAMT", "AMOUNT")
        cancelled_col = _candidate_column(columns, "CANCELLED")
        output = [("Project", project_col), ("Document Type", None), ("Document No.", document_col),
                  ("Customer", customer_col), ("Date", date_col), ("Amount (RM)", amount_col)]
        selected = [f'"{project_col}"', f"'{document_type}'", f'"{document_col}"']
        selected += [f'"{col}"' if col else "NULL" for _, col in output[3:]]
        where, params = [f'"{project_col}" IS NOT NULL', f'"{project_col}" <> ?'], ["----"]
        if cancelled_col:
            where.append(f'COALESCE("{cancelled_col}", FALSE) = FALSE')
        if project:
            where.append(f'"{project_col}" = ?')
            params.append(project)
        clause = " WHERE " + " AND ".join(where) if where else ""
        con = get_connection()
        try:
            cur = con.cursor()
            try:
                sql = f"SELECT FIRST {max(1, min(int(limit), 2000))} {', '.join(selected)} FROM {quote_identifier(table)}{clause}"
                cur.execute(sql, params) if params else cur.execute(sql)
                results.extend(cur.fetchall())
                used.append(f"{document_type} ({table})")
            finally: cur.close()
        finally: con.close()
    if not used:
        return None, "Sales document tables were not found with both Project and Document Number fields. Expected SL_IV, SL_CN, SL_DN or SL_CS."
    results.sort(key=lambda row: str(row[3] or ""), reverse=True)
    return {"source": ", ".join(used), "columns": [label for label, _ in output], "rows": results[:limit]}, None

def json_value(value):
    if isinstance(value, (bytes, bytearray)):
        return _text(value)
    # Blob readers (pictures, scanned files and attachments) cannot be JSON
    # serialised and are not useful in a table grid. Keep every table preview
    # safe while clearly showing that binary content exists.
    if hasattr(value, "read"):
        return "[Binary attachment]"
    if isinstance(value, Decimal): return float(value)
    if hasattr(value, "isoformat"): return value.isoformat()
    return value

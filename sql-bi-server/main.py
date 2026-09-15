# =========================================================
# main.py
# SQL Accounting BI Dashboard
#
# RESPONSIBILITY:
# - FastAPI backend
# - API endpoints
# - Serve the frontend
#
# NOT INCLUDED HERE:
# - HTML
# - CSS
# - JavaScript
# - Database query logic
#
# Database logic is handled by:
#     firebird_db.py
#
# Frontend files:
#     templates/index.html
#     static/css/style.css
#     static/js/app.js
# =========================================================


# =========================================================
# IMPORTS
# =========================================================

from datetime import date
from pathlib import Path
import os
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import secrets
from access_control import DASHBOARD_USERNAME, DASHBOARD_PASSWORD, available_dcfs, fdbs_from_dcf, selected_fdb_path
from reporting import router as reporting_router
from customer_statement import router as customer_statement_router
from sales_analysis import router as sales_analysis_router

from firebird_db import (
    get_table_names,
    get_table_preview,
    get_document_listing,
    get_document_detail,
    is_document_table,
    categorize_tables,
    json_value,
    get_profit_loss,
    configure_database_path,
)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="SQL Accounting BI Dashboard",
    version="1.0.0",
)
allowed_origins = [origin.strip() for origin in os.getenv("AMS_SQL_BI_ALLOWED_ORIGINS", "http://localhost:5174").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
app.include_router(reporting_router)
app.include_router(customer_statement_router)
# Email-sending routes are intentionally disabled in this portal integration.
# This server is restricted to read-only BI/reporting use.
app.include_router(sales_analysis_router)


# =========================================================
# STATIC FILES
#
# This exposes:
#
# /static/css/style.css
# /static/js/app.js
#
# The HTML file can load these files separately.
# =========================================================

app.mount(
    "/static",
    StaticFiles(directory="static"),
    name="static",
)


class LoginRequest(BaseModel):
    username: str
    password: str


class DcfRequest(BaseModel):
    dcf: str


class DatabaseRequest(BaseModel):
    dcf: str
    fdb: str


# Local-only sessions; restarting the dashboard signs users out.
_gateway_sessions = {}


def _gateway_session(request: Request):
    return _gateway_sessions.get(request.cookies.get("ams_dashboard_session"), {})


@app.get("/api/access/status")
def access_status(request: Request):
    session = _gateway_session(request)
    logged_in = bool(session.get("logged_in"))
    return {"logged_in": logged_in, "database_ready": bool(session.get("database_ready")), "dcf": session.get("dcf"), "fdb": session.get("fdb"), "dcfs": available_dcfs() if logged_in else []}


@app.post("/api/access/login")
def access_login(payload: LoginRequest, request: Request):
    # Keep compatibility with older cached standalone pages that submitted
    # the former display username; the password remains the configured gate.
    accepted_usernames = {DASHBOARD_USERNAME, "AMS TEAM"}
    if payload.username not in accepted_usernames or payload.password != DASHBOARD_PASSWORD:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    token = secrets.token_urlsafe(32)
    # Keep database selection explicit, matching the supplied PROJECT.zip flow.
    # Login alone never opens a database; the user must choose a DCF and FDB.
    _gateway_sessions[token] = {"logged_in": True, "database_ready": False}
    response = JSONResponse({"dcfs": available_dcfs()})
    response.set_cookie("ams_dashboard_session", token, httponly=True, samesite="lax")
    return response


@app.post("/api/access/logout")
def access_logout(request: Request):
    token = request.cookies.get("ams_dashboard_session")
    _gateway_sessions.pop(token, None)
    response = JSONResponse({"ok": True})
    response.delete_cookie("ams_dashboard_session")
    return response


@app.post("/api/access/fdbs")
def access_fdbs(payload: DcfRequest, request: Request):
    if not _gateway_session(request).get("logged_in"):
        raise HTTPException(status_code=401, detail="Please log in first.")
    try:
        return {"fdbs": fdbs_from_dcf(payload.dcf)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/access/select-database")
def access_select_database(payload: DatabaseRequest, request: Request):
    session = _gateway_session(request)
    if not session.get("logged_in"):
        raise HTTPException(status_code=401, detail="Please log in first.")
    try:
        path = selected_fdb_path(payload.dcf, payload.fdb)
        configure_database_path(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    session.update({"dcf": payload.dcf, "fdb": payload.fdb, "database_ready": True})
    return {"ok": True, "fdb": payload.fdb}


@app.middleware("http")
async def require_gateway(request: Request, call_next):
    path = request.url.path
    if path.startswith("/static") or path == "/" or path.startswith("/api/access"):
        return await call_next(request)
    if path.startswith("/api/") and not _gateway_session(request).get("database_ready"):
        return JSONResponse(status_code=401, content={"detail": "Please select a database first."})
    return await call_next(request)


# =========================================================
# FRONTEND
#
# When the browser opens:
#
# http://127.0.0.1:8010/
#
# FastAPI will return:
#
# templates/index.html
#
# The HTML will then load:
# - CSS
# - JavaScript
# =========================================================

@app.get("/")
def home():

    return FileResponse(
        "templates/index.html"
    )


# =========================================================
# API
# TABLE LIST
#
# Returns:
# - all visible tables
# - table count
# - tables grouped by module
#
# Example:
# GET /api/tables
# =========================================================

@app.get("/api/tables")
def api_tables():

    try:

        tables = get_table_names()

        categories = categorize_tables()

        return {
            "tables": tables,
            "count": len(tables),
            "categories": categories,
        }

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


# =========================================================
# API
# RAW TABLE
#
# Used when the user clicks a normal database table.
#
# Example:
#
# GET /api/table/AR_CUSTOMER
#
# Returns:
# - table name
# - column names
# - rows
# =========================================================

@app.get("/api/table/{table_name:path}")
def api_table(
    table_name: str,

    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
):

    try:

        columns, rows = get_table_preview(
            table_name,
            limit=limit,
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


    return {
        "table": table_name,

        "columns": columns,

        "rows": [
            [
                json_value(value)
                for value in row
            ]
            for row in rows
        ],

        "count": len(rows),
    }


# =========================================================
# API
# CHECK WHETHER A TABLE IS A DOCUMENT
#
# The JavaScript uses this before opening a table.
#
# Example:
#
# GET /api/document/AR_IV/status
#
# Response:
#
# {
#     "table": "AR_IV",
#     "is_document": true
# }
# =========================================================

@app.get(
    "/api/document/{table_name:path}/status"
)
def api_document_status(
    table_name: str,
):

    try:

        return {
            "table": table_name,

            "is_document":
                is_document_table(
                    table_name
                ),
        }

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


# =========================================================
# API
# DOCUMENT LISTING
#
# Used for:
#
# Customer Invoice
# Sales Invoice
# Customer Payment
# Journal Entry
# Payment Voucher
# etc.
#
# Example:
#
# GET /api/documents/AR_IV
#
# The frontend will display a list such as:
#
# DOCNO       DATE          CUSTOMER       AMOUNT
# ------------------------------------------------
# INV00001    2026-09-01    ABC SDN BHD    500.00
# INV00002    2026-09-02    XYZ SDN BHD    800.00
#
# The document number can then be clicked.
# =========================================================

@app.get(
    "/api/documents/{table_name:path}"
)
def api_documents(
    table_name: str,

    limit: int = Query(
        default=500,
        ge=1,
        le=1000,
    ),
):

    try:

        result, error = get_document_listing(
            table_name,
            limit=limit,
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


    if error:

        raise HTTPException(
            status_code=400,
            detail=error,
        )


    return {
    **result,
    "rows": [
        [json_value(value) for value in row]
        for row in result["rows"]
    ],
}


# =========================================================
# API
# SINGLE DOCUMENT
#
# Used when the user clicks a document number.
#
# Example:
#
# GET /api/document/AR_IV?docno=INV00001
#
# IMPORTANT:
#
# We intentionally DO NOT return the Document Header.
#
# The frontend will only receive:
#
# - document table
# - document number
# - detail table
# - detail columns
# - detail rows
#
# This means the old "Document Header" section
# will not appear on the frontend.
# =========================================================

@app.get(
    "/api/document/{table_name:path}"
)
def api_document(
    table_name: str,
    docno: str,
):

    try:

        result, error = get_document_detail(
            table_name,
            docno,
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )


    if error:

        raise HTTPException(
            status_code=404,
            detail=error,
        )


    # -----------------------------------------------------
    # ONLY RETURN DOCUMENT DETAIL
    #
    # Do NOT return:
    #
    # result["header"]
    # result["document_header"]
    #
    # because we don't want the Document Header
    # displayed anymore.
    # -----------------------------------------------------

    return {
        "table": table_name,

        "docno": docno,

        "detail_table":
            result.get(
                "detail_table"
            ),

        "detail_columns":
            result.get(
                "detail_columns",
                []
            ),

        "detail_rows": [
            [
                json_value(value)
                for value in row
            ]
            for row in result.get(
                "detail_rows",
                []
            )
        ],
    }


# =========================================================
# HEALTH CHECK
#
# Useful later when connecting the dashboard
# to another frontend or monitoring service.
#
# Example:
#
# GET /api/health
#
# Response:
#
# {
#     "status": "ok"
# }
# =========================================================

@app.get("/api/health")
def api_health():

    return {
        "status": "ok"
    }


@app.get("/api/reports/profit-loss")
def api_profit_loss(
    from_date: date = Query(...),
    to_date: date = Query(...),
    columns: str = Query("current,ytd"),
    date_field: str = Query("POSTDATE", pattern="^(POSTDATE|DOCDATE)$"),
    currency: str = Query("local", pattern="^(local|original)$"),
    document_types: str = Query(""),
    project: str = Query(""),
    agent: str = Query(""),
    area: str = Query(""),
):
    """Return a configurable, read-only SQL Accounting-style P&L report."""
    try:
        return get_profit_loss(
            from_date,
            to_date,
            columns=[item.strip() for item in columns.split(",")],
            date_field=date_field,
            currency=currency,
            document_types=[item.strip() for item in document_types.split(",")],
            project=project,
            agent=agent,
            area=area,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

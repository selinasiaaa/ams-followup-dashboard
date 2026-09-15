// =========================================================
// app.js
// SQL Accounting BI Dashboard
//
// RESPONSIBILITY:
// - Frontend interaction
// - Page navigation
// - API requests
// - Table rendering
// - Document rendering
// - Column show/hide
//
// HTML:
//     templates/index.html
//
// CSS:
//     static/css/style.css
//
// BACKEND:
//     main.py
// =========================================================


// =========================================================
// 1. GLOBAL VARIABLES
// =========================================================

// Main HTML container.
const app = document.getElementById("app");


// =========================================================
// 2. APPLICATION START
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {
        const startApplication = function () {
            setupNavigation();
            showDashboard();
        };

        // The dashboard starts only after the local access gateway has chosen
        // an FDB database.  This avoids loading reports against the old DB.
        if (document.body.classList.contains("gateway-active")) {
            document.addEventListener("database-ready", startApplication, { once: true });
        } else {
            startApplication();
        }

    }
);


// =========================================================
// 3. NAVIGATION
// =========================================================

function setupNavigation() {

    const navLinks =
        document.querySelectorAll(
            ".nav-link"
        );


    navLinks.forEach(
        function (link) {

            link.addEventListener(
                "click",
                function () {

                    const page =
                        this.dataset.page;


                    if (
                        page === "dashboard"
                    ) {

                        showDashboard();

                    }


                    if (
                        page === "tables"
                    ) {

                        showTables();

                    }

                    if (
                        page === "profit-loss"
                    ) {

                        showProfitLoss();

                    }

                    if (page === "sales-analysis") {
                        showSalesAnalysis();
                    }

                    if (page === "customer-statement") {
                        showCustomerStatement();
                    }

                }
            );

        }
    );

}


// =========================================================
// 4. API HELPER
//
// All communication with Python backend
// goes through this function.
// =========================================================

async function api(url) {

    const response =
        await fetch(url);


    if (!response.ok) {

        let message =
            "Request failed.";


        try {

            const error =
                await response.json();

            message =
                error.detail ||
                message;

        } catch (error) {
            // Ignore JSON parsing error.
        }


        throw new Error(
            message
        );

    }


    return response.json();

}


// =========================================================
// 5. DASHBOARD
// =========================================================

async function showDashboard() {

    app.innerHTML = `
        <div class="loading">
            Loading dashboard...
        </div>
    `;


    try {

        const data =
            await api(
                "/api/tables"
            );


        renderDashboard(data);


    } catch (error) {

        showError(
            error.message
        );

    }

}


// =========================================================
// 6. RENDER DASHBOARD
// =========================================================

function renderDashboard(data) {

    const categories =
        data.categories || {};


    app.innerHTML = `

        <!-- =============================================
             PAGE TITLE
             ============================================= -->

        <h1 class="page-title">
            SQL Accounting Dashboard
        </h1>


        <div class="page-subtitle">
            Local Firebird database overview
        </div>


        <!-- =============================================
             SUMMARY CARDS
             ============================================= -->

        <div class="cards">


            <div class="card">

                <div class="card-title">
                    Visible Tables
                </div>

                <div class="card-value">
                    ${data.count}
                </div>

            </div>


            <div class="card">

                <div class="card-title">
                    Modules
                </div>

                <div class="card-value">
                    ${Object.keys(categories).length}
                </div>

            </div>


            <div class="card">

                <div class="card-title">
                    Database
                </div>

                <div class="card-value">
                    ACC-0007
                </div>

            </div>


            <div class="card">

                <div class="card-title">
                    Connection
                </div>

                <div class="card-value">
                    Connected
                </div>

            </div>


        </div>


        <!-- =============================================
             MODULE LIST
             ============================================= -->

        <div class="panel">

            <div class="panel-title">
                Modules
            </div>


            <table>

                <thead>

                    <tr>

                        <th>
                            Module
                        </th>

                        <th>
                            Tables
                        </th>

                        <th>
                        </th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        Object.entries(
                            categories
                        )
                        .map(
                            function (
                                [category, tables]
                            ) {

                                return `

                                    <tr>

                                        <td>

                                            <strong>
                                                ${escapeHtml(
                                                    category
                                                )}
                                            </strong>

                                        </td>


                                        <td>
                                            ${tables.length}
                                        </td>


                                        <td>

                                            <button
                                                type="button"
                                                class="button"
                                                onclick="showCategory(
                                                    '${escapeJs(category)}'
                                                )"
                                            >

                                                View →

                                            </button>

                                        </td>

                                    </tr>

                                `;

                            }
                        )
                        .join("")
                    }

                </tbody>

            </table>

        </div>

    `;

}


// =========================================================
// 7. DATABASE TABLES
// =========================================================

async function showTables(
    category = null
) {

    app.innerHTML = `
        <div class="loading">
            Loading tables...
        </div>
    `;


    try {

        const data =
            await api(
                "/api/tables"
            );


        renderTables(
            data.categories,
            category
        );


    } catch (error) {

        showError(
            error.message
        );

    }

}


// =========================================================
// 8. SHOW ONE CATEGORY
// =========================================================

function showCategory(
    category
) {

    showTables(
        category
    );

}


// =========================================================
// 9. RENDER DATABASE TABLES
// =========================================================

function renderTables(
    categories,
    selectedCategory = null
) {

    let entries =
        Object.entries(
            categories || {}
        );


    // -----------------------------------------------------
    // If a category was selected,
    // only show that category.
    // -----------------------------------------------------

    if (selectedCategory) {

        entries =
            entries.filter(
                function (
                    [category]
                ) {

                    return (
                        category.toLowerCase()
                        ===
                        selectedCategory.toLowerCase()
                    );

                }
            );

    }


    let html = `

        <!-- =============================================
             BREADCRUMB
             ============================================= -->

        <div class="breadcrumb">

            <span
                class="breadcrumb-link"
                onclick="showDashboard()"
            >
                Dashboard
            </span>

            /

            Database Tables

        </div>


        <!-- =============================================
             PAGE TITLE
             ============================================= -->

        <h1 class="page-title">
            Database Tables
        </h1>


        <div class="page-subtitle">

            T_* internal/generated
            tables are hidden.

        </div>

    `;


    // -----------------------------------------------------
    // Render each module.
    // -----------------------------------------------------

    entries.forEach(
        function (
            [category, tables]
        ) {

            html += `

                <div class="panel">

                    <div class="panel-title">
                        ${escapeHtml(category)}
                    </div>


                    <div class="table-list">

            `;


            // -------------------------------------------------
            // Render tables inside this module.
            // -------------------------------------------------

            tables.forEach(
                function (item) {

                    const table =
                        item.table;

                    const title =
                        item.title;


                    html += `

                        <div
                            class="table-card"
                            onclick="openTable(
                                '${escapeJs(table)}'
                            )"
                        >

                            <div
                                class="table-card-title"
                            >

                                ${escapeHtml(
                                    title
                                )}

                            </div>


                            <div
                                class="table-card-name"
                            >

                                ${escapeHtml(
                                    table
                                )}

                            </div>

                        </div>

                    `;

                }
            );


            html += `

                    </div>

                </div>

            `;

        }
    );


    app.innerHTML =
        html;

}


// =========================================================
// 10. OPEN TABLE
//
// First check whether the table is a document table.
//
// Document table:
//     Open document listing.
//
// Normal table:
//     Open raw table.
// =========================================================

async function openTable(
    tableName
) {

    try {

        const status =
            await api(
                "/api/document/"
                +
                encodeURIComponent(
                    tableName
                )
                +
                "/status"
            );


        if (
            status.is_document
        ) {

            openDocumentListing(
                tableName
            );

        } else {

            openRawTable(
                tableName
            );

        }

    } catch (error) {

        showError(
            error.message
        );

    }

}


// =========================================================
// 11. OPEN RAW TABLE
// =========================================================

async function openRawTable(
    tableName
) {

    app.innerHTML = `
        <div class="loading">
            Loading table...
        </div>
    `;


    try {

        const data =
            await api(
                "/api/table/"
                +
                encodeURIComponent(
                    tableName
                )
            );


        renderRawTable(
            data
        );


    } catch (error) {

        showError(
            error.message
        );

    }

}


// =========================================================
// 12. RENDER RAW TABLE
// =========================================================

function renderRawTable(
    data
) {

    const storageKey =
        "raw-" + data.table;


    app.innerHTML = `

        <!-- =============================================
             BREADCRUMB
             ============================================= -->

        <div class="breadcrumb">

            <span
                class="breadcrumb-link"
                onclick="showTables()"
            >
                Tables
            </span>

            /

            ${escapeHtml(
                data.table
            )}

        </div>


        <!-- =============================================
             TITLE
             ============================================= -->

        <h1 class="page-title">

            ${escapeHtml(
                data.table
            )}

        </h1>


        <div class="page-subtitle">
            Showing ${data.rows.length} record${data.rows.length === 1 ? "" : "s"}
        </div>


        <!-- =============================================
             COLUMN SELECTOR
             ============================================= -->

        ${renderColumnSelector(
            data.columns,
            storageKey
        )}


        <!-- =============================================
             DATA TABLE
             ============================================= -->

        ${renderDataTable(
            data.columns,
            data.rows
        )}

    `;


    applyColumnSettings(
        storageKey
    );

}


// =========================================================
// 13. DOCUMENT LISTING
// =========================================================

async function openDocumentListing(
    tableName
) {

    app.innerHTML = `
        <div class="loading">
            Loading documents...
        </div>
    `;


    try {

        const data =
            await api(
                "/api/documents/"
                +
                encodeURIComponent(
                    tableName
                )
            );


        renderDocumentListing(
            data
        );


    } catch (error) {

        showError(
            error.message
        );

    }

}


// =========================================================
// 14. RENDER DOCUMENT LISTING
// =========================================================

function renderDocumentListing(
    data
) {

    const columns =
        data.columns || [];


    const docIndex =
        columns.indexOf(
            data.docno_column
        );


    let rowsHtml = "";


    // -----------------------------------------------------
    // Render every document.
    // -----------------------------------------------------

    data.rows.forEach(
        function (row) {

            rowsHtml += "<tr>";


            row.forEach(
                function (
                    value,
                    index
                ) {

                    // -----------------------------------------
                    // Document number becomes clickable.
                    // -----------------------------------------

                    if (
                        index === docIndex
                    ) {

                        const docno =
                            value ?? "";


                        rowsHtml += `

                            <td
                                data-col-index="${index}"
                            >

                                <a
                                    class="doc-link"
                                    onclick="openDocument(
                                        '${escapeJs(
                                            data.table
                                        )}',
                                        '${escapeJs(
                                            docno
                                        )}'
                                    )"
                                >

                                    ${escapeHtml(
                                        docno
                                    )}

                                </a>

                            </td>

                        `;

                    } else {

                        rowsHtml += `

                            <td
                                data-col-index="${index}"
                            >

                                ${escapeHtml(
                                    value
                                )}

                            </td>

                        `;

                    }

                }
            );


            rowsHtml += "</tr>";

        }
    );


    const storageKey =
        "documents-" + data.table;


    app.innerHTML = `

        <!-- =============================================
             BREADCRUMB
             ============================================= -->

        <div class="breadcrumb">

            <span
                class="breadcrumb-link"
                onclick="showTables()"
            >
                Tables
            </span>

            /

            ${escapeHtml(
                data.table
            )}

        </div>


        <!-- =============================================
             DOCUMENT TITLE
             ============================================= -->

        <h1 class="page-title">

            ${escapeHtml(
                getFriendlyDocumentName(
                    data.table
                )
            )}

        </h1>


        <div class="page-subtitle">

            ${escapeHtml(
                data.table
            )}

        </div>


        <div class="info">

            Click the document number
            to open the document detail.

        </div>


        <!-- =============================================
             COLUMN SELECTOR
             ============================================= -->

        ${renderColumnSelector(
            columns,
            storageKey
        )}


        <!-- =============================================
             DOCUMENT TABLE
             ============================================= -->

        <div class="panel">

            <div class="panel-title">
                Documents
            </div>


            <div class="data-wrapper">

                <table
                    class="data-table"
                    data-column-table
                >

                    <thead>

                        <tr>

                            <th class="row-number">No.</th>

                            ${
                                columns
                                .map(
                                    function (
                                        column,
                                        index
                                    ) {

                                        return `

                                            <th
                                                data-col-index="${index}"
                                            >

                                                ${escapeHtml(
                                                    column
                                                )}

                                            </th>

                                        `;

                                    }
                                )
                                .join("")
                            }

                        </tr>

                    </thead>


                    <tbody>

                        ${
                            rowsHtml
                            ||
                            `

                                <tr>

                                    <td
                                        colspan="${columns.length}"
                                        style="text-align:center"
                                    >

                                        No documents found.

                                    </td>

                                </tr>

                            `
                        }

                    </tbody>

                </table>

            </div>

        </div>

    `;


    applyColumnSettings(
        storageKey
    );

}


// =========================================================
// 15. OPEN DOCUMENT
// =========================================================

async function openDocument(
    tableName,
    docno
) {

    app.innerHTML = `
        <div class="loading">
            Loading document...
        </div>
    `;


    try {

        const data =
            await api(
                "/api/document/"
                +
                encodeURIComponent(
                    tableName
                )
                +
                "?docno="
                +
                encodeURIComponent(
                    docno
                )
            );


        renderDocument(
            data
        );


    } catch (error) {

        showError(
            error.message
        );

    }

}


// =========================================================
// 16. RENDER DOCUMENT DETAIL
//
// IMPORTANT:
//
// There is NO Document Header here.
//
// We only show:
//
// - Document type
// - Document number
// - Back button
// - Document Detail
//
// The actual header fields are NOT displayed.
// =========================================================

function renderDocument(
    data
) {

    const storageKey =
        "detail-"
        +
        data.table
        +
        "-"
        +
        data.docno;


    let detailHtml = "";


    if (
        data.detail_table
    ) {

        detailHtml = `

            <!-- =========================================
                 DETAIL INFORMATION
                 ========================================= -->

            <div class="panel">

                <div class="panel-title">
                    Document Detail
                </div>


                <div class="info">

                    Detail table:

                    <strong>
                        ${escapeHtml(
                            data.detail_table
                        )}
                    </strong>

                    &nbsp;·&nbsp;

                    ${data.detail_rows.length}

                    row(s)

                </div>

            </div>


            <!-- =========================================
                 COLUMN SELECTOR
                 ========================================= -->

            ${renderColumnSelector(
                data.detail_columns,
                storageKey
            )}


            <!-- =========================================
                 DETAIL DATA
                 ========================================= -->

            ${renderDataTable(
                data.detail_columns,
                data.detail_rows
            )}

        `;

    } else {

        detailHtml = `

            <div class="panel">

                <div class="panel-title">
                    Document Detail
                </div>


                <div class="info">

                    No detail records found.

                </div>

            </div>

        `;

    }


    // -----------------------------------------------------
    // IMPORTANT:
    //
    // There is intentionally NO:
    //
    // Document Header
    // Header fields
    // Customer name
    // Date
    // Amount
    //
    // here.
    // -----------------------------------------------------

    app.innerHTML = `

        <!-- =============================================
             BREADCRUMB
             ============================================= -->

        <div class="breadcrumb">

            <span
                class="breadcrumb-link"
                onclick="showTables()"
            >

                Tables

            </span>

            /

            <span
                class="breadcrumb-link"
                onclick="openDocumentListing(
                    '${escapeJs(
                        data.table
                    )}'
                )"
            >

                ${escapeHtml(
                    getFriendlyDocumentName(
                        data.table
                    )
                )}

            </span>

            /

            ${escapeHtml(
                data.docno
            )}

        </div>


        <!-- =============================================
             DOCUMENT TITLE
             ============================================= -->

        <h1
            class="page-title document-title"
        >

            ${escapeHtml(
                getFriendlyDocumentName(
                    data.table
                )
            )}

        </h1>


        <!-- =============================================
             DOCUMENT NUMBER
             ============================================= -->

        <div class="document-number">

            Document No.:

            <strong>
                ${escapeHtml(
                    data.docno
                )}
            </strong>

        </div>


        <!-- =============================================
             BACK BUTTON
             ============================================= -->

        <div
            style="margin-bottom:20px"
        >

            <button
                type="button"
                class="button secondary"
                onclick="openDocumentListing(
                    '${escapeJs(
                        data.table
                    )}'
                )"
            >

                ← Back to Listing

            </button>

        </div>


        <!-- =============================================
             DOCUMENT DETAIL
             ============================================= -->

        ${detailHtml}

    `;


    applyColumnSettings(
        storageKey
    );

}


// =========================================================
// 17. COLUMN SELECTOR
// =========================================================

function renderColumnSelector(
    columns,
    storageKey
) {

    return `

        <div class="panel">

            <div class="panel-title">
                Columns
            </div>


            <!-- =========================================
                 SHOW / HIDE ALL
                 ========================================= -->

            <div class="toolbar-actions">

                <button
                    type="button"
                    class="column-chip active"
                    onclick="showAllColumns(
                        '${escapeJs(
                            storageKey
                        )}'
                    )"
                >

                    Show All

                </button>


                <button
                    type="button"
                    class="column-chip active"
                    onclick="hideAllColumns(
                        '${escapeJs(
                            storageKey
                        )}'
                    )"
                >

                    Hide All

                </button>

            </div>


            <!-- =========================================
                 INDIVIDUAL COLUMNS
                 ========================================= -->

            <div class="column-toolbar">

                ${
                    columns
                    .map(
                        function (
                            column,
                            index
                        ) {

                            return `

                                <button
                                    type="button"
                                    class="column-chip active"
                                    data-column-selector
                                    data-column-index="${index}"
                                    data-storage-key="${escapeHtml(
                                        storageKey
                                    )}"
                                    onclick="toggleColumn(
                                        '${escapeJs(
                                            storageKey
                                        )}',
                                        ${index}
                                    )"
                                >

                                    ${escapeHtml(
                                        column
                                    )}

                                </button>

                            `;

                        }
                    )
                    .join("")
                }

            </div>

        </div>

    `;

}


// =========================================================
// 18. DATA TABLE
// =========================================================

function renderDataTable(
    columns,
    rows
) {

    return `

        <div class="panel">

            <div class="panel-title">
                Data
            </div>


            <div class="data-wrapper">

                <table
                    class="data-table"
                    data-column-table
                >

                    <!-- =================================
                         TABLE HEADER
                         ================================= -->

                    <thead>

                        <tr>

                            <th class="row-number">No.</th>

                            ${
                                columns
                                .map(
                                    function (
                                        column,
                                        index
                                    ) {

                                        return `

                                            <th
                                                data-col-index="${index}"
                                            >

                                                ${escapeHtml(
                                                    column
                                                )}

                                            </th>

                                        `;

                                    }
                                )
                                .join("")
                            }

                        </tr>

                    </thead>


                    <!-- =================================
                         TABLE BODY
                         ================================= -->

                    <tbody>

                        ${
                            rows.length > 0

                            ?

                            rows
                            .map(
                                function (
                                    row,
                                    rowIndex
                                ) {

                                    return `

                                        <tr>

                                            <td class="row-number">${rowIndex + 1}</td>

                                            ${
                                                row
                                                .map(
                                                    function (
                                                        value,
                                                        index
                                                    ) {

                                                        return `

                                                            <td
                                                                data-col-index="${index}"
                                                            >

                                                                ${escapeHtml(
                                                                    value
                                                                )}

                                                            </td>

                                                        `;

                                                    }
                                                )
                                                .join("")
                                            }

                                        </tr>

                                    `;

                                }
                            )
                            .join("")

                            :

                            `

                                <tr>

                                    <td
                                        colspan="${columns.length + 1}"
                                        style="text-align:center"
                                    >

                                        No records found.

                                    </td>

                                </tr>

                            `
                        }

                    </tbody>

                </table>

            </div>

        </div>

    `;

}


// =========================================================
// 19. TOGGLE ONE COLUMN
// =========================================================

function toggleColumn(
    storageKey,
    index
) {

    const state =
        getColumnState(
            storageKey
        );


    // Default is visible.
    // Clicking changes it to hidden.
    state[index] =
        state[index] === false
            ? true
            : false;


    saveColumnState(
        storageKey,
        state
    );


    applyColumnSettings(
        storageKey
    );

}


// =========================================================
// 20. SHOW ALL COLUMNS
// =========================================================

function showAllColumns(
    storageKey
) {

    const chips =
        document.querySelectorAll(
            `[data-storage-key="${cssEscape(
                storageKey
            )}"]`
        );


    const state = {};


    chips.forEach(
        function (chip) {

            state[
                chip.dataset.columnIndex
            ] = true;

        }
    );


    saveColumnState(
        storageKey,
        state
    );


    applyColumnSettings(
        storageKey
    );

}


// =========================================================
// 21. HIDE ALL COLUMNS
// =========================================================

function hideAllColumns(
    storageKey
) {

    const chips =
        document.querySelectorAll(
            `[data-storage-key="${cssEscape(
                storageKey
            )}"]`
        );


    const state = {};


    chips.forEach(
        function (chip) {

            state[
                chip.dataset.columnIndex
            ] = false;

        }
    );


    saveColumnState(
        storageKey,
        state
    );


    applyColumnSettings(
        storageKey
    );

}


// =========================================================
// 22. GET COLUMN SETTINGS
//
// Uses browser localStorage.
//
// This means:
// If you hide columns from AR_CUSTOMER,
// the browser remembers the setting.
// =========================================================

function getColumnState(
    storageKey
) {

    try {

        return JSON.parse(
            localStorage.getItem(
                "sqlbi-columns-"
                +
                storageKey
            )
            ||
            "{}"
        );

    } catch (error) {

        return {};

    }

}


// =========================================================
// 23. SAVE COLUMN SETTINGS
// =========================================================

function saveColumnState(
    storageKey,
    state
) {

    localStorage.setItem(
        "sqlbi-columns-"
        +
        storageKey,

        JSON.stringify(
            state
        )
    );

}


// =========================================================
// 24. APPLY COLUMN SETTINGS
//
// Controls both:
// - Column buttons
// - Table columns
// =========================================================

function applyColumnSettings(
    storageKey
) {

    const state =
        getColumnState(
            storageKey
        );


    const chips =
        document.querySelectorAll(
            `[data-storage-key="${cssEscape(
                storageKey
            )}"]`
        );


    const table =
        document.querySelector(
            "[data-column-table]"
        );


    if (!table) {

        return;

    }


    chips.forEach(
        function (chip) {

            const index =
                chip.dataset.columnIndex;


            const visible =
                state[index] !== false;


            // ---------------------------------------------
            // Update column button.
            // ---------------------------------------------

            chip.classList.toggle(
                "active",
                visible
            );


            // ---------------------------------------------
            // Update table column.
            // ---------------------------------------------

            table
                .querySelectorAll(
                    `[data-col-index="${index}"]`
                )
                .forEach(
                    function (cell) {

                        cell.style.display =
                            visible
                            ? ""
                            : "none";

                    }
                );

        }
    );

}


// =========================================================
// 25. FRIENDLY DOCUMENT NAMES
//
// Database table names are converted into
// user-friendly names for the interface.
// =========================================================

function getFriendlyDocumentName(
    tableName
) {

    const names = {

        // -----------------------------------------------
        // CUSTOMER
        // -----------------------------------------------

        "AR_IV":
            "Customer Invoice",

        "AR_DN":
            "Customer Debit Note",

        "AR_CN":
            "Customer Credit Note",

        "AR_PM":
            "Customer Payment",

        "AR_CF":
            "Customer Refund",

        "AR_CT":
            "Customer Contra",

        "AR_DP":
            "Customer Deposit",


        // -----------------------------------------------
        // SUPPLIER
        // -----------------------------------------------

        "AP_PI":
            "Supplier Invoice",

        "AP_SD":
            "Supplier Debit Note",

        "AP_SC":
            "Supplier Credit Note",

        "AP_SP":
            "Supplier Payment",

        "AP_SF":
            "Supplier Refund",

        "AP_ST":
            "Supplier Contra",


        // -----------------------------------------------
        // SALES
        // -----------------------------------------------

        "SL_QT":
            "Sales Quotation",

        "SL_SO":
            "Sales Order",

        "SL_DO":
            "Delivery Order",

        "SL_IV":
            "Sales Invoice",

        "SL_CS":
            "Cash Sales",

        "SL_CN":
            "Sales Credit Note",

        "SL_DN":
            "Sales Debit Note",


        // -----------------------------------------------
        // PURCHASE
        // -----------------------------------------------

        "PH_PQ":
            "Purchase Request",

        "PH_PR":
            "Purchase Request",

        "PH_PO":
            "Purchase Order",

        "PH_GR":
            "Goods Received",

        "PH_PI":
            "Purchase Invoice",

        "PH_CP":
            "Cash Purchase",

        "PH_SD":
            "Purchase Debit Note",

        "PH_SC":
            "Purchase Return",


        // -----------------------------------------------
        // GENERAL LEDGER
        // -----------------------------------------------

        "GL_JE":
            "Journal Entry",

        "GL_JV":
            "Journal Entry",

        "GL_PV":
            "Payment Voucher",

        "GL_OR":
            "Official Receipt",

        "GL_CB":
            "Cash Book Entry",

    };


    return (
        names[tableName]
        ||
        tableName
    );

}


// =========================================================
// 26. ERROR MESSAGE
// =========================================================

function showError(
    message
) {

    app.innerHTML = `

        <div class="error">

            <strong>
                Error
            </strong>


            <br><br>


            ${escapeHtml(
                message
            )}

        </div>

    `;

}


// =========================================================
// 27. HTML ESCAPE
//
// Prevent database values from being interpreted
// as HTML.
// =========================================================

function escapeHtml(
    value
) {

    if (
        value === null
        ||
        value === undefined
    ) {

        return "";

    }


    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


// =========================================================
// 28. JAVASCRIPT STRING ESCAPE
// =========================================================

function escapeJs(
    value
) {

    return String(value)

        .replace(
            /\\/g,
            "\\\\"
        )

        .replace(
            /'/g,
            "\\'"
        )

        .replace(
            /\r/g,
            "\\r"
        )

        .replace(
            /\n/g,
            "\\n"
        );

}


// =========================================================
// 29. PROFIT & LOSS REPORT
// =========================================================

function showProfitLoss() {
    const today = new Date().toISOString().slice(0, 10);
    app.innerHTML = `
        <div class="breadcrumb">Reports / Profit &amp; Loss</div>
        <h1 class="page-title">Profit &amp; Loss</h1>
        <div class="page-subtitle">Statement of Comprehensive Income from posted GL transactions</div>
        <div class="panel report-filters">
            <div class="panel-title">Report criteria</div>
            <div class="filter-grid">
                <label>From date<input id="pnl-from" type="date" value="${today}"></label>
                <label>To date<input id="pnl-to" type="date" value="${today}"></label>
                <label>Report format<select id="pnl-format" onchange="applyPnlFormat(this.value)"><option value="custom">Custom columns</option><option value="this-month-year">This Month vs This Year</option><option value="this-month-last-month">This Month vs Last Month</option><option value="this-month-last-year">This Month vs Last Year</option></select></label>
                <label>Date basis<select id="pnl-date-field"><option value="POSTDATE">Posting date</option><option value="DOCDATE">Document date</option></select></label>
                <label>Currency<select id="pnl-currency"><option value="local">Local currency (RM)</option><option value="original">Original document currency</option></select></label>
                <label class="filter-wide">Document types (optional)<input id="pnl-document-types" type="text" placeholder="For example: IV,CN,DN,PI"></label>
                <label>Project (optional)<input id="pnl-project" type="text" placeholder="Exact project code"></label>
                <label>Agent (optional)<input id="pnl-agent" type="text" placeholder="Exact agent name"></label>
                <label>Area (optional)<input id="pnl-area" type="text" placeholder="Exact area name"></label>
            </div>
            <div class="filter-label">Columns to show</div>
            <div class="checkbox-row">
                <label><input class="pnl-column" type="checkbox" value="current" checked> Current period</label>
                <label><input class="pnl-column" type="checkbox" value="mtd"> Month to date</label>
                <label><input class="pnl-column" type="checkbox" value="ytd" checked> Year to date</label>
                <label><input class="pnl-column" type="checkbox" value="previous_period"> Previous period</label>
                <label><input class="pnl-column" type="checkbox" value="last_month"> Last month</label>
                <label><input class="pnl-column" type="checkbox" value="last_year"> Last year</label>
                <label><input id="pnl-percent" type="checkbox"> Show % of net sales</label>
                <label><input id="pnl-zero" type="checkbox"> Show zero-balance accounts</label>
                <label><input id="pnl-code" type="checkbox" checked> Show account codes</label>
                <label><input id="pnl-description2" type="checkbox"> Use second description</label>
            </div>
            <div class="report-actions"><button class="button" type="button" onclick="refreshProfitLoss()">Refresh report</button></div>
        </div>
        <div id="pnl-result" class="loading">Choose criteria and refresh the report.</div>
    `;
    refreshProfitLoss();
}

function applyPnlFormat(format) {
    const selected = {"custom": ["current", "ytd"], "this-month-year": ["mtd", "ytd"], "this-month-last-month": ["mtd", "last_month"], "this-month-last-year": ["mtd", "last_year"]}[format] || ["current"];
    document.querySelectorAll(".pnl-column").forEach(function (input) { input.checked = selected.includes(input.value); });
}

async function refreshProfitLoss() {
    const result = document.getElementById("pnl-result");
    const columns = Array.from(document.querySelectorAll(".pnl-column:checked")).map(function (input) { return input.value; });
    if (!columns.length) { showError("Select at least one report column."); return; }
    result.innerHTML = '<div class="loading">Building Profit &amp; Loss report...</div>';
    try {
        const parameters = new URLSearchParams({
            from_date: document.getElementById("pnl-from").value,
            to_date: document.getElementById("pnl-to").value,
            columns: columns.join(","),
            date_field: document.getElementById("pnl-date-field").value,
            currency: document.getElementById("pnl-currency").value,
            document_types: document.getElementById("pnl-document-types").value,
            project: document.getElementById("pnl-project").value,
            agent: document.getElementById("pnl-agent").value,
            area: document.getElementById("pnl-area").value,
        });
        const report = await api("/api/reports/profit-loss?" + parameters.toString());
        renderProfitLoss(report, {showPercent: document.getElementById("pnl-percent").checked, showZero: document.getElementById("pnl-zero").checked, showCode: document.getElementById("pnl-code").checked, useDescription2: document.getElementById("pnl-description2").checked});
    } catch (error) {
        result.innerHTML = '<div class="error"><strong>Error</strong><br><br>' + escapeHtml(error.message) + '</div>';
    }
}

function pnlMoney(value) {
    const amount = Number(value || 0);
    const formatted = Math.abs(amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return amount < 0 ? "(" + formatted + ")" : formatted;
}

function pnlPercent(value, netSales) {
    if (!netSales) return "-";
    return ((Number(value || 0) / Number(netSales)) * 100).toFixed(1) + "%";
}

function renderProfitLoss(report, options) {
    const showPercent = options.showPercent;
    const result = document.getElementById("pnl-result");
    const headers = report.columns.map(function (column) {
        return `<th>${escapeHtml(column.label)}<small>${escapeHtml(column.from_date)} to ${escapeHtml(column.to_date)}</small></th>${showPercent ? '<th class="percent-column">%</th>' : ''}`;
    }).join("");
    function values(row) {
        return report.columns.map(function (column) {
            const amount = row.values ? row.values[column.key] : row[column.key];
            const netSales = report.summaries[column.key].net_sales;
            return `<td class="amount">${pnlMoney(amount)}</td>${showPercent ? `<td class="percent-column">${pnlPercent(amount, netSales)}</td>` : ''}`;
        }).join("");
    }
    let body = "";
    report.sections.forEach(function (section) {
        body += `<tr class="pnl-section"><td colspan="${1 + report.columns.length * (showPercent ? 2 : 1)}">${escapeHtml(section.label)}</td></tr>`;
        section.accounts.filter(function (account) { return options.showZero || Object.values(account.values).some(function (value) { return Number(value) !== 0; }); }).forEach(function (account) {
            const description = options.useDescription2 && account.description2 ? account.description2 : account.description;
            body += `<tr><td class="account-name">${options.showCode ? `<span>${escapeHtml(account.code)}</span>` : ""} ${escapeHtml(description)}</td>${values(account)}</tr>`;
        });
        body += `<tr class="pnl-total"><td>Total ${escapeHtml(section.label)}</td>${values({values: section.totals})}</tr>`;
        if (section.code === "SA") body += `<tr class="pnl-subtotal"><td>NET SALES</td>${values({values: Object.fromEntries(report.columns.map(function (column) { return [column.key, report.summaries[column.key].net_sales]; }))})}</tr>`;
        if (section.code === "CO") body += `<tr class="pnl-subtotal"><td>GROSS PROFIT/(LOSS)</td>${values({values: Object.fromEntries(report.columns.map(function (column) { return [column.key, report.summaries[column.key].gross_profit]; }))})}</tr>`;
    });
    const beforeTax = Object.fromEntries(report.columns.map(function (column) { return [column.key, report.summaries[column.key].net_profit_before_tax]; }));
    const afterTax = Object.fromEntries(report.columns.map(function (column) { return [column.key, report.summaries[column.key].net_profit_after_tax]; }));
    body += `<tr class="pnl-subtotal"><td>NET PROFIT/(LOSS)</td>${values({values: beforeTax})}</tr>`;
    body += `<tr class="pnl-final"><td>NET PROFIT/(LOSS) AFTER TAX</td>${values({values: afterTax})}</tr>`;
    const focusColumn = report.columns[0].key;
    const groupAmount = function (code) { const section = report.sections.find(function (item) { return item.code === code; }); return section ? section.totals[focusColumn] : 0; };
    const kpis = [["Revenue", groupAmount("SL") + groupAmount("SA")], ["COGS", groupAmount("CO")], ["Gross Profit", report.summaries[focusColumn].gross_profit], ["Other Income", groupAmount("OI") + groupAmount("EO")], ["Expenses", groupAmount("EP")], ["Net Profit Before Tax", report.summaries[focusColumn].net_profit_before_tax]];
    result.innerHTML = `
        <div class="pnl-kpis">${kpis.map(function (item) { return `<div class="pnl-kpi"><div>${escapeHtml(item[0])}</div><strong>${pnlMoney(item[1])}</strong><small>RM - ${escapeHtml(report.columns[0].from_date)} to ${escapeHtml(report.columns[0].to_date)}</small></div>`; }).join("")}</div>
        <div class="panel pnl-chart-panel"><div class="panel-title">GL Profit / Loss</div><div class="page-subtitle">${escapeHtml(report.columns[0].from_date)} to ${escapeHtml(report.columns[0].to_date)}</div><div id="pnl-chart" class="pnl-chart" aria-label="Profit and loss chart"></div></div>
        <div class="panel pnl-report">
            <div class="report-heading"><div><strong>${escapeHtml(report.title)}</strong><div>For the period ${escapeHtml(report.filters.from_date)} to ${escapeHtml(report.filters.to_date)}</div></div><div>${report.currency === "local" ? "RM (Local currency)" : "Original document currency"}</div></div>
            <div class="data-wrapper"><table class="data-table pnl-table"><thead><tr><th>Account</th>${headers}</tr></thead><tbody>${body}</tbody></table></div>
        </div>`;
    renderPnlChart(kpis);
}

function renderPnlChart(items) {
    const target = document.getElementById("pnl-chart");
    const max = Math.max.apply(null, items.map(function (item) { return Math.abs(Number(item[1])); }).concat([1]));
    target.innerHTML = `<div class="pnl-bars">${items.map(function (item) {
        const value = Number(item[1]);
        const width = Math.max(2, Math.round((Math.abs(value) / max) * 100));
        return `<div class="pnl-bar-row"><div class="pnl-bar-label">${escapeHtml(item[0])}</div><div class="pnl-bar-track"><div class="pnl-bar ${value < 0 ? "negative" : ""}" style="width:${width}%"></div></div><div class="pnl-bar-value">${pnlMoney(value)}</div></div>`;
    }).join("")}</div>`;
}

// =========================================================
// 30. CSS SELECTOR ESCAPE
// =========================================================

function cssEscape(
    value
) {

    if (
        window.CSS
        &&
        CSS.escape
    ) {

        return CSS.escape(
            value
        );

    }


    return value.replace(
        /([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g,
        "\\$1"
    );

}

# SQL Accounting BI server

This is the isolated FastAPI service imported from `PROJECT.zip`. It is separate from the React Follow-up dashboard and does not use Firebase/Firestore.

Before running it, copy `.env.example` to `.env` on this laptop and set a dedicated Firebird user with `SELECT`-only permissions. Do not use SYSDBA. The Firebird service may remain on the accounting server; this BI service connects to it through the office Wi-Fi/LAN.

Run locally on this laptop:

```powershell
py -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env: enter the BI login and the remote Firebird server/database path.
.\.venv\Scripts\uvicorn main:app --host 127.0.0.1 --port 8010
```

Test it locally with `http://127.0.0.1:8010/api/health`. The React project includes a local-only `.env.local` pointing at `http://localhost:8010`; restart the Vite dev server after changing it. Your browser talks to the BI service on your own laptop, not a cloud service.

The email-sending routes from the source ZIP are disabled in this copy. The remaining database/report endpoints must be used only with a database account that has read-only access.

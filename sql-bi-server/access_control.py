"""Local gateway and SQL Account DCF database selection helpers."""
import os
from pathlib import Path
from xml.etree import ElementTree
from dotenv import load_dotenv

# This file is deliberately local-only. It is ignored by Git and keeps database
# credentials off the React/Vercel side of the project.
load_dotenv(Path(__file__).with_name(".env"))

# Set these values in the server environment. Do not commit real credentials.
DASHBOARD_USERNAME = os.getenv("AMS_SQL_BI_USERNAME", "")
DASHBOARD_PASSWORD = os.getenv("AMS_SQL_BI_PASSWORD", "")
DCF_DIRECTORY = Path(os.getenv("AMS_SQL_BI_DCF_DIRECTORY", r"C:\eStream\SQLAccounting\Share"))


def available_dcfs():
    return sorted(item.name for item in DCF_DIRECTORY.glob("*.DCF"))


def _safe_dcf(name: str) -> Path:
    candidate = (DCF_DIRECTORY / Path(name).name).resolve()
    if candidate.parent != DCF_DIRECTORY.resolve() or candidate.suffix.upper() != ".DCF" or not candidate.is_file():
        raise ValueError("Choose a valid DCF file from the SQL Accounting Share folder.")
    return candidate


def fdbs_from_dcf(name: str):
    dcf = _safe_dcf(name)
    try:
        root = ElementTree.parse(dcf).getroot()
    except (ElementTree.ParseError, OSError) as exc:
        raise ValueError(f"Unable to read DCF file: {exc}") from exc
    database_dir = Path(root.attrib.get("Folder", ""))
    entries, seen = [], set()
    for element in root.iter():
        for value in element.attrib.values():
            text = str(value).strip()
            if text.upper().endswith(".FDB"):
                filename, key = Path(text).name, Path(text).name.lower()
                if key not in seen:
                    seen.add(key)
                    entries.append({
                        "name": filename,
                        "company_name": element.attrib.get("CompanyName", "Company name not recorded"),
                        "remark": element.attrib.get("Remark", "No remark"),
                        "available": (database_dir / filename).is_file(),
                    })
    return entries


def selected_fdb_path(dcf_name: str, fdb_name: str) -> Path:
    allowed = {entry["name"].lower() for entry in fdbs_from_dcf(dcf_name)}
    filename = Path(fdb_name).name
    if filename.lower() not in allowed:
        raise ValueError("The selected FDB is not listed in this DCF file.")
    root = ElementTree.parse(_safe_dcf(dcf_name)).getroot()
    path = (Path(root.attrib.get("Folder", "")) / filename).resolve()
    if not path.is_file():
        raise ValueError("This FDB is listed in the DCF, but the database file is not available.")
    return path

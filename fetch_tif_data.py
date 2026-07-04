"""
Marathon County TIF Scorecard - data fetcher.

Pulls two Wisconsin DOR sources and merges them into data/districts.json:

  A) TID value certifications (Excel, statewide, one file per year)
     https://www.revenue.wi.gov/SLFReportstif/{year}tifcomun.xlsx
     Columns: County, CoMun, TVC, Municipality, TID, Base Yr,
              Current Value, Base Value, Increment

  B) PE-300 TID Annual Reports (DOR Vault public REST API)
     Index:  GET {VAULT}/rest/tidar/comun/comuninformationget/{year}
     Report: GET {VAULT}/rest/core/submission
                 ?subId=TIDAR-{year}-{auth}-{tidnum}-{tidacct}&system=tidar

One correct path. Any unexpected shape raises and kills the run.
"""

import io
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import requests

COUNTY = "MARATHON"
VALUE_YEARS = range(2019, 2026)   # xlsx certifications available 2019+
REPORT_YEARS = range(2018, 2026)  # PE-300 API available 2018+

VALUES_URL = "https://www.revenue.wi.gov/SLFReportstif/{year}tifcomun.xlsx"
VAULT = "https://ww2.revenue.wi.gov/VaultPublic"
INDEX_URL = VAULT + "/rest/tidar/comun/comuninformationget/{year}"
SUBMISSION_URL = VAULT + "/rest/core/submission"

OUT_PATH = Path(__file__).parent / "public" / "data" / "districts.json"
REQUEST_PAUSE = 0.2  # seconds between Vault API calls

SESSION = requests.Session()
SESSION.headers["User-Agent"] = (
    "WausauPilotReview-TIF-Scorecard/1.0 (civic data; tech@wausaupilotandreview.com)"
)


def get(url: str, **kwargs) -> requests.Response:
    resp = SESSION.get(url, timeout=60, **kwargs)
    resp.raise_for_status()
    return resp


def num(value) -> int:
    """PE-300 amounts arrive as ints; accept numeric strings, reject anything else."""
    if isinstance(value, bool):
        raise TypeError(f"boolean where number expected: {value!r}")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return round(value)
    if isinstance(value, str):
        stripped = value.strip().replace(",", "")
        if stripped == "":
            return 0  # untouched amount box on a filed form means no activity
        if stripped.lstrip("-").isdigit():
            return int(stripped)
    raise TypeError(f"unparseable amount: {value!r}")


def clean_code(cell: str) -> str:
    """DOR Excel wraps codes as ='37291' to keep leading zeros. Unwrap."""
    return cell.strip().strip('="')


def mdy_to_iso(value: str | None) -> str | None:
    """Vault dates arrive as MM/DD/YYYY or MM-DD-YYYY; "N/A" is DOR's null."""
    if not value or value == "N/A":
        return None
    return datetime.strptime(value.replace("-", "/"), "%m/%d/%Y").date().isoformat()


def fetch_values(year: int) -> list[dict]:
    """Parse one certification workbook, return all rows statewide.

    Statewide because the same physical TID appears once per county portion;
    that repetition is how cross-county districts are detected.
    """
    print(f"[values] {year}", flush=True)
    wb = openpyxl.load_workbook(io.BytesIO(get(VALUES_URL.format(year=year)).content))
    rows = list(wb.active.iter_rows(values_only=True))

    header_idx = next(i for i, r in enumerate(rows) if r and r[0] == "County")
    out = []
    for row in rows[header_idx + 1:]:
        if not row or not isinstance(row[0], str) or not row[0].strip():
            continue
        out.append({
            "year": year,
            "county": row[0].strip(),
            "coMuniCode": clean_code(row[1]),
            "muniType": row[2].split()[0],  # "CITY OF" (2019 vintage) vs "CITY" (2025)
            "municipality": row[3].strip(),
            "tidNumber": clean_code(row[4]),
            "baseYear": num(row[5]),
            "currentValue": num(row[6]),
            "baseValue": num(row[7]),
            "increment": num(row[8]),
        })
    if not out:
        raise RuntimeError(f"no data rows found in {year} certification file")
    return out


def fetch_index(year: int) -> list[dict]:
    """Return the statewide TID roster for one report year.

    Statewide, not county-filtered: cross-county municipalities (Abbotsford,
    Marshfield) file each TID's PE-300 under a single co-muni code that may
    sit in the neighboring county, so resolution needs the full roster.
    """
    print(f"[index] {year}", flush=True)
    body = get(INDEX_URL.format(year=year)).json()
    if body["result"] != "Ok":
        raise RuntimeError(f"index {year} returned {body['result']}")

    entries = []
    for muni in body["subject"]["comunlist"]:
        for tid in muni["tidData"]:
            entries.append({
                "year": year,
                "county": muni["countyName"],
                "coMuniCode": muni["coMuniCode"],
                "municipality": muni["muniName"],
                "muniType": muni["muniType"],
                "auth": muni["auth"],
                "tidNumber": tid["tidnum"],
                "tidAcct": tid["tidacct"],
                "tidType": tid["tidTypeValue"],
                "tidTypeDesc": tid["tidTypeDesc"],
                "filed": tid["submissionStatus"] == "Filed",
            })
    return entries


def fetch_report(entry: dict) -> dict:
    """Fetch one PE-300 submission and extract the scorecard fields."""
    sub_id = (f"TIDAR-{entry['year']}-{entry['auth']}"
              f"-{entry['tidNumber']}-{entry['tidAcct']}")
    body = get(SUBMISSION_URL, params={"subId": sub_id, "system": "tidar"}).json()
    if body["result"] != "Ok":
        raise RuntimeError(f"submission {sub_id} returned {body['result']}")

    fd = body["subject"]["data"]["formData"]

    def amt(key: str) -> int:
        # Vault serializes only touched form boxes; absent key means no activity
        return num(fd.get(key, 0))

    return {
        "year": entry["year"],
        "beginningBalance": amt("sec1BeginingBalance"),
        "capitalExpenditures": amt("sec2CapitalExp"),
        "adminCosts": amt("sec2Admin"),
        "debtPrincipal": amt("sec2PrincipalCosts"),
        "debtInterest": amt("sec2InterestCharges"),
        "totalExpenditures": amt("sec2TotalExp"),
        "taxIncrement": amt("sec3TaxIncrement"),
        "debtProceeds": amt("sec3DebtProceed"),
        "totalRevenue": amt("sec3TotalRevenue"),
        "futureProjectCosts": amt("sec4ProjectCosts"),
        "futureProjectRevenue": amt("sec4ProjectRevenue"),
        "endingBalance": amt("sec4EndingBalance"),
        "surplus": amt("sec4Surplus"),
        "createdDate": mdy_to_iso(fd["tid"]["createdDate"]),
        "terminationDate": mdy_to_iso(fd["tid"]["terminatedDate"]),
    }


def build() -> dict:
    values = [row for year in VALUE_YEARS for row in fetch_values(year)]
    index = [row for year in REPORT_YEARS for row in fetch_index(year)]

    districts: dict[str, dict] = {}
    all_values, values = values, [r for r in values if r["county"] == COUNTY]
    if not values:
        raise RuntimeError(f"no {COUNTY} rows in certification files")

    # A TID spanning counties is certified once per county portion under the
    # same (municipality, type, TID, base year). DOR's auth codes differ per
    # county portion, so certification repetition is the reliable signal.
    counties_by_tid: dict[tuple, set[str]] = {}
    for r in all_values:
        counties_by_tid.setdefault(
            (r["municipality"], r["muniType"], r["tidNumber"], r["baseYear"]),
            set()).add(r["county"])
    spanning = {k[:3] for k, c in counties_by_tid.items() if len(c) > 1}

    def ingest(key: str, entries: list[dict], marathon_code: str) -> None:
        """Create one district from its filing-roster entries and pull reports."""
        head = entries[-1]  # latest year carries current type/termination info
        district = districts[key] = {
            "id": key,
            "coMuniCode": marathon_code,
            "municipality": head["municipality"],
            "muniType": head["muniType"],
            "tidNumber": head["tidNumber"],
            "tidType": head["tidType"],
            "tidTypeDesc": head["tidTypeDesc"],
            "crossCounty": (head["county"] != COUNTY
                            or (head["municipality"], head["muniType"],
                                head["tidNumber"]) in spanning),
            "filesUnderCounty": head["county"],
            "createdDate": None,
            "terminationDate": None,
            "lastReportYear": max(e["year"] for e in entries),
            "values": [],
            "financials": [],
        }
        for entry in entries:
            if not entry["filed"]:
                continue
            print(f"[report] {entry['year']} {key}", flush=True)
            financials = fetch_report(entry)
            district["createdDate"] = financials.pop("createdDate")
            district["terminationDate"] = financials.pop("terminationDate")
            district["financials"].append(financials)
            time.sleep(REQUEST_PAUSE)

    by_filing_key: dict[str, list[dict]] = {}
    for entry in index:
        by_filing_key.setdefault(
            f"{entry['coMuniCode']}-{entry['tidNumber']}", []).append(entry)

    for key, entries in by_filing_key.items():
        if entries[0]["county"] == COUNTY:
            ingest(key, sorted(entries, key=lambda e: e["year"]), entries[0]["coMuniCode"])

    for row in values:
        key = f"{row['coMuniCode']}-{row['tidNumber']}"
        if key not in districts:
            # Marathon-portion value row for a TID that files in a neighboring
            # county. Resolve by municipality name + TID number statewide.
            matches = [e for e in index
                       if e["municipality"] == row["municipality"]
                       and e["muniType"] == row["muniType"]
                       and e["tidNumber"] == row["tidNumber"]]
            if len({e["auth"] for e in matches}) != 1:
                raise RuntimeError(f"cannot uniquely resolve filing entity for {key} "
                                   f"({row['municipality']} TID {row['tidNumber']})")
            ingest(key, sorted(matches, key=lambda e: e["year"]), row["coMuniCode"])

        districts[key]["values"].append({
            k: row[k] for k in
            ("year", "baseYear", "currentValue", "baseValue", "increment")
        })

    latest_report_year = max(REPORT_YEARS)
    for district in districts.values():
        district["status"] = ("active" if district["lastReportYear"] == latest_report_year
                              else "terminated")
        district["values"].sort(key=lambda r: r["year"])
        district["financials"].sort(key=lambda r: r["year"])

    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "county": COUNTY,
        "valueYears": [min(VALUE_YEARS), max(VALUE_YEARS)],
        "reportYears": [min(REPORT_YEARS), max(REPORT_YEARS)],
        "districts": sorted(districts.values(),
                            key=lambda d: (d["municipality"], d["tidNumber"])),
    }


def main() -> None:
    data = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data, indent=1))
    active = sum(1 for d in data["districts"] if d["status"] == "active")
    print(f"wrote {OUT_PATH}: {len(data['districts'])} districts "
          f"({active} active), {sum(len(d['financials']) for d in data['districts'])} "
          f"annual reports", flush=True)


if __name__ == "__main__":
    sys.exit(main())

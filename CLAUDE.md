# marathon-tif

TIF scorecard for Wausau Pilot & Review: is tax increment financing in Marathon
County paying off? District-by-district performance from Wisconsin DOR public
data. Zero scraping risk — one direct Excel download and one public JSON API.

## Pipeline

`fetch_tif_data.py` → `public/data/districts.json` → React 18/Vite widget →
GitHub Pages → WordPress iframe. Monthly data cron
(`.github/workflows/update-data.yml`) commits refreshed JSON; any push to
`main` triggers the Pages build (`.github/workflows/deploy.yml`), so a data
refresh redeploys the site with no extra wiring.

## Widget

Single page, no router: `src/App.jsx` (load, county-ledger toplines, sort
state) → `src/District.jsx` (row + drilldown) → `src/scorecard.js` (all
derivations — raw facts stay in the JSON, display logic lives here only).
Hand-rolled SVG charts, zero chart dependencies. WPR design system: teal
`#3A867C`, cream `#f6f2e9`, Fraunces display, Public Sans body, JetBrains
Mono for figures.

Signature element: the shared-scale diverging balance bar in the outlook
column (sqrt scale so ±$60K stays visible beside a −$5.2M outlier).

Verdict vocabulary (neutral by design — it repeats each municipality's own
filed arithmetic, `sec4Surplus`): **Ahead** (surplus ≥ 0), **Short**
(surplus < 0), **Closing** (final wind-down filing: Section 4 all zero),
**Closed** (no longer in the index). Never editorialize beyond the filings.

## Data sources

**A. TID value certifications (Excel, statewide, one file per year, 2019+)**
`https://www.revenue.wi.gov/SLFReportstif/{year}tifcomun.xlsx`
Columns: County, CoMun, TVC, Municipality, TID, Base Yr, Current Value,
Base Value, Increment. Code cells arrive Excel-armored as `="37291"` — strip.
Header row located by scanning for `County` in column A. Parallel files exist
per school district (`tifsch`), tech college (`tifvtc`), special district
(`tifspl`) — not currently ingested.

**B. PE-300 TID Annual Reports (DOR Vault public REST API, 2018+)**
- Index: `GET https://ww2.revenue.wi.gov/VaultPublic/rest/tidar/comun/comuninformationget/{year}`
- Report: `GET https://ww2.revenue.wi.gov/VaultPublic/rest/core/submission?subId=TIDAR-{year}-{auth}-{tidnum}-{tidacct}&system=tidar`

Undocumented but public — it is exactly what the DOR "TID Annual Report" page
(`ww2.revenue.wi.gov/VaultPublic/publish/tidar/report.html`) calls from the
browser. Filings for report year N post March–July of year N+1.

## Data gotchas (all learned from live filings — do not "simplify" away)

- **Sparse serialization:** the Vault only serializes form boxes the filer
  touched. Absent amount key = untouched box = 0. Blank string = 0. Anything
  else unparseable raises.
- **Form vintages:** older filings lack the `formatted*` date keys. Plain
  `createdDate` / `terminatedDate` (MM-DD-YYYY) exist in every vintage — use
  those. `"N/A"` is DOR's null.
- **Cross-county municipalities:** the certification file splits a TID's value
  by county portion; the PE-300 files once, under one co-muni code that may
  sit in a neighboring county. Abbotsford TID 5 files under Clark (10201),
  Marshfield TID 14 under Wood (71251 — note the muni suffix even changes,
  250→251, so never derive codes). DOR assigns a **different auth code per
  county portion** (Abbotsford: 0269 Clark, 1018 Marathon), so auth cannot
  identify a municipality across counties. Orphan resolution: municipality
  name + type + TID number against the statewide index, raising unless the
  match is a single `auth`. Spanning detection: the same (municipality, type,
  TID, base year) certified under 2+ counties. District identity keeps the
  Marathon co-muni code; `values` are the **Marathon portion only** (that is
  the editorial question); `financials` are whole-district. Flags:
  `crossCounty`, `filesUnderCounty`. Currently 6 flagged: Unity 1,
  Abbotsford 5 & 6, Colby 2 & 4, Marshfield 14.
- **TVC vocabulary drift:** the certification file's municipality-type column
  reads `CITY OF` in older vintages and `CITY` in newer ones. First-token
  normalization (`split()[0]`) decodes both.
- **`surplus` is DOR's own solvency math:** `sec4Surplus` equals
  `futureProjectRevenue + endingBalance − futureProjectCosts` in the filings.
  The scorecard's underwater/ahead verdict uses the municipality's own
  arithmetic.
- Districts terminated before 2019 have report history but no value rows
  (e.g., 37106-001).
- A district is `terminated` when it stops appearing in the index; its final
  filing may report all-zero Section 4 (wind-down).
- `terminatedDate` is the *scheduled* statutory termination, not the actual
  dissolution date. 37106-001 (Brokaw) left the index before 2019 yet files
  2030-09-29, so the widget's "closed {year}" can post-date the real closure.

## Contract: public/data/districts.json

```
{
  generated, county, valueYears: [min,max], reportYears: [min,max],
  districts: [{
    id ("<coMuniCode>-<tidNumber>"), coMuniCode, municipality, muniType,
    tidNumber, tidType, tidTypeDesc, crossCounty, filesUnderCounty,
    createdDate, terminationDate, status ("active"|"terminated"),
    lastReportYear,
    values:     [{year, baseYear, currentValue, baseValue, increment}],
    financials: [{year, beginningBalance, capitalExpenditures, adminCosts,
                  debtPrincipal, debtInterest, totalExpenditures,
                  taxIncrement, debtProceeds, totalRevenue,
                  futureProjectCosts, futureProjectRevenue,
                  endingBalance, surplus}]
  }]
}
```

`taxIncrement` is actual dollars collected on the increment that year — the
amount diverted from general distribution to schools/county/NTC. No mill-rate
math required.

## Principles

One correct path, no fallbacks. Fail fast and loud — any unexpected shape from
DOR kills the run rather than writing suspect data. Surgical changes only.
Raw facts in JSON; derived metrics belong in the widget.

## Environment

Windows/PowerShell 5.1 locally (`;` not `&&`), Python 3.14, deps:
`requests`, `openpyxl`. Full ingest is ~320 HTTP GETs (~2 min at the 0.2s
politeness pause); incremental years add ~45/year.

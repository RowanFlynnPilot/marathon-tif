"""Sanity gate for public/data/districts.json.

Runs in the monthly data workflow between fetch and commit, so a
catastrophically wrong DOR file (changed shape, truncated download,
wrong county) cannot be committed and deployed. Bounds are deliberately
loose — this catches disasters, not drift. Stdlib only.
"""

import json
import re
import sys
from datetime import date

FAILURES = []


def check(cond, msg):
    if not cond:
        FAILURES.append(msg)


def main():
    with open("public/data/districts.json", encoding="utf-8") as f:
        data = json.load(f)

    for key in ("generated", "county", "valueYears", "reportYears", "districts"):
        check(key in data, f"missing top-level key: {key}")
    if FAILURES:
        report()

    check(data["county"] == "MARATHON", f"county is {data['county']!r}")

    this_year = date.today().year
    for label in ("valueYears", "reportYears"):
        lo, hi = data[label]
        check(2018 <= lo <= hi <= this_year, f"{label} out of range: {lo}-{hi}")

    districts = data["districts"]
    check(40 <= len(districts) <= 80, f"district count suspicious: {len(districts)}")

    active = [d for d in districts if d["status"] == "active"]
    check(30 <= len(active) <= 60, f"active count suspicious: {len(active)}")

    num_value_keys = ("year", "currentValue", "baseValue", "increment")
    num_fin_keys = (
        "year", "taxIncrement", "totalRevenue", "totalExpenditures",
        "futureProjectCosts", "futureProjectRevenue", "endingBalance", "surplus",
    )
    for d in districts:
        did = d.get("id", "<no id>")
        check(re.fullmatch(r"\d{5}-\w{3,4}", did), f"{did}: malformed id")
        check(d["status"] in ("active", "terminated"), f"{did}: bad status {d['status']!r}")
        check(len(d["financials"]) > 0, f"{did}: no financials")
        for v in d["values"]:
            for k in num_value_keys:
                check(isinstance(v.get(k), (int, float)), f"{did}: value {k} not numeric")
        for fin in d["financials"]:
            for k in num_fin_keys:
                check(isinstance(fin.get(k), (int, float)), f"{did}: financial {k} not numeric")

    latest_value_year = data["valueYears"][1]
    locked = sum(
        v["increment"]
        for d in active
        for v in d["values"]
        if v["year"] == latest_value_year
    )
    check(0.4e9 <= locked <= 5e9, f"county increment suspicious: ${locked:,.0f}")

    collected = sum(d["financials"][-1]["taxIncrement"] for d in active)
    check(5e6 <= collected <= 100e6, f"taxes collected suspicious: ${collected:,.0f}")

    report()


def report():
    if FAILURES:
        print(f"FAILED — {len(FAILURES)} problem(s):")
        for msg in FAILURES:
            print(f"  - {msg}")
        sys.exit(1)
    print("districts.json passes all sanity checks")
    sys.exit(0)


if __name__ == "__main__":
    main()

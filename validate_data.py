"""Sanity gate for public/data/districts.json.

Runs in the monthly data workflow between fetch and commit, so a
catastrophically wrong DOR file (changed shape, truncated download,
wrong county) cannot be committed and deployed. Bounds are deliberately
loose — this catches disasters, not drift. Stdlib only.

    python validate_data.py [--previous path/to/last-committed.json]

With --previous, also diffs against the last committed data: districts
never vanish, statuses don't flip en masse (the failure mode if DOR ever
publishes a new report-year roster incrementally), year ranges never go
backwards, and no district loses filed years.
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

    if "--previous" in sys.argv:
        with open(sys.argv[sys.argv.index("--previous") + 1], encoding="utf-8") as f:
            compare(json.load(f), data)

    report()


def compare(previous, data):
    new = {d["id"]: d for d in data["districts"]}
    missing = sorted(d["id"] for d in previous["districts"] if d["id"] not in new)
    check(not missing, f"districts vanished from DOR data: {missing}")

    flips = [d["id"] for d in previous["districts"]
             if d["id"] in new and new[d["id"]]["status"] != d["status"]]
    check(len(flips) <= 3, f"{len(flips)} districts changed status in one refresh: {flips}")

    prev_active = sum(d["status"] == "active" for d in previous["districts"])
    new_active = sum(d["status"] == "active" for d in data["districts"])
    check(new_active >= prev_active - 3, f"active count dropped {prev_active} -> {new_active}")

    for label in ("valueYears", "reportYears"):
        check(data[label][1] >= previous[label][1],
              f"{label} went backwards: {previous[label]} -> {data[label]}")

    for d in previous["districts"]:
        if d["id"] in new:
            check(len(new[d["id"]]["financials"]) >= len(d["financials"]),
                  f"{d['id']}: filed years dropped from {len(d['financials'])} "
                  f"to {len(new[d['id']]['financials'])}")


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

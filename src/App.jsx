import { useEffect, useMemo, useState } from "react";
import District from "./District.jsx";
import { moneyCompact, snapshot, sortSnapshots, toplines } from "./scorecard.js";

// Deep link for reporters: ?district=<id> expands that drilldown on load.
// Read-only — expand/collapse never writes back to the URL.
const deepLinkId = new URLSearchParams(window.location.search).get("district");

const SORT_LABELS = {
  increment: "Increment",
  taxIncrement: "Taxes collected",
  outlook: "Outlook",
  term: "Termination",
  district: "District",
};

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("increment");
  const [sortDir, setSortDir] = useState(1);
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState("");

  // A deep link to a terminated district would otherwise land on nothing.
  useEffect(() => {
    if (!data || !deepLinkId) return;
    const target = data.districts.find((d) => d.id === deepLinkId);
    if (target && target.status === "terminated") setShowClosed(true);
  }, [data]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setError(null);
    fetch(`${import.meta.env.BASE_URL}data/districts.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`data fetch failed: ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [attempt]);

  const snaps = useMemo(
    () => (data ? data.districts.map(snapshot) : []),
    [data]
  );

  const shown = useMemo(() => {
    let pool = showClosed ? snaps : snaps.filter((s) => s.status === "active");
    const q = query.trim().toLowerCase();
    if (q) {
      pool = pool.filter((s) =>
        `${s.municipality} tid ${s.tidNumber.replace(/^0+/, "")}`
          .toLowerCase()
          .includes(q)
      );
    }
    return sortSnapshots(pool, sort, sortDir);
  }, [snaps, sort, sortDir, showClosed, query]);

  if (error) {
    return (
      <main className="wrap">
        <p className="loadstate">
          Couldn't load district data ({error}).{" "}
          <button className="retry" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </button>
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="wrap">
        <p className="loadstate">Loading district data…</p>
      </main>
    );
  }

  const top = toplines(snaps, data.valueYears[1]);
  const maxAbsOutlook = Math.max(
    ...shown.map((s) => Math.abs(s.outlook ?? 0)),
    1
  );

  return (
    <main className="wrap">
      <header className="masthead">
        <p className="masthead__eyebrow">Wausau Pilot &amp; Review · Civic Data</p>
        <h1>The TIF Scorecard</h1>
        <p className="masthead__dek">
          When a Marathon County community creates a tax increment district, new
          property value inside it — the <em>increment</em> — pays for the
          district's projects instead of funding schools, the county and the
          technical college. Each district's own annual filings say whether
          that bet is paying off.
        </p>
      </header>

      <section className="ledger" aria-label="County totals">
        <div className="ledger__item">
          <span className="ledger__fig">{moneyCompact(top.lockedIncrement)}</span>
          <span className="ledger__label">
            of property value locked as increment across {top.activeCount} active districts ({top.year})
          </span>
        </div>
        <div className="ledger__item">
          <span className="ledger__fig">{moneyCompact(top.taxCollected)}</span>
          <span className="ledger__label">
            in {top.year} property taxes collected on that increment
          </span>
        </div>
        <div className="ledger__item">
          <span className="ledger__fig">{moneyCompact(top.cumTaxCollected)}</span>
          <span className="ledger__label">
            collected across all districts since {data.reportYears[0]}
          </span>
        </div>
        <div className="ledger__item">
          <span className="ledger__fig ledger__fig--short">{top.shortCount} of {top.activeCount}</span>
          <span className="ledger__label">
            districts projected short by their own filings
          </span>
        </div>
      </section>

      <div className="controls">
        <div className="controls__sorts" role="group" aria-label="Sort districts">
          {Object.entries(SORT_LABELS).map(([key, label]) => (
            <button
              key={key}
              className={`sortbtn ${sort === key ? "sortbtn--on" : ""}`}
              onClick={() => {
                if (sort === key) {
                  setSortDir(-sortDir);
                } else {
                  setSort(key);
                  setSortDir(1);
                }
              }}
              aria-pressed={sort === key}
            >
              {label}
              {sort === key && (sortDir === 1 ? " ↓" : " ↑")}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="controls__filter"
          placeholder="Filter by community…"
          aria-label="Filter districts by community"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="controls__closed">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Show closed districts
        </label>
      </div>

      <section className="board" aria-label="District scorecard">
        {shown.length === 0 && (
          <p className="loadstate">No districts match “{query.trim()}”.</p>
        )}
        {shown.map((snap) => (
          <District
            key={snap.id}
            snap={snap}
            maxAbsOutlook={maxAbsOutlook}
            initialOpen={snap.id === deepLinkId}
          />
        ))}
      </section>

      <footer className="method">
        <h2>About this data</h2>
        <p>
          Values come from Wisconsin Department of Revenue TID certifications;
          finances come from each municipality's annual report (Form PE-300)
          filed with DOR. "Ahead" and "Short" repeat the municipality's own
          filed arithmetic: projected remaining revenue plus fund balance,
          minus remaining project costs. Districts marked "Closing" have a
          final wind-down filing on record. For municipalities that span
          county lines, value figures are the Marathon County portion only.
          Report years {data.reportYears[0]}–{data.reportYears[1]}; updated{" "}
          {data.generated.slice(0, 10)}.
        </p>
      </footer>
    </main>
  );
}

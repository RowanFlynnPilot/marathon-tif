// Pure derivations over the raw contract in public/data/districts.json.
// Raw facts live in the JSON; everything the UI displays derives here.

export const VERDICTS = {
  ahead: { label: "Ahead", blurb: "Filed projection covers remaining costs" },
  short: { label: "Short", blurb: "Filed projection does not cover remaining costs" },
  closing: { label: "Closing", blurb: "Final wind-down filing on record" },
  closed: { label: "Closed", blurb: "District terminated; value returned to the tax rolls" },
};

const last = (arr) => (arr.length ? arr[arr.length - 1] : null);

export function snapshot(district) {
  const fin = last(district.financials);
  const val = last(district.values);

  let verdict;
  if (district.status === "terminated") {
    verdict = "closed";
  } else if (
    fin.futureProjectCosts === 0 &&
    fin.futureProjectRevenue === 0 &&
    fin.surplus === 0
  ) {
    verdict = "closing";
  } else {
    verdict = fin.surplus < 0 ? "short" : "ahead";
  }

  const termYear = district.terminationDate
    ? Number(district.terminationDate.slice(0, 4))
    : null;

  // Sums cover the report window only (2018+); older districts collected
  // plenty before the data begins, so display labels say "since {year}".
  const cumTaxes = district.financials.reduce((s, f) => s + f.taxIncrement, 0);

  return {
    ...district,
    fin,
    val,
    verdict,
    increment: val ? val.increment : null,
    taxIncrement: fin ? fin.taxIncrement : null,
    outlook: verdict === "ahead" || verdict === "short" ? fin.surplus : null,
    cumTaxes,
    firstFinYear: district.financials[0].year,
    growth: val && val.baseValue > 0 ? val.currentValue / val.baseValue : null,
    termYear,
    // Filings carry the *scheduled* statutory termination; a terminated
    // district whose filed date sits beyond its final report never recorded
    // an actual closing date, so the scheduled year would be misleading.
    staleTermDate:
      district.status === "terminated" &&
      termYear !== null &&
      termYear > district.lastReportYear + 1,
  };
}

export function toplines(snapshots, latestValueYear) {
  const active = snapshots.filter((s) => s.status === "active");
  return {
    year: latestValueYear,
    activeCount: active.length,
    lockedIncrement: active.reduce(
      (sum, s) => sum + (s.val && s.val.year === latestValueYear ? s.val.increment : 0),
      0
    ),
    taxCollected: active.reduce((sum, s) => sum + s.fin.taxIncrement, 0),
    // All districts, including since-closed ones — those taxes were still
    // diverted while they were open.
    cumTaxCollected: snapshots.reduce((sum, s) => sum + s.cumTaxes, 0),
    shortCount: active.filter((s) => s.verdict === "short").length,
  };
}

export function multiple(n) {
  if (n === null || n === undefined) return "—";
  return `${n >= 100 ? Math.round(n) : n.toFixed(1)}×`;
}

// key extracts the sort value; desc is the default direction. Rows whose
// key is null (no value rows, no outlook) always sort last, in either
// direction — see sortSnapshots.
export const SORTS = {
  increment: { key: (s) => s.increment, desc: true },
  taxIncrement: { key: (s) => s.taxIncrement, desc: true },
  outlook: { key: (s) => s.outlook, desc: false },
  term: { key: (s) => s.termYear, desc: false },
  district: { key: (s) => `${s.municipality} ${s.tidNumber}`, desc: false },
};

export function sortSnapshots(pool, sortKey, flip) {
  const { key, desc } = SORTS[sortKey];
  const dir = (desc ? -1 : 1) * flip;
  return [...pool].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    const cmp = typeof ka === "string" ? ka.localeCompare(kb) : ka - kb;
    return cmp * dir;
  });
}

const dollarsFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(n) {
  if (n === null || n === undefined) return "—";
  return dollarsFull.format(n);
}

export function moneyCompact(n) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${abs}`;
}

export function titleCase(s) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

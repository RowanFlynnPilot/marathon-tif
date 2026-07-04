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

  return {
    ...district,
    fin,
    val,
    verdict,
    increment: val ? val.increment : null,
    taxIncrement: fin ? fin.taxIncrement : null,
    outlook: verdict === "ahead" || verdict === "short" ? fin.surplus : null,
    termYear: district.terminationDate
      ? Number(district.terminationDate.slice(0, 4))
      : null,
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
    shortCount: active.filter((s) => s.verdict === "short").length,
  };
}

export const SORTS = {
  increment: (a, b) => (b.increment ?? -1) - (a.increment ?? -1),
  taxIncrement: (a, b) => (b.taxIncrement ?? -1) - (a.taxIncrement ?? -1),
  outlook: (a, b) => (a.outlook ?? Infinity) - (b.outlook ?? Infinity),
  term: (a, b) => (a.termYear ?? Infinity) - (b.termYear ?? Infinity),
  district: (a, b) =>
    a.municipality.localeCompare(b.municipality) ||
    a.tidNumber.localeCompare(b.tidNumber),
};

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

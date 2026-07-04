import { useEffect, useRef, useState } from "react";
import { VERDICTS, money, moneyCompact, titleCase } from "./scorecard.js";
import annotations from "./annotations.json";

// Shared sqrt scale keeps ±$60K visible next to a −$5.2M outlier.
function balanceWidth(amount, maxAbs) {
  return (Math.sqrt(Math.abs(amount)) / Math.sqrt(maxAbs)) * 50;
}

function BalanceBar({ outlook, maxAbs }) {
  if (outlook === null) return <div className="balance balance--idle" aria-hidden="true" />;
  const width = balanceWidth(outlook, maxAbs);
  const side = outlook < 0 ? "left" : "right";
  return (
    <div className="balance" aria-hidden="true">
      <span
        className={`balance__fill balance__fill--${side}`}
        style={side === "left" ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }}
      />
    </div>
  );
}

// Charts draw 1:1 with their rendered width (no viewBox stretching), so
// hover math is exact and text stays crisp at every size.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    setWidth(ref.current.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function ChartTip({ x, width, children }) {
  // Widest tooltip (bar chart, full-dollar figures) runs ~220px; keep its
  // center far enough from the edges that it never bleeds out.
  const left = width < 240 ? width / 2 : Math.min(Math.max(x, 112), width - 112);
  return (
    <div className="charttip" style={{ left }}>
      {children}
    </div>
  );
}

function Sparkline({ values }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const h = 190, pad = 12, top = 52, bottom = 14;
  const n = values.length;
  const max = Math.max(...values.map((v) => v.increment));
  const min = Math.min(...values.map((v) => v.increment), 0);
  const x = (i) => pad + (i / (n - 1)) * (width - 2 * pad);
  const y = (v) => h - bottom - ((v - min) / (max - min || 1)) * (h - top - bottom);
  const line = values.map((v, i) => `${x(i)},${y(v.increment)}`).join(" ");
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left - pad) / (rect.width - 2 * pad);
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  return (
    <div ref={ref} className="chartbox" style={{ minHeight: h }}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <>
          <svg viewBox={`0 0 ${width} ${h}`} width="100%" className="spark" role="img"
            aria-label={`Increment ${values[0].year} to ${values[n - 1].year}`}>
            <polygon className="spark__area"
              points={`${x(0)},${h - bottom} ${line} ${x(n - 1)},${h - bottom}`} />
            <polyline points={line} fill="none" />
            {hover === null ? (
              <circle cx={x(n - 1)} cy={y(values[n - 1].increment)} r="4" />
            ) : (
              <g className="spark__hover">
                <line x1={x(hover)} x2={x(hover)} y1={top - 8} y2={h - bottom} />
                <circle cx={x(hover)} cy={y(values[hover].increment)} r="5" />
              </g>
            )}
          </svg>
          {hover !== null && (
            <ChartTip x={x(hover)} width={width}>
              <span className="charttip__year">{values[hover].year} increment</span>
              <span className="charttip__fig">{money(values[hover].increment)}</span>
            </ChartTip>
          )}
        </>
      )}
    </div>
  );
}

function FinanceBars({ financials }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const h = 210, pad = 12, top = 52, bottom = 24;
  const n = financials.length;
  const max = Math.max(
    ...financials.map((f) => Math.max(f.taxIncrement, f.debtPrincipal + f.debtInterest)),
    1
  );
  const band = (width - 2 * pad) / n;
  const bh = (v) => ((h - top - bottom) * v) / max;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left - pad) / band))));
  };
  const hovered = hover !== null ? financials[hover] : null;
  return (
    <div ref={ref} className="chartbox" style={{ minHeight: h }}
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <>
          <svg viewBox={`0 0 ${width} ${h}`} width="100%" className="finbars" role="img"
            aria-label="Tax increment collected vs. debt service by year">
            {hover !== null && (
              <rect className="finbars__hi" x={pad + hover * band} width={band}
                y={top - 8} height={h - bottom - top + 8} />
            )}
            {financials.map((f, i) => {
              const x0 = pad + i * band;
              const debt = f.debtPrincipal + f.debtInterest;
              return (
                <g key={f.year}>
                  <rect className="finbars__incr" x={x0 + band * 0.14} width={band * 0.34}
                    y={h - bottom - bh(f.taxIncrement)} height={bh(f.taxIncrement)} />
                  <rect className="finbars__debt" x={x0 + band * 0.52} width={band * 0.34}
                    y={h - bottom - bh(debt)} height={bh(debt)} />
                  <text x={x0 + band / 2} y={h - 8} textAnchor="middle">
                    {String(f.year).slice(2)}
                  </text>
                </g>
              );
            })}
          </svg>
          {hovered && (
            <ChartTip x={pad + hover * band + band / 2} width={width}>
              <span className="charttip__year">{hovered.year}</span>
              <span className="charttip__row">
                <span className="key key--incr">tax increment</span>
                {money(hovered.taxIncrement)}
              </span>
              <span className="charttip__row">
                <span className="key key--debt">debt service</span>
                {money(hovered.debtPrincipal + hovered.debtInterest)}
              </span>
            </ChartTip>
          )}
        </>
      )}
    </div>
  );
}

function ChartTabs({ snap }) {
  const hasSpark = snap.values.length > 1;
  const [tab, setTab] = useState(hasSpark ? "increment" : "finance");
  return (
    <div className="charts">
      {hasSpark && (
        <div className="charts__tabs" role="tablist" aria-label="District charts">
          <button role="tab" aria-selected={tab === "increment"}
            className={`tabbtn ${tab === "increment" ? "tabbtn--on" : ""}`}
            onClick={() => setTab("increment")}>
            Increment value
          </button>
          <button role="tab" aria-selected={tab === "finance"}
            className={`tabbtn ${tab === "finance" ? "tabbtn--on" : ""}`}
            onClick={() => setTab("finance")}>
            Taxes collected vs. debt
          </button>
        </div>
      )}
      {tab === "increment" ? (
        <figure>
          <Sparkline values={snap.values} />
          <figcaption>
            Increment, {snap.values[0].year}–{snap.val.year}: {money(snap.values[0].increment)} → {money(snap.val.increment)}
          </figcaption>
        </figure>
      ) : (
        <figure>
          <FinanceBars financials={snap.financials} />
          <figcaption>
            <span className="key key--incr">tax increment</span> vs{" "}
            <span className="key key--debt">debt service</span>, by year
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function CopyLink({ id }) {
  const [copied, setCopied] = useState(false);
  // Inside the iframe, location is still the GitHub Pages URL, so this
  // yields the canonical standalone link in both contexts.
  const url = `${window.location.origin}${window.location.pathname}?district=${id}`;
  return (
    <button
      className="copylink"
      onClick={() => {
        navigator.clipboard.writeText(url).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => window.prompt("Copy this link:", url)
        );
      }}
    >
      {copied ? "Link copied ✓" : "Copy link to this district"}
    </button>
  );
}

function Lifecycle({ createdDate, terminationDate }) {
  if (!createdDate || !terminationDate) return null;
  const start = new Date(createdDate).getTime();
  const end = new Date(terminationDate).getTime();
  const pct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  return (
    <div className="lifecycle">
      <span className="lifecycle__date">{createdDate.slice(0, 4)}</span>
      <div className="lifecycle__track">
        <span className="lifecycle__elapsed" style={{ width: `${pct}%` }} />
      </div>
      <span className="lifecycle__date">{terminationDate.slice(0, 4)}</span>
    </div>
  );
}

export default function District({ snap, maxAbsOutlook, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const verdict = VERDICTS[snap.verdict];
  const ann = annotations[snap.id];
  const rootRef = useRef(null);

  useEffect(() => {
    if (initialOpen && rootRef.current) rootRef.current.scrollIntoView();
  }, []);

  return (
    <div ref={rootRef} className={`district district--${snap.verdict}`}>
      <button
        className="district__row"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div className="cell cell--name">
          <span className="cell__muni">
            {titleCase(snap.municipality)} TID {snap.tidNumber.replace(/^0+/, "")}
            {ann && <span className="cell__place"> · {ann.name}</span>}
          </span>
          <span className="cell__type">{snap.tidTypeDesc}</span>
        </div>
        <div className="cell cell--num">
          <span className="cell__label">Increment</span>
          <span className="cell__fig">{moneyCompact(snap.increment)}</span>
        </div>
        <div className="cell cell--num">
          <span className="cell__label">{snap.fin.year} taxes</span>
          <span className="cell__fig">{moneyCompact(snap.taxIncrement)}</span>
        </div>
        <div className="cell cell--balance">
          <span className="cell__label">Outlook, as filed</span>
          <BalanceBar outlook={snap.outlook} maxAbs={maxAbsOutlook} />
          <span className="cell__fig cell__fig--outlook">{moneyCompact(snap.outlook)}</span>
        </div>
        <div className="cell cell--verdict">
          <span className={`chip chip--${snap.verdict}`}>{verdict.label}</span>
          <span className="cell__term">
            {snap.status === "terminated"
              ? snap.staleTermDate
                ? `last filed ${snap.lastReportYear}`
                : `closed ${snap.termYear}`
              : `to ${snap.termYear ?? "—"}`}
          </span>
        </div>
      </button>

      {open && (
        <div className="district__detail">
          <p className="detail__blurb">
            {ann && `${ann.note} `}
            {verdict.blurb}. Created {snap.createdDate?.slice(0, 4) ?? "—"},{" "}
            {snap.status === "terminated"
              ? snap.staleTermDate
                ? `last annual report filed ${snap.lastReportYear}`
                : `terminated ${snap.terminationDate?.slice(0, 4) ?? "—"}`
              : `terminates ${snap.terminationDate?.slice(0, 4) ?? "—"}`}.
            {snap.crossCounty &&
              ` ${titleCase(snap.municipality)} spans county lines: value shown is the Marathon County portion; finances cover the whole district${snap.filesUnderCounty !== "MARATHON" ? `, filed under ${titleCase(snap.filesUnderCounty)} County` : ""}.`}
          </p>
          {!snap.staleTermDate && (
            <Lifecycle createdDate={snap.createdDate} terminationDate={snap.terminationDate} />
          )}
          <ChartTabs snap={snap} />
          <dl className="detail__figures">
            <div><dt>Base value</dt><dd>{money(snap.val?.baseValue)}</dd></div>
            <div><dt>Current value</dt><dd>{money(snap.val?.currentValue)}</dd></div>
            <div><dt>Remaining costs</dt><dd>{money(snap.fin.futureProjectCosts)}</dd></div>
            <div><dt>Projected revenue</dt><dd>{money(snap.fin.futureProjectRevenue)}</dd></div>
            <div><dt>Fund balance</dt><dd>{money(snap.fin.endingBalance)}</dd></div>
            <div><dt>Filed outlook</dt><dd>{money(snap.fin.surplus)}</dd></div>
          </dl>
          <CopyLink id={snap.id} />
        </div>
      )}
    </div>
  );
}

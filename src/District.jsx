import { useState } from "react";
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

function Sparkline({ values }) {
  if (values.length < 2) return null;
  const w = 220, h = 56, pad = 4;
  const max = Math.max(...values.map((v) => v.increment));
  const min = Math.min(...values.map((v) => v.increment), 0);
  const x = (i) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (n) => h - pad - ((n - min) / (max - min || 1)) * (h - 2 * pad);
  const points = values.map((v, i) => `${x(i)},${y(v.increment)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" role="img"
      aria-label={`Increment ${values[0].year} to ${values[values.length - 1].year}`}>
      <polyline points={points} fill="none" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1].increment)} r="3" />
    </svg>
  );
}

function FinanceBars({ financials }) {
  const w = 220, h = 72, pad = 4;
  const max = Math.max(
    ...financials.map((f) => Math.max(f.taxIncrement, f.debtPrincipal + f.debtInterest)),
    1
  );
  const band = (w - 2 * pad) / financials.length;
  const bh = (n) => ((h - 18) * n) / max;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="finbars" role="img"
      aria-label="Tax increment collected vs. debt service by year">
      {financials.map((f, i) => {
        const x0 = pad + i * band;
        const debt = f.debtPrincipal + f.debtInterest;
        return (
          <g key={f.year}>
            <rect className="finbars__incr" x={x0 + band * 0.14} width={band * 0.34}
              y={h - 14 - bh(f.taxIncrement)} height={bh(f.taxIncrement)} />
            <rect className="finbars__debt" x={x0 + band * 0.52} width={band * 0.34}
              y={h - 14 - bh(debt)} height={bh(debt)} />
            <text x={x0 + band / 2} y={h - 3} textAnchor="middle">
              {String(f.year).slice(2)}
            </text>
          </g>
        );
      })}
    </svg>
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

export default function District({ snap, maxAbsOutlook }) {
  const [open, setOpen] = useState(false);
  const verdict = VERDICTS[snap.verdict];
  const ann = annotations[snap.id];

  return (
    <div className={`district district--${snap.verdict}`}>
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
            {snap.status === "terminated" ? `closed ${snap.termYear}` : `to ${snap.termYear ?? "—"}`}
          </span>
        </div>
      </button>

      {open && (
        <div className="district__detail">
          <p className="detail__blurb">
            {ann && `${ann.note} `}
            {verdict.blurb}. Created {snap.createdDate?.slice(0, 4) ?? "—"},{" "}
            {snap.status === "terminated" ? "terminated" : "terminates"}{" "}
            {snap.terminationDate?.slice(0, 4) ?? "—"}.
            {snap.crossCounty &&
              ` ${titleCase(snap.municipality)} spans county lines: value shown is the Marathon County portion; finances cover the whole district${snap.filesUnderCounty !== "MARATHON" ? `, filed under ${titleCase(snap.filesUnderCounty)} County` : ""}.`}
          </p>
          <Lifecycle createdDate={snap.createdDate} terminationDate={snap.terminationDate} />
          <div className="detail__charts">
            {snap.values.length > 1 && (
              <figure>
                <Sparkline values={snap.values} />
                <figcaption>
                  Increment, {snap.values[0].year}–{snap.val.year}: {money(snap.values[0].increment)} → {money(snap.val.increment)}
                </figcaption>
              </figure>
            )}
            <figure>
              <FinanceBars financials={snap.financials} />
              <figcaption>
                <span className="key key--incr">tax increment</span> vs{" "}
                <span className="key key--debt">debt service</span>, by year
              </figcaption>
            </figure>
          </div>
          <dl className="detail__figures">
            <div><dt>Base value</dt><dd>{money(snap.val?.baseValue)}</dd></div>
            <div><dt>Current value</dt><dd>{money(snap.val?.currentValue)}</dd></div>
            <div><dt>Remaining costs</dt><dd>{money(snap.fin.futureProjectCosts)}</dd></div>
            <div><dt>Projected revenue</dt><dd>{money(snap.fin.futureProjectRevenue)}</dd></div>
            <div><dt>Fund balance</dt><dd>{money(snap.fin.endingBalance)}</dd></div>
            <div><dt>Filed outlook</dt><dd>{money(snap.fin.surplus)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}

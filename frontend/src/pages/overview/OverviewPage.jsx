import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, StatCard, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatDate, periodLabel } from '../../lib/format';

// One fill per ledger: three greys, then the same greys with a hatch so adjacent series stay distinguishable.
const FILLS = ['rgb(var(--c1))', 'rgb(var(--c2))', 'rgb(var(--c3))', 'url(#hatch-1)', 'url(#hatch-2)', 'url(#hatch-3)'];
const fillOf = (i) => FILLS[i % FILLS.length];
function ChartDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        {[1, 2, 3].map((n) => (
          <pattern key={n} id={`hatch-${n}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" style={{ fill: `rgb(var(--c${n}))` }} />
            <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.5" style={{ stroke: 'rgb(var(--base))' }} />
          </pattern>
        ))}
      </defs>
    </svg>
  );
}
const Swatch = ({ fill }) => (
  <svg width="14" height="14" aria-hidden="true" className="shrink-0 rounded-sm"><rect width="14" height="14" style={{ fill }} stroke="rgb(var(--ink) / .4)" /></svg>
);
const ledgerPath = (key) => (key === 'lending' ? '/lending' : `/c/${key.split(':')[1]}`);

// Axis labels: ₹ in full under 1,000, then K, then L (lakh).
const short = (v) => (v >= 1e5 ? `₹${+(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `₹${+(v / 1e3).toFixed(1)}K` : `₹${v}`);
// Smallest "nice" step (1, 2, 2.5, 5 × 10^n) so 4 steps cover max.
function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

function TrendChart({ trend, ledgers }) {
  const [hover, setHover] = useState(null);
  // left axis gutter, right gutter (average label), plot width, plot height, room for the current-month label
  const L = 52, R = 70, W = 1000, H = 150, TOP = 22;
  const n = trend.length;
  const slot = (W - L - R) / Math.max(n, 1);
  const barW = Math.min(24, slot - 8);
  const totals = trend.map((t) => ledgers.reduce((s, l) => s + (t.byLedger[l.key] || 0), 0));
  const max = Math.max(...totals, 0);
  const step = max > 0 ? niceStep(max) : 1000;
  const top = step * 4;
  const yOf = (v) => TOP + H - (v / top) * H;
  const xOf = (i) => L + i * slot + (slot - barW) / 2;
  const avg = n ? totals.reduce((a, b) => a + b, 0) / n : 0;
  const last = n - 1;
  const tip = hover === null ? null : trend[hover];

  return (
    <>
      <ChartDefs />
      <div className="glass-in relative w-full overflow-x-auto rounded-3xl p-3" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${TOP + H + 24}`} className="w-full min-w-[420px]" style={{ height: 210 }} role="img"
          aria-label={`Money received per month for the last ${n} months, stacked by ledger. Average ${formatINR(Math.round(avg))}.`}>
          {[0, 1, 2, 3, 4].map((k) => (
            <g key={k}>
              <line x1={L} y1={yOf(k * step)} x2={W - R} y2={yOf(k * step)} style={{ stroke: 'var(--c-grid)' }} strokeWidth={1} />
              <text x={L - 8} y={yOf(k * step) + 3.5} textAnchor="end" fontSize={10} fontWeight={600} style={{ fill: 'rgb(var(--muted))' }}>{short(k * step)}</text>
            </g>
          ))}
          {trend.map((t, i) => {
            const x = xOf(i);
            let y = TOP + H;
            const h = (totals[i] / top) * H;
            const r = Math.min(4, h); // rounded data-end, square at the baseline
            return (
              <g key={t.period} opacity={hover !== null && hover !== i ? 0.45 : 1}>
                <clipPath id={`bar-${i}`}>
                  <path d={`M${x},${TOP + H} V${TOP + H - h + r} Q${x},${TOP + H - h} ${x + r},${TOP + H - h} H${x + barW - r} Q${x + barW},${TOP + H - h} ${x + barW},${TOP + H - h + r} V${TOP + H} Z`} />
                </clipPath>
                <g clipPath={`url(#bar-${i})`}>
                  {ledgers.map((l, li) => {
                    const sh = ((t.byLedger[l.key] || 0) / top) * H;
                    y -= sh;
                    return sh > 0 ? <rect key={l.key} x={x} y={y} width={barW} height={sh} style={{ fill: fillOf(li), stroke: 'rgb(var(--base))' }} strokeWidth={2} /> : null;
                  })}
                </g>
                {i === last && h > 0 && (
                  <>
                    <rect x={x - 3} y={TOP + H - h - 3} width={barW + 6} height={h + 3} rx={6} fill="none" style={{ stroke: 'rgb(var(--ink))' }} strokeWidth={1.5} />
                    <text x={x + barW / 2} y={TOP + H - h - 9} textAnchor="middle" fontSize={11} fontWeight={800} style={{ fill: 'rgb(var(--ink))' }}>{short(totals[i])}</text>
                  </>
                )}
                <text x={x + barW / 2} y={TOP + H + 16} textAnchor="middle" fontSize={10} fontWeight={i === last ? 800 : 600}
                  style={{ fill: i === last ? 'rgb(var(--ink))' : 'rgb(var(--muted))' }}>{periodLabel(t.period).slice(0, 3)}</text>
                {/* hit target: the whole column, bigger than the bar */}
                <rect x={L + i * slot} y={0} width={slot} height={TOP + H + 24} fill="transparent" tabIndex={0}
                  aria-label={`${periodLabel(t.period)}: ${formatINR(totals[i])}`}
                  onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
              </g>
            );
          })}
          {avg > 0 && (
            <g pointerEvents="none">
              <line x1={L} y1={yOf(avg)} x2={W - R} y2={yOf(avg)} style={{ stroke: 'rgb(var(--ink) / .7)' }} strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={W - R + 6} y={yOf(avg) + 3.5} textAnchor="start" fontSize={10} fontWeight={700} style={{ fill: 'rgb(var(--ink))' }}>avg {short(Math.round(avg))}</text>
            </g>
          )}
        </svg>
        {tip && (
          <div role="status" className="glass-pop pointer-events-none absolute top-2 z-10 min-w-[170px] rounded-2xl px-3.5 py-3 text-sm shadow-lg"
            // beside the bar, never over it: right of it in the first half, left of it in the second
            style={hover < n / 2 ? { left: `${((xOf(hover) + barW + 14) / W) * 100}%` } : { right: `${(1 - (xOf(hover) - 14) / W) * 100}%` }}>
            <div className="font-extrabold">{periodLabel(tip.period)}</div>
            <div className="mb-1.5 text-lg font-black tabnum">{formatINR(totals[hover])}</div>
            {ledgers.map((l, li) => (
              <div key={l.key} className="flex items-center gap-2 py-0.5">
                <Swatch fill={fillOf(li)} />
                <span className="font-black tabnum">{formatINR(tip.byLedger[l.key] || 0)}</span>
                <span className="truncate font-semibold text-muted">{l.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-bold text-muted">
        {ledgers.map((l, i) => (
          <span key={l.key} className="flex items-center gap-1.5"><Swatch fill={fillOf(i)} /> {l.name}</span>
        ))}
        <span className="flex items-center gap-1.5"><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" style={{ stroke: 'rgb(var(--ink) / .7)' }} strokeWidth="1.5" strokeDasharray="5 4" /></svg> 12-month average</span>
      </div>
    </>
  );
}

function ItemList({ title, items, empty }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black">{title}</h2>
        <span className="text-sm font-extrabold text-muted">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="py-6 text-center font-bold text-muted">{empty}</p> : (
        <ul className="max-h-80 space-y-3 overflow-y-auto p-1">
          {items.map((i, k) => (
            <li key={k} className="glass-in flex items-center justify-between gap-3 rounded-2xl p-3.5">
              <div className="min-w-0">
                <Link to={i.link} className="block truncate font-extrabold hover:underline">{i.title}</Link>
                <p className="text-sm font-semibold text-muted">{i.ledgerName} · {formatDate(i.date)}</p>
              </div>
              <span className="font-black tabnum">{formatINR(i.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getOverview().then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading>Loading overview…</Loading>;
  const { ledgers, totals, owedBack, trend, upcoming, overdueList, lentOut, debts } = data;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" sub={`All ledgers · ${periodLabel(data.month)}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Received" value={formatINR(totals.received)} note="Payments received this month" tone="paid" />
        <StatCard label="Pending" value={formatINR(totals.pending)} note="Due up to today, unpaid" tone="partial" />
        <StatCard label="Overdue" value={formatINR(totals.overdue)} note="Past due date, unpaid" tone="overdue" />
        <StatCard label="Owed back (not income)" value={formatINR(owedBack.advances + owedBack.credit)}
          note={`Advances ${formatINR(owedBack.advances)} · Credit ${formatINR(owedBack.credit)}`} tone="advance" />
        <StatCard label="Advance retained" value={formatINR(totals.advanceRetained)} note="Kept from advances this month" tone="neutral" />
        <StatCard label="Money lent out" value={formatINR(lentOut)} note="Principal on active loans" tone="neutral" />
        <StatCard label="I still owe" value={formatINR(debts.owed)} note={`Repaid ${formatINR(debts.repaidThisMonth)} this month`} tone="overdue" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ledgers.map((l, i) => (
          <Link key={l.key} to={ledgerPath(l.key)} className="glass block rounded-xl3 p-5 hover:-translate-y-0.5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
              <Swatch fill={fillOf(i)} />{l.name}
            </h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[['Received', l.received, 'paid'], ['Pending', l.pending, 'partial'], ['Overdue', l.overdue, 'overdue'], ...(l.key === 'lending' ? [] : [['Advance retained', l.advanceRetained, 'neutral']])].map(([k, v, tone]) => (
                <div key={k} className={`tone-${tone} rounded-2xl px-3 py-2`}>
                  <dt className="text-[11px] font-extrabold">{k}</dt>
                  <dd className="font-black tabnum">{formatINR(v)}</dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
        <Link to="/owe" className="glass block rounded-xl3 p-5 hover:-translate-y-0.5">
          <h2 className="mb-3 text-lg font-black">Money I owe</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="tone-overdue rounded-2xl px-3 py-2"><dt className="text-[11px] font-extrabold">Still owed</dt><dd className="font-black tabnum">{formatINR(debts.owed)}</dd></div>
            <div className="tone-paid rounded-2xl px-3 py-2"><dt className="text-[11px] font-extrabold">Repaid this month</dt><dd className="font-black tabnum">{formatINR(debts.repaidThisMonth)}</dd></div>
          </dl>
          {debts.people.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm font-semibold">
              {debts.people.map((p) => <li key={p.id} className="flex justify-between gap-3"><span className="truncate">{p.name}</span><span className="tabnum">{formatINR(p.left)} left</span></li>)}
            </ul>
          )}
        </Link>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-black">Received, last 12 months</h2>
        <TrendChart trend={trend} ledgers={ledgers} />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ItemList title="Overdue" items={overdueList} empty="Nothing overdue." />
        <ItemList title="Upcoming (next 7 days)" items={upcoming} empty="Nothing due in the next 7 days." />
      </div>
    </div>
  );
}

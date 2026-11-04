import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, StatCard, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatDate, periodLabel } from '../../lib/format';

// One color per ledger: accent blue, peach, then darker clay tones (contrast on the #e9e8f8 base).
const COLORS = ['#8db9f0', '#f5b69e', '#7fd3a8', '#f0cf7a', '#c3a8ee', '#e89aa0'];
const ledgerPath = (key) => (key === 'lending' ? '/lending' : `/c/${key.split(':')[1]}`);

function TrendChart({ trend, ledgers }) {
  const W = 600, H = 140, gap = 6;
  const n = trend.length;
  const barW = n ? (W - gap * (n + 1)) / n : 30;
  const totals = trend.map((t) => ledgers.reduce((s, l) => s + (t.byLedger[l.key] || 0), 0));
  const max = Math.max(...totals, 1);
  return (
    <>
      <div className="neu-in w-full overflow-x-auto rounded-3xl p-3">
        <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full min-w-[400px]" style={{ height: 180 }} role="img" aria-label="Twelve-month stacked bar chart of money received per ledger">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={0} y1={H - f * H} x2={W} y2={H - f * H} stroke="#d4d3ea" strokeWidth={1} />)}
          {trend.map((t, i) => {
            const x = gap + i * (barW + gap);
            let y = H;
            return (
              <g key={t.period}>
                <title>{`${periodLabel(t.period)}: received ${formatINR(totals[i])}${ledgers.map((l) => ` · ${l.name} ${formatINR(t.byLedger[l.key] || 0)}`).join('')}`}</title>
                {ledgers.map((l, li) => {
                  const h = ((t.byLedger[l.key] || 0) / max) * H;
                  y -= h;
                  return h > 0 ? <rect key={l.key} x={x} y={y} width={barW} height={h} fill={COLORS[li % COLORS.length]} /> : null;
                })}
                <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize={10} fill="#55607a" fontWeight={600}>{periodLabel(t.period).slice(0, 3)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-bold text-muted">
        {ledgers.map((l, i) => (
          <span key={l.key} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /> {l.name}</span>
        ))}
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
            <li key={k} className="neu-in flex items-center justify-between gap-3 rounded-2xl p-3.5">
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
  const { ledgers, totals, owedBack, trend, upcoming, overdueList } = data;

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
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ledgers.map((l, i) => (
          <Link key={l.key} to={ledgerPath(l.key)} className="neu block rounded-xl3 p-5 hover:-translate-y-0.5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
              <span className="h-3 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{l.name}
            </h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[['Received', l.received, 'paid'], ['Pending', l.pending, 'partial'], ['Overdue', l.overdue, 'overdue'], ['Advance retained', l.advanceRetained, 'neutral']].map(([k, v, tone]) => (
                <div key={k} className={`clay-${tone} rounded-2xl px-3 py-2`}>
                  <dt className="text-[11px] font-extrabold">{k}</dt>
                  <dd className="font-black tabnum">{formatINR(v)}</dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
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

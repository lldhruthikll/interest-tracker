import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, IndianRupee } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, StatCard, StatusPill, Select, Table, Loading, ErrorNote, PageHeader } from '../../components/ui';
import NotificationBanner from '../../components/NotificationBanner';
import PaymentModal from '../../components/PaymentModal';
import BorrowerFormModal from '../../components/BorrowerFormModal';
import { formatINR, formatDate, todayIST } from '../../lib/format';

export default function LendingDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBorrowerModalOpen, setIsBorrowerModalOpen] = useState(false);
  const [selectedBorrowerForPayment, setSelectedBorrowerForPayment] = useState(null);

  const [analyticsYear, setAnalyticsYear] = useState(() => Number(todayIST().slice(0, 4)));
  const [analyticsMonth, setAnalyticsMonth] = useState(() => Number(todayIST().slice(5, 7)));
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAnalytics = useCallback(async (year, month) => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsData(await api.getMonthlyAnalytics(year, month));
    } catch (err) {
      console.error('Analytics error:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setStats(await api.getDashboard());
    } catch (err) {
      setError(err.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);
  useEffect(() => { fetchAnalytics(analyticsYear, analyticsMonth); }, [analyticsYear, analyticsMonth, fetchAnalytics]);

  if (loading) return <Loading>Loading dashboard…</Loading>;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  const { summary, todaysDue = [], overdue = [], upcoming = [] } = stats || {};

  const filterList = (list) => {
    if (!search) return list;
    const term = search.toLowerCase();
    return list.filter((i) => i.borrowerName.toLowerCase().includes(term) || i.phone.includes(term));
  };
  const fToday = filterList(todaysDue);
  const fOverdue = filterList(overdue);
  const fUpcoming = filterList(upcoming);

  const openPayment = (bId) => {
    setSelectedBorrowerForPayment(bId);
    setIsPaymentModalOpen(true);
  };

  const dueRow = (item, sub, action, label) => (
    <li key={item.recordId} className="glass-in flex items-center justify-between gap-3 rounded-2xl p-3.5">
      <div className="min-w-0">
        <Link to={`/lending/borrowers/${item.borrowerId}`} className="block truncate font-extrabold hover:underline">{item.borrowerName}</Link>
        <p className="text-sm font-semibold text-muted">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-black tabnum">{formatINR(item.pendingAmount)}</span>
        <Button className="!px-3 !py-1.5 text-sm" onClick={action} aria-label={`${label} for ${item.borrowerName}`}>{label}</Button>
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Lending" sub="Interest collection and loan metrics">
        <Button variant="secondary" onClick={() => setIsBorrowerModalOpen(true)}><UserPlus size={16} /> Add Borrower</Button>
        <Button onClick={() => openPayment(null)}><IndianRupee size={16} /> Record Payment</Button>
      </PageHeader>

      <NotificationBanner todaysDue={todaysDue} onOpenPaymentModal={() => openPayment(null)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Interest Due Today" value={formatINR(summary?.todaysDueAmount)} note={`${summary?.todaysDueCount || 0} borrower(s) due today`} tone="neutral" />
        <StatCard label="Overdue Borrowers" value={summary?.overdueCount || 0} note={`Total overdue: ${formatINR(summary?.totalOverdueAmount)}`} tone="overdue" />
        <StatCard label="Upcoming (Next 7 Days)" value={summary?.upcomingCount || 0} note="Interest due within 7 days" tone="partial" />
        <StatCard label="Total Pending Interest" value={formatINR(summary?.totalPendingInterest)} note="Accumulated uncollected interest" tone="advance" />
        <StatCard label="Total Principal Lent" value={formatINR(summary?.totalPrincipalLent)} note="Across active loans" tone="paid" />
        <StatCard label="Total Active Loans" value={summary?.totalActiveLoans || 0} note="Currently generating interest" tone="neutral" />
      </div>

      <input type="search" aria-label="Search due items" className="field max-w-md" placeholder="Search due items by borrower name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">Today's Due Payments</h2>
            <span className="text-sm font-extrabold text-muted">{fToday.length} due</span>
          </div>
          {fToday.length === 0 ? <p className="py-8 text-center font-bold text-muted">No interest payments due today.</p> : (
            <ul className="max-h-80 space-y-3 overflow-y-auto p-1">
              {fToday.map((i) => dueRow(i, `${i.phone} • Period: ${i.periodName}`, () => openPayment(i.borrowerId), 'Collect'))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black">Overdue Borrowers</h2>
            <span className="text-sm font-extrabold text-muted">{fOverdue.length} overdue</span>
          </div>
          {fOverdue.length === 0 ? <p className="py-8 text-center font-bold text-muted">No overdue payments. All borrowers up to date.</p> : (
            <ul className="max-h-80 space-y-3 overflow-y-auto p-1">
              {fOverdue.map((i) => dueRow(i, `${i.periodName} (${i.daysOverdue} days late)`, () => openPayment(i.borrowerId), 'Pay Now'))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Upcoming Due Dates (Next 7 Days)</h2>
          <span className="text-sm font-extrabold text-muted">{fUpcoming.length} upcoming</span>
        </div>
        {fUpcoming.length === 0 ? <p className="py-6 text-center font-bold text-muted">No payments due in the next 7 days.</p> : (
          <ul className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2 lg:grid-cols-3">
            {fUpcoming.map((i) => (
              <li key={i.recordId} className="glass-in flex items-center justify-between gap-3 rounded-2xl p-3.5">
                <div className="min-w-0">
                  <Link to={`/lending/borrowers/${i.borrowerId}`} className="block truncate font-extrabold hover:underline">{i.borrowerName}</Link>
                  <p className="text-sm font-semibold text-muted">Due: {formatDate(i.dueDate)}</p>
                </div>
                <span className="font-black tabnum">{formatINR(i.pendingAmount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AnalyticsSection
        analyticsData={analyticsData}
        analyticsLoading={analyticsLoading}
        analyticsYear={analyticsYear}
        analyticsMonth={analyticsMonth}
        onYearChange={setAnalyticsYear}
        onMonthChange={setAnalyticsMonth}
      />

      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} onSuccess={fetchDashboardData} initialBorrowerId={selectedBorrowerForPayment} />
      <BorrowerFormModal isOpen={isBorrowerModalOpen} onClose={() => setIsBorrowerModalOpen(false)} onSuccess={fetchDashboardData} />
    </div>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COLLECTED = 'rgb(var(--c1))'; // solid ink
const PENDING = 'rgb(var(--c3))'; // light grey, outlined

function AnalyticsSection({ analyticsData, analyticsLoading, analyticsYear, analyticsMonth, onYearChange, onMonthChange }) {
  const currentYear = Number(todayIST().slice(0, 4));
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const { monthlyTrend = [], selectedMonthSummary = {}, borrowerBreakdown = [] } = analyticsData || {};
  const s = selectedMonthSummary;

  const chartW = 600;
  const chartH = 140;
  const barGap = 6;
  const barCount = monthlyTrend.length;
  const barW = barCount > 0 ? (chartW - barGap * (barCount + 1)) / barCount : 30;
  const maxVal = Math.max(...monthlyTrend.map((m) => m.totalExpected), 1);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  const columns = [
    { key: 'borrower', header: 'Borrower', render: (b) => <><span className="font-extrabold">{b.borrowerName}</span> <span className="text-muted">{b.phone}</span></> },
    { key: 'totalExpected', header: 'Expected', align: 'right', render: (b) => formatINR(b.totalExpected) },
    { key: 'totalCollected', header: 'Collected', align: 'right', render: (b) => formatINR(b.totalCollected) },
    { key: 'totalPending', header: 'Pending', align: 'right', render: (b) => formatINR(b.totalPending) },
    { key: 'status', header: 'Status', render: (b) => {
      const p = pct(b.totalCollected, b.totalExpected);
      return <StatusPill status={p >= 100 ? 'PAID' : p > 0 ? 'PARTIAL' : 'PENDING'} />;
    } },
  ];

  return (
    <Card className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-lg font-black">Monthly Interest Analytics</h2>
        <div className="flex items-center gap-3">
          <Select aria-label="Month" value={analyticsMonth} onChange={(e) => onMonthChange(parseInt(e.target.value))}
            options={MONTHS.map((name, i) => ({ value: i + 1, label: name }))} />
          <Select aria-label="Year" value={analyticsYear} onChange={(e) => onYearChange(parseInt(e.target.value))} options={years} />
        </div>
      </div>

      {analyticsLoading ? <Loading>Loading analytics…</Loading> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Expected" value={formatINR(s.totalExpected)} note={`${s.totalRecords || 0} records`} tone="neutral" />
            <StatCard label="Collected" value={formatINR(s.totalCollected)} note={`${pct(s.totalCollected, s.totalExpected)}% collected`} tone="paid" />
            <StatCard label="Pending" value={formatINR(s.totalPending)} note={s.totalExpected ? `${pct(s.totalPending, s.totalExpected)}% outstanding` : '—'} tone="advance" />
          </div>

          {monthlyTrend.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-extrabold text-muted">12-month trend</h3>
              <div className="glass-in w-full overflow-x-auto rounded-3xl p-3">
                <svg viewBox={`0 0 ${chartW} ${chartH + 30}`} className="w-full min-w-[400px]" style={{ height: 180 }} role="img"
                  aria-label="Twelve-month bar chart of interest collected and pending">
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                    <line key={f} x1={0} y1={chartH - f * chartH} x2={chartW} y2={chartH - f * chartH} style={{ stroke: 'var(--c-grid)' }} strokeWidth={1} />
                  ))}
                  {monthlyTrend.map((m, i) => {
                    const x = barGap + i * (barW + barGap);
                    const expectedH = (m.totalExpected / maxVal) * chartH;
                    const collectedH = (m.totalCollected / maxVal) * chartH;
                    const sel = m.month === analyticsMonth && m.year === analyticsYear;
                    return (
                      <g key={i}>
                        <title>{`${m.label}: collected ${formatINR(m.totalCollected)} of ${formatINR(m.totalExpected)}`}</title>
                        {/* full bar = expected; grey part visible above collected = pending */}
                        <rect x={x} y={chartH - expectedH} width={barW} height={expectedH} rx={3} style={{ fill: PENDING, stroke: sel ? 'rgb(var(--ink))' : 'rgb(var(--muted))' }} strokeWidth={sel ? 2 : 1} />
                        <rect x={x} y={chartH - collectedH} width={barW} height={collectedH} rx={3} style={{ fill: COLLECTED }} />
                        <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={10} fontWeight={sel ? 800 : 600} style={{ fill: sel ? 'rgb(var(--ink))' : 'rgb(var(--muted))' }}>{m.label}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="mt-2 flex items-center gap-5 text-sm font-bold text-muted">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-ink/40" style={{ background: COLLECTED }} /> Collected</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-muted" style={{ background: PENDING }} /> Pending</span>
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-extrabold text-muted">Borrower breakdown: {MONTHS[analyticsMonth - 1]} {analyticsYear}</h3>
            <Table columns={columns} rows={borrowerBreakdown.map((b) => ({ ...b, id: b.borrowerId }))} empty="No interest records for this month." />
          </div>
        </>
      )}
    </Card>
  );
}

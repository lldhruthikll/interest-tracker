import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import NotificationBanner from '../components/NotificationBanner';
import PaymentModal from '../components/PaymentModal';
import BorrowerFormModal from '../components/BorrowerFormModal';
import {
  Clock,
  AlertTriangle,
  Calendar,
  IndianRupee,
  TrendingUp,
  Landmark,
  Search,
  UserPlus,
  ArrowUpRight,
  Phone,
  BarChart2,
  ChevronDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBorrowerModalOpen, setIsBorrowerModalOpen] = useState(false);
  const [selectedBorrowerForPayment, setSelectedBorrowerForPayment] = useState(null);

  // --- Analytics state ---
  const now = new Date();
  const [analyticsYear, setAnalyticsYear] = useState(now.getFullYear());
  const [analyticsMonth, setAnalyticsMonth] = useState(now.getMonth() + 1);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAnalytics = useCallback(async (year, month) => {
    try {
      setAnalyticsLoading(true);
      const data = await api.getMonthlyAnalytics(year, month);
      setAnalyticsData(data);
    } catch (err) {
      console.error('Analytics error:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await api.getDashboard();
      setStats(data);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetchAnalytics(analyticsYear, analyticsMonth);
  }, [analyticsYear, analyticsMonth, fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mr-3" />
        Loading Dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
        {error}
      </div>
    );
  }

  const { summary, todaysDue = [], overdue = [], upcoming = [] } = stats || {};

  // Filter lists based on search
  const filterList = (list) => {
    if (!search) return list;
    const term = search.toLowerCase();
    return list.filter(
      (item) =>
        item.borrowerName.toLowerCase().includes(term) ||
        item.phone.includes(term)
    );
  };

  const filteredTodaysDue = filterList(todaysDue);
  const filteredOverdue = filterList(overdue);
  const filteredUpcoming = filterList(upcoming);

  const openPaymentForBorrower = (bId) => {
    setSelectedBorrowerForPayment(bId);
    setIsPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Executive Overview
          </h1>
          <p className="text-xs text-slate-400">
            Real-time interest collection & loan metrics
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsBorrowerModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center transition-colors"
          >
            <UserPlus className="w-4 h-4 mr-1.5 text-cyan-400" />
            Add Borrower
          </button>
          <button
            onClick={() => {
              setSelectedBorrowerForPayment(null);
              setIsPaymentModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center shadow-lg shadow-emerald-600/20 transition-all"
          >
            <IndianRupee className="w-4 h-4 mr-1.5" />
            Record Payment
          </button>
        </div>
      </div>

      {/* Notification Alert Banner for Today's Due */}
      <NotificationBanner
        todaysDue={todaysDue}
        onOpenPaymentModal={() => {
          setSelectedBorrowerForPayment(null);
          setIsPaymentModalOpen(true);
        }}
      />

      {/* 6 Required Dashboard Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Interest Due Today"
          value={`₹${summary?.todaysDueAmount || 0}`}
          subtext={`${summary?.todaysDueCount || 0} borrower(s) due today`}
          icon={Clock}
          color="cyan"
        />
        <StatCard
          title="Overdue Borrowers"
          value={summary?.overdueCount || 0}
          subtext={`Total overdue: ₹${summary?.totalOverdueAmount || 0}`}
          icon={AlertTriangle}
          color="rose"
        />
        <StatCard
          title="Upcoming (Next 7 Days)"
          value={summary?.upcomingCount || 0}
          subtext="Interest due within 7 days"
          icon={Calendar}
          color="amber"
        />
        <StatCard
          title="Total Pending Interest"
          value={`₹${summary?.totalPendingInterest || 0}`}
          subtext="Accumulated uncollected interest"
          icon={TrendingUp}
          color="indigo"
        />
        <StatCard
          title="Total Principal Lent"
          value={`₹${summary?.totalPrincipalLent || 0}`}
          subtext="Across active loans"
          icon={Landmark}
          color="emerald"
        />
        <StatCard
          title="Total Active Loans"
          value={summary?.totalActiveLoans || 0}
          subtext="Currently generating interest"
          icon={IndianRupee}
          color="cyan"
        />
      </div>

      {/* Real-time Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Search due items by borrower name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Main Lists Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Due List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold text-slate-100 flex items-center">
              <Clock className="w-4 h-4 mr-2 text-cyan-400" />
              Today's Due Payments
            </h3>
            <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded-full border border-cyan-500/20">
              {filteredTodaysDue.length} Due
            </span>
          </div>

          {filteredTodaysDue.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No interest payments due today.
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-80 pr-1">
              {filteredTodaysDue.map((item) => (
                <div
                  key={item.recordId}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 flex items-center justify-between transition-colors"
                >
                  <div>
                    <Link
                      to={`/borrowers/${item.borrowerId}`}
                      className="text-xs font-bold text-slate-100 hover:text-cyan-400 transition-colors flex items-center"
                    >
                      {item.borrowerName}
                      <ArrowUpRight className="w-3 h-3 ml-1 text-slate-500" />
                    </Link>
                    <p className="text-[11px] text-slate-400 flex items-center mt-0.5">
                      <Phone className="w-3 h-3 mr-1 text-slate-500" />
                      {item.phone} • Period: {item.periodName}
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-extrabold text-cyan-400">
                      ₹{item.pendingAmount}
                    </span>
                    <button
                      onClick={() => openPaymentForBorrower(item.borrowerId)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                    >
                      Collect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Borrowers List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold text-slate-100 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 text-rose-400" />
              Overdue Borrowers
            </h3>
            <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
              {filteredOverdue.length} Overdue
            </span>
          </div>

          {filteredOverdue.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No overdue payments. All borrowers up to date!
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-80 pr-1">
              {filteredOverdue.map((item) => (
                <div
                  key={item.recordId}
                  className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/20 hover:border-rose-500/40 flex items-center justify-between transition-colors"
                >
                  <div>
                    <Link
                      to={`/borrowers/${item.borrowerId}`}
                      className="text-xs font-bold text-slate-100 hover:text-rose-400 transition-colors flex items-center"
                    >
                      {item.borrowerName}
                      <ArrowUpRight className="w-3 h-3 ml-1 text-slate-500" />
                    </Link>
                    <p className="text-[11px] text-rose-300/80 mt-0.5">
                      {item.periodName} ({item.daysOverdue} days late)
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-extrabold text-rose-400">
                      ₹{item.pendingAmount}
                    </span>
                    <button
                      onClick={() => openPaymentForBorrower(item.borrowerId)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                    >
                      Pay Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Due Dates (Next 7 Days) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-extrabold text-slate-100 flex items-center">
            <Calendar className="w-4 h-4 mr-2 text-amber-400" />
            Upcoming Due Dates (Next 7 Days)
          </h3>
          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
            {filteredUpcoming.length} Upcoming
          </span>
        </div>

        {filteredUpcoming.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No payments due in the next 7 days.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredUpcoming.map((item) => (
              <div
                key={item.recordId}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/30 transition-colors flex items-center justify-between"
              >
                <div>
                  <Link
                    to={`/borrowers/${item.borrowerId}`}
                    className="text-xs font-bold text-slate-100 hover:text-amber-400 transition-colors"
                  >
                    {item.borrowerName}
                  </Link>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Due: {new Date(item.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs font-extrabold text-amber-400">
                  ₹{item.pendingAmount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Analytics Section ── */}
      <AnalyticsSection
        analyticsData={analyticsData}
        analyticsLoading={analyticsLoading}
        analyticsYear={analyticsYear}
        analyticsMonth={analyticsMonth}
        onYearChange={setAnalyticsYear}
        onMonthChange={setAnalyticsMonth}
      />

      {/* Modals */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={fetchDashboardData}
        initialBorrowerId={selectedBorrowerForPayment}
      />

      <BorrowerFormModal
        isOpen={isBorrowerModalOpen}
        onClose={() => setIsBorrowerModalOpen(false)}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}

// ─── Analytics Section Component ───────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function AnalyticsSection({
  analyticsData, analyticsLoading,
  analyticsYear, analyticsMonth,
  onYearChange, onMonthChange,
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const { monthlyTrend = [], selectedMonthSummary = {}, borrowerBreakdown = [] } =
    analyticsData || {};

  // SVG Bar Chart dimensions
  const chartW = 600;
  const chartH = 140;
  const barGap = 6;
  const barCount = monthlyTrend.length;
  const barW = barCount > 0 ? (chartW - barGap * (barCount + 1)) / barCount : 30;
  const maxVal = Math.max(...monthlyTrend.map((m) => m.totalExpected), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-slate-100 flex items-center">
          <BarChart2 className="w-4 h-4 mr-2 text-violet-400" />
          Monthly Interest Analytics
        </h3>
        <div className="flex items-center gap-2">
          {/* Month Selector */}
          <div className="relative">
            <select
              value={analyticsMonth}
              onChange={(e) => onMonthChange(parseInt(e.target.value))}
              className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg pl-3 pr-7 py-2 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              {MONTHS.map((name, i) => (
                <option key={i} value={i + 1}>{name}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
          </div>
          {/* Year Selector */}
          <div className="relative">
            <select
              value={analyticsYear}
              onChange={(e) => onYearChange(parseInt(e.target.value))}
              className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg pl-3 pr-7 py-2 focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {analyticsLoading ? (
        <div className="flex items-center justify-center h-32 text-slate-400 text-xs">
          <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full mr-2" />
          Loading analytics...
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Expected</p>
              <p className="text-lg font-black text-slate-100">
                ₹{(selectedMonthSummary.totalExpected || 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {selectedMonthSummary.totalRecords || 0} records
              </p>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-xl p-4 text-center">
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest mb-1">Collected</p>
              <p className="text-lg font-black text-emerald-400">
                ₹{(selectedMonthSummary.totalCollected || 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                {selectedMonthSummary.totalExpected
                  ? `${Math.round((selectedMonthSummary.totalCollected / selectedMonthSummary.totalExpected) * 100)}% collected`
                  : '0% collected'}
              </p>
            </div>
            <div className="bg-rose-950/30 border border-rose-500/20 rounded-xl p-4 text-center">
              <p className="text-[10px] text-rose-400 uppercase tracking-widest mb-1">Pending</p>
              <p className="text-lg font-black text-rose-400">
                ₹{(selectedMonthSummary.totalPending || 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-rose-600 mt-0.5">
                {selectedMonthSummary.totalExpected
                  ? `${Math.round((selectedMonthSummary.totalPending / selectedMonthSummary.totalExpected) * 100)}% outstanding`
                  : '—'}
              </p>
            </div>
          </div>

          {/* 12-Month SVG Bar Chart */}
          {monthlyTrend.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">12-Month Trend</p>
              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${chartW} ${chartH + 30}`}
                  className="w-full min-w-[400px]"
                  style={{ height: 180 }}
                >
                  {/* Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
                    <line
                      key={frac}
                      x1={0} y1={chartH - frac * chartH}
                      x2={chartW} y2={chartH - frac * chartH}
                      stroke="#1e293b" strokeWidth={1}
                    />
                  ))}

                  {monthlyTrend.map((m, i) => {
                    const x = barGap + i * (barW + barGap);
                    const expectedH = (m.totalExpected / maxVal) * chartH;
                    const collectedH = (m.totalCollected / maxVal) * chartH;
                    const isSelected =
                      m.month === analyticsMonth && m.year === analyticsYear;

                    return (
                      <g key={i}>
                        {/* Expected bar (background) */}
                        <rect
                          x={x}
                          y={chartH - expectedH}
                          width={barW}
                          height={expectedH}
                          rx={3}
                          fill={isSelected ? '#6d28d9' : '#334155'}
                          opacity={0.7}
                        />
                        {/* Collected bar (foreground) */}
                        <rect
                          x={x}
                          y={chartH - collectedH}
                          width={barW}
                          height={collectedH}
                          rx={3}
                          fill={isSelected ? '#10b981' : '#0f766e'}
                          opacity={0.9}
                        />
                        {/* Month label */}
                        <text
                          x={x + barW / 2}
                          y={chartH + 16}
                          textAnchor="middle"
                          fontSize={9}
                          fill={isSelected ? '#a78bfa' : '#64748b'}
                          fontWeight={isSelected ? '700' : '400'}
                        >
                          {m.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex items-center gap-5 mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-slate-600 opacity-70" />
                  <span className="text-[10px] text-slate-500">Expected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-teal-700" />
                  <span className="text-[10px] text-slate-500">Collected</span>
                </div>
              </div>
            </div>
          )}

          {/* Per-Borrower Breakdown */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">
              Borrower Breakdown — {MONTHS[analyticsMonth - 1]} {analyticsYear}
            </p>
            {borrowerBreakdown.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No interest records for this month.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-2.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Borrower</th>
                      <th className="pb-2.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-right">Expected</th>
                      <th className="pb-2.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-right">Collected</th>
                      <th className="pb-2.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-right">Pending</th>
                      <th className="pb-2.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {borrowerBreakdown.map((b) => {
                      const pct = b.totalExpected > 0
                        ? Math.round((b.totalCollected / b.totalExpected) * 100)
                        : 0;
                      const statusLabel =
                        pct >= 100 ? 'PAID' : pct > 0 ? 'PARTIAL' : 'PENDING';
                      const statusColor =
                        pct >= 100
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : pct > 0
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

                      return (
                        <tr key={b.borrowerId} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 pr-4">
                            <ArrowUpRight className="w-3 h-3 inline mr-1 text-slate-600" />
                            <span className="font-semibold text-slate-200">{b.borrowerName}</span>
                            <span className="ml-2 text-slate-500">{b.phone}</span>
                          </td>
                          <td className="py-2.5 text-right text-slate-300 font-mono">
                            ₹{b.totalExpected.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 text-right text-emerald-400 font-mono font-semibold">
                            ₹{b.totalCollected.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 text-right text-rose-400 font-mono font-semibold">
                            ₹{b.totalPending.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
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
  Plus,
  UserPlus,
  ArrowUpRight,
  Phone,
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

import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import BorrowerFormModal from '../components/BorrowerFormModal';
import PaymentModal from '../components/PaymentModal';
import { Search, UserPlus, Phone, MapPin, IndianRupee, ChevronRight, AlertCircle, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BorrowersPage() {
  const [borrowers, setBorrowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [isBorrowerModalOpen, setIsBorrowerModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState(null);

  const fetchBorrowers = async () => {
    try {
      setLoading(true);
      const data = await api.getBorrowers(search);
      setBorrowers(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch borrowers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBorrowers();
  }, [search]);

  const openPaymentModal = (bId) => {
    setSelectedBorrowerId(bId);
    setIsPaymentModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Borrowers Directory
          </h1>
          <p className="text-xs text-slate-400">
            Manage clients, loans, and collection status
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsBorrowerModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center shadow-lg shadow-cyan-600/20 transition-all"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add New Borrower
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Search by borrower name or phone number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mr-3" />
          Loading Borrowers...
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      ) : borrowers.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300">No borrowers found</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            {search ? 'Try adjusting your search term' : 'Get started by creating your first borrower'}
          </p>
          <button
            onClick={() => setIsBorrowerModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
          >
            Add Borrower
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {borrowers.map((b) => (
            <div
              key={b.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-100 hover:text-cyan-400 transition-colors">
                      <Link to={`/borrowers/${b.id}`}>{b.name}</Link>
                    </h3>
                    <p className="text-xs text-slate-400 flex items-center mt-1">
                      <Phone className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
                      {b.phone}
                    </p>
                    {b.address && (
                      <p className="text-xs text-slate-500 flex items-center mt-0.5 truncate">
                        <MapPin className="w-3.5 h-3.5 mr-1.5 text-slate-600 shrink-0" />
                        {b.address}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      b.activeLoansCount > 0
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {b.activeLoansCount} Active Loan(s)
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Total Principal
                    </span>
                    <span className="font-bold text-slate-200">₹{b.totalPrincipal}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Monthly Interest
                    </span>
                    <span className="font-bold text-cyan-400">₹{b.totalMonthlyInterest}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Pending Amount
                    </span>
                    <span
                      className={`font-extrabold ${
                        b.totalPendingInterest > 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      ₹{b.totalPendingInterest}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Next Due Date
                    </span>
                    <span className="font-semibold text-slate-300">
                      {b.nextDueDate
                        ? new Date(b.nextDueDate).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  onClick={() => openPaymentModal(b.id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors flex items-center"
                >
                  <IndianRupee className="w-3.5 h-3.5 mr-1" />
                  Pay
                </button>

                <Link
                  to={`/borrowers/${b.id}`}
                  className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center"
                >
                  View Profile
                  <ChevronRight className="w-4 h-4 ml-0.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <BorrowerFormModal
        isOpen={isBorrowerModalOpen}
        onClose={() => setIsBorrowerModalOpen(false)}
        onSuccess={fetchBorrowers}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={fetchBorrowers}
        initialBorrowerId={selectedBorrowerId}
      />
    </div>
  );
}

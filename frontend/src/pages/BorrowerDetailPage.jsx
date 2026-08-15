import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import LoanFormModal from '../components/LoanFormModal';
import PaymentModal from '../components/PaymentModal';
import BorrowerFormModal from '../components/BorrowerFormModal';
import {
  ArrowLeft,
  Phone,
  MapPin,
  FileText,
  IndianRupee,
  Plus,
  Landmark,
  Calendar,
  CheckCircle2,
  Clock,
  Edit,
  Trash2,
  CheckSquare,
  Square,
  History,
  Info,
} from 'lucide-react';

export default function BorrowerDetailPage() {
  const { id } = useParams();
  const [borrower, setBorrower] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanToEdit, setLoanToEdit] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState(null);
  const [isEditBorrowerModalOpen, setIsEditBorrowerModalOpen] = useState(false);

  const fetchBorrowerDetail = async () => {
    try {
      setLoading(true);
      const data = await api.getBorrowerById(id);
      setBorrower(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch borrower profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBorrowerDetail();
  }, [id]);

  const handleToggleLoanStatus = async (loanId, currentStatus) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    if (
      window.confirm(
        `Are you sure you want to mark this loan as ${nextStatus}?`
      )
    ) {
      try {
        await api.updateLoanStatus(loanId, nextStatus);
        fetchBorrowerDetail();
      } catch (err) {
        alert('Failed to update loan status: ' + err.message);
      }
    }
  };

  const handleOpenEditLoan = (loan) => {
    setLoanToEdit(loan);
    setIsLoanModalOpen(true);
  };

  const handleOpenAddLoan = () => {
    setLoanToEdit(null);
    setIsLoanModalOpen(true);
  };

  const handleDeleteLoan = async (loanId) => {
    if (
      window.confirm(
        'Are you sure you want to delete this loan? All interest records for this loan will be removed.'
      )
    ) {
      try {
        await api.deleteLoan(loanId);
        fetchBorrowerDetail();
      } catch (err) {
        alert('Failed to delete loan: ' + err.message);
      }
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment? Interest records will be reverted.')) {
      try {
        await api.deletePayment(paymentId);
        fetchBorrowerDetail();
      } catch (err) {
        alert('Failed to delete payment: ' + err.message);
      }
    }
  };

  const handleEditPayment = (payment) => {
    setPaymentToEdit(payment);
    setIsPaymentModalOpen(true);
  };

  const handleClearInterestRecord = async (record) => {
    const pendingAmount = record.amount - record.paidAmount;
    if (
      window.confirm(
        `Mark interest for ${record.periodName} (₹${pendingAmount}) as paid / cleared?`
      )
    ) {
      try {
        await api.clearInterestRecord(record.id);
        fetchBorrowerDetail();
      } catch (err) {
        alert('Failed to clear due record: ' + err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mr-3" />
        Loading Profile...
      </div>
    );
  }

  if (error || !borrower) {
    return (
      <div className="space-y-4">
        <Link
          to="/borrowers"
          className="inline-flex items-center text-xs text-cyan-400 font-bold hover:underline"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Borrowers
        </Link>
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error || 'Borrower not found'}
        </div>
      </div>
    );
  }

  const { summary = {}, loans = [], payments = [] } = borrower;

  return (
    <div className="space-y-6">
      {/* Top Back Navigation */}
      <Link
        to="/borrowers"
        className="inline-flex items-center text-xs text-slate-400 font-bold hover:text-cyan-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Borrowers List
      </Link>

      {/* Profile Header & Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight">
                {borrower.name}
              </h1>
              <button
                onClick={() => setIsEditBorrowerModalOpen(true)}
                title="Edit Borrower Info"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition-colors"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-400">
              <span className="flex items-center text-cyan-400 font-semibold">
                <Phone className="w-3.5 h-3.5 mr-1" />
                {borrower.phone}
              </span>
              {borrower.address && (
                <span className="flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1 text-slate-500" />
                  {borrower.address}
                </span>
              )}
            </div>

            {borrower.notes && (
              <p className="text-xs text-slate-500 mt-2 bg-slate-950 px-3 py-1.5 rounded-lg inline-block border border-slate-800">
                Notes: {borrower.notes}
              </p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={handleOpenAddLoan}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center shadow-lg shadow-blue-600/20 transition-all"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add New Loan
            </button>
            <button
              onClick={() => setIsPaymentModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center shadow-lg shadow-emerald-600/20 transition-all"
            >
              <IndianRupee className="w-4 h-4 mr-1.5" />
              Record Payment
            </button>
          </div>
        </div>

        {/* Financial Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Active Principal
            </span>
            <span className="text-lg font-black text-slate-100">
              ₹{summary.totalPrincipal || 0}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Monthly Interest
            </span>
            <span className="text-lg font-black text-cyan-400">
              ₹{summary.totalMonthlyInterest || 0}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Pending Interest
            </span>
            <span className="text-lg font-black text-rose-400">
              ₹{summary.totalPendingAmount || 0}
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Next Due Date
            </span>
            <span className="text-sm font-bold text-amber-400 mt-1 block">
              {summary.nextDueDate
                ? new Date(summary.nextDueDate).toLocaleDateString()
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Loans Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-100 flex items-center">
          <Landmark className="w-5 h-5 mr-2 text-cyan-400" />
          Loan Accounts ({loans.length})
        </h2>

        {loans.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
            No loans recorded for this borrower yet. Click "Add New Loan" to create one.
          </div>
        ) : (
          <div className="space-y-6">
            {loans.map((loan) => (
              <div
                key={loan.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl"
              >
                {/* Loan Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="text-base font-extrabold text-slate-100">
                        Principal: ₹{loan.principal}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          loan.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {loan.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                      <span>
                        Monthly Interest:{' '}
                        <strong className="text-cyan-400">₹{loan.monthlyInterest}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Start Date:{' '}
                        <strong className="text-slate-200">
                          {new Date(loan.startDate).toLocaleDateString()}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Due Day:{' '}
                        <strong className="text-amber-400">{loan.dueDay}th of every month</strong>
                      </span>
                    </p>
                  </div>

                  {/* Loan Actions: Edit, Delete, Close/Reopen */}
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => handleOpenEditLoan(loan)}
                      title="Edit Loan"
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center border border-slate-700 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                      Edit
                    </button>

                    <button
                      onClick={() => handleDeleteLoan(loan.id)}
                      title="Delete Loan"
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center border border-rose-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Delete
                    </button>

                    <button
                      onClick={() => handleToggleLoanStatus(loan.id, loan.status)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        loan.status === 'ACTIVE'
                          ? 'bg-slate-800 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border-slate-700 hover:border-rose-500/30'
                          : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {loan.status === 'ACTIVE' ? 'Close' : 'Re-open'}
                    </button>
                  </div>
                </div>

                {/* Monthly Interest Schedule Table with Checkbox / One-click Clear Due */}
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Monthly Interest Ledger (Check to Clear Due)
                  </h4>

                  {loan.interestRecords.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No monthly interest due yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-800">
                            <th className="pb-2 font-bold uppercase w-12 text-center">Clear</th>
                            <th className="pb-2 font-bold uppercase">Period</th>
                            <th className="pb-2 font-bold uppercase">Due Date</th>
                            <th className="pb-2 font-bold uppercase">Amount Due</th>
                            <th className="pb-2 font-bold uppercase">Paid</th>
                            <th className="pb-2 font-bold uppercase">Pending</th>
                            <th className="pb-2 font-bold uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {loan.interestRecords.map((rec) => {
                            const pending = rec.amount - rec.paidAmount;
                            const isPaid = rec.status === 'PAID';

                            return (
                              <tr key={rec.id} className="hover:bg-slate-950/50 transition-colors">
                                {/* Checkbox / Clear Due Action */}
                                <td className="py-2.5 text-center">
                                  {isPaid ? (
                                    <span title="Paid / Cleared">
                                      <CheckSquare className="w-4 h-4 text-emerald-400 mx-auto" />
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleClearInterestRecord(rec)}
                                      title={`Click to mark ${rec.periodName} (₹${pending}) as Cleared / Paid`}
                                      className="text-slate-500 hover:text-emerald-400 transition-colors p-0.5"
                                    >
                                      <Square className="w-4 h-4 mx-auto" />
                                    </button>
                                  )}
                                </td>
                                <td className="py-2.5 font-bold text-slate-200">{rec.periodName}</td>
                                <td className="py-2.5 text-slate-400">
                                  {new Date(rec.dueDate).toLocaleDateString()}
                                </td>
                                <td className="py-2.5 font-semibold text-slate-300">₹{rec.amount}</td>
                                <td className="py-2.5 font-semibold text-emerald-400">₹{rec.paidAmount}</td>
                                <td
                                  className={`py-2.5 font-bold ${
                                    pending > 0 ? 'text-rose-400' : 'text-slate-500'
                                  }`}
                                >
                                  ₹{pending}
                                </td>
                                <td className="py-2.5">
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                        isPaid
                                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                          : rec.status === 'PARTIALLY_PAID'
                                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                      }`}
                                    >
                                      {rec.status}
                                    </span>
                                    {!isPaid && (
                                      <button
                                        onClick={() => handleClearInterestRecord(rec)}
                                        className="text-[10px] text-emerald-400 hover:underline font-bold"
                                      >
                                        Mark Paid
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment History Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-lg font-extrabold text-slate-100 flex items-center mb-4">
          <History className="w-5 h-5 mr-2 text-emerald-400" />
          Payment History ({payments.length})
        </h2>

        {payments.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">
            No payments recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-bold uppercase">Date</th>
                  <th className="pb-2 font-bold uppercase">Amount Paid</th>
                  <th className="pb-2 font-bold uppercase">Allocated Periods (FIFO)</th>
                  <th className="pb-2 font-bold uppercase">Notes</th>
                  <th className="pb-2 font-bold uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {payments.map((p) => {
                  const periodsText = p.allocations
                    .map(
                      (a) =>
                        `${a.interestRecord?.periodName || 'Period'} (₹${a.amount})`
                    )
                    .join(', ');

                  return (
                    <tr key={p.id} className="hover:bg-slate-950/50 transition-colors">
                      <td className="py-3 font-semibold text-slate-300">
                        {new Date(p.paymentDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 font-black text-emerald-400">₹{p.amount}</td>
                      <td className="py-3 text-slate-400 font-medium">
                        {periodsText || 'General Payment'}
                      </td>
                      <td className="py-3 text-slate-500">{p.notes || '-'}</td>
                      <td className="py-3">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditPayment(p)}
                            title="Edit Payment"
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/30 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            title="Delete Payment"
                            className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <LoanFormModal
        isOpen={isLoanModalOpen}
        onClose={() => {
          setIsLoanModalOpen(false);
          setLoanToEdit(null);
        }}
        onSuccess={fetchBorrowerDetail}
        borrowerId={borrower.id}
        borrowerName={borrower.name}
        loanToEdit={loanToEdit}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentToEdit(null);
        }}
        onSuccess={fetchBorrowerDetail}
        initialBorrowerId={borrower.id}
        paymentToEdit={paymentToEdit}
      />

      <BorrowerFormModal
        isOpen={isEditBorrowerModalOpen}
        onClose={() => setIsEditBorrowerModalOpen(false)}
        onSuccess={fetchBorrowerDetail}
        borrowerToEdit={borrower}
      />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { X, IndianRupee, Info, Edit } from 'lucide-react';
import { api } from '../api/client';

export default function PaymentModal({ isOpen, onClose, onSuccess, initialBorrowerId = null, paymentToEdit = null }) {
  const isEditMode = Boolean(paymentToEdit);

  const [borrowers, setBorrowers] = useState([]);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState(initialBorrowerId || '');
  const [loans, setLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (isEditMode) {
        // Pre-fill from existing payment
        setAmount(paymentToEdit.amount || '');
        setNotes(paymentToEdit.notes || '');
        setPaymentDate(
          paymentToEdit.paymentDate
            ? new Date(paymentToEdit.paymentDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]
        );
        setSelectedBorrowerId(paymentToEdit.borrowerId || '');
        setSelectedLoanId(paymentToEdit.loanId || '');
      } else {
        api.getBorrowers().then((data) => {
          setBorrowers(data);
          if (initialBorrowerId) {
            setSelectedBorrowerId(initialBorrowerId);
          } else if (data.length > 0) {
            setSelectedBorrowerId(data[0].id);
          }
        });
      }
    }
  }, [isOpen, initialBorrowerId, isEditMode, paymentToEdit]);

  useEffect(() => {
    if (selectedBorrowerId && !isEditMode) {
      api.getBorrowerById(selectedBorrowerId).then((borrower) => {
        setLoans(borrower.loans || []);
        setSelectedLoanId('');
      });
    } else {
      setLoans([]);
    }
  }, [selectedBorrowerId, isEditMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }

    try {
      setSubmitting(true);

      if (isEditMode) {
        await api.updatePayment(paymentToEdit.id, {
          amount: Number(amount),
          notes,
          paymentDate,
        });
      } else {
        if (!selectedBorrowerId) {
          setError('Please select a borrower');
          return;
        }
        await api.recordPayment({
          borrowerId: Number(selectedBorrowerId),
          loanId: selectedLoanId ? Number(selectedLoanId) : null,
          amount: Number(amount),
          notes,
          paymentDate,
        });
      }

      onSuccess();
      onClose();
      setAmount('');
      setNotes('');
    } catch (err) {
      setError(err.message || 'Failed to save payment');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBorrowerObj = borrowers.find((b) => Number(b.id) === Number(selectedBorrowerId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isEditMode ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
              {isEditMode ? <Edit className="w-5 h-5" /> : <IndianRupee className="w-5 h-5" />}
            </div>
            <h3 className="text-lg font-bold text-slate-100">
              {isEditMode ? 'Edit Payment' : 'Record Payment'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {isEditMode ? (
            /* Edit mode: show locked info banner */
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-3 text-xs text-amber-300">
              <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                <strong>Editing payment:</strong> Changing the amount will automatically reverse and redo the FIFO interest allocation.
              </span>
            </div>
          ) : (
            /* Create mode: FIFO notice */
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-start space-x-3 text-xs text-cyan-300">
              <Info className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
              <span>
                <strong>FIFO Payment Allocation:</strong> Payment will automatically pay off the oldest pending monthly interest records first.
              </span>
            </div>
          )}

          {/* Borrower Selector — only in create mode */}
          {!isEditMode && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                Borrower *
              </label>
              <select
                value={selectedBorrowerId}
                onChange={(e) => setSelectedBorrowerId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                required
              >
                <option value="">Select Borrower</option>
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.phone}) {b.totalPendingInterest > 0 ? `- Pending: ₹${b.totalPendingInterest}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Specific Loan Selector — only in create mode */}
          {!isEditMode && loans.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                Loan (Optional - Auto distributes if left empty)
              </label>
              <select
                value={selectedLoanId}
                onChange={(e) => setSelectedLoanId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="">All Loans (Auto-distribute)</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    Principal: ₹{l.principal} | Monthly: ₹{l.monthlyInterest} | Due Day: {l.dueDay}th
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              Payment Amount (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">₹</span>
              <input
                type="number"
                step="any"
                placeholder="e.g. 8000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-semibold text-emerald-400 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>

          {/* Date & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Cash / UPI"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-5 py-2 rounded-xl text-white text-sm font-bold shadow-lg transition-all ${isEditMode ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'}`}
            >
              {submitting
                ? isEditMode ? 'Saving...' : 'Recording...'
                : isEditMode ? 'Save Changes' : 'Submit Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


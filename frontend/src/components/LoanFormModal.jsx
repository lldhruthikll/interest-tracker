import React, { useState, useEffect } from 'react';
import { X, Landmark, Calendar as CalendarIcon, Calculator, Percent, Edit } from 'lucide-react';
import { api } from '../api/client';

export default function LoanFormModal({
  isOpen,
  onClose,
  onSuccess,
  borrowerId,
  borrowerName,
  loanToEdit = null,
}) {
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyInterest, setMonthlyInterest] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loanToEdit) {
      setPrincipal(loanToEdit.principal ? loanToEdit.principal.toString() : '');
      setMonthlyInterest(
        loanToEdit.monthlyInterest ? loanToEdit.monthlyInterest.toString() : ''
      );
      if (loanToEdit.startDate) {
        setStartDate(new Date(loanToEdit.startDate).toISOString().split('T')[0]);
      }
      setNotes(loanToEdit.notes || '');

      // Calculate implied rate if principal & monthlyInterest exist
      if (loanToEdit.principal && loanToEdit.monthlyInterest) {
        const rate = (loanToEdit.monthlyInterest / loanToEdit.principal) * 100;
        setInterestRate(rate % 1 === 0 ? rate.toString() : rate.toFixed(2));
      }
    } else {
      setPrincipal('');
      setInterestRate('');
      setMonthlyInterest('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setNotes('');
    }
  }, [loanToEdit, isOpen]);

  if (!isOpen) return null;

  // Calculate monthly interest from principal and interest rate (%)
  const handleRateChange = (rateVal, pVal = principal) => {
    setInterestRate(rateVal);
    if (rateVal !== '' && pVal !== '' && !isNaN(Number(pVal)) && !isNaN(Number(rateVal))) {
      const calculated = (Number(pVal) * Number(rateVal)) / 100;
      setMonthlyInterest(calculated % 1 === 0 ? calculated.toString() : calculated.toFixed(2));
    }
  };

  const handlePrincipalChange = (pVal) => {
    setPrincipal(pVal);
    if (interestRate !== '' && pVal !== '' && !isNaN(Number(pVal)) && !isNaN(Number(interestRate))) {
      const calculated = (Number(pVal) * Number(interestRate)) / 100;
      setMonthlyInterest(calculated % 1 === 0 ? calculated.toString() : calculated.toFixed(2));
    }
  };

  const handleManualInterestChange = (val) => {
    setMonthlyInterest(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!principal || !monthlyInterest || !startDate) {
      setError('Principal, Monthly Interest Amount, and Start Date are required');
      return;
    }

    try {
      setSubmitting(true);
      if (loanToEdit) {
        await api.updateLoan(loanToEdit.id, {
          principal: Number(principal),
          monthlyInterest: Number(monthlyInterest),
          startDate,
          notes,
        });
      } else {
        await api.createLoan({
          borrowerId: Number(borrowerId),
          principal: Number(principal),
          monthlyInterest: Number(monthlyInterest),
          startDate,
          notes,
        });
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save loan');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDate = new Date(startDate);
  const dueDay = isNaN(selectedDate.getTime()) ? null : selectedDate.getDate();
  const presetRates = [1, 1.5, 2, 2.5, 3, 5];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              {loanToEdit ? <Edit className="w-5 h-5" /> : <Landmark className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">
                {loanToEdit ? 'Edit Loan Details' : 'Add New Loan'}
              </h3>
              <p className="text-xs text-slate-400">For {borrowerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {/* Principal */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              Principal Amount (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">₹</span>
              <input
                type="number"
                step="any"
                placeholder="e.g. 100000"
                value={principal}
                onChange={(e) => handlePrincipalChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Percentage Interest Rate Calculator section */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-cyan-400 flex items-center uppercase tracking-wider">
                <Calculator className="w-3.5 h-3.5 mr-1.5" />
                Interest Rate Calculator (% per month)
              </label>
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                placeholder="Enter % per month (e.g. 2.5)"
                value={interestRate}
                onChange={(e) => handleRateChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-3.5 pr-8 py-2 text-xs font-semibold text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <Percent className="w-3.5 h-3.5 absolute right-3 top-2.5 text-cyan-500" />
            </div>

            {/* Quick Preset Percentage Buttons */}
            <div className="flex items-center space-x-1.5 pt-0.5">
              <span className="text-[10px] text-slate-500 font-semibold mr-1">Quick %:</span>
              {presetRates.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleRateChange(rate.toString())}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors ${
                    interestRate === rate.toString()
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-extrabold'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-cyan-500/50'
                  }`}
                >
                  {rate}%
                </button>
              ))}
            </div>
          </div>

          {/* Monthly Interest Amount (Auto-calculated or Manual) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase">
                Monthly Interest Amount (₹) *
              </label>
              {interestRate && principal && monthlyInterest && (
                <span className="text-[11px] font-bold text-emerald-400">
                  {interestRate}% of ₹{principal}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">₹</span>
              <input
                type="number"
                step="any"
                placeholder="e.g. 3000"
                value={monthlyInterest}
                onChange={(e) => handleManualInterestChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3.5 py-2.5 text-sm font-bold text-cyan-400 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                required
              />
            </div>
          </div>

          {/* Loan Start Date & Automatic Due Date Banner */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              Loan Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              required
            />
            {dueDay && (
              <p className="mt-1.5 text-xs text-amber-400 font-medium flex items-center">
                <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                Interest will automatically be due on the {dueDay}th of every month.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
              Loan Notes / Asset Details (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Collateral / Agreement details"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

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
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-600/20 transition-all"
            >
              {submitting
                ? 'Saving...'
                : loanToEdit
                ? 'Update Loan Details'
                : 'Create Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

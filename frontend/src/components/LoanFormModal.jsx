import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Modal, Button, Field, ErrorNote, InsetCard } from './ui';
import { todayIST, toDateInput } from '../lib/format';

const PRESET_RATES = [1, 1.5, 2, 2.5, 3, 5];
const calc = (p, r) => {
  const v = (Number(p) * Number(r)) / 100;
  return v % 1 === 0 ? v.toString() : v.toFixed(2);
};
const valid = (p, r) => p !== '' && r !== '' && !isNaN(Number(p)) && !isNaN(Number(r));

export default function LoanFormModal({ isOpen, onClose, onSuccess, borrowerId, borrowerName, loanToEdit = null }) {
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyInterest, setMonthlyInterest] = useState('');
  const [startDate, setStartDate] = useState(todayIST());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    if (loanToEdit) {
      setPrincipal(loanToEdit.principal ? loanToEdit.principal.toString() : '');
      setMonthlyInterest(loanToEdit.monthlyInterest ? loanToEdit.monthlyInterest.toString() : '');
      setStartDate(loanToEdit.startDate ? toDateInput(loanToEdit.startDate) : todayIST());
      setNotes(loanToEdit.notes || '');
      if (loanToEdit.principal && loanToEdit.monthlyInterest) {
        const rate = (loanToEdit.monthlyInterest / loanToEdit.principal) * 100;
        setInterestRate(rate % 1 === 0 ? rate.toString() : rate.toFixed(2));
      } else setInterestRate('');
    } else {
      setPrincipal('');
      setInterestRate('');
      setMonthlyInterest('');
      setStartDate(todayIST());
      setNotes('');
    }
  }, [loanToEdit, isOpen]);

  const handleRateChange = (rate) => {
    setInterestRate(rate);
    if (valid(principal, rate)) setMonthlyInterest(calc(principal, rate));
  };
  const handlePrincipalChange = (p) => {
    setPrincipal(p);
    if (valid(p, interestRate)) setMonthlyInterest(calc(p, interestRate));
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
      const body = { principal: Number(principal), monthlyInterest: Number(monthlyInterest), startDate, notes };
      if (loanToEdit) await api.updateLoan(loanToEdit.id, body);
      else await api.createLoan({ borrowerId: Number(borrowerId), ...body });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save loan');
    } finally {
      setSubmitting(false);
    }
  };

  // startDate is 'YYYY-MM-DD': read the day from the string, no Date parsing.
  const dueDay = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? Number(startDate.slice(8)) : null;

  return (
    <Modal open={isOpen} onClose={onClose} title={`${loanToEdit ? 'Edit Loan Details' : 'Add New Loan'} for ${borrowerName ?? ''}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Principal amount (₹) *" type="number" step="any" placeholder="e.g. 100000" value={principal} onChange={(e) => handlePrincipalChange(e.target.value)} required />

        <InsetCard className="space-y-3 !p-4">
          <Field label="Interest rate calculator (% per month)" type="number" step="any" placeholder="e.g. 2.5" value={interestRate} onChange={(e) => handleRateChange(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-extrabold text-muted">Quick %:</span>
            {PRESET_RATES.map((r) => {
              const on = interestRate === r.toString();
              return (
                <button key={r} type="button" aria-pressed={on} onClick={() => handleRateChange(r.toString())}
                  className={`rounded-full px-3 py-1 text-sm font-bold ${on ? 'neu-in text-accent-ink' : 'neu text-muted'}`}>
                  {r}%
                </button>
              );
            })}
          </div>
        </InsetCard>

        <div>
          <Field label="Monthly interest amount (₹) *" type="number" step="any" placeholder="e.g. 3000" value={monthlyInterest} onChange={(e) => setMonthlyInterest(e.target.value)} required />
          {interestRate && principal && monthlyInterest && (
            <p className="mt-1 text-sm font-bold text-muted">{interestRate}% of ₹{principal}</p>
          )}
        </div>

        <div>
          <Field label="Loan start date *" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          {dueDay && <p className="mt-1 text-sm font-bold text-muted">Interest will automatically be due on the {dueDay}th of every month.</p>}
        </div>

        <Field label="Loan notes / asset details (optional)" placeholder="e.g. Collateral / agreement details" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : loanToEdit ? 'Update Loan Details' : 'Create Loan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

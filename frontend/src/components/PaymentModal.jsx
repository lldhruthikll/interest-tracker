import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Modal, Button, Field, Select, ErrorNote, InsetCard } from './ui';
import { formatINR, todayIST, toDateInput } from '../lib/format';

export default function PaymentModal({ isOpen, onClose, onSuccess, initialBorrowerId = null, paymentToEdit = null }) {
  const isEditMode = Boolean(paymentToEdit);

  const [borrowers, setBorrowers] = useState([]);
  const [selectedBorrowerId, setSelectedBorrowerId] = useState(initialBorrowerId || '');
  const [loans, setLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIST());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (isEditMode) {
      setAmount(paymentToEdit.amount != null ? String(paymentToEdit.amount) : '');
      setNotes(paymentToEdit.notes || '');
      setPaymentDate(paymentToEdit.paymentDate ? toDateInput(paymentToEdit.paymentDate) : todayIST());
      setSelectedBorrowerId(paymentToEdit.borrowerId || '');
      setSelectedLoanId(paymentToEdit.loanId || '');
    } else {
      setAmount('');
      setNotes('');
      setPaymentDate(todayIST());
      api.getBorrowers().then((data) => {
        setBorrowers(data);
        if (initialBorrowerId) setSelectedBorrowerId(initialBorrowerId);
        else if (data.length > 0) setSelectedBorrowerId(data[0].id);
      }).catch((err) => setError(err.message || 'Failed to load borrowers'));
    }
  }, [isOpen, initialBorrowerId, isEditMode, paymentToEdit]);

  useEffect(() => {
    if (selectedBorrowerId && !isEditMode && isOpen) {
      api.getBorrowerById(selectedBorrowerId).then((b) => {
        setLoans(b.loans || []);
        setSelectedLoanId('');
      }).catch((err) => setError(err.message || 'Failed to load loans'));
    } else {
      setLoans([]);
    }
  }, [selectedBorrowerId, isEditMode, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!isEditMode && !selectedBorrowerId) {
      setError('Please select a borrower');
      return;
    }
    try {
      setSubmitting(true);
      if (isEditMode) {
        await api.updatePayment(paymentToEdit.id, { amount: Number(amount), notes, paymentDate });
      } else {
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
    } catch (err) {
      setError(err.message || 'Failed to save payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={isEditMode ? 'Edit Payment' : 'Record Payment'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <InsetCard className="!p-4 text-sm font-semibold text-muted">
          {isEditMode
            ? <><strong className="text-ink">Editing payment:</strong> changing the amount will automatically reverse and redo the FIFO interest allocation.</>
            : <><strong className="text-ink">FIFO payment allocation:</strong> the payment automatically pays off the oldest pending monthly interest records first.</>}
        </InsetCard>

        {!isEditMode && (
          <Select label="Borrower *" value={selectedBorrowerId} onChange={(e) => setSelectedBorrowerId(e.target.value)} required>
            <option value="">Select borrower</option>
            {borrowers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.phone}){b.totalPendingInterest > 0 ? ` - Pending: ${formatINR(b.totalPendingInterest)}` : ''}
              </option>
            ))}
          </Select>
        )}

        {!isEditMode && loans.length > 0 && (
          <Select label="Loan (optional, auto-distributes if left empty)" value={selectedLoanId} onChange={(e) => setSelectedLoanId(e.target.value)}>
            <option value="">All loans (auto-distribute)</option>
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                Principal: {formatINR(l.principal)} | Monthly: {formatINR(l.monthlyInterest)} | Due day: {l.dueDay}th
              </option>
            ))}
          </Select>
        )}

        <Field label="Payment amount (₹) *" type="number" step="any" placeholder="e.g. 8000" value={amount} onChange={(e) => setAmount(e.target.value)} required />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <Field label="Notes (optional)" placeholder="e.g. Cash / UPI" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (isEditMode ? 'Saving…' : 'Recording…') : isEditMode ? 'Save Changes' : 'Submit Payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

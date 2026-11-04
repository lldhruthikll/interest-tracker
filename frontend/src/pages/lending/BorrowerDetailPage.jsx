import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Plus, IndianRupee, Pencil, Trash2, Square, CheckSquare } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, StatCard, StatusPill, Table, EmptyState, Loading, ErrorNote } from '../../components/ui';
import LoanFormModal from '../../components/LoanFormModal';
import PaymentModal from '../../components/PaymentModal';
import BorrowerFormModal from '../../components/BorrowerFormModal';
import { formatINR, formatDate, formatAnyDate } from '../../lib/format';

export default function BorrowerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [borrower, setBorrower] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanToEdit, setLoanToEdit] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentToEdit, setPaymentToEdit] = useState(null);
  const [isEditBorrowerModalOpen, setIsEditBorrowerModalOpen] = useState(false);

  const fetchBorrowerDetail = async () => {
    try {
      setLoading(true);
      setError('');
      setBorrower(await api.getBorrowerById(id));
    } catch (err) {
      setError(err.message || 'Failed to fetch borrower profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBorrowerDetail(); }, [id]);

  // Confirm, run the call, refresh; API {error} text is shown inline.
  const act = async (message, call, failPrefix, after = fetchBorrowerDetail) => {
    if (!window.confirm(message)) return;
    try {
      setActionError('');
      await call();
      after();
    } catch (err) {
      setActionError(`${failPrefix}: ${err.message}`);
    }
  };

  const handleToggleLoanStatus = (loanId, status) => {
    const next = status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    return act(`Are you sure you want to mark this loan as ${next}?`, () => api.updateLoanStatus(loanId, next), 'Failed to update loan status');
  };
  const handleDeleteLoan = (loanId) =>
    act('Are you sure you want to delete this loan? All interest records for this loan will be removed.', () => api.deleteLoan(loanId), 'Failed to delete loan');
  const handleDeletePayment = (paymentId) =>
    act('Are you sure you want to delete this payment? Interest records will be reverted.', () => api.deletePayment(paymentId), 'Failed to delete payment');
  const handleClearInterestRecord = (rec) =>
    act(`Mark interest for ${rec.periodName} (${formatINR(rec.amount - rec.paidAmount)}) as paid / cleared?`, () => api.clearInterestRecord(rec.id), 'Failed to clear due record');
  const handleDeleteBorrower = () =>
    act(`Delete borrower ${borrower.name}? This cannot be undone.`, () => api.deleteBorrower(borrower.id), 'Failed to delete borrower', () => navigate('/lending/borrowers'));

  if (loading && !borrower) return <Loading>Loading profile…</Loading>;

  if (error || !borrower) {
    return (
      <div className="space-y-4">
        <Link to="/lending/borrowers" className="font-extrabold text-ink hover:underline">Back to borrowers</Link>
        <ErrorNote>{error || 'Borrower not found'}</ErrorNote>
      </div>
    );
  }

  const { summary = {}, loans = [], payments = [] } = borrower;

  const ledgerColumns = () => [
    { key: 'clear', header: 'Clear', render: (rec) => rec.status === 'PAID'
      ? <CheckSquare size={20} aria-label="Paid" role="img" />
      : <button type="button" onClick={() => handleClearInterestRecord(rec)} aria-label={`Mark ${rec.periodName} as paid`} className="rounded p-0.5"><Square size={20} /></button> },
    { key: 'periodName', header: 'Period', render: (rec) => <span className="font-extrabold">{rec.periodName}</span> },
    { key: 'dueDate', header: 'Due date', render: (rec) => formatDate(rec.dueDate) },
    { key: 'amount', header: 'Amount due', align: 'right', render: (rec) => formatINR(rec.amount) },
    { key: 'paidAmount', header: 'Paid', align: 'right', render: (rec) => formatINR(rec.paidAmount) },
    { key: 'pending', header: 'Pending', align: 'right', render: (rec) => formatINR(rec.amount - rec.paidAmount) },
    { key: 'status', header: 'Status', render: (rec) => (
      <span className="flex items-center gap-2">
        <StatusPill status={rec.status} />
        {rec.status !== 'PAID' && <button type="button" onClick={() => handleClearInterestRecord(rec)} className="text-sm font-extrabold text-ink underline">Mark paid</button>}
      </span>
    ) },
  ];

  const paymentColumns = [
    { key: 'date', header: 'Date', render: (p) => formatAnyDate(p.paymentDate) },
    { key: 'amount', header: 'Amount paid', align: 'right', render: (p) => <span className="font-black">{formatINR(p.amount)}</span> },
    { key: 'alloc', header: 'Allocated periods (FIFO)', render: (p) => p.allocations
      .map((a) => `${a.interestRecord?.periodName || 'Period'} (${formatINR(a.amount)})`).join(', ') || 'General Payment' },
    { key: 'notes', header: 'Notes', render: (p) => p.notes || '-' },
    { key: 'actions', header: 'Actions', render: (p) => (
      <span className="flex gap-2">
        <button type="button" className="btn !p-2" aria-label="Edit payment" title="Edit payment" onClick={() => { setPaymentToEdit(p); setIsPaymentModalOpen(true); }}><Pencil size={16} /></button>
        <button type="button" className="btn !p-2" aria-label="Delete payment" title="Delete payment" onClick={() => handleDeletePayment(p.id)}><Trash2 size={16} /></button>
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <Link to="/lending/borrowers" className="inline-block font-extrabold text-ink hover:underline">Back to borrowers list</Link>

      <Card>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-2xl font-black">
              {borrower.name}
              <button type="button" className="btn !p-2" aria-label="Edit borrower info" title="Edit borrower info" onClick={() => setIsEditBorrowerModalOpen(true)}><Pencil size={16} /></button>
              <button type="button" className="btn !p-2" aria-label="Delete borrower" title="Delete borrower" onClick={handleDeleteBorrower}><Trash2 size={16} /></button>
            </h1>
            <p className="mt-1 font-semibold text-muted">{borrower.phone}{borrower.address ? ` • ${borrower.address}` : ''}</p>
            {borrower.notes && <p className="glass-in mt-2 inline-block rounded-xl px-3 py-1.5 text-sm font-semibold text-muted">Notes: {borrower.notes}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => { setLoanToEdit(null); setIsLoanModalOpen(true); }}><Plus size={16} /> Add New Loan</Button>
            <Button onClick={() => { setPaymentToEdit(null); setIsPaymentModalOpen(true); }}><IndianRupee size={16} /> Record Payment</Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Active principal" value={formatINR(summary.totalPrincipal)} tone="paid" />
          <StatCard label="Monthly interest" value={formatINR(summary.totalMonthlyInterest)} tone="neutral" />
          <StatCard label="Total pending interest" value={formatINR(summary.totalPendingAmount)} tone="advance" />
          <StatCard label="Next due date" value={summary.nextDueDate ? formatDate(summary.nextDueDate) : 'N/A'} tone="partial" />
        </div>
      </Card>

      <ErrorNote>{actionError}</ErrorNote>

      <section className="space-y-4">
        <h2 className="text-xl font-black">Loan accounts ({loans.length})</h2>
        {loans.length === 0 ? (
          <EmptyState title="No loans yet">No loans recorded for this borrower. Use "Add New Loan" to create one.</EmptyState>
        ) : loans.map((loan) => (
          <Card key={loan.id}>
            <div className="flex flex-col justify-between gap-3 pb-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-black tabnum">Principal: {formatINR(loan.principal)}</span>
                  <span className={`pill ${loan.status === 'ACTIVE' ? 'tone-paid' : 'tone-neutral'}`}>{loan.status === 'ACTIVE' ? 'Active' : 'Closed'}</span>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-sm font-semibold text-muted">
                  <span>Monthly interest: <strong className="text-ink">{formatINR(loan.monthlyInterest)}</strong></span>
                  <span>Start date: <strong className="text-ink">{formatDate(loan.startDate)}</strong></span>
                  <span>Due day: <strong className="text-ink">{loan.dueDay}th of every month</strong></span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => { setLoanToEdit(loan); setIsLoanModalOpen(true); }}><Pencil size={14} /> Edit</Button>
                <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => handleDeleteLoan(loan.id)}><Trash2 size={14} /> Delete</Button>
                <Button variant="secondary" className="!px-3 !py-2 text-sm" onClick={() => handleToggleLoanStatus(loan.id, loan.status)}>{loan.status === 'ACTIVE' ? 'Close' : 'Re-open'}</Button>
              </div>
            </div>
            <h3 className="mb-3 text-sm font-extrabold text-muted">Monthly interest ledger (check to clear due)</h3>
            <Table columns={ledgerColumns()} rows={loan.interestRecords} empty="No monthly interest due yet." />
          </Card>
        ))}
      </section>

      <Card>
        <h2 className="mb-4 text-xl font-black">Payment history ({payments.length})</h2>
        <Table columns={paymentColumns} rows={payments} empty="No payments recorded yet." />
      </Card>

      <LoanFormModal
        isOpen={isLoanModalOpen}
        onClose={() => { setIsLoanModalOpen(false); setLoanToEdit(null); }}
        onSuccess={fetchBorrowerDetail}
        borrowerId={borrower.id}
        borrowerName={borrower.name}
        loanToEdit={loanToEdit}
      />
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => { setIsPaymentModalOpen(false); setPaymentToEdit(null); }}
        onSuccess={fetchBorrowerDetail}
        initialBorrowerId={borrower.id}
        paymentToEdit={paymentToEdit}
      />
      <BorrowerFormModal isOpen={isEditBorrowerModalOpen} onClose={() => setIsEditBorrowerModalOpen(false)} onSuccess={fetchBorrowerDetail} borrowerToEdit={borrower} />
    </div>
  );
}

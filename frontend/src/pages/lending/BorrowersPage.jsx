import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, IndianRupee } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, EmptyState, Loading, ErrorNote, PageHeader } from '../../components/ui';
import BorrowerFormModal from '../../components/BorrowerFormModal';
import PaymentModal from '../../components/PaymentModal';
import { formatINR, formatDate } from '../../lib/format';

const Stat = ({ label, children }) => (
  <div>
    <span className="block text-[11px] font-extrabold text-muted">{label}</span>
    <span className="font-black tabnum">{children}</span>
  </div>
);

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
      setError('');
      setBorrowers(await api.getBorrowers(search));
    } catch (err) {
      setError(err.message || 'Failed to fetch borrowers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBorrowers(); }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader title="Borrowers" sub="Manage clients, loans, and collection status">
        <Button onClick={() => setIsBorrowerModalOpen(true)}><UserPlus size={16} /> Add New Borrower</Button>
      </PageHeader>

      <input type="search" aria-label="Search borrowers" className="field max-w-md" placeholder="Search by borrower name or phone number" value={search} onChange={(e) => setSearch(e.target.value)} />

      {error ? <ErrorNote>{error}</ErrorNote> : loading ? <Loading>Loading borrowers…</Loading> : borrowers.length === 0 ? (
        <EmptyState title="No borrowers found">
          {search ? 'Try adjusting your search term.' : 'Get started by creating your first borrower.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {borrowers.map((b) => (
            <Card key={b.id} className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black"><Link to={`/lending/borrowers/${b.id}`} className="hover:underline">{b.name}</Link></h2>
                    <p className="text-sm font-semibold text-muted">{b.phone}</p>
                    {b.address && <p className="truncate text-sm font-semibold text-muted">{b.address}</p>}
                  </div>
                  <span className={`pill shrink-0 ${b.activeLoansCount > 0 ? 'tone-paid' : 'tone-neutral'}`}>{b.activeLoansCount} active loan(s)</span>
                </div>
                <div className="glass-in mt-4 grid grid-cols-2 gap-3 rounded-2xl p-3.5 text-sm">
                  <Stat label="Total principal">{formatINR(b.totalPrincipal)}</Stat>
                  <Stat label="Monthly interest">{formatINR(b.totalMonthlyInterest)}</Stat>
                  <Stat label="Pending amount"><span className={b.totalPendingInterest > 0 ? 'text-ink' : 'text-muted'}>{formatINR(b.totalPendingInterest)}</span></Stat>
                  <Stat label="Next due date">{b.nextDueDate ? formatDate(b.nextDueDate) : 'N/A'}</Stat>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <Button onClick={() => { setSelectedBorrowerId(b.id); setIsPaymentModalOpen(true); }} aria-label={`Record payment for ${b.name}`}>
                  <IndianRupee size={16} /> Pay
                </Button>
                <Link to={`/lending/borrowers/${b.id}`} className="font-extrabold text-ink hover:underline">View profile</Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BorrowerFormModal isOpen={isBorrowerModalOpen} onClose={() => setIsBorrowerModalOpen(false)} onSuccess={fetchBorrowers} />
      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} onSuccess={fetchBorrowers} initialBorrowerId={selectedBorrowerId} />
    </div>
  );
}

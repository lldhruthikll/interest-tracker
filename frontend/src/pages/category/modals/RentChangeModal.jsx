import React, { useState } from 'react';
import { api } from '../../../api/client';
import { Button, Modal, Field, ErrorNote } from '../../../components/ui';
import { todayIST } from '../../../lib/format';

export default function RentChangeModal({ open, agreementId, current, onClose, onDone }) {
  const [amount, setAmount] = useState(current ?? '');
  const [from, setFrom] = useState(todayIST().slice(0, 7));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { onDone(await api.addRate(agreementId, { amount, effectiveFrom: from })); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title="Change rent" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="New monthly amount (₹)" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Field label="Effective from month" type="month" required value={from} onChange={(e) => setFrom(e.target.value)} />
        <p className="text-sm font-semibold text-muted">Unpaid dues from that month use the new amount. Dues with money already collected keep theirs.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

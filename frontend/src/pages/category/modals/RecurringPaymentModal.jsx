import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { Button, Modal, Field, Select, ErrorNote } from '../../../components/ui';
import { formatINR, todayIST } from '../../../lib/format';

const METHODS = [['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK', 'Bank'], ['CHEQUE', 'Cheque']].map(([value, label]) => ({ value, label }));

// agreements: [{id, label, unpaid?}] to pick from; or pass fixed `agreement` {id,label}. `payment` = edit mode.
export default function RecurringPaymentModal({ open, agreements = [], agreement, payment, unpaid, onClose, onDone }) {
  const [agId, setAgId] = useState(agreement?.id ?? agreements[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [f, setF] = useState({
    amount: payment?.amount ?? '', paymentDate: payment ? String(payment.paymentDate).slice(0, 10) : todayIST(),
    method: payment?.method ?? 'CASH', notes: payment?.notes ?? '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const shown = useMemo(() => agreements.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()) || a.id === agId), [agreements, q, agId]);
  const current = agreement || agreements.find((a) => String(a.id) === String(agId));
  const [fetched, setFetched] = useState(null);
  useEffect(() => {
    setFetched(null);
    if (unpaid != null || !agId) return undefined;
    let live = true;
    api.getAgreement(agId).then((a) => live && setFetched(a.balances.unpaidPaise / 100)).catch(() => {});
    return () => { live = false; };
  }, [agId, unpaid]);
  const unpaidNow = unpaid ?? fetched;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!agId) return setError('Choose an agreement');
    setBusy(true);
    try {
      const body = { amount: f.amount, paymentDate: f.paymentDate, method: f.method, notes: f.notes.trim() };
      onDone(payment ? await api.updateRecurringPayment(payment.id, body) : await api.createRecurringPayment({ ...body, agreementId: Number(agId) }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title={payment ? 'Edit payment' : 'Record payment'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        {agreement || payment ? <p className="font-extrabold">{current?.label || agreement?.label}</p> : (
          <>
            <Field label="Search" placeholder="e.g. Shop A-1 or tenant name" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select label="Agreement" value={agId} onChange={(e) => setAgId(e.target.value)}>
              {shown.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </>
        )}
        {unpaidNow != null && <p className="glass-in rounded-2xl px-4 py-3 text-sm font-bold tabnum">Unpaid before this payment: {formatINR(unpaidNow)}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} />
          <Field label="Payment date" type="date" required max={todayIST()} value={f.paymentDate} onChange={set('paymentDate')} />
          <Select label="Method" value={f.method} onChange={set('method')} options={METHODS} />
          <Field label="Notes (optional)" value={f.notes} onChange={set('notes')} />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</Button>
        </div>
      </form>
    </Modal>
  );
}

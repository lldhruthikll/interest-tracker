import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { Button, Modal, Field, Select, ErrorNote } from '../../../components/ui';
import { formatINR, todayIST } from '../../../lib/format';

const METHODS = [['CASH', 'Cash'], ['UPI', 'UPI'], ['BANK', 'Bank'], ['CHEQUE', 'Cheque']].map(([value, label]) => ({ value, label }));

// agreements: [{id, label, unpaid?}] to pick from; or pass fixed `agreement` {id,label}. `payment` = edit mode.
// suggest: creditor id to pre-select for "paid to someone you owe" (else fetched with the agreement).
// canRepay=false hides that question (ended agreements: their payments can't be edited later).
export default function RecurringPaymentModal({ open, agreements = [], agreement, payment, unpaid, suggest, canRepay = true, onClose, onDone }) {
  const [agId, setAgId] = useState(String(agreement?.id ?? agreements[0]?.id ?? ''));
  const [q, setQ] = useState('');
  const [f, setF] = useState({
    amount: payment?.amount ?? '', paymentDate: payment ? String(payment.paymentDate).slice(0, 10) : todayIST(),
    method: payment?.method ?? 'CASH', notes: payment?.notes ?? '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const linked = payment?.debtEntry;
  const [repay, setRepay] = useState(linked || suggest ? 'yes' : 'no');
  const [credId, setCredId] = useState(String(linked?.creditorId ?? suggest ?? ''));
  const [newC, setNewC] = useState({ name: '', phone: '', amount: '' });
  const [creditors, setCreditors] = useState([]);
  useEffect(() => { if (canRepay) api.getCreditors().then((d) => setCreditors(d.creditors)).catch(() => {}); }, [canRepay]);
  // still owed, plus the one this payment is already linked to (it may be cleared by this very payment)
  const owed = creditors.filter((c) => c.left > 0 || c.id === linked?.creditorId);
  const chosen = owed.find((c) => String(c.id) === credId);
  const leftBefore = chosen ? chosen.left + (chosen.id === linked?.creditorId ? Number(linked.amount) : 0) : 0;
  const passOn = chosen ? Math.min(Number(f.amount) || 0, leftBefore) : 0;
  const pickYes = () => { setRepay('yes'); if (!credId) setCredId(owed[0] ? String(owed[0].id) : 'new'); };
  const shown = useMemo(() => agreements.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()) || String(a.id) === agId), [agreements, q, agId]);
  const current = agreement || agreements.find((a) => String(a.id) === String(agId));
  const [fetched, setFetched] = useState(null);
  useEffect(() => {
    setFetched(null);
    if (unpaid != null || !agId) return undefined;
    let live = true;
    api.getAgreement(agId).then((a) => {
      if (!live) return;
      setFetched(a.balances.unpaidPaise / 100);
      if (!payment) { setRepay(a.suggestedCreditorId ? 'yes' : 'no'); setCredId(String(a.suggestedCreditorId ?? '')); }
    }).catch(() => {});
    return () => { live = false; };
  }, [agId, unpaid]);
  const unpaidNow = unpaid ?? fetched;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!agId) return setError('Choose an agreement');
    setBusy(true);
    try {
      const repayTo = !canRepay || repay === 'no' ? null : credId === 'new'
        ? { newCreditor: { name: newC.name.trim(), phone: newC.phone.trim() || null, amount: newC.amount } }
        : { creditorId: Number(credId) };
      const body = { amount: f.amount, paymentDate: f.paymentDate, method: f.method, notes: f.notes.trim(), repayTo };
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
        {canRepay && (
          <div className="space-y-3">
            <p className="font-extrabold">Paid to someone you owe?</p>
            <div className="flex gap-2">
              <Button variant={repay === 'no' ? 'primary' : 'secondary'} className="!px-4 !py-1.5 text-sm" onClick={() => setRepay('no')}>No</Button>
              <Button variant={repay === 'yes' ? 'primary' : 'secondary'} className="!px-4 !py-1.5 text-sm" onClick={pickYes}>Yes</Button>
            </div>
            {repay === 'yes' && (
              <>
                <Select label="Paid to" value={credId} onChange={(e) => setCredId(e.target.value)}>
                  {owed.map((c) => <option key={c.id} value={c.id}>{c.name} · {formatINR(c.left)} left</option>)}
                  <option value="new">+ New person I owe…</option>
                </Select>
                {credId === 'new' ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Name" required value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} />
                    <Field label="Phone (optional)" type="tel" value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} />
                    <Field label="Amount I owe (₹)" type="number" min="0" step="0.01" required value={newC.amount} onChange={(e) => setNewC({ ...newC, amount: e.target.value })} />
                  </div>
                ) : chosen && (
                  <p className="glass-in rounded-2xl px-4 py-3 text-sm font-bold tabnum">
                    {chosen.name}: {formatINR(leftBefore)} → {formatINR(leftBefore - passOn)}
                    {Number(f.amount) > passOn && ` · ${formatINR(Number(f.amount) - passOn)} stays with you`}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !agId}>{busy ? 'Saving…' : 'Save payment'}</Button>
        </div>
      </form>
    </Modal>
  );
}

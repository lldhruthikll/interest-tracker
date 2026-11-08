import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { Button, Modal, Field, Select, ErrorNote } from '../../../components/ui';
import { formatINR, formatDate, todayIST } from '../../../lib/format';

const TIMING = [{ value: 'IN_ADVANCE', label: 'In advance (rent for the month is due in that month)' }, { value: 'IN_ARREARS', label: 'In arrears (due the month after)' }];
const RULE = [{ value: 'PRORATED', label: 'Prorated by days' }, { value: 'FULL', label: 'Full month' }, { value: 'FREE', label: 'Free' }];

export default function MoveInModal({ open, cat, unitId, onClose, onDone }) {
  // vacant, non-archived units of non-archived places only
  const units = useMemo(() => cat.places.filter((p) => !p.archived)
    .flatMap((p) => p.units.filter((u) => !u.archived && !u.agreement).map((u) => ({ ...u, placeName: p.name }))), [cat]);
  // a requested unit that is not vacant must never fall back to another unit
  const unitMissing = unitId != null && !units.some((x) => x.id === unitId);
  const [f, setF] = useState(() => {
    const u = unitMissing ? null : units.find((x) => x.id === unitId) || units[0];
    return { unitId: u?.id ?? '', startDate: todayIST(), dueDay: '1', amount: u?.defaultAmount ?? '', timing: 'IN_ADVANCE',
      firstMonthRule: 'PRORATED', lastMonthRule: 'PRORATED', advanceAmount: '', advanceDate: todayIST(), previousBalance: '', notes: '' };
  });
  const [payerMode, setPayerMode] = useState('existing'); // 'existing' | 'new'
  const [search, setSearch] = useState('');
  const [payers, setPayers] = useState([]);
  const [payerId, setPayerId] = useState('');
  const [np, setNp] = useState({ name: '', phone: '' });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const pickUnit = (e) => {
    const u = units.find((x) => String(x.id) === e.target.value);
    setF({ ...f, unitId: e.target.value, amount: u ? u.defaultAmount : f.amount });
  };

  useEffect(() => {
    const t = setTimeout(() => api.getPayers(search).then(setPayers).catch(() => setPayers([])), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { startDate, dueDay, timing, firstMonthRule, amount } = f;
  useEffect(() => {
    setPreview(null);
    if (!startDate || !dueDay || !(Number(amount) > 0)) return undefined;
    let live = true;
    const t = setTimeout(() => {
      api.previewAgreement({ startDate, dueDay: Number(dueDay), timing, firstMonthRule, amount })
        .then((r) => live && setPreview(r)).catch((e) => live && setPreview({ error: e.message }));
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [startDate, dueDay, timing, firstMonthRule, amount]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (unitMissing) return setError('The selected unit is no longer vacant.');
    if (payerMode === 'existing' && !payerId) return setError(`Choose a ${cat.payerLabel.toLowerCase()} or add a new one`);
    setBusy(true);
    try {
      const body = { unitId: Number(f.unitId), startDate: f.startDate, dueDay: Number(f.dueDay), amount: f.amount, timing: f.timing,
        firstMonthRule: f.firstMonthRule, lastMonthRule: f.lastMonthRule, notes: f.notes.trim() || undefined };
      if (payerMode === 'existing') body.payerId = Number(payerId);
      else body.newPayer = { name: np.name.trim(), phone: np.phone.trim() };
      if (f.advanceAmount !== '') { body.advanceAmount = f.advanceAmount; body.advanceDate = f.advanceDate; }
      if (f.previousBalance !== '') body.previousBalance = f.previousBalance;
      onDone(await api.createAgreement(body));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const pv = Array.isArray(preview) && preview.length ? preview : null;
  return (
    <Modal open={open} title={`Move in ${cat.payerLabel.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error || (unitMissing ? 'The selected unit is not vacant, so no one can be moved in. Close this and try again.' : '')}</ErrorNote>
        {units.length === 0 ? <p className="font-bold text-muted">No vacant {cat.unitLabel.toLowerCase()} available. Add one under Manage.</p> : (
          <Select label={cat.unitLabel} value={f.unitId} onChange={pickUnit}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}{cat.placeLabel && ` · ${u.placeName}`}</option>)}
          </Select>
        )}
        <div className="glass-in space-y-3 rounded-2xl p-4">
          <div className="flex gap-2">
            <Button variant={payerMode === 'existing' ? 'primary' : 'secondary'} className="!px-3 !py-1.5 text-sm" onClick={() => setPayerMode('existing')}>Existing {cat.payerLabel.toLowerCase()}</Button>
            <Button variant={payerMode === 'new' ? 'primary' : 'secondary'} className="!px-3 !py-1.5 text-sm" onClick={() => setPayerMode('new')}>+ New</Button>
          </div>
          {payerMode === 'existing' ? (
            <>
              <Field label={`Search ${cat.payerLabel.toLowerCase()} by name or phone`} value={search} onChange={(e) => setSearch(e.target.value)} />
              <Select label={cat.payerLabel} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                <option value="">Select…</option>
                {payers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
              </Select>
            </>
          ) : (
            <>
              <Field label={`${cat.payerLabel} name`} required value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
              <Field label="Phone" required value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} />
            </>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" type="date" required value={f.startDate} onChange={set('startDate')} />
          <Field label="Due day of month (1-31)" type="number" min="1" max="31" required value={f.dueDay} onChange={set('dueDay')} />
          <Field label="Monthly amount (₹)" type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} />
          <Select label="Billing" value={f.timing} onChange={set('timing')} options={TIMING} />
          <Select label="First month" value={f.firstMonthRule} onChange={set('firstMonthRule')} options={RULE} />
          <Select label="Last month" value={f.lastMonthRule} onChange={set('lastMonthRule')} options={RULE} />
          <Field label="Advance received (₹, optional)" type="number" min="0" step="0.01" value={f.advanceAmount} onChange={set('advanceAmount')} />
          {f.advanceAmount !== '' && <Field label="Advance date" type="date" value={f.advanceDate} onChange={set('advanceDate')} />}
        </div>
        <Field label="Previous balance (₹, optional)" type="number" min="0" step="0.01" value={f.previousBalance} onChange={set('previousBalance')} />
        <p className="-mt-2 text-sm font-semibold text-muted">For an existing tenant: what they already owe you from before the start date. It is added to what they owe, and their payments clear it first.</p>
        <Field label="Notes (optional)" value={f.notes} onChange={set('notes')} />
        <p aria-live="polite" className="glass-in rounded-2xl px-4 py-3 text-sm font-bold tabnum">
          {pv ? `First due: ${formatINR(pv[0].amount)} on ${formatDate(pv[0].dueDate)}${pv[1] ? ` · Next: ${formatINR(pv[1].amount)} on ${formatDate(pv[1].dueDate)}` : ''}`
            : preview?.error || 'Enter the date, due day and amount to preview the first dues.'}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !units.length || unitMissing}>{busy ? 'Saving…' : 'Move in'}</Button>
        </div>
      </form>
    </Modal>
  );
}

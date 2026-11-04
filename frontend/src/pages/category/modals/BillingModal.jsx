import React, { useState } from 'react';
import { api } from '../../../api/client';
import { Button, Modal, Field, Select, ErrorNote } from '../../../components/ui';

const TIMING = [{ value: 'IN_ADVANCE', label: 'In advance' }, { value: 'IN_ARREARS', label: 'In arrears' }];
const RULE = [{ value: 'PRORATED', label: 'Prorated by days' }, { value: 'FULL', label: 'Full month' }, { value: 'FREE', label: 'Free' }];

export default function BillingModal({ open, agreement, onClose, onDone }) {
  const [f, setF] = useState({ dueDay: agreement.dueDay, timing: agreement.timing, firstMonthRule: agreement.firstMonthRule, lastMonthRule: agreement.lastMonthRule });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { onDone(await api.updateBilling(agreement.id, { ...f, dueDay: Number(f.dueDay) })); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title="Billing settings" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Due day of month (1-31)" type="number" min="1" max="31" required value={f.dueDay} onChange={set('dueDay')} />
        <Select label="Billing" value={f.timing} onChange={set('timing')} options={TIMING} />
        <Select label="First month" value={f.firstMonthRule} onChange={set('firstMonthRule')} options={RULE} />
        <Select label="Last month" value={f.lastMonthRule} onChange={set('lastMonthRule')} options={RULE} />
        <p className="text-sm font-semibold text-muted">Dues with nothing collected are recalculated. Dues with money collected are kept.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

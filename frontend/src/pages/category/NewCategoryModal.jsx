import React, { useState } from 'react';
import { api } from '../../api/client';
import { Button, Modal, Field, ErrorNote } from '../../components/ui';

export default function NewCategoryModal({ open, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', placeLabel: '', unitLabel: '', payerLabel: '', color: '#737373' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const c = await api.createCategory(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])));
      setF({ name: '', placeLabel: '', unitLabel: '', payerLabel: '', color: '#737373' });
      onCreated(c);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title="New category" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Category name" required placeholder="e.g. Commercial Rent" value={f.name} onChange={set('name')} />
        <p className="text-sm font-semibold text-muted">Names for the three levels, singular. Example: Building, Shop, Tenant.</p>
        <Field label="Top level (e.g. Building)" required value={f.placeLabel} onChange={set('placeLabel')} />
        <Field label="Item that is rented (e.g. Shop)" required value={f.unitLabel} onChange={set('unitLabel')} />
        <Field label="Who pays (e.g. Tenant)" required value={f.payerLabel} onChange={set('payerLabel')} />
        <Field label="Color" type="color" className="max-w-[8rem]" value={f.color} onChange={set('color')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create category'}</Button>
        </div>
      </form>
    </Modal>
  );
}

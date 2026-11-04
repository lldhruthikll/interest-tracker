import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Table, Modal, Field, Loading, ErrorNote, PageHeader } from '../../components/ui';

export default function PayersPage() {
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', notes: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false; // a slow earlier response must not overwrite a newer one
    const t = setTimeout(() => api.getPayers(search.trim())
      .then((r) => { if (!cancelled) { setRows(r); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); }), 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const create = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.phone.trim()) return setError('Name and phone are required.');
    setBusy(true);
    try { const p = await api.createPayer({ name: f.name.trim(), phone: f.phone.trim(), notes: f.notes.trim() || undefined }); nav(`/payers/${p.id}`); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const cols = [
    { key: 'name', header: 'Name', render: (p) => <Link className="font-extrabold text-ink underline" to={`/payers/${p.id}`}>{p.name}</Link> },
    { key: 'phone', header: 'Phone' },
    { key: 'units', header: 'Active units', render: (p) => p.agreements.map((a) => a.unit.name).join(', ') || 'None' },
    { key: 'login', header: 'Login', render: (p) => (p.login ? (p.login.active ? 'Enabled' : 'Disabled') : 'None') },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Payers" sub="Tenants and regulars across all categories">
        <Button onClick={() => { setError(''); setOpen(true); }}>+ Add payer</Button>
      </PageHeader>
      <Field label="Search by name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!open && <ErrorNote>{error}</ErrorNote>}
      {rows ? <Table columns={cols} rows={rows} empty="No payers found." /> : <Loading />}
      <Modal open={open} title="Add payer" onClose={() => setOpen(false)}>
        <form onSubmit={create} className="space-y-4" noValidate>
          <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <Field label="Phone" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
          <Field label="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save payer'}</Button>
        </form>
      </Modal>
    </div>
  );
}

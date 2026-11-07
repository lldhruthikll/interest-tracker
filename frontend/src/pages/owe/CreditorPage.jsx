import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, Modal, Field, StatCard, Table, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatAnyDate, todayIST } from '../../lib/format';
import { Progress } from './OwePage';

// type: 'BORROWED' (borrowed more) or 'REPAID' (repaid from own money)
function EntryModal({ creditorId, type, onClose, onDone }) {
  const [f, setF] = useState({ amount: '', date: todayIST(), notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api.addDebtEntry(creditorId, { type, ...f, notes: f.notes.trim() }); onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title={type === 'BORROWED' ? 'Borrowed more' : 'Repaid (own money)'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Amount (₹)" type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} />
        <Field label="Date" type="date" required max={todayIST()} value={f.date} onChange={set('date')} />
        <Field label="Notes (optional)" value={f.notes} onChange={set('notes')} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CreditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [modal, setModal] = useState(null); // 'BORROWED' | 'REPAID'
  const load = useCallback(() => api.getCreditor(id).then((d) => { setC(d); setError(''); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { setC(null); load(); }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!c) return <Loading />;

  const act = async (msg, fn) => {
    if (!window.confirm(msg)) return;
    setActionError('');
    try { await fn(); } catch (e) { setActionError(e.message); }
  };
  const delEntry = (e) => act('Delete this line? This cannot be undone.', async () => { await api.deleteDebtEntry(e.id); await load(); });
  const delPerson = () => act(`Delete ${c.name} and their whole log? Rent payments stay as they are.`,
    async () => { await api.deleteCreditor(c.id); navigate('/owe'); });

  return (
    <div className="space-y-6">
      <PageHeader title={c.name} sub={[c.phone, c.notes].filter(Boolean).join(' · ') || undefined}>
        <Link className="btn" to="/owe">Back</Link>
        <Button variant="secondary" onClick={() => setModal('BORROWED')}>+ Borrowed more</Button>
        <Button disabled={c.left <= 0} onClick={() => setModal('REPAID')}>+ Repaid</Button>
      </PageHeader>
      <ErrorNote>{actionError}</ErrorNote>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Borrowed" value={formatINR(c.borrowed)} tone="neutral" />
        <StatCard label="Repaid" value={formatINR(c.repaid)} tone="paid" />
        <StatCard label="Left" value={formatINR(c.left)} tone={c.left > 0 ? 'overdue' : 'paid'} />
      </div>
      <Card><Progress c={c} /></Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-black">Log</h2>
        <Table columns={[
          { key: 'date', header: 'Date', render: (e) => formatAnyDate(e.date) },
          { key: 'amount', header: 'Amount', align: 'right', render: (e) => (e.type === 'REPAID' ? `− ${formatINR(e.amount)}` : `+ ${formatINR(e.amount)}`) },
          { key: 'message', header: 'What', render: (e) => (e.agreementId
            ? <Link className="text-ink underline" to={`/agreements/${e.agreementId}`}>{e.message}</Link> : e.message) },
          { key: 'notes', header: 'Notes', render: (e) => e.notes || '' },
          { key: 'act', header: '', render: (e) => (e.agreementId
            ? <span className="text-sm font-bold text-muted">From rent</span>
            : <Button className="!px-3 !py-1 text-sm" onClick={() => delEntry(e)}>Delete</Button>) },
        ]} rows={c.entries} />
      </Card>

      <div><Button variant="secondary" onClick={delPerson}>Delete {c.name}</Button></div>

      {modal && <EntryModal creditorId={c.id} type={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}

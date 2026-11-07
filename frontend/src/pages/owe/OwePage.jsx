import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, Modal, Field, StatCard, StatusPill, Table, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatAnyDate, todayIST } from '../../lib/format';

export const Progress = ({ c }) => {
  const pct = c.borrowed ? Math.round((c.repaid / c.borrowed) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% repaid`}>
        <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-sm font-semibold text-muted tabnum">{formatINR(c.left)} left of {formatINR(c.borrowed)} · {pct}% repaid</div>
    </div>
  );
};

function AddPersonModal({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', amount: '', date: todayIST() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { onDone(await api.createCreditor({ ...f, name: f.name.trim(), phone: f.phone.trim() || null })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Add person I owe" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Name" required value={f.name} onChange={set('name')} />
        <Field label="Phone (optional)" type="tel" value={f.phone} onChange={set('phone')} />
        <Field label="Amount I owe (₹)" type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} />
        <Field label="Borrowed on" type="date" required max={todayIST()} value={f.date} onChange={set('date')} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add person'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function OwePage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api.getCreditors().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const { totals: t, creditors } = data;
  const name = (c) => <Link className="font-extrabold text-ink underline" to={`/owe/${c.id}`}>{c.name}</Link>;

  return (
    <div className="space-y-6">
      <PageHeader title="Money I owe" sub="People I borrowed from, and what I've repaid">
        <Button onClick={() => setAdding(true)}>+ Add person I owe</Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total still owed" value={formatINR(t.owed)} tone="overdue" />
        <StatCard label="Repaid so far" value={formatINR(t.repaid)} tone="paid" />
        <StatCard label="Repaid this month" value={formatINR(t.repaidThisMonth)} tone="partial" />
      </div>

      <Card>
        <Table columns={[
          { key: 'name', header: 'Person', render: name },
          { key: 'borrowed', header: 'Borrowed', align: 'right', render: (c) => formatINR(c.borrowed) },
          { key: 'repaid', header: 'Repaid', align: 'right', render: (c) => formatINR(c.repaid) },
          { key: 'left', header: 'Left', align: 'right', render: (c) => (c.left > 0 ? <b>{formatINR(c.left)}</b> : <StatusPill status="Cleared" />) },
          { key: 'last', header: 'Last paid', render: (c) => (c.lastPaid ? formatAnyDate(c.lastPaid) : '—') },
        ]} rows={creditors} empty="No one yet. Add the first person you owe." />
      </Card>

      {creditors.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {creditors.map((c) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg">{name(c)}</span>
                {c.phone && <span className="text-sm font-semibold text-muted">{c.phone}</span>}
              </div>
              <Progress c={c} />
            </Card>
          ))}
        </div>
      )}

      {adding && <AddPersonModal onClose={() => setAdding(false)} onDone={(c) => navigate(`/owe/${c.id}`)} />}
    </div>
  );
}

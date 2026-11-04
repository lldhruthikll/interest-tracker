import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, StatusPill, Table, Field, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatDate } from '../../lib/format';

function LoginCard({ payer, reload }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const login = payer.login;
  const run = async (fn, ok) => {
    setError(''); setMsg('');
    try { await fn(); setF({ username: '', password: '' }); setPw(''); setMsg(ok); await reload(); } catch (e) { setError(e.message); }
  };
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-black">Login</h2>
      {login ? (
        <>
          <p className="font-semibold">Username <b>{login.username}</b> · {login.active ? 'Enabled' : 'Disabled'}</p>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate
            onSubmit={(e) => { e.preventDefault(); if (pw.length < 8) return setError('Password must be at least 8 characters.'); run(() => api.updatePayerLogin(payer.id, { password: pw }), 'Password reset. They must change it at next login.'); }}>
            <Field className="flex-1" label="New starting password (min 8)" type="text" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
            <Button type="submit">Reset password</Button>
          </form>
          <Button variant="secondary" onClick={() => run(() => api.updatePayerLogin(payer.id, { active: !login.active }), login.active ? 'Login disabled.' : 'Login enabled.')}>
            {login.active ? 'Disable login' : 'Enable login'}
          </Button>
        </>
      ) : (
        <form className="space-y-3" noValidate
          onSubmit={(e) => { e.preventDefault(); if (!f.username.trim()) return setError('Username is required.'); if (f.password.length < 8) return setError('Password must be at least 8 characters.'); run(() => api.createPayerLogin(payer.id, { username: f.username.trim(), password: f.password }), 'Login created. Share the username and starting password.'); }}>
          <p className="font-semibold text-muted">No login yet. A login gives read-only access to their own dues.</p>
          <Field label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="off" />
          <Field label="Starting password (min 8)" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" />
          <Button type="submit">Create login</Button>
        </form>
      )}
      <ErrorNote>{error}</ErrorNote>
      {msg && <p role="status" className="font-bold">{msg}</p>}
    </Card>
  );
}

export default function PayerDetailPage() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.getPayer(id).then((d) => { setP(d); setError(''); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { setP(null); load(); }, [load]);
  if (error && !p) return <ErrorNote>{error}</ErrorNote>;
  if (!p) return <Loading />;

  const cols = [
    { key: 'unit', header: 'Unit', render: (a) => <Link className="font-extrabold text-ink underline" to={`/agreements/${a.id}`}>{a.unit.name}</Link> },
    { key: 'place', header: 'Place', render: (a) => `${a.unit.place.category.name} · ${a.unit.place.name}` },
    { key: 'status', header: 'Status', render: (a) => <StatusPill status={a.status} /> },
    { key: 'since', header: 'Since', render: (a) => formatDate(String(a.startDate).slice(0, 10)) },
    { key: 'unpaid', header: 'Unpaid', align: 'right', render: (a) => formatINR(a.balances.unpaidPaise / 100) },
    { key: 'adv', header: 'Advance held', align: 'right', render: (a) => formatINR(a.balances.advanceHeldPaise / 100) },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={p.name} sub={[p.phone, p.notes].filter(Boolean).join(' · ')}>
        <Link className="btn" to="/payers">Back</Link>
      </PageHeader>
      <Table columns={cols} rows={p.agreements} empty="No agreements yet." />
      <LoginCard payer={p} reload={load} />
    </div>
  );
}

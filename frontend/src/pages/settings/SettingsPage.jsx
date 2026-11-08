import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeSwitch } from '../../lib/theme';
import { Button, Card, Table, Field, Loading, ErrorNote, PageHeader } from '../../components/ui';

function SmsRemindersCard() {
  const [on, setOn] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getProfile().then((p) => setOn(!!p.smsReminders)).catch((e) => setError(e.message)); }, []);
  const toggle = async (e) => {
    const next = e.target.checked;
    setError('');
    try { setOn((await api.updatePreferences({ smsReminders: next })).smsReminders); } catch (err) { setError(err.message); }
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-black">SMS due-date reminders</h2>
      <ErrorNote>{error}</ErrorNote>
      <label className="flex items-start gap-3 font-semibold">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-current" checked={!!on} disabled={on === null} onChange={toggle} />
        <span>
          Text my tenants and borrowers on their due date
          <span className="block text-sm text-muted">
            Once a day (9:00 AM IST), each tenant or regular whose payment is due that day, and each borrower whose interest
            is due that day, gets an SMS with the amount due and their total still owed if it is more, as long as it isn't
            fully paid. Sent from the phone running SMS Push Gateway, to the number on their record.
          </span>
        </span>
      </label>
    </Card>
  );
}

function PasswordCard() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(''); setOk(false);
    if (f.newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (f.newPassword !== f.confirm) return setError('New passwords do not match.');
    try { await api.changePassword({ currentPassword: f.currentPassword, newPassword: f.newPassword }); setOk(true); setF({ currentPassword: '', newPassword: '', confirm: '' }); }
    catch (err) { setError(err.message); }
  };
  return (
    <Card>
      <form onSubmit={submit} className="max-w-sm space-y-4" noValidate>
        <h2 className="text-lg font-black">Change password</h2>
        <Field label="Current password" type="password" value={f.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
        <Field label="New password (min 8 characters)" type="password" value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
        <Field label="Confirm new password" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
        <ErrorNote>{error}</ErrorNote>
        {ok && <p role="status" className="font-bold">Password updated.</p>}
        <Button type="submit">Update password</Button>
      </form>
    </Card>
  );
}

function FamilyCard() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ username: '', name: '', password: '' });
  const [pw, setPw] = useState({}); // id -> new password being typed
  const [error, setError] = useState('');
  const load = useCallback(() => api.getMembers().then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } };

  const create = (e) => {
    e.preventDefault();
    if (!f.username.trim() || !f.name.trim()) return setError('Username and name are required.');
    if (f.password.length < 8) return setError('Password must be at least 8 characters.');
    run(async () => { await api.createMember({ username: f.username.trim(), name: f.name.trim(), password: f.password }); setF({ username: '', name: '', password: '' }); });
  };
  const reset = (m) => {
    const v = pw[m.id] || '';
    if (v.length < 8) return setError('Password must be at least 8 characters.');
    run(async () => { await api.updateMember(m.id, { password: v }); setPw({ ...pw, [m.id]: '' }); });
  };
  const cols = [
    { key: 'name', header: 'Name' },
    { key: 'username', header: 'Username' },
    { key: 'active', header: 'Status', render: (m) => (m.active ? 'Enabled' : 'Disabled') },
    { key: 'reset', header: 'Reset password', render: (m) => (
      <span className="flex gap-2">
        <input aria-label={`New password for ${m.username}`} className="field !py-1" type="text" autoComplete="off" placeholder="Min 8 characters" value={pw[m.id] || ''} onChange={(e) => setPw({ ...pw, [m.id]: e.target.value })} />
        <Button className="!px-3 !py-1 text-sm" onClick={() => reset(m)}>Reset</Button>
      </span>) },
    { key: 'toggle', header: '', render: (m) => <Button className="!px-3 !py-1 text-sm" onClick={() => run(() => api.updateMember(m.id, { active: !m.active }))}>{m.active ? 'Disable' : 'Enable'}</Button> },
  ];
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-black">Family accounts</h2>
      <p className="font-semibold text-muted">Each family member gets a separate, empty workspace. They must change the starting password at first login.</p>
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-4 sm:items-end" noValidate>
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="off" />
        <Field label="Starting password (min 8)" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" />
        <Button type="submit">Create account</Button>
      </form>
      <ErrorNote>{error}</ErrorNote>
      {rows ? <Table columns={cols} rows={rows} empty="No family accounts yet." /> : <Loading />}
    </Card>
  );
}

function ArchivedCard() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.getAllCategories().then((c) => setRows(c.filter((x) => x.archived))).catch(() => setRows([])); }, []);
  if (!rows?.length) return null;
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-black">Archived categories</h2>
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className="glass-in flex items-center justify-between gap-3 rounded-2xl p-3.5">
            <span className="font-extrabold">{c.name}</span>
            <Link className="btn !px-3 !py-1.5 text-sm" to={`/c/${c.id}/settings`}>Open to restore</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" sub={user?.name} />
      <Card><ThemeSwitch /></Card>
      <SmsRemindersCard />
      <PasswordCard />
      <ArchivedCard />
      {user?.role === 'ADMIN' && <FamilyCard />}
    </div>
  );
}

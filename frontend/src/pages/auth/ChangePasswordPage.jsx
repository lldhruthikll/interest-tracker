import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Field, Backdrop } from '../../components/ui';

export default function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (f.newPassword !== f.confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: f.currentPassword, newPassword: f.newPassword });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Backdrop />
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-xl3 p-8" noValidate>
        <h1 className="mb-1 text-2xl font-black">Change password</h1>
        <p className="mb-5 font-semibold text-muted">
          {user.mustChangePassword ? 'Set a new password before continuing.' : 'Choose a new password.'}
        </p>
        <div className="space-y-4">
          <Field label="Current password" type="password" value={f.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" autoFocus required />
          <Field label="New password (min 8 characters)" type="password" value={f.newPassword} onChange={set('newPassword')} autoComplete="new-password" required />
          <Field label="Confirm new password" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" required />
        </div>
        {error && <p role="alert" className="mt-4 rounded-2xl border border-dashed border-ink px-4 py-2 font-semibold text-ink">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">{busy ? 'Saving…' : 'Update password'}</button>
        <button type="button" onClick={logout} className="btn mt-3 w-full">Log out</button>
        {!user.mustChangePassword && <Link to="/" className="mt-3 block text-center font-semibold underline">Cancel</Link>}
      </form>
    </div>
  );
}

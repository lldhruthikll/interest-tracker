import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Field, Backdrop, Logo } from '../../components/ui';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Backdrop />
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-xl3 p-8" noValidate>
        <div className="mb-6 flex items-center gap-2 text-xl font-black">
          <Logo className="h-8 w-8 rounded-xl" />
          FinLedger
        </div>
        <h1 className="mb-1 text-2xl font-black">Sign in</h1>
        <p className="mb-5 font-semibold text-muted">Use the username and password you were given.</p>
        <div className="space-y-4">
          <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {error && <p role="alert" className="mt-4 rounded-2xl border border-dashed border-ink px-4 py-2 font-semibold text-ink">{error}</p>}
        <button type="submit" disabled={busy || !username || !password} className="btn-primary mt-6 w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

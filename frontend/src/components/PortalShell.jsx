import React from 'react';
import { Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Backdrop, Logo } from './ui';
import { ThemeSwitch } from '../lib/theme';

export default function PortalShell() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto min-h-screen max-w-4xl p-3 md:p-6">
      <Backdrop />
      <header className="glass mb-5 flex items-center justify-between rounded-xl3 px-5 py-3">
        <div className="flex items-center gap-2 text-[17px] font-black">
          <Logo />
          FinLedger
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-bold text-muted sm:inline">{user?.name}</span>
          <button type="button" onClick={logout} className="btn !py-2"><LogOut size={16} /> Logout</button>
        </div>
      </header>
      <Outlet />
      <footer className="mt-5 flex justify-end"><ThemeSwitch /></footer>
    </div>
  );
}

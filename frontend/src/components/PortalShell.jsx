import React from 'react';
import { Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function PortalShell() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto min-h-screen max-w-4xl p-3 md:p-6">
      <header className="neu mb-5 flex items-center justify-between rounded-xl3 px-5 py-3">
        <div className="flex items-center gap-2 text-[17px] font-black">
          <span className="h-[26px] w-[26px] rounded-[9px]" style={{ background: 'linear-gradient(135deg,#8db9f0,#f5b69e)' }} />
          FinLedger
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden font-bold text-muted sm:inline">{user?.name}</span>
          <button type="button" onClick={logout} className="btn !py-2"><LogOut size={16} /> Logout</button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

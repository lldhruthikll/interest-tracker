import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { useDialog } from './ui';

const item = ({ isActive }) =>
  `block rounded-2xl px-3.5 py-2.5 font-bold ${isActive ? 'neu-in text-accent-ink' : 'text-muted hover:text-ink'}`;

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2.5 pb-3.5 pt-1 text-[17px] font-black">
      <span className="h-[26px] w-[26px] rounded-[9px]" style={{ background: 'linear-gradient(135deg,#8db9f0,#f5b69e)', boxShadow: 'inset -3px -3px 6px rgba(0,0,0,.12), inset 3px 3px 6px rgba(255,255,255,.5)' }} />
      FinLedger
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const drawer = useRef(null);
  useDialog(open, () => setOpen(false), drawer);

  useEffect(() => { api.getCategories().then((c) => setCats(c.filter((x) => !x.archived))).catch(() => {}); }, []);
  useEffect(() => setOpen(false), [pathname]);

  const menu = (
    <nav aria-label="Main" className="flex flex-col gap-2">
      <Brand />
      <NavLink to="/" end className={item}>Overview</NavLink>
      <div className="px-3 pt-2.5 text-[10px] font-extrabold uppercase tracking-[.08em] text-muted">Ledgers</div>
      <NavLink to="/lending" className={item}>Lending</NavLink>
      {cats.map((c) => <NavLink key={c.id} to={`/c/${c.id}`} className={item}>{c.name}</NavLink>)}
      <NavLink to="/c/new" className="mt-1.5 rounded-2xl border-2 border-dashed border-[#c3c1df] px-3.5 py-2.5 text-center font-bold text-muted hover:text-ink">+ New category</NavLink>
      <div className="mt-3 flex flex-col gap-2 border-t-2 border-dotted border-line pt-3">
        <NavLink to="/payers" className={item}>Payers</NavLink>
        <NavLink to="/calendar" className={item}>Calendar</NavLink>
        <NavLink to="/settings" className={item}>Settings</NavLink>
        <button type="button" onClick={logout} className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left font-bold text-muted hover:text-ink">
          <LogOut size={16} /> Logout{user?.name ? ` (${user.name})` : ''}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen p-3 md:flex md:gap-5 md:p-6">
      <header className="mb-3 flex items-center justify-between md:hidden">
        <Brand />
        <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="btn !p-3 !rounded-2xl"><Menu size={20} /></button>
      </header>
      <aside className="neu sticky top-6 hidden h-fit max-h-[calc(100vh-3rem)] w-52 shrink-0 overflow-y-auto rounded-xl3 px-3 py-4 md:block">{menu}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div ref={drawer} tabIndex={-1} className="neu outline-none absolute inset-y-0 left-0 w-64 max-w-[85vw] overflow-y-auto rounded-r-xl3 px-3 py-4">
            <button type="button" data-autofocus aria-label="Close menu" onClick={() => setOpen(false)} className="btn !p-2 !rounded-full absolute right-3 top-3"><X size={16} /></button>
            {menu}
          </div>
        </div>
      )}
      <main className="min-w-0 flex-1"><Outlet /></main>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { useDialog, Backdrop, Logo } from './ui';
import NewCategoryModal from '../pages/category/NewCategoryModal';

// Pages call this after creating/archiving/renaming a category so the sidebar reloads.
export const refreshCategories = () => window.dispatchEvent(new Event('categories:changed'));

const item = ({ isActive }) =>
  `block rounded-2xl px-3.5 py-2.5 font-medium ${isActive ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'}`;

// Finds tenants/regulars (name, phone, unit) and borrowers (name, phone) across every ledger.
function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const { pathname } = useLocation();
  useEffect(() => { setQ(''); setRes(null); }, [pathname]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return undefined; }
    let live = true;
    const t = setTimeout(() => api.search(term).then((r) => live && setRes(r)).catch(() => live && setRes({ tenants: [], borrowers: [] })), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const link = 'block rounded-xl px-3 py-2 text-sm hover:bg-accent hover:text-accent-ink';
  return (
    <div className="px-1 pb-1">
      <input type="search" aria-label="Search tenants and borrowers" placeholder="Search name, shop, phone…" value={q}
        onChange={(e) => setQ(e.target.value)} className="field !py-2 text-sm" />
      {res && (
        <div className="glass-in mt-2 max-h-80 overflow-y-auto rounded-2xl p-1.5" aria-live="polite">
          {res.tenants.length + res.borrowers.length === 0 && <p className="px-3 py-2 text-sm font-semibold text-muted">No matches.</p>}
          {res.tenants.map((t) => (
            <NavLink key={`t${t.agreementId}`} to={`/agreements/${t.agreementId}`} className={link}>
              <span className="block truncate font-bold">{t.name}{t.status === 'ENDED' ? ' (moved out)' : ''}</span>
              <span className="block truncate text-xs opacity-75">{t.unit} · {t.category} · {t.phone}</span>
            </NavLink>
          ))}
          {res.borrowers.map((b) => (
            <NavLink key={`b${b.id}`} to={`/lending/borrowers/${b.id}`} className={link}>
              <span className="block truncate font-bold">{b.name}</span>
              <span className="block truncate text-xs opacity-75">Borrower · {b.phone}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2.5 pb-3.5 pt-1 text-[17px] font-black">
      <Logo />
      FinLedger
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const drawer = useRef(null);
  useDialog(open, () => setOpen(false), drawer);

  useEffect(() => {
    const load = () => api.getCategories().then((c) => setCats(c.filter((x) => !x.archived))).catch(() => {});
    load();
    window.addEventListener('categories:changed', load);
    return () => window.removeEventListener('categories:changed', load);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const menu = (
    <nav aria-label="Main" className="flex flex-col gap-2">
      <Brand />
      <GlobalSearch />
      <NavLink to="/" end className={item}>Overview</NavLink>
      <div className="px-3 pt-2.5 text-[10px] font-extrabold uppercase tracking-[.08em] text-muted">Ledgers</div>
      <NavLink to="/lending" className={item}>Lending</NavLink>
      {cats.map((c) => <NavLink key={c.id} to={`/c/${c.id}`} className={item}>{c.name}</NavLink>)}
      <NavLink to="/owe" className={item}>Money I owe</NavLink>
      <button type="button" onClick={() => { setOpen(false); setNewCat(true); }} className="mt-1.5 rounded-2xl border border-dashed border-ink/40 px-3.5 py-2.5 text-center font-bold text-muted hover:text-ink">+ New category</button>
      <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
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
      <Backdrop />
      <header className="mb-3 flex items-center justify-between md:hidden">
        <Brand />
        <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="btn !p-3 !rounded-2xl"><Menu size={20} /></button>
      </header>
      <aside className="glass sticky top-6 hidden h-fit max-h-[calc(100vh-3rem)] w-52 shrink-0 overflow-y-auto rounded-xl3 px-3 py-4 md:block">{menu}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} />
          <div ref={drawer} tabIndex={-1} className="glass-pop outline-none absolute inset-y-0 left-0 w-64 max-w-[85vw] overflow-y-auto rounded-r-xl3 px-3 py-4">
            <button type="button" data-autofocus aria-label="Close menu" onClick={() => setOpen(false)} className="btn !p-2 !rounded-full absolute right-3 top-3"><X size={16} /></button>
            {menu}
          </div>
        </div>
      )}
      <main className="min-w-0 flex-1"><Outlet /></main>
      <NewCategoryModal open={newCat} onClose={() => setNewCat(false)}
        onCreated={(c) => { setNewCat(false); refreshCategories(); navigate(`/c/${c.id}/manage`); }} />
    </div>
  );
}

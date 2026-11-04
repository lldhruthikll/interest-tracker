import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');

export function Button({ variant = 'primary', className, ...p }) {
  return <button type="button" className={cx(variant === 'primary' ? 'btn-primary' : 'btn', className)} {...p} />;
}
export const Card = ({ className, ...p }) => <div className={cx('neu rounded-xl3 p-5', className)} {...p} />;
export const InsetCard = ({ className, ...p }) => <div className={cx('neu-in rounded-xl3 p-5', className)} {...p} />;

export function StatCard({ label, value, note, tone = 'neutral' }) {
  return (
    <div className={cx('clay rounded-3xl p-4', `clay-${tone}`)}>
      <div className="text-[11px] font-extrabold opacity-90 mb-1.5">{label}</div>
      <div className="text-xl font-black tabnum">{value}</div>
      {note && <div className="text-[11px] font-bold mt-1 opacity-90">{note}</div>}
    </div>
  );
}

const STATUS = {
  PAID: ['Paid', 'paid'], PARTIAL: ['Partial', 'partial'], PARTIALLY_PAID: ['Partial', 'partial'],
  OVERDUE: ['Overdue', 'overdue'], DUE_TODAY: ['Due today', 'partial'], UPCOMING: ['Upcoming', 'neutral'],
  PENDING: ['Pending', 'neutral'], VACANT: ['Vacant', null],
};
export function StatusPill({ status }) {
  const [text, tone] = STATUS[status] || [String(status || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), 'neutral'];
  return <span className={cx('pill', tone ? `clay-${tone}` : 'neu-in text-muted')}>{text}</span>;
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="group">
      {options.map((o) => {
        const { value: v, label } = typeof o === 'object' ? o : { value: o, label: o };
        const on = v === value;
        return (
          <button key={v} type="button" aria-pressed={on} onClick={() => onChange(v)}
            className={cx('rounded-full px-4 py-2 font-bold', on ? 'neu-in text-accent-ink' : 'neu text-muted')}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Shared dialog behavior: initial focus, Tab trap, Escape, focus restore. Depends only on `open`.
export function useDialog(open, onClose, ref) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const el = ref.current;
    (el.querySelector('[data-autofocus],input,select,textarea,button:not([data-close])') || el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') return cb.current();
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open, ref]);
}

export function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useDialog(open, onClose, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="neu outline-none rounded-xl3 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-xl font-black">{title}</h2>
          <button data-close type="button" aria-label="Close" onClick={onClose} className="btn !p-2 !rounded-full"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, className, ...p }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-extrabold mb-1.5">{label}</label>
      <input id={id} className="field" aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} {...p} />
      {error && <p id={`${id}-e`} role="alert" className="text-sm font-bold text-clay-overdue-ink mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, error, options = [], className, children, ...p }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="block text-sm font-extrabold mb-1.5">{label}</label>}
      <select id={id} className="field" {...p}>
        {children || options.map((o) => (typeof o === 'object'
          ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
      {error && <p role="alert" className="text-sm font-bold text-clay-overdue-ink mt-1">{error}</p>}
    </div>
  );
}

// columns: [{key, header, render?(row), align?: 'right'}]
export function Table({ columns, rows, empty = 'Nothing here yet.' }) {
  return (
    <div className="neu-in rounded-3xl px-4 py-2 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="text-[11px] text-muted font-extrabold">
            {columns.map((c) => <th key={c.key} scope="col" className={cx('py-3 px-1', c.align === 'right' && 'text-right')}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t-2 border-dotted border-line">
              {columns.map((c) => (
                <td key={c.key} className={cx('py-3 px-1 font-semibold', c.align === 'right' && 'text-right tabnum')}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="py-6 text-center text-muted font-bold">{empty}</p>}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="neu-in rounded-3xl p-8 text-center">
      <p className="font-black text-lg">{title}</p>
      {children && <p className="text-muted font-semibold mt-1">{children}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p role="alert" className="neu-in rounded-2xl px-4 py-3 text-sm font-bold text-clay-overdue-ink">{children}</p>;
}

export const Loading = ({ children = 'Loading…' }) => (
  <div role="status" className="flex h-48 items-center justify-center font-bold text-muted">{children}</div>
);

export const PageHeader = ({ title, sub, children }) => (
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <h1 className="text-2xl font-black">{title}</h1>
      {sub && <p className="text-sm font-semibold text-muted">{sub}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
  </div>
);

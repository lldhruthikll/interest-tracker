import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');

export function Button({ variant = 'primary', className, ...p }) {
  return <button type="button" className={cx(variant === 'primary' ? 'btn-primary' : 'btn', className)} {...p} />;
}
export const Card = ({ className, ...p }) => <div className={cx('glass rounded-xl3 p-5', className)} {...p} />;
export const InsetCard = ({ className, ...p }) => <div className={cx('glass-in rounded-xl3 p-5', className)} {...p} />;

// Tone marker (no color): Paid solid, Partial grey, Overdue dashed, Advance hollow, Neutral faint.
const MARK = {
  paid: 'bg-ink', partial: 'bg-muted', overdue: 'border-2 border-dashed border-ink',
  advance: 'border-2 border-ink', neutral: 'bg-ink/20',
};
export function StatCard({ label, value, note, tone = 'neutral' }) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0 rounded-sm', MARK[tone] || MARK.neutral)} />{label}
      </div>
      <div className="text-xl font-extrabold tabnum">{value}</div>
      {note && <div className="mt-1 text-[11px] font-medium text-muted">{note}</div>}
    </div>
  );
}

const STATUS = {
  PAID: ['Paid', 'paid'], PARTIAL: ['Partial', 'partial'], PARTIALLY_PAID: ['Partial', 'partial'],
  OVERDUE: ['Overdue', 'overdue'], DUE_TODAY: ['Due today', 'due'], UPCOMING: ['Upcoming', 'neutral'],
  PENDING: ['Pending', 'neutral'], VACANT: ['Vacant', 'neutral'],
};
export function StatusPill({ status }) {
  const [text, tone] = STATUS[status] || [String(status || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), 'neutral'];
  return (
    <span className={cx('pill', `tone-${tone}`)}>
      {tone === 'overdue' && <span aria-hidden="true">! </span>}{text}
    </span>
  );
}

export const Logo = ({ className = 'h-[26px] w-[26px] rounded-[9px]' }) => <span aria-hidden="true" className={cx('inline-block bg-ink', className)} />;

// Soft blurred grey shapes behind the page; colors come from theme tokens.
export const Backdrop = () => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <span className="blob blob-1" /><span className="blob blob-2" /><span className="blob blob-3" />
  </div>
);

export function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2.5" role="group">
      {options.map((o) => {
        const { value: v, label } = typeof o === 'object' ? o : { value: o, label: o };
        const on = v === value;
        return (
          <button key={v} type="button" aria-pressed={on} onClick={() => onChange(v)}
            className={cx('chip', on && 'chip-on')}>
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
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="glass-pop outline-none rounded-xl3 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-xl font-black">{title}</h2>
          <button data-close type="button" aria-label="Close" onClick={onClose} className="btn !p-2 !rounded-full"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, error, className, ...p }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">{label}</label>
      <input id={id} className="field" aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} {...p} />
      {error && <p id={`${id}-e`} role="alert" className="text-sm font-bold text-ink mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, error, options = [], className, children, ...p }) {
  const id = useId();
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="block text-sm font-semibold mb-1.5">{label}</label>}
      <select id={id} className="field" {...p}>
        {children || options.map((o) => (typeof o === 'object'
          ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}
      </select>
      {error && <p role="alert" className="text-sm font-bold text-ink mt-1">{error}</p>}
    </div>
  );
}

// columns: [{key, header, render?(row), align?: 'right'}]
export function Table({ columns, rows, empty = 'Nothing here yet.' }) {
  return (
    <div className="glass-in rounded-3xl px-4 py-2 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="text-[11px] text-muted font-semibold uppercase tracking-wide">
            {columns.map((c) => <th key={c.key} scope="col" className={cx('py-3 px-1', c.align === 'right' && 'text-right')}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t border-line">
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
    <div className="glass-in rounded-3xl p-8 text-center">
      <p className="font-black text-lg">{title}</p>
      {children && <p className="text-muted font-semibold mt-1">{children}</p>}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p role="alert" className="glass-in rounded-2xl border-dashed !border-ink px-4 py-3 text-sm font-semibold text-ink"><span aria-hidden="true">! </span>{children}</p>;
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

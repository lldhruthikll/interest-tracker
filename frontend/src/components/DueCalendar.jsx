import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatINR, todayIST } from '../lib/format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

// Event word + tone from amount/paid/date (all ledgers share this).
export function eventState(e, today) {
  if (e.status === 'PAID' || (e.amount > 0 && e.paid >= e.amount)) return ['paid', 'Paid'];
  if (e.paid > 0) return ['partial', 'Partial'];
  return e.date < today ? ['overdue', 'Overdue'] : ['neutral', 'Upcoming'];
}

// Controlled month grid: `month` is {year, month0}; events are /calendar items.
export default function DueCalendar({ events = [], month, onMonthChange, subtitle }) {
  const { year, month0 } = month;
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month0, 1).getDay();
  const todayStr = todayIST();
  const go = (y, m) => { const d = new Date(y, m, 1); onMonthChange({ year: d.getFullYear(), month0: d.getMonth() }); };

  const byDate = new Map();
  events.forEach((e) => byDate.set(e.date, [...(byDate.get(e.date) || []), e]));
  const days = [...Array(firstDayOfWeek).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="neu rounded-xl3 p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{MONTHS[month0]} {year}</h2>
          {subtitle && <p className="text-sm font-semibold text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" className="btn !p-2.5" onClick={() => go(year, month0 - 1)}><ChevronLeft size={18} /></button>
          <button type="button" className="btn" onClick={() => { const [y, m] = todayStr.split('-').map(Number); onMonthChange({ year: y, month0: m - 1 }); }}>Today</button>
          <button type="button" aria-label="Next month" className="btn !p-2.5" onClick={() => go(year, month0 + 1)}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1 text-xs font-extrabold text-muted">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((n, idx) => {
              if (!n) return <div key={`e-${idx}`} className="h-28" />;
              const dateStr = `${year}-${pad(month0 + 1)}-${pad(n)}`;
              const isToday = dateStr === todayStr;
              const list = byDate.get(dateStr) || [];
              return (
                <div key={dateStr} className={`flex h-28 flex-col gap-1 overflow-hidden rounded-2xl p-2 ${isToday ? 'neu ring-2 ring-accent-ink' : 'neu-in'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${isToday ? 'text-accent-ink' : 'text-ink'}`}>{n}{isToday && ' · Today'}</span>
                    {list.length > 0 && <span className="text-[10px] font-extrabold text-muted">{list.length} due</span>}
                  </div>
                  <div className="space-y-1 overflow-y-auto">
                    {list.map((e, i) => {
                      const [tone, word] = eventState(e, todayStr);
                      const left = Math.max(e.amount - e.paid, 0);
                      return (
                        <Link key={i} to={e.link} className={`clay-${tone} block truncate rounded-lg px-1.5 py-1 text-[11px] font-bold`}
                          title={`${e.ledgerName}: ${e.title} - ${word} - ${formatINR(left || e.amount)}`}>
                          <div className="truncate">{e.title}</div>
                          <div className="tabnum text-[10px]">{formatINR(left || e.amount)} · {word}</div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

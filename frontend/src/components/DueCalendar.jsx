import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatINR } from '../lib/format';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

export default function DueCalendar({ events = [] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const t = new Date();
  const todayStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

  // dueDate is 'YYYY-MM-DD': group by the string itself, no Date parsing.
  const eventsByDate = new Map();
  events.forEach((evt) => {
    const k = String(evt.dueDate).slice(0, 10);
    if (!eventsByDate.has(k)) eventsByDate.set(k, []);
    eventsByDate.get(k).push(evt);
  });

  const days = [...Array(firstDayOfWeek).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="neu rounded-xl3 p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{MONTHS[month]} {year}</h2>
          <p className="text-sm font-semibold text-muted">Monthly interest due schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" className="btn !p-2.5" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}><ChevronLeft size={18} /></button>
          <button type="button" className="btn" onClick={() => setCurrentMonth(new Date())}>Today</button>
          <button type="button" aria-label="Next month" className="btn !p-2.5" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1 text-xs font-extrabold text-muted">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((dayNumber, idx) => {
              if (!dayNumber) return <div key={`e-${idx}`} className="h-28" />;
              const dateStr = `${year}-${pad(month + 1)}-${pad(dayNumber)}`;
              const isToday = dateStr === todayStr;
              const dayEvents = eventsByDate.get(dateStr) || [];
              return (
                <div key={dateStr} className={`flex h-28 flex-col gap-1 overflow-hidden rounded-2xl p-2 ${isToday ? 'neu ring-2 ring-accent-ink' : 'neu-in'}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${isToday ? 'text-accent-ink' : 'text-ink'}`}>{dayNumber}{isToday && ' · Today'}</span>
                    {dayEvents.length > 0 && <span className="text-[10px] font-extrabold text-muted">{dayEvents.length} due</span>}
                  </div>
                  <div className="space-y-1 overflow-y-auto">
                    {dayEvents.map((evt) => {
                      const isPaid = evt.status === 'PAID';
                      const isOverdue = !isPaid && dateStr < todayStr;
                      const [tone, word] = isPaid ? ['paid', 'Paid'] : isOverdue ? ['overdue', 'Overdue'] : ['neutral', 'Upcoming'];
                      return (
                        <div key={evt.id} className={`clay-${tone} truncate rounded-lg px-1.5 py-1 text-[11px] font-bold`}
                          title={`${evt.borrowerName} - ${word} - Pending: ${formatINR(evt.pendingAmount)}`}>
                          <div className="truncate">{evt.borrowerName}</div>
                          <div className="tabnum text-[10px]">{formatINR(evt.pendingAmount > 0 ? evt.pendingAmount : evt.amount)} · {word}</div>
                        </div>
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

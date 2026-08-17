import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function DueCalendar({ events = [] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const todayLocal = new Date();
  const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;

  // Group events by local YYYY-MM-DD (consistent with calendar grid which uses local year/month/day)
  const eventsByDate = new Map();
  events.forEach((evt) => {
    const d = new Date(evt.dueDate);
    // Use local date parts so the grouping matches the calendar grid date strings
    const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!eventsByDate.has(dStr)) {
      eventsByDate.set(dStr, []);
    }
    eventsByDate.get(dStr).push(evt);
  });

  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      {/* Month & Navigation Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">
              {monthNames[month]} {year}
            </h2>
            <p className="text-xs text-slate-400">Monthly Interest Due Schedule</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-400 transition-colors"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-2 mb-2 text-center">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-xs font-bold text-slate-500 uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((dayNumber, idx) => {
          if (!dayNumber) {
            return <div key={`empty-${idx}`} className="h-28 rounded-xl bg-slate-950/30 border border-slate-900/50" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const dayEvents = eventsByDate.get(dateStr) || [];

          return (
            <div
              key={dateStr}
              className={`h-28 rounded-xl p-2 border flex flex-col justify-between overflow-hidden transition-all ${
                isToday
                  ? 'bg-cyan-950/30 border-cyan-500/50 ring-1 ring-cyan-500/30'
                  : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-extrabold w-6 h-6 rounded-full flex items-center justify-center ${
                    isToday ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                  }`}
                >
                  {dayNumber}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-md">
                    {dayEvents.length} due
                  </span>
                )}
              </div>

              {/* Event items */}
              <div className="space-y-1 overflow-y-auto max-h-16 pr-1">
                {dayEvents.map((evt) => {
                  const isPaid = evt.status === 'PAID';
                  const isOverdue = !isPaid && dateStr < todayStr;

                  let badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
                  if (isPaid) badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  else if (isOverdue) badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                  return (
                    <div
                      key={evt.id}
                      className={`text-[11px] font-medium px-1.5 py-1 rounded-md border truncate ${badgeColor}`}
                      title={`${evt.borrowerName} - Pending: ₹${evt.pendingAmount}`}
                    >
                      <div className="truncate font-semibold">{evt.borrowerName}</div>
                      <div className="text-[10px] opacity-80">₹{evt.pendingAmount > 0 ? evt.pendingAmount : evt.amount}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

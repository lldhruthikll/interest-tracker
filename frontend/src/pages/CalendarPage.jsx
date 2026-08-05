import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import DueCalendar from '../components/DueCalendar';

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getDashboard()
      .then((data) => {
        setEvents(data.calendarEvents || []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load calendar events');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mr-3" />
        Loading Calendar...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">
          Collection Calendar
        </h1>
        <p className="text-xs text-slate-400">
          Visual monthly schedule for interest due dates and payment statuses
        </p>
      </div>

      <DueCalendar events={events} />
    </div>
  );
}

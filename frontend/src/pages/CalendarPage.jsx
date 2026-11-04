import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import DueCalendar from '../components/DueCalendar';
import { Loading, ErrorNote, PageHeader, Chips } from '../components/ui';
import { todayIST } from '../lib/format';

const pad = (n) => String(n).padStart(2, '0');

export default function CalendarPage() {
  const [month, setMonth] = useState(() => { const [y, m] = todayIST().split('-').map(Number); return { year: y, month0: m - 1 }; });
  const [ledger, setLedger] = useState('');
  const [cats, setCats] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { api.getCategories().then((c) => setCats(c.filter((x) => !x.archived))).catch(() => {}); }, []);

  useEffect(() => {
    let live = true;
    const { year, month0 } = month;
    const last = new Date(year, month0 + 1, 0).getDate();
    setLoading(true); setError('');
    api.getCalendar(`${year}-${pad(month0 + 1)}-01`, `${year}-${pad(month0 + 1)}-${pad(last)}`, ledger)
      .then((d) => live && setEvents(d))
      .catch((err) => live && setError(err.message || 'Failed to load calendar events'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [month, ledger]);

  const options = [{ value: '', label: 'All ledgers' }, { value: 'lending', label: 'Lending' },
    ...cats.map((c) => ({ value: `category:${c.id}`, label: c.name }))];

  return (
    <div className="space-y-6">
      <PageHeader title="Collection Calendar" sub="Due dates and payment status across all ledgers" />
      <Chips options={options} value={ledger} onChange={setLedger} />
      <ErrorNote>{error}</ErrorNote>
      {loading && !events.length ? <Loading>Loading calendar…</Loading>
        : <DueCalendar events={events} month={month} onMonthChange={setMonth} subtitle={ledger ? options.find((o) => o.value === ledger)?.label : 'All ledgers'} />}
    </div>
  );
}

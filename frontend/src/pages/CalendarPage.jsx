import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import DueCalendar from '../components/DueCalendar';
import { Loading, ErrorNote, PageHeader } from '../components/ui';

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDashboard()
      .then((data) => setEvents(data.calendarEvents || []))
      .catch((err) => setError(err.message || 'Failed to load calendar events'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading>Loading calendar…</Loading>;
  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="space-y-6">
      <PageHeader title="Collection Calendar" sub="Visual monthly schedule for interest due dates and payment statuses" />
      <DueCalendar events={events} />
    </div>
  );
}

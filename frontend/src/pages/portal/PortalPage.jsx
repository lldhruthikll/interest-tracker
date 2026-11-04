import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Card, StatCard, StatusPill, EmptyState, Loading, ErrorNote } from '../../components/ui';
import { formatINR, formatDate, formatAnyDate, periodLabel, todayIST } from '../../lib/format';

const METHOD = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank', CHEQUE: 'Cheque', ADVANCE: 'Advance applied' };

function dueStatus(d, today) {
  const paid = Number(d.paidAmount), amt = Number(d.amount);
  if (paid >= amt) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return String(d.dueDate).slice(0, 10) < today ? 'OVERDUE' : 'PENDING';
}

function AgreementCard({ a, today }) {
  const owing = a.unpaid > 0;
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-black">{a.unitName}</h2>
        <p className="font-semibold text-muted">{a.categoryName} · {a.placeName}{a.status === 'ENDED' ? ` · Ended ${formatDate(a.endDate)}` : ''}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Monthly amount" value={formatINR(a.amount)} note={`Due on day ${a.dueDay}`} />
        <StatCard label="Due now" value={formatINR(a.unpaid)} tone={owing ? 'overdue' : 'paid'} note={owing ? 'Please pay' : 'All paid'} />
      </div>
      {a.advanceHeld > 0 && <p className="font-bold">Advance held: {formatINR(a.advanceHeld)}</p>}
      {a.credit > 0 && <p className="font-bold">Credit: {formatINR(a.credit)}</p>}
      <div>
        <h3 className="mb-2 font-black">Month by month</h3>
        <ul className="space-y-2">
          {[...a.dues].reverse().map((d) => (
            <li key={d.period} className="glass-in flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <div>
                <p className="font-extrabold">{periodLabel(d.period)}</p>
                <p className="text-sm font-semibold text-muted">Due {formatDate(String(d.dueDate).slice(0, 10))}</p>
              </div>
              <div className="text-right">
                <p className="font-extrabold tabnum">{formatINR(d.paidAmount)} of {formatINR(d.amount)}</p>
                <StatusPill status={dueStatus(d, today)} />
              </div>
            </li>
          ))}
          {!a.dues.length && <li className="font-semibold text-muted">No dues yet.</li>}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 font-black">Payments</h3>
        <ul className="space-y-2">
          {a.payments.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 px-1 font-semibold">
              <span>{formatAnyDate(p.paymentDate)} · {METHOD[p.method] || p.method}</span>
              <span className="font-extrabold tabnum">{formatINR(p.amount)}</span>
            </li>
          ))}
          {!a.payments.length && <li className="font-semibold text-muted">No payments recorded.</li>}
        </ul>
      </div>
    </Card>
  );
}

export default function PortalPage() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getPortalMe().then(setD).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!d) return <Loading />;
  const today = todayIST();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Hello, {d.payer.name}</h1>
      {d.agreements.map((a, i) => <AgreementCard key={i} a={a} today={today} />)}
      {!d.agreements.length && <EmptyState title="Nothing to show yet">No rentals are linked to your account.</EmptyState>}
      <Link to="/change-password" className="btn block !py-4 text-center">Change password</Link>
    </div>
  );
}

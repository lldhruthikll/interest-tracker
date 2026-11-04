import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, StatCard, StatusPill, Table, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatDate, formatAnyDate, periodLabel, todayIST } from '../../lib/format';
import RecurringPaymentModal from './modals/RecurringPaymentModal';
import RentChangeModal from './modals/RentChangeModal';
import BillingModal from './modals/BillingModal';
import MoveOutModal from './modals/MoveOutModal';

const TIMING = { IN_ADVANCE: 'In advance', IN_ARREARS: 'In arrears' };
const RULE = { PRORATED: 'Prorated', FULL: 'Full month', FREE: 'Free' };
const ADV = { RECEIVED: 'Received', APPLIED_TO_RENT: 'Applied to rent', RETAINED: 'Retained', REFUNDED: 'Refunded', CREDIT_REFUNDED: 'Credit refunded' };
const METHOD = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank', CHEQUE: 'Cheque', ADVANCE: 'Advance applied' };

function dueStatus(d, today) {
  const paid = Number(d.paidAmount); const amt = Number(d.amount);
  if (paid >= amt) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return String(d.dueDate).slice(0, 10) < today ? 'OVERDUE' : 'PENDING';
}
const Section = ({ title, children }) => <Card className="space-y-3"><h2 className="text-lg font-black">{title}</h2>{children}</Card>;
const Row = ({ k, v }) => <div className="flex justify-between gap-4 py-1"><dt className="font-bold text-muted">{k}</dt><dd className="text-right font-extrabold tabnum">{v}</dd></div>;

export default function AgreementDetailPage() {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [modal, setModal] = useState(null); // 'pay' | {edit: payment} | 'rent' | 'billing' | 'out'
  const load = useCallback(() => api.getAgreement(id).then((d) => { setA(d); setError(''); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { setA(null); load(); }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!a) return <Loading />;
  const cat = a.unit.place.category;
  const today = todayIST();
  const ended = a.status === 'ENDED';
  const b = a.balances;
  const rupees = (p) => formatINR(p / 100);
  const currentRate = [...a.rateChanges].reverse().find((r) => r.effectiveFrom <= today.slice(0, 7)) || a.rateChanges[0];
  const done = () => { setModal(null); load(); };
  const label = `${a.unit.name} · ${a.payer.name}`;

  const del = async (p) => {
    if (!window.confirm('Delete this payment? This cannot be undone.')) return;
    setActionError('');
    try { await api.deleteRecurringPayment(p.id); await load(); } catch (e) { setActionError(e.message); }
  };

  const duesCols = [
    { key: 'period', header: 'Month', render: (d) => periodLabel(d.period) },
    { key: 'dueDate', header: 'Due date', render: (d) => formatDate(String(d.dueDate).slice(0, 10)) },
    { key: 'amount', header: 'Amount', align: 'right', render: (d) => formatINR(d.amount) },
    { key: 'paid', header: 'Paid', align: 'right', render: (d) => formatINR(d.paidAmount) },
    { key: 'status', header: 'Status', render: (d) => <StatusPill status={dueStatus(d, today)} /> },
  ];
  const payCols = [
    { key: 'date', header: 'Date', render: (p) => formatAnyDate(p.paymentDate) },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => formatINR(p.amount) },
    { key: 'method', header: 'Method', render: (p) => METHOD[p.method] || p.method },
    { key: 'notes', header: 'Notes', render: (p) => p.notes || '' },
    { key: 'act', header: '', render: (p) => (p.method === 'ADVANCE' || ended
      ? <span className="text-sm font-bold text-muted">Locked</span>
      : <span className="flex gap-2">
        <Button className="!px-3 !py-1 text-sm" onClick={() => setModal({ edit: p })}>Edit</Button>
        <Button className="!px-3 !py-1 text-sm" onClick={() => del(p)}>Delete</Button>
      </span>) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`${a.unit.name} · ${a.payer.name}`} sub={`${cat.name} · ${cat.placeLabel}: ${a.unit.place.name}${ended ? ` · Ended ${formatAnyDate(a.endDate)}` : ''}`}>
        <Link className="btn" to={`/c/${cat.id}`}>Back</Link>
        {!ended && <Button onClick={() => setModal('pay')}>+ Record payment</Button>}
        {!ended && <Button variant="secondary" onClick={() => setModal('rent')}>Change rent</Button>}
        {!ended && <Button variant="secondary" onClick={() => setModal('billing')}>Billing settings</Button>}
        {!ended && <Button variant="secondary" onClick={() => setModal('out')}>Move out</Button>}
      </PageHeader>
      <ErrorNote>{actionError}</ErrorNote>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Unpaid" value={rupees(b.unpaidPaise)} tone="partial" />
        <StatCard label="Overdue" value={rupees(b.overduePaise)} tone={b.overduePaise ? 'overdue' : 'neutral'} />
        <StatCard label="Credit" value={rupees(b.creditPaise)} note="Paid ahead" tone="neutral" />
        <StatCard label="Advance held" value={rupees(b.advanceHeldPaise)} note="Not income" tone="advance" />
      </div>

      <Section title="Agreement">
        <dl>
          <Row k={cat.payerLabel} v={`${a.payer.name} · ${a.payer.phone}`} />
          <Row k={cat.unitLabel} v={`${a.unit.name} (${cat.placeLabel}: ${a.unit.place.name})`} />
          <Row k="Category" v={cat.name} />
          <Row k="Current amount" v={formatINR(currentRate?.amount)} />
          <Row k="Due day" v={a.dueDay} />
          <Row k="Billing" v={TIMING[a.timing]} />
          <Row k="First month" v={RULE[a.firstMonthRule]} />
          <Row k="Last month" v={RULE[a.lastMonthRule]} />
          <Row k="Start date" v={formatAnyDate(a.startDate)} />
          {ended && <Row k="End date" v={formatAnyDate(a.endDate)} />}
          {a.notes && <Row k="Notes" v={a.notes} />}
        </dl>
      </Section>

      <Section title="Monthly dues"><Table columns={duesCols} rows={a.dues} empty="No dues yet." /></Section>
      <Section title="Payments"><Table columns={payCols} rows={a.payments} empty="No payments yet." /></Section>
      <Section title="Rent history">
        <Table columns={[
          { key: 'effectiveFrom', header: 'From', render: (r) => periodLabel(r.effectiveFrom) },
          { key: 'amount', header: 'Monthly amount', align: 'right', render: (r) => formatINR(r.amount) },
        ]} rows={a.rateChanges} />
      </Section>
      <Section title="Advance">
        <Table columns={[
          { key: 'date', header: 'Date', render: (e) => formatAnyDate(e.date) },
          { key: 'type', header: 'Type', render: (e) => ADV[e.type] || e.type },
          { key: 'amount', header: 'Amount', align: 'right', render: (e) => formatINR(e.amount) },
          { key: 'notes', header: 'Notes', render: (e) => e.notes || '' },
        ]} rows={a.advances} empty="No advance recorded." />
      </Section>

      {modal === 'pay' && <RecurringPaymentModal open agreement={{ id: a.id, label }} unpaid={b.unpaidPaise / 100} onClose={() => setModal(null)} onDone={done} />}
      {modal?.edit && <RecurringPaymentModal open agreement={{ id: a.id, label }} payment={modal.edit} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'rent' && <RentChangeModal open agreementId={a.id} current={currentRate?.amount} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'billing' && <BillingModal open agreement={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'out' && <MoveOutModal open agreement={a} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

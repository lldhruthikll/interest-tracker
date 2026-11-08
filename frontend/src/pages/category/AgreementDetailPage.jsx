import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, Modal, Field, StatCard, StatusPill, Table, Loading, ErrorNote, PageHeader, SmsToggle } from '../../components/ui';
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
function AdvanceModal({ agreementId, onClose, onDone }) {
  const [f, setF] = useState({ amount: '', date: todayIST(), notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api.addAdvance(agreementId, { type: 'RECEIVED', amount: f.amount, date: f.date, notes: f.notes.trim() }); onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Add advance received" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Amount (₹)" type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} />
        <Field label="Date" type="date" required max={todayIST()} value={f.date} onChange={set('date')} />
        <Field label="Notes (optional)" value={f.notes} onChange={set('notes')} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !(Number(f.amount) > 0)}>{busy ? 'Saving…' : 'Save advance'}</Button>
        </div>
      </form>
    </Modal>
  );
}
function TenantModal({ payer, label, onClose, onDone }) {
  const [f, setF] = useState({ name: payer.name, phone: payer.phone, notes: payer.notes || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api.updatePayer(payer.id, { name: f.name.trim(), phone: f.phone.trim(), notes: f.notes.trim() }); onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title={`Edit ${label.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label="Name" required value={f.name} onChange={set('name')} />
        <Field label="Phone" type="tel" required value={f.phone} onChange={set('phone')} />
        <Field label="Notes (optional)" value={f.notes} onChange={set('notes')} />
        <p className="text-sm font-semibold text-muted">Changes apply everywhere this {label.toLowerCase()} appears, including other units they rent.</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PreviousBalanceModal({ agreementId, current, onClose, onDone }) {
  const [amount, setAmount] = useState(current ? String(current) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api.setPreviousBalance(agreementId, amount === '' ? 0 : amount); onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Previous balance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <p className="text-sm font-semibold text-muted">What this tenant already owed you before you started tracking them here. It is added to what they owe, and their payments clear it first. Enter 0 to remove it.</p>
        <Field label="Previous balance (₹)" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
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
  const prev = a.dues.find((d) => d.period === '0000-00');

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
    { key: 'owe', header: 'Paid to', render: (p) => (p.debtEntry
      ? <Link className="text-ink underline" to={`/owe/${p.debtEntry.creditor.id}`}>{p.debtEntry.creditor.name} ({formatINR(p.debtEntry.amount)})</Link> : '') },
    { key: 'act', header: '', render: (p) => (p.method === 'ADVANCE' || ended
      ? <span className="text-sm font-bold text-muted">Locked</span>
      : <span className="flex gap-2">
        <Button className="!px-3 !py-1 text-sm" onClick={() => setModal({ edit: p })}>Edit</Button>
        <Button className="!px-3 !py-1 text-sm" onClick={() => del(p)}>Delete</Button>
      </span>) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`${a.unit.name} · ${a.payer.name}`} sub={`${cat.name}${cat.placeLabel ? ` · ${cat.placeLabel}: ${a.unit.place.name}` : ''}${ended ? ` · Ended ${formatAnyDate(a.endDate)}` : ''}`}>
        <Link className="btn" to={`/c/${cat.id}`}>Back</Link>
        {(!ended || b.unpaidPaise > 0) && <Button onClick={() => setModal('pay')}>+ Record payment</Button>}
        {!ended && <Button variant="secondary" onClick={() => setModal('rent')}>Change rent</Button>}
        <Button variant="secondary" onClick={() => setModal('tenant')}>Edit {cat.payerLabel.toLowerCase()}</Button>
        {!ended && <Button variant="secondary" onClick={() => setModal('prev')}>Previous balance</Button>}
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
          {prev && <Row k="Previous balance" v={`${formatINR(prev.amount)}${Number(prev.paidAmount) >= Number(prev.amount) ? ' (cleared)' : Number(prev.paidAmount) > 0 ? ` (${formatINR(prev.amount - prev.paidAmount)} left)` : ''}`} />}
          <Row k={cat.unitLabel} v={cat.placeLabel ? `${a.unit.name} (${cat.placeLabel}: ${a.unit.place.name})` : a.unit.name} />
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
        <SmsToggle key={a.payer.id} checked={a.payer.smsReminders} label={`Send SMS reminders to ${a.payer.name}`}
          onSave={(v) => api.updatePayer(a.payer.id, { smsReminders: v })} />
      </Section>

      <Section title="Monthly dues"><Table columns={duesCols} rows={a.dues} empty="No dues yet." /></Section>
      <Section title="Payments"><Table columns={payCols} rows={a.payments} empty="No payments yet." /></Section>
      {a.pastAgreements?.length > 0 && (
        <Section title={`Past tenants on this ${cat.unitLabel.toLowerCase()}`}>
          <Table columns={[
            { key: 'payer', header: cat.payerLabel, render: (x) => <Link className="font-extrabold text-ink underline" to={`/agreements/${x.id}`}>{x.payer?.name}</Link> },
            { key: 'start', header: 'From', render: (x) => formatAnyDate(x.startDate) },
            { key: 'end', header: 'To', render: (x) => (x.endDate ? formatAnyDate(x.endDate) : '—') },
            { key: 'status', header: 'Status', render: (x) => <StatusPill status={x.status} /> },
          ]} rows={a.pastAgreements} />
        </Section>
      )}
      <Section title="Rent history">
        <Table columns={[
          { key: 'effectiveFrom', header: 'From', render: (r) => periodLabel(r.effectiveFrom) },
          { key: 'amount', header: 'Monthly amount', align: 'right', render: (r) => formatINR(r.amount) },
        ]} rows={a.rateChanges} />
      </Section>
      <Section title="Advance">
        {!ended && <div><Button variant="secondary" onClick={() => setModal('adv')}>Add advance received</Button></div>}
        <Table columns={[
          { key: 'date', header: 'Date', render: (e) => formatAnyDate(e.date) },
          { key: 'type', header: 'Type', render: (e) => ADV[e.type] || e.type },
          { key: 'amount', header: 'Amount', align: 'right', render: (e) => formatINR(e.amount) },
          { key: 'notes', header: 'Notes', render: (e) => e.notes || '' },
        ]} rows={a.advances} empty="No advance recorded." />
      </Section>

      {modal === 'pay' && <RecurringPaymentModal open agreement={{ id: a.id, label }} unpaid={b.unpaidPaise / 100}
        suggest={a.suggestedCreditorId} canRepay={!ended} onClose={() => setModal(null)} onDone={done} />}
      {modal?.edit && <RecurringPaymentModal open agreement={{ id: a.id, label }} payment={modal.edit} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'tenant' && <TenantModal payer={a.payer} label={cat.payerLabel} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'prev' && <PreviousBalanceModal agreementId={a.id} current={prev?.amount} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'adv' && <AdvanceModal agreementId={a.id} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'rent' && <RentChangeModal open agreementId={a.id} current={currentRate?.amount} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'billing' && <BillingModal open agreement={a} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'out' && <MoveOutModal open agreement={a} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

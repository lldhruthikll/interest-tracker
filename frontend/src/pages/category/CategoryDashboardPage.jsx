import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, Chips, Field, StatCard, StatusPill, Table, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, periodLabel, todayIST } from '../../lib/format';
import useCategory from './useCategory';
import MoveInModal from './modals/MoveInModal';
import RecurringPaymentModal from './modals/RecurringPaymentModal';

const plural = (w) => (/(s|x|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

export default function CategoryDashboardPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { cat, error: catError, reload: reloadCat } = useCategory(categoryId);
  const [placeId, setPlaceId] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [moveIn, setMoveIn] = useState(null); // {unitId?}
  const [paying, setPaying] = useState(false);

  useEffect(() => { setPlaceId(''); setData(null); }, [categoryId]);
  const live = useRef(0); // latest request wins; a stale response never overwrites newer data
  const load = useCallback(() => {
    const n = ++live.current;
    return api.getCategoryDashboard(categoryId, placeId)
      .then((d) => { if (n === live.current) { setData(d); setError(''); } })
      .catch((e) => { if (n === live.current) setError(e.message); });
  }, [categoryId, placeId]);
  useEffect(() => { load(); return () => { live.current += 1; }; }, [load]);

  if (catError || error) return <ErrorNote>{catError || error}</ErrorNote>;
  if (!cat || !data) return <Loading />;
  const { stats: s, units } = data;
  const L = { place: cat.placeLabel, unit: cat.unitLabel, payer: cat.payerLabel };
  const refresh = () => { reloadCat(); return load(); };
  const exportXlsx = async () => { setActionError(''); try { await api.exportCategory(cat.id, cat.name.replace(/\s+/g, '_')); } catch (e) { setActionError(e.message); } };
  const activeUnits = units.filter((u) => u.agreementId);
  const needle = q.trim().toLowerCase();
  const shown = needle ? units.filter((u) => [u.unitName, u.placeName, u.payer?.name, u.payer?.phone]
    .some((v) => v && String(v).toLowerCase().includes(needle))) : units;

  const columns = [
    { key: 'unitName', header: L.unit, render: (u) => (u.agreementId
      ? <Link className="font-extrabold text-ink underline" to={`/agreements/${u.agreementId}`}>{u.unitName}</Link>
      : <button type="button" className="font-extrabold text-ink underline" onClick={() => setMoveIn({ unitId: u.unitId })}>{u.unitName}</button>) },
    ...(L.place ? [{ key: 'placeName', header: L.place }] : []),
    { key: 'payer', header: L.payer, render: (u) => u.payer?.name || '—' },
    { key: 'amount', header: 'Amount', align: 'right', render: (u) => formatINR(u.amount) },
    { key: 'status', header: 'Status', render: (u) => <StatusPill status={u.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={cat.name} sub={[L.place, L.unit, L.payer].filter(Boolean).join(' → ')}>
        <Link className="btn" to={`/c/${cat.id}/manage`}>Manage {L.place || L.unit}</Link>
        <Link className="btn" to={`/c/${cat.id}/settings`}>Settings</Link>
        <Button onClick={exportXlsx}>Export</Button>
        <Button disabled={!activeUnits.length} onClick={() => setPaying(true)}>+ Record payment</Button>
      </PageHeader>

      <ErrorNote>{actionError}</ErrorNote>

      {L.place && data.places.length > 0 && (
        <Chips value={placeId} onChange={setPlaceId}
          options={[{ value: '', label: `All ${plural(L.place.toLowerCase())}` }, ...data.places.map((p) => ({ value: String(p.id), label: p.name }))]} />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Received this month" value={formatINR(s.collectedThisMonth)} note={`of ${formatINR(s.dueThisMonth)} billed for ${periodLabel(todayIST().slice(0, 7)).slice(0, 3)}`} tone="paid" />
        <StatCard label="Pending" value={formatINR(s.pending)} note={s.overdue ? `${formatINR(s.overdue)} overdue` : 'Nothing overdue'} tone={s.overdue ? 'overdue' : 'partial'} />
        <StatCard label="Owed back (not income)" value={formatINR(s.advancesHeld + s.credit)}
          note={`Advances ${formatINR(s.advancesHeld)} · Credit ${formatINR(s.credit)}`} tone="advance" />
        <StatCard label="Occupied" value={`${s.occupied} of ${s.totalUnits}`} note={`${L.unit.toLowerCase()} in use`} tone="neutral" />
        {s.advanceRetained > 0 && <StatCard label="Advance retained" value={formatINR(s.advanceRetained)} note="This month" tone="paid" />}
      </div>

      <Card>
        <div className="mb-3 max-w-sm">
          <Field label={`Search ${L.payer.toLowerCase()}, ${L.unit.toLowerCase()} or phone`} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Table columns={columns} rows={shown} empty={needle ? `No match for "${q.trim()}".` : `No ${L.unit.toLowerCase()} yet. Add some under Manage.`} />
      </Card>

      {moveIn && <MoveInModal open cat={cat} unitId={moveIn.unitId} onClose={() => setMoveIn(null)}
        onDone={(a) => { setMoveIn(null); navigate(`/agreements/${a.id}`); }} />}
      {paying && <RecurringPaymentModal open onClose={() => setPaying(false)}
        agreements={activeUnits.map((u) => ({ id: u.agreementId, label: `${u.unitName} · ${u.payer?.name}` }))}
        onDone={() => { setPaying(false); refresh(); }} />}
    </div>
  );
}

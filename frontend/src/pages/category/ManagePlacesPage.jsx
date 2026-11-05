import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Button, Card, Modal, Field, StatusPill, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR } from '../../lib/format';
import useCategory from './useCategory';

const isUnitKind = (e) => e.kind === 'unit';

// One modal edits or creates a place ({kind:'place'}) or a unit ({kind:'unit'}).
function EditModal({ edit, labels, onClose, onSave }) {
  const [name, setName] = useState(edit.item?.name || '');
  const [amount, setAmount] = useState(edit.item?.defaultAmount ?? '');
  const [extra, setExtra] = useState((isUnitKind(edit) ? edit.item?.notes : edit.item?.address) || '');
  const [error, setError] = useState('');
  const isUnit = edit.kind === 'unit';
  const label = isUnit ? labels.unit : labels.place;
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { await onSave(isUnit ? { name: name.trim(), defaultAmount: amount, notes: extra.trim() } : { name: name.trim(), address: extra.trim() }); } catch (err) { setError(err.message); }
  };
  return (
    <Modal open title={`${edit.item ? 'Edit' : 'Add'} ${label.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Field label={`${label} name`} required value={name} onChange={(e) => setName(e.target.value)} />
        {isUnit && <Field label="Default monthly amount (₹)" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />}
        <Field label={isUnit ? 'Notes (optional)' : 'Address (optional)'} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function ManagePlacesPage() {
  const { categoryId } = useParams();
  const { cat, error: loadError, reload } = useCategory(categoryId);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');

  if (loadError) return <ErrorNote>{loadError}</ErrorNote>;
  if (!cat) return <Loading />;
  const labels = { place: cat.placeLabel, unit: cat.unitLabel };

  const act = async (fn) => { setError(''); try { await fn(); await reload(); } catch (err) { setError(err.message); } };
  const save = async (data) => {
    const { kind, item, placeId } = edit;
    if (kind === 'place') await (item ? api.updatePlace(item.id, data) : api.createPlace(cat.id, data));
    else await (item ? api.updateUnit(item.id, data) : api.createUnit(placeId, data));
    setEdit(null);
    await reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`Manage ${cat.placeLabel} and ${cat.unitLabel}`} sub={cat.name}>
        <Link className="btn" to={`/c/${cat.id}`}>Back</Link>
        <Link className="btn" to={`/c/${cat.id}/settings`}>Settings</Link>
        <Button onClick={() => setEdit({ kind: 'place' })}>+ Add {cat.placeLabel.toLowerCase()}</Button>
      </PageHeader>
      <ErrorNote>{error}</ErrorNote>
      {cat.places.length === 0 && <Card><p className="py-6 text-center font-bold text-muted">No {cat.placeLabel.toLowerCase()} yet. Add the first one.</p></Card>}
      {cat.places.map((p) => (
        <Card key={p.id} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">{p.name} {p.archived && <StatusPill status="Archived" />}</h2>
            <div className="flex flex-wrap gap-2">
              <Button className="!px-3 !py-1.5 text-sm" onClick={() => setEdit({ kind: 'place', item: p })}>Edit</Button>
              <Button className="!px-3 !py-1.5 text-sm" onClick={() => act(() => api.updatePlace(p.id, { archived: !p.archived }))}>{p.archived ? 'Restore' : 'Archive'}</Button>
              {!p.archived && <Button className="!px-3 !py-1.5 text-sm" onClick={() => setEdit({ kind: 'unit', placeId: p.id })}>+ Add {cat.unitLabel.toLowerCase()}</Button>}
            </div>
          </div>
          {p.units.length === 0 ? <p className="font-semibold text-muted">No {cat.unitLabel.toLowerCase()} yet.</p> : (
            <ul className="space-y-2">
              {p.units.map((u) => (
                <li key={u.id} className="glass-in flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5">
                  <div>
                    <span className="font-extrabold">{u.name}</span>{' '}
                    {u.archived ? <StatusPill status="Archived" /> : u.agreement && <span className="text-sm font-semibold text-muted">· {u.agreement.payer?.name}</span>}
                    <div className="text-sm font-semibold text-muted tabnum">Default {formatINR(u.defaultAmount)} / month</div>
                  </div>
                  <div className="flex gap-2">
                    <Button className="!px-3 !py-1.5 text-sm" onClick={() => setEdit({ kind: 'unit', placeId: p.id, item: u })}>Edit</Button>
                    <Button className="!px-3 !py-1.5 text-sm" onClick={() => act(() => api.updateUnit(u.id, { archived: !u.archived }))}>{u.archived ? 'Restore' : 'Archive'}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      {edit && <EditModal key={`${edit.kind}-${edit.item?.id ?? 'new'}`} edit={edit} labels={labels} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

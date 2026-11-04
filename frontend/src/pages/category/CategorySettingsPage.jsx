import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { refreshCategories } from '../../components/AppShell';
import { Button, Card, Field, Loading, ErrorNote, PageHeader } from '../../components/ui';
import useCategory from './useCategory';

export default function CategorySettingsPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { cat, error: loadError, reload } = useCategory(categoryId);
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (cat) setF({ name: cat.name, placeLabel: cat.placeLabel, unitLabel: cat.unitLabel, payerLabel: cat.payerLabel, color: cat.color || '#737373' });
  }, [cat]);

  if (loadError) return <ErrorNote>{loadError}</ErrorNote>;
  if (!cat || !f) return <Loading />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async (fn, msg) => {
    setError(''); setOk('');
    try { await fn(); refreshCategories(); setOk(msg); } catch (err) { setError(err.message); }
  };
  const save = (e) => {
    e.preventDefault();
    run(async () => { await api.updateCategory(cat.id, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]))); await reload(); }, 'Saved.');
  };
  const toggleArchive = () => run(async () => { await api.updateCategory(cat.id, { archived: !cat.archived }); await reload(); },
    cat.archived ? 'Category restored.' : 'Category archived. It is hidden from the sidebar.');
  const remove = async () => {
    if (!window.confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    setError(''); setOk('');
    try { await api.deleteCategory(cat.id); refreshCategories(); navigate('/'); } catch (err) { setError(err.message); }
  };

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={`${cat.name} settings`} sub={cat.archived ? 'Archived' : undefined}>
        <Link className="btn" to={`/c/${cat.id}/manage`}>Manage {cat.placeLabel}</Link>
      </PageHeader>
      <ErrorNote>{error}</ErrorNote>
      {ok && <p role="status" className="glass rounded-2xl px-4 py-3 text-sm font-bold">{ok}</p>}
      <Card>
        <form onSubmit={save} className="space-y-4">
          <Field label="Category name" required value={f.name} onChange={set('name')} />
          <Field label="Top level label (singular)" required value={f.placeLabel} onChange={set('placeLabel')} />
          <Field label="Rented item label (singular)" required value={f.unitLabel} onChange={set('unitLabel')} />
          <Field label="Payer label (singular)" required value={f.payerLabel} onChange={set('payerLabel')} />
          <Field label="Color" type="color" className="max-w-[8rem]" value={f.color} onChange={set('color')} />
          <Button type="submit">Save changes</Button>
        </form>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-black">Archive or delete</h2>
        <p className="text-sm font-semibold text-muted">Archiving hides the category from the sidebar and the Overview; data is kept. Delete works only for a category with no {cat.placeLabel.toLowerCase()} added.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={toggleArchive}>{cat.archived ? 'Restore category' : 'Archive category'}</Button>
          <Button variant="secondary" onClick={remove}>Delete category</Button>
        </div>
      </Card>
    </div>
  );
}

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Loading, ErrorNote, PageHeader } from '../../components/ui';
import useCategory from './useCategory';

// ponytail: stand-in until Task 12b builds the category dashboard.
export default function CategoryPlaceholderPage() {
  const { categoryId } = useParams();
  const { cat, error } = useCategory(categoryId);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!cat) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={cat.name} sub={`${cat.placeLabel} → ${cat.unitLabel} → ${cat.payerLabel}`} />
      <Card className="flex flex-wrap gap-3">
        <Link className="btn" to={`/c/${cat.id}/manage`}>Manage {cat.placeLabel} and {cat.unitLabel}</Link>
        <Link className="btn" to={`/c/${cat.id}/settings`}>Settings</Link>
      </Card>
      <p className="font-semibold text-muted">The dashboard for this ledger arrives in the next step.</p>
    </div>
  );
}

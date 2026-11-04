import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Card, Table, Loading, ErrorNote, PageHeader } from '../../components/ui';
import { formatINR, formatAnyDate } from '../../lib/format';

export default function ReportsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    api.getPayments()
      .then(setPayments)
      .catch((err) => setError(err.message || 'Failed to fetch payment history'))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    try {
      setDownloading(true);
      setExportError('');
      await api.downloadExcelReport();
    } catch (err) {
      setExportError('Failed to download Excel report: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const term = search.toLowerCase();
  const filtered = payments.filter((p) => !term
    || p.borrower?.name.toLowerCase().includes(term)
    || p.borrower?.phone.includes(term)
    || (p.notes && p.notes.toLowerCase().includes(term)));

  const columns = [
    { key: 'date', header: 'Date', render: (p) => formatAnyDate(p.paymentDate) },
    { key: 'borrower', header: 'Borrower', render: (p) => <span className="font-extrabold">{p.borrower?.name}</span> },
    { key: 'phone', header: 'Phone', render: (p) => p.borrower?.phone },
    { key: 'amount', header: 'Amount paid', align: 'right', render: (p) => <span className="font-black">{formatINR(p.amount)}</span> },
    { key: 'alloc', header: 'FIFO allocations', render: (p) => p.allocations
      .map((a) => `${a.interestRecord?.periodName || 'Period'} (${formatINR(a.amount)})`).join(', ') || 'General Payment' },
    { key: 'notes', header: 'Notes', render: (p) => p.notes || '-' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & Payment History" sub="Export full audit logs and spreadsheets to Excel">
        <Button onClick={handleExport} disabled={downloading}>
          <Download size={16} /> {downloading ? 'Generating Excel…' : 'Export to Excel (.xlsx)'}
        </Button>
      </PageHeader>
      <ErrorNote>{exportError}</ErrorNote>

      <input type="search" aria-label="Filter payments" className="field max-w-md" placeholder="Filter payment logs by borrower or notes" value={search} onChange={(e) => setSearch(e.target.value)} />

      <Card>
        <h2 className="mb-4 text-lg font-black">Global Payment Transactions</h2>
        {loading ? <Loading>Loading transactions…</Loading> : error ? <ErrorNote>{error}</ErrorNote>
          : <Table columns={columns} rows={filtered} empty="No payment history records found." />}
      </Card>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Download, FileSpreadsheet, History, Search } from 'lucide-react';

export default function ReportsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getPayments()
      .then((data) => {
        setPayments(data);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch payment history');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    try {
      setDownloading(true);
      await api.downloadExcelReport();
    } catch (err) {
      alert('Failed to download Excel report: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      p.borrower?.name.toLowerCase().includes(term) ||
      p.borrower?.phone.includes(term) ||
      (p.notes && p.notes.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Export button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">
            Reports & Payment History
          </h1>
          <p className="text-xs text-slate-400">
            Export full audit logs and spreadsheets to Excel
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={downloading}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center shadow-lg shadow-emerald-600/20 transition-all self-start sm:self-auto"
        >
          <Download className="w-4 h-4 mr-2" />
          {downloading ? 'Generating Excel...' : 'Export to Excel (.xlsx)'}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
        <input
          type="text"
          placeholder="Filter payment logs by borrower or notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Payment History Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-sm font-extrabold text-slate-100 flex items-center mb-4">
          <History className="w-4 h-4 mr-2 text-cyan-400" />
          Global Payment Transactions
        </h2>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full mr-3" />
            Loading Transactions...
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            No payment history records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="pb-3 font-bold uppercase">Date</th>
                  <th className="pb-3 font-bold uppercase">Borrower</th>
                  <th className="pb-3 font-bold uppercase">Phone</th>
                  <th className="pb-3 font-bold uppercase">Amount Paid</th>
                  <th className="pb-3 font-bold uppercase">FIFO Allocations</th>
                  <th className="pb-3 font-bold uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredPayments.map((p) => {
                  const periodsText = p.allocations
                    .map(
                      (a) =>
                        `${a.interestRecord?.periodName || 'Period'} (₹${a.amount})`
                    )
                    .join(', ');

                  return (
                    <tr key={p.id} className="hover:bg-slate-950/50 transition-colors">
                      <td className="py-3 font-medium text-slate-300">
                        {new Date(p.paymentDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 font-bold text-slate-100">
                        {p.borrower?.name}
                      </td>
                      <td className="py-3 text-slate-400">{p.borrower?.phone}</td>
                      <td className="py-3 font-black text-emerald-400">₹{p.amount}</td>
                      <td className="py-3 text-cyan-300 font-medium">
                        {periodsText || 'General Payment'}
                      </td>
                      <td className="py-3 text-slate-500">{p.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

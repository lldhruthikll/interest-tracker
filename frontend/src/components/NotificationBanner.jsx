import React from 'react';
import { Bell, ArrowRight } from 'lucide-react';
import { Button } from './ui';
import { formatINR } from '../lib/format';

export default function NotificationBanner({ todaysDue = [], onOpenPaymentModal }) {
  if (!todaysDue || todaysDue.length === 0) return null;
  const total = todaysDue.reduce((sum, item) => sum + item.pendingAmount, 0);

  return (
    <div role="status" className="glass flex flex-col items-start justify-between gap-4 rounded-3xl p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <Bell size={22} className="shrink-0" aria-hidden="true" />
        <div>
          <p className="font-black">Interest due today: {todaysDue.length} loan(s)</p>
          <p className="text-sm font-bold">Total pending: <span className="tabnum">{formatINR(total)}</span></p>
        </div>
      </div>
      <Button onClick={onOpenPaymentModal}>Collect Payment <ArrowRight size={16} /></Button>
    </div>
  );
}

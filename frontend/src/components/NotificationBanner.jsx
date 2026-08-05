import React from 'react';
import { Bell, AlertCircle, ArrowRight } from 'lucide-react';

export default function NotificationBanner({ todaysDue = [], onOpenPaymentModal }) {
  if (!todaysDue || todaysDue.length === 0) return null;

  const totalAmountDueToday = todaysDue.reduce((sum, item) => sum + item.pendingAmount, 0);

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-cyan-900/40 via-blue-900/40 to-slate-900 border border-cyan-500/30 p-4 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 animate-bounce">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-100 flex items-center">
            Interest Due Today!
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-300 font-extrabold border border-cyan-500/30">
              {todaysDue.length} Loan(s)
            </span>
          </h4>
          <p className="text-xs text-slate-300 mt-0.5">
            Total pending interest due today: <strong className="text-cyan-400 font-extrabold">₹{totalAmountDueToday}</strong>
          </p>
        </div>
      </div>

      <button
        onClick={onOpenPaymentModal}
        className="shrink-0 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center shadow-lg shadow-cyan-500/20 transition-all"
      >
        Collect Payment
        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
      </button>
    </div>
  );
}

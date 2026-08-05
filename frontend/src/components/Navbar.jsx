import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, IndianRupee, Download, Bell } from 'lucide-react';
import { api } from '../api/client';

export default function Navbar({ onOpenPaymentModal, todayDueCount = 0 }) {
  const { user, logout } = useAuth();
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    try {
      setDownloading(true);
      await api.downloadExcelReport();
    } catch (err) {
      alert('Failed to export Excel report: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const triggerBrowserNotification = () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }

    if (Notification.permission === 'granted') {
      new Notification('Interest Due Today', {
        body: `You have ${todayDueCount} interest payment(s) due today!`,
        icon: '/favicon.svg',
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification('Interest Due Today', {
            body: `You have ${todayDueCount} interest payment(s) due today!`,
            icon: '/favicon.svg',
          });
        }
      });
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & App Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <IndianRupee className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-100 tracking-tight block">
                FinLedger
              </span>
              <span className="text-xs text-cyan-400 font-medium">Personal Lending Manager</span>
            </div>
          </div>

          {/* Actions Header */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Today's due notification indicator */}
            <button
              onClick={triggerBrowserNotification}
              title="Browser Notification for Today's Due"
              className="relative p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <Bell className="w-5 h-5 text-cyan-400" />
              {todayDueCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center animate-pulse">
                  {todayDueCount}
                </span>
              )}
            </button>

            {/* Quick Record Payment */}
            <button
              onClick={onOpenPaymentModal}
              className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-600/20 transition-all"
            >
              <IndianRupee className="w-4 h-4 mr-1.5" />
              Record Payment
            </button>

            {/* Export Report */}
            <button
              onClick={handleExport}
              disabled={downloading}
              className="inline-flex items-center px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4 mr-1.5 text-cyan-400" />
              {downloading ? 'Exporting...' : 'Export Excel'}
            </button>

            {/* Admin User info & logout */}
            <div className="flex items-center space-x-2 border-l border-slate-800 pl-3 sm:pl-4">
              <span className="text-xs text-slate-400 font-medium hidden md:inline">
                {user?.name || 'Admin'}
              </span>
              <button
                onClick={logout}
                title="Sign out"
                className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

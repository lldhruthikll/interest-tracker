import React from 'react';

export default function StatCard({ title, value, subtext, icon: Icon, color = 'cyan' }) {
  const colorStyles = {
    cyan: 'from-cyan-500/10 to-blue-500/10 border-cyan-500/20 text-cyan-400',
    amber: 'from-amber-500/10 to-yellow-500/10 border-amber-500/20 text-amber-400',
    rose: 'from-rose-500/10 to-red-500/10 border-rose-500/20 text-rose-400',
    emerald: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-400',
    indigo: 'from-indigo-500/10 to-purple-500/10 border-indigo-500/20 text-indigo-400',
  };

  const selectedColor = colorStyles[color] || colorStyles.cyan;

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${selectedColor} border p-5 backdrop-blur-sm shadow-lg`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            {title}
          </p>
          <h3 className="text-2xl font-extrabold text-white tracking-tight">
            {value}
          </h3>
          {subtext && (
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {subtext}
            </p>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

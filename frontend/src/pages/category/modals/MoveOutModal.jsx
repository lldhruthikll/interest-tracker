import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { Button, Modal, Field, Select, ErrorNote } from '../../../components/ui';
import { formatINR, formatDate, periodLabel, todayIST } from '../../../lib/format';

const RULE = [{ value: 'PRORATED', label: 'Prorated by days' }, { value: 'FULL', label: 'Full month' }, { value: 'FREE', label: 'Free' }];
const paise = (v) => Math.round(Number(v) * 100);

export default function MoveOutModal({ open, agreement, onClose, onDone }) {
  const [endDate, setEndDate] = useState(todayIST());
  const [rule, setRule] = useState(agreement.lastMonthRule);
  const [pv, setPv] = useState(null);
  const [apply, setApply] = useState(true);
  const [retained, setRetained] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPv(null); setError('');
    if (!endDate) return undefined;
    let live = true;
    const t = setTimeout(() => {
      api.previewMoveOut(agreement.id, { endDate, lastMonthRule: rule }).then((r) => live && setPv(r)).catch((e) => live && setError(e.message));
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [agreement.id, endDate, rule]);

  // all in paise; mirrors the server's settlement order
  let refund = null;
  let applied = 0;
  let retP = 0;
  if (pv) {
    applied = apply ? Math.min(pv.advanceHeldPaise, pv.unpaidPaise) : 0;
    retP = paise(retained || 0);
    refund = { advance: pv.advanceHeldPaise - applied - retP, credit: pv.creditPaise };
  }
  const needReason = retP > 0 && !reason.trim();
  const bad = refund && (retP < 0 || refund.advance < 0);
  const badWhy = retP < 0 ? 'Retained amount cannot be negative.' : 'Retained amount is more than the advance left after applying it to dues.';
  const unpaidAfter = pv ? pv.unpaidPaise - applied : 0;
  const open_ = pv ? pv.dues.filter((d) => paise(d.amount) > paise(d.paidAmount)) : [];

  const confirm = async () => {
    setError(''); setBusy(true);
    try {
      onDone(await api.moveOut(agreement.id, { endDate, lastMonthRule: rule, applyAdvance: apply,
        retained: retP > 0 ? { amount: retained, notes: reason.trim() } : null }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title="Move out" onClose={onClose}>
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Move-out date" type="date" required max={todayIST()} min={String(agreement.startDate).slice(0, 10)} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Select label="Last month" value={rule} onChange={(e) => setRule(e.target.value)} options={RULE} />
        </div>
        {!pv && !error && <p className="font-bold text-muted">Calculating…</p>}
        {pv && (
          <>
            <dl className="glass-in space-y-1 rounded-2xl p-4 text-sm font-bold tabnum">
              <div className="flex justify-between"><dt>Unpaid dues</dt><dd>{formatINR(pv.unpaidPaise / 100)}</dd></div>
              <div className="flex justify-between"><dt>Advance held</dt><dd>{formatINR(pv.advanceHeldPaise / 100)}</dd></div>
              <div className="flex justify-between"><dt>Credit (paid ahead)</dt><dd>{formatINR(pv.creditPaise / 100)}</dd></div>
            </dl>
            {open_.length > 0 && (
              <ul className="space-y-1 text-sm font-semibold">
                {open_.map((d) => <li key={d.id ?? d.period} className="flex justify-between tabnum"><span>{periodLabel(d.period)} due {formatDate(d.dueDate)}</span><span>{formatINR(Number(d.amount) - Number(d.paidAmount))}</span></li>)}
              </ul>
            )}
            {pv.advanceHeldPaise > 0 && (
              <>
                <label className="flex items-center gap-2 font-bold">
                  <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} /> Apply advance to unpaid dues
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Amount retained (₹)" type="number" min="0" step="0.01" value={retained} onChange={(e) => setRetained(e.target.value)} />
                  <Field label="Reason for retaining" value={reason} onChange={(e) => setReason(e.target.value)} />
                  {needReason && <p className="text-sm font-bold sm:col-span-2">Enter a reason for retaining this amount.</p>}
                </div>
              </>
            )}
            {bad && <p role="alert" className="text-sm font-bold">{badWhy}</p>}
            <div className="glass-in space-y-1 rounded-2xl p-4 text-sm font-bold tabnum">
              {applied > 0 && <div className="flex justify-between"><span>Advance applied to dues</span><span>{formatINR(applied / 100)}</span></div>}
              {unpaidAfter > 0 && <div className="flex justify-between"><span>Still unpaid after move-out</span><span>{formatINR(unpaidAfter / 100)}</span></div>}
              {retP > 0 && <div className="flex justify-between"><span>Retained</span><span>{formatINR(retP / 100)}</span></div>}
              <div className="flex justify-between"><span>Advance refund</span><span>{bad ? 'Invalid' : formatINR(refund.advance / 100)}</span></div>
              <div className="flex justify-between"><span>Credit refund</span><span>{formatINR(refund.credit / 100)}</span></div>
              <div className="flex justify-between border-t border-line pt-1 text-base font-black"><span>Total refund</span><span>{bad ? 'Invalid' : formatINR((refund.advance + refund.credit) / 100)}</span></div>
            </div>
          </>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!pv || bad || needReason || busy} onClick={confirm}>{busy ? 'Saving…' : 'Confirm move out'}</Button>
        </div>
      </div>
    </Modal>
  );
}

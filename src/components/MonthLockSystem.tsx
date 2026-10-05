import { useState, type FormEvent } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { Lock, Unlock, AlertTriangle, ShieldAlert, CheckCircle2, History } from 'lucide-react';
import { getMonthName, getISTCurrentMonth } from '../utils/formatters';

interface MonthLockSystemProps {
  store: ProductionStore;
}

export function MonthLockSystem({ store }: MonthLockSystemProps) {
  const { db, setMonthLock, selectedMonth } = store;

  const [unlockTargetMonth, setUnlockTargetMonth] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
  const currentMonthStr = getISTCurrentMonth();

  const handleLock = async (month: string) => {
    setSubmitting(true);
    setFeedback(null);
    const res = await setMonthLock(month, 'LOCK');
    setSubmitting(false);
    if (res.success) {
      setFeedback({ type: 'success', message: `Month ${month} locked successfully.` });
    } else {
      setFeedback({ type: 'error', message: res.message || 'Failed to lock month.' });
    }
  };

  const handleExecuteUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!unlockTargetMonth) return;
    if (!unlockReason.trim()) {
      setFeedback({ type: 'error', message: 'Please provide a clear reason for unlocking this month.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    const res = await setMonthLock(unlockTargetMonth, 'UNLOCK', unlockReason);
    setSubmitting(false);

    if (res.success) {
      setFeedback({ type: 'success', message: `Month ${unlockTargetMonth} unlocked. Reason logged in audit trail.` });
      setUnlockTargetMonth(null);
      setUnlockReason('');
    } else {
      setFeedback({ type: 'error', message: res.message || 'Failed to unlock month.' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">Month Locking Authority</h2>
            <p className="text-xs text-slate-500">Enforce integrity and control retroactive accounting corrections</p>
          </div>
        </div>

        <div className="text-xs text-slate-600">
          Current System Month: <strong className="text-blue-600 font-mono font-bold">{currentMonthStr}</strong>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs font-bold flex items-center space-x-2 ${
            feedback.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Month Status List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {months.map((m) => {
          const statusObj = db.monthStatuses.find((rec) => rec.month === m);
          const isClosed = statusObj?.isClosed;
          const isLocked = isClosed || statusObj?.status === 'LOCKED' || (!statusObj && m !== currentMonthStr);
          const isCurrent = m === currentMonthStr;

          return (
            <div
              key={m}
              className={`p-4 rounded-xl border transition-all ${
                isLocked
                  ? 'bg-slate-50 border-slate-200 shadow-xs'
                  : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900 text-sm">{getMonthName(m)}</h3>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                        CURRENT
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{m}</div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                      isClosed
                        ? 'bg-slate-100 text-slate-600'
                        : isLocked
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{isClosed ? 'CLOSED' : isLocked ? 'LOCKED' : 'OPEN'}</span>
                  </span>
                </div>
              </div>

              {/* Status Details */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                {statusObj?.unlockReason && (
                  <div className="text-amber-800 text-[11px] bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <strong>Last Unlock Reason:</strong> {statusObj.unlockReason}
                  </div>
                )}
                {isClosed && (
                  <div className="text-slate-500 text-[11px]">
                    Finalized by {statusObj.closedBy || 'Admin'} on{' '}
                    {new Date(statusObj.closedAt || '').toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-3 flex items-center justify-end space-x-2">
                {isLocked ? (
                  <button
                    type="button"
                    onClick={() => setUnlockTargetMonth(m)}
                    className="py-1.5 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>Request Unlock</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLock(m)}
                    className="py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 font-bold text-xs flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Lock Month</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controlled Unlock Reason Modal */}
      {unlockTargetMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <div className="flex items-center space-x-2 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-900 uppercase">Unlock Past Month</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Unlocking <strong className="text-slate-900">{getMonthName(unlockTargetMonth)}</strong> allows modifications
              to production records. This action will be permanently recorded in the immutable audit log.
            </p>

            <form onSubmit={handleExecuteUnlock} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Reason for Unlocking <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g. Correcting piece count for Tabish on Day 12 per supervisor notebook note"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setUnlockTargetMonth(null);
                    setUnlockReason('');
                  }}
                  className="w-1/2 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Unlocking...' : 'Confirm Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

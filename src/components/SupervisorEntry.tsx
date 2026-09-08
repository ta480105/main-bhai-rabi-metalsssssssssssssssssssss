import { useState, type FormEvent } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { useAuth } from '../context/AuthContext';
import { formatNumber, getISTToday } from '../utils/formatters';
import { HardHat, LogOut, CheckCircle2, AlertTriangle, Send, Plus, RefreshCw, Calendar, FileSpreadsheet, ClipboardList } from 'lucide-react';
import { MonthlyCalendar } from './MonthlyCalendar';

interface SupervisorEntryProps {
  store: ProductionStore;
}

export function SupervisorEntry({ store }: SupervisorEntryProps) {
  const { db, isLive, submitProduction, logout, currentRole } = store;
  const { user, signOut } = useAuth();

  // Active view tab: Daily Entry vs Monthly Calendar
  const [supervisorTab, setSupervisorTab] = useState<'entry' | 'calendar'>('entry');

  // Form state
  const [workerId, setWorkerId] = useState<string>('');
  const [pieceSizeId, setPieceSizeId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [attendanceStatus, setAttendanceStatus] = useState<'normal' | 'P' | 'X'>('normal');
  const [notes, setNotes] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Duplicate modal
  const [duplicateData, setDuplicateData] = useState<{
    existingRecord: any;
    pendingPayload: any;
  } | null>(null);

  // Filter only active workers
  const activeWorkers = db.workers.filter((w) => w.status === 'active');
  const activePieceSizes = db.pieceSizes.filter((p) => p.status === 'active');

  const todayStr = getISTToday();
  const todayRecords = db.productionRecords.filter((r) => r.date === todayStr);

  const handleSubmit = async (e?: FormEvent, allowDuplicateOverride?: 'add' | 'update') => {
    if (e) e.preventDefault();
    setFeedback(null);

    if (!workerId) {
      setFeedback({ type: 'error', message: 'Please select a worker.' });
      return;
    }
    if (!pieceSizeId) {
      setFeedback({ type: 'error', message: 'Please select a piece size.' });
      return;
    }

    if (attendanceStatus === 'normal') {
      const numQty = Number(quantity);
      if (isNaN(numQty) || numQty <= 0) {
        setFeedback({ type: 'error', message: 'Please enter a valid positive quantity.' });
        return;
      }
    }

    setIsSubmitting(true);

    const payload: {
      workerId: string;
      pieceSizeId: string;
      quantity: number;
      date: string;
      attendanceStatus?: 'normal' | 'P' | 'X';
      notes?: string;
      allowDuplicate?: 'add' | 'update' | false;
    } = {
      workerId,
      pieceSizeId,
      quantity: attendanceStatus === 'normal' ? Number(quantity) : 0,
      date: todayStr,
      attendanceStatus,
      notes,
      allowDuplicate: allowDuplicateOverride || false,
    };

    const res = await submitProduction(payload);
    setIsSubmitting(false);

    if (res?.duplicate) {
      setDuplicateData({
        existingRecord: res.existingRecord,
        pendingPayload: payload,
      });
      return;
    }

    if (res?.success) {
      setFeedback({ type: 'success', message: 'Production saved successfully.' });
      setQuantity('');
      setAttendanceStatus('normal');
      setNotes('');
      // Auto clear feedback after 3.5s
      setTimeout(() => setFeedback(null), 3500);
    } else {
      setFeedback({ type: 'error', message: res?.message || 'Failed to save production.' });
    }
  };

  const handleResolveDuplicate = async (choice: 'add' | 'update') => {
    if (!duplicateData) return;
    setDuplicateData(null);
    await handleSubmit(undefined, choice);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-700 px-4 py-3 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-blue-400">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-bold text-white text-sm sm:text-base leading-tight uppercase tracking-tight">
                  SUPERVISOR PORTAL
                </h1>
                <div className="flex items-center space-x-1.5 bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-700">
                  <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-[10px] font-mono text-green-400">{isLive ? 'LIVE' : 'OFFLINE'}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span>IST Shift: {todayStr}</span>
              </p>
            </div>
          </div>

          {/* Supervisor Navigation Mode Switcher */}
          <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setSupervisorTab('entry')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                supervisorTab === 'entry'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Daily Shift Entry</span>
            </button>
            <button
              type="button"
              onClick={() => setSupervisorTab('calendar')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                supervisorTab === 'calendar'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Monthly Calendar</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {user?.email && (
              <span className="hidden sm:inline text-xs text-slate-400 font-mono">
                {user.email.split('@')[0]}
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                await signOut();
                logout();
              }}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors cursor-pointer"
            >
              LOGOUT
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {supervisorTab === 'calendar' ? (
        <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 space-y-5 pb-20">
          <MonthlyCalendar store={store} />
        </main>
      ) : (
        <main className="flex-1 max-w-xl mx-auto w-full p-4 space-y-5 pb-20">
        {/* Feedback Message */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl flex items-center space-x-3 transition-all animate-fadeIn ${
              feedback.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
            )}
            <span className="text-xs font-bold">{feedback.message}</span>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-2.5">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Daily Production Shift Entry</h2>
            <p className="text-xs text-slate-500">Record pieces for worker notebook shift</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* STEP 1: Select Worker */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                STEP 1: Select Worker
              </label>
              <select
                id="select-worker"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-slate-50 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900"
              >
                <option value="">-- Choose Worker --</option>
                {activeWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.firstName} ({w.fullName})
                  </option>
                ))}
              </select>
            </div>

            {/* STEP 2: Select Piece Size */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                STEP 2: Select Piece Size
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activePieceSizes.map((ps) => {
                  const isSelected = pieceSizeId === ps.id;
                  return (
                    <button
                      key={ps.id}
                      type="button"
                      onClick={() => setPieceSizeId(ps.id)}
                      className={`py-2.5 px-3 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {ps.displayName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 3: Enter Quantity / Attendance */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  STEP 3: Enter Quantity
                </label>
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={() => setAttendanceStatus('normal')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                      attendanceStatus === 'normal' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Pieces
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttendanceStatus('P');
                      setQuantity('0');
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                      attendanceStatus === 'P' ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    P (Present)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttendanceStatus('X');
                      setQuantity('0');
                    }}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                      attendanceStatus === 'X' ? 'bg-red-600 text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    X (Absent)
                  </button>
                </div>
              </div>

              {attendanceStatus === 'normal' ? (
                <>
                  <input
                    type="number"
                    inputMode="numeric"
                    id="input-quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full py-3 px-4 text-xl font-mono font-bold text-center rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />

                  {/* Quick Quantity Buttons */}
                  <div className="flex space-x-1.5 pt-2">
                    {[500, 1000, 1500, 2000, 2500].map((quickVal) => (
                      <button
                        key={quickVal}
                        type="button"
                        onClick={() => setQuantity(String((Number(quantity) || 0) + quickVal))}
                        className="flex-1 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 active:scale-95 transition-all cursor-pointer"
                      >
                        +{quickVal}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div
                  className={`p-3 rounded-lg text-center font-bold text-xs ${
                    attendanceStatus === 'P'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  Marking Day Status as: {attendanceStatus === 'P' ? 'P (Present Shift)' : 'X (Absent/Holiday)'}
                </div>
              )}
            </div>

            {/* STEP 4: Submit Button */}
            <button
              type="submit"
              id="btn-submit-production"
              disabled={isSubmitting}
              className="w-full py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'SAVING...' : 'SUBMIT PRODUCTION'}</span>
            </button>
          </form>
        </div>

        {/* Today's Entries Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-2">
              <span>Today's Entries</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">
                {todayRecords.length}
              </span>
            </h3>
            <span className="text-[11px] text-slate-400">Auto-sync active</span>
          </div>

          {todayRecords.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-white border border-slate-200 text-slate-500 text-xs">
              No production records submitted yet today.
            </div>
          ) : (
            <div className="space-y-2">
              {todayRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-xs">
                      {rec.workerFirstName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs sm:text-sm">{rec.workerFirstName}</div>
                      <div className="text-[11px] text-slate-500">{rec.pieceSizeName}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    {rec.attendanceStatus && rec.attendanceStatus !== 'normal' ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.attendanceStatus === 'P'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {rec.attendanceStatus}
                      </span>
                    ) : (
                      <div className="font-mono font-bold text-blue-600 text-sm sm:text-base">
                        {formatNumber(rec.quantity)} <span className="text-xs text-slate-400 font-sans">pcs</span>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400">
                      {new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      )}

      {/* Duplicate Entry Warning Modal */}
      {duplicateData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base text-slate-900">Entry Already Exists</h3>
            </div>

            <p className="text-xs text-slate-600">
              An entry already exists for <strong className="text-slate-900">{duplicateData.existingRecord.workerFirstName}</strong> with{' '}
              <strong className="text-slate-900">{duplicateData.existingRecord.pieceSizeName}</strong> today:
            </p>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center font-mono font-bold text-amber-800 text-base">
              Existing Quantity: {formatNumber(duplicateData.existingRecord.quantity)} pcs
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleResolveDuplicate('add')}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 font-bold text-white text-xs uppercase tracking-wider cursor-pointer shadow-sm"
              >
                Record {duplicateData.pendingPayload.quantity} as Additional Entry
              </button>

              {currentRole === 'ADMIN' ? (
                <button
                  type="button"
                  onClick={() => handleResolveDuplicate('update')}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-900 font-bold text-white text-xs uppercase tracking-wider cursor-pointer shadow-sm"
                >
                  Overwrite Existing (Admin Only)
                </button>
              ) : (
                <p className="text-[11px] text-slate-500 text-center italic">
                  Supervisors can append additional entries; modifying existing records requires Admin access.
                </p>
              )}

              <button
                type="button"
                onClick={() => setDuplicateData(null)}
                className="w-full py-2 px-4 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 font-bold text-slate-600 text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

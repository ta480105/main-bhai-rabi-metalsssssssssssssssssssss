import { useState, type FormEvent } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { ProductionRecord } from '../types';
import { formatINR, formatNumber, getMonthName } from '../utils/formatters';
import { Table, Search, Filter, Edit3, Trash2, Calendar, Lock } from 'lucide-react';

interface ProductionRecordsTableProps {
  store: ProductionStore;
}

export function ProductionRecordsTable({ store }: ProductionRecordsTableProps) {
  const { db, selectedMonth, deleteProductionRecord, updateProductionRecord } = store;

  const [search, setSearch] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [filterPieceSizeId, setFilterPieceSizeId] = useState('');
  const [filterMonth, setFilterMonth] = useState(selectedMonth);

  // Edit record modal
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editAttendance, setEditAttendance] = useState<'normal' | 'P' | 'X'>('normal');
  const [editNotes, setEditNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filter records
  const filteredRecords = db.productionRecords
    .filter((r) => {
      const matchMonth = !filterMonth || r.month === filterMonth;
      const matchWorker = !filterWorkerId || r.workerId === filterWorkerId;
      const matchPiece = !filterPieceSizeId || r.pieceSizeId === filterPieceSizeId;
      const matchSearch =
        r.workerFirstName.toLowerCase().includes(search.toLowerCase()) ||
        r.workerName.toLowerCase().includes(search.toLowerCase()) ||
        r.pieceSizeName.toLowerCase().includes(search.toLowerCase()) ||
        r.date.includes(search);
      return matchMonth && matchWorker && matchPiece && matchSearch;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const monthStatusObj = db.monthStatuses.find((m) => m.month === filterMonth);
  const isMonthLocked = monthStatusObj ? monthStatusObj.status === 'LOCKED' || monthStatusObj.isClosed : false;

  const handleOpenEdit = (rec: ProductionRecord) => {
    setEditingRecord(rec);
    setEditQty(String(rec.quantity));
    setEditAttendance(rec.attendanceStatus || 'normal');
    setEditNotes(rec.notes || '');
    setFeedback(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    if (isMonthLocked) {
      setFeedback('Month is locked. Modifications are forbidden.');
      return;
    }

    setSaving(true);
    setFeedback(null);

    const res = await updateProductionRecord(editingRecord.id, {
      quantity: editAttendance === 'normal' ? Number(editQty) : 0,
      attendanceStatus: editAttendance,
      notes: editNotes,
    });

    setSaving(false);
    if (res.success) {
      setEditingRecord(null);
    } else {
      setFeedback(res.message || 'Error updating record');
    }
  };

  const handleDelete = async (rec: ProductionRecord) => {
    if (isMonthLocked) {
      alert('Month is locked. Cannot delete entries in locked months.');
      return;
    }
    if (confirm(`Delete entry for ${rec.workerFirstName} (${rec.pieceSizeName} × ${rec.quantity}) on ${rec.date}?`)) {
      await deleteProductionRecord(rec.id);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">
              Production Records Database
            </h2>
            <p className="text-xs text-slate-500">Comprehensive searchable transaction log of factory entries</p>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Showing <strong className="text-slate-900">{filteredRecords.length}</strong> records
        </div>
      </div>

      {/* Search & Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search worker or date..."
            className="w-full py-2 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Months</option>
          {['2026-08', '2026-09', '2026-10'].map((m) => (
            <option key={m} value={m}>
              {getMonthName(m)}
            </option>
          ))}
        </select>

        <select
          value={filterWorkerId}
          onChange={(e) => setFilterWorkerId(e.target.value)}
          className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Workers</option>
          {db.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.firstName} ({w.fullName})
            </option>
          ))}
        </select>

        <select
          value={filterPieceSizeId}
          onChange={(e) => setFilterPieceSizeId(e.target.value)}
          className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Piece Sizes</option>
          {db.pieceSizes.map((ps) => (
            <option key={ps.id} value={ps.id}>
              {ps.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-bold border-b border-slate-200">Date</th>
                <th className="py-2.5 px-3 font-bold border-b border-slate-200">Worker</th>
                <th className="py-2.5 px-3 font-bold border-b border-slate-200">Piece Size</th>
                <th className="py-2.5 px-3 font-bold text-right border-b border-slate-200">Quantity</th>
                <th className="py-2.5 px-3 font-bold text-right border-b border-slate-200">Rate</th>
                <th className="py-2.5 px-3 font-bold text-right text-blue-700 border-b border-slate-200">Amount</th>
                <th className="py-2.5 px-3 font-bold border-b border-slate-200">Entered By</th>
                <th className="py-2.5 px-3 font-bold text-center border-b border-slate-200">Status</th>
                <th className="py-2.5 px-3 font-bold text-right border-b border-slate-200">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-mono">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                    No production records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const amt = (r.quantity || 0) * (r.applicableRate || 0);
                  const isRecMonthLocked =
                    db.monthStatuses.find((m) => m.month === r.month)?.status === 'LOCKED' ||
                    db.monthStatuses.find((m) => m.month === r.month)?.isClosed;

                  return (
                    <tr key={r.id} className="hover:bg-blue-50/60 transition-colors">
                      <td className="py-2.5 px-3 text-slate-800 font-semibold">{r.date}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="font-bold text-slate-900 text-xs block">{r.workerFirstName}</span>
                        <span className="text-[10px] text-slate-500">{r.workerName}</span>
                      </td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-700">{r.pieceSizeName}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {r.attendanceStatus && r.attendanceStatus !== 'normal' ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.attendanceStatus === 'P'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {r.attendanceStatus}
                          </span>
                        ) : (
                          `${formatNumber(r.quantity)} pcs`
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {r.applicableRate ? `₹${r.applicableRate.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-blue-600">
                        {amt > 0 ? formatINR(amt) : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-600 text-[11px]">
                        <span className="inline-flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>{r.enteredBy}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.status === 'finalized'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {r.status || 'Active'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            disabled={isRecMonthLocked}
                            onClick={() => handleOpenEdit(r)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title={isRecMonthLocked ? 'Month is locked' : 'Edit entry'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isRecMonthLocked}
                            onClick={() => handleDelete(r)}
                            className="p-1 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-30 cursor-pointer"
                            title={isRecMonthLocked ? 'Month is locked' : 'Delete entry'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Edit Production • {editingRecord.workerFirstName}
            </h3>
            <p className="text-xs text-slate-500">
              {editingRecord.pieceSizeName} on {editingRecord.date}
            </p>

            {feedback && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {feedback}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Shift Mode
                </label>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditAttendance('normal')}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editAttendance === 'normal'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Pieces
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditAttendance('P')}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editAttendance === 'P'
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    P (Present)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditAttendance('X')}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editAttendance === 'X'
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    X (Absent)
                  </button>
                </div>
              </div>

              {editAttendance === 'normal' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Quantity (Pieces)
                  </label>
                  <input
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono font-bold text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="w-1/2 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-1/2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

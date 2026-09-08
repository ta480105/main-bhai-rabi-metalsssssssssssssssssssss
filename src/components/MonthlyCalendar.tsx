import { useState } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { formatINR, formatNumber, getDaysInMonth, getMonthName, getMonthlyRate } from '../utils/formatters';
import { generateWorkerMonthlySlipPdf } from '../utils/pdfReport';
import {
  Calendar,
  Lock,
  Unlock,
  Edit2,
  X,
  Trash2,
  Save,
  CheckCircle2,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertTriangle,
  Info,
  ShieldAlert,
  IndianRupee,
} from 'lucide-react';

interface MonthlyCalendarProps {
  store: ProductionStore;
}

export function MonthlyCalendar({ store }: MonthlyCalendarProps) {
  const {
    db,
    currentRole,
    selectedMonth,
    setSelectedMonth,
    selectedWorkerId,
    setSelectedWorkerId,
    updateProductionRecord,
    deleteProductionRecord,
    submitProduction,
    saveMonthlyRate,
  } = store;

  const isSupervisor = currentRole === 'SUPERVISOR';
  const isAdmin = currentRole === 'ADMIN';

  // Edit cell modal state
  const [editingCell, setEditingCell] = useState<{
    day: number;
    pieceSizeId: string;
    pieceSizeName: string;
    workerId: string;
    workerName: string;
    existingRecord?: any;
    quantity: number;
    attendanceStatus: 'normal' | 'P' | 'X';
    notes: string;
  } | null>(null);

  const [savingEdit, setSavingEdit] = useState(false);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);

  // Edit Piece Rate modal state (Admin only)
  const [editingRate, setEditingRate] = useState<{
    pieceSizeId: string;
    pieceSizeName: string;
    currentRate: number;
    newRate: string;
  } | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [rateFeedback, setRateFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Workers and piece sizes
  const activeWorkers = db.workers;
  const activePieceSizes = db.pieceSizes.filter((p) => p.status === 'active');

  const selectedWorker = activeWorkers.find((w) => w.id === selectedWorkerId) || activeWorkers[0];

  // Month status
  const monthStatusObj = db.monthStatuses.find((m) => m.month === selectedMonth);
  const isLocked = monthStatusObj ? monthStatusObj.status === 'LOCKED' || monthStatusObj.isClosed : false;
  const daysCount = getDaysInMonth(selectedMonth);

  // Filter records for this worker and month
  const workerMonthRecords = db.productionRecords.filter(
    (r) => r.workerId === selectedWorker?.id && r.month === selectedMonth
  );

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const newMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const newMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  // Build grid data day by day (1 to 31)
  const rows = [];
  for (let day = 1; day <= daysCount; day++) {
    const dayRecords = workerMonthRecords.filter((r) => r.day === day);
    let dayTotalPieces = 0;

    const cellMap: Record<string, { record?: any; display: string; status: 'normal' | 'P' | 'X'; quantity: number }> = {};

    activePieceSizes.forEach((ps) => {
      const rec = dayRecords.find((r) => r.pieceSizeId === ps.id);
      if (rec) {
        if (rec.attendanceStatus === 'P') {
          cellMap[ps.id] = { record: rec, display: 'P', status: 'P', quantity: 0 };
        } else if (rec.attendanceStatus === 'X') {
          cellMap[ps.id] = { record: rec, display: 'X', status: 'X', quantity: 0 };
        } else {
          cellMap[ps.id] = { record: rec, display: formatNumber(rec.quantity), status: 'normal', quantity: rec.quantity };
          dayTotalPieces += rec.quantity;
        }
      } else {
        cellMap[ps.id] = { record: undefined, display: '-', status: 'normal', quantity: 0 };
      }
    });

    rows.push({
      day,
      cellMap,
      dayTotalPieces,
    });
  }

  // Calculate Column Totals, Applicable Rates, and Amounts
  let workerGrandTotalAmount = 0;
  let workerGrandTotalPieces = 0;

  const columnSummaries = activePieceSizes.map((ps) => {
    const psRecords = workerMonthRecords.filter((r) => r.pieceSizeId === ps.id);
    const totalQty = psRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);

    // Get applicable rate for this month
    const rate = getMonthlyRate(db.monthlyRates, ps.id, selectedMonth, 0);
    const amount = totalQty * rate;

    workerGrandTotalPieces += totalQty;
    workerGrandTotalAmount += amount;

    return {
      pieceSizeId: ps.id,
      displayName: ps.displayName,
      totalQty,
      rate,
      amount,
    };
  });

  const handleOpenCell = (day: number, pieceSizeId: string, pieceSizeName: string) => {
    const existing = workerMonthRecords.find((r) => r.day === day && r.pieceSizeId === pieceSizeId);
    setEditingCell({
      day,
      pieceSizeId,
      pieceSizeName,
      workerId: selectedWorker.id,
      workerName: selectedWorker.fullName,
      existingRecord: existing,
      quantity: existing ? existing.quantity : 0,
      attendanceStatus: existing?.attendanceStatus || 'normal',
      notes: existing?.notes || '',
    });
    setEditFeedback(null);
  };

  const handleSaveCellEdit = async () => {
    if (!editingCell) return;
    if (isLocked) {
      setEditFeedback('Month is locked. Cannot modify records.');
      return;
    }

    setSavingEdit(true);
    const dateStr = `${selectedMonth}-${String(editingCell.day).padStart(2, '0')}`;

    if (editingCell.existingRecord) {
      const res = await updateProductionRecord(editingCell.existingRecord.id, {
        quantity: editingCell.attendanceStatus === 'normal' ? editingCell.quantity : 0,
        attendanceStatus: editingCell.attendanceStatus,
        notes: editingCell.notes,
      });
      setSavingEdit(false);
      if (res.success) {
        setEditingCell(null);
      } else {
        setEditFeedback(res.message || 'Failed to save');
      }
    } else {
      const res = await submitProduction({
        workerId: editingCell.workerId,
        pieceSizeId: editingCell.pieceSizeId,
        quantity: editingCell.attendanceStatus === 'normal' ? editingCell.quantity : 0,
        date: dateStr,
        attendanceStatus: editingCell.attendanceStatus,
        notes: editingCell.notes,
        allowDuplicate: 'update',
      });
      setSavingEdit(false);
      if (res.success) {
        setEditingCell(null);
      } else {
        setEditFeedback(res.message || 'Failed to create record');
      }
    }
  };

  const handleDeleteCellRecord = async () => {
    if (!editingCell?.existingRecord) return;
    if (isLocked) {
      setEditFeedback('Month is locked. Cannot delete records.');
      return;
    }

    setSavingEdit(true);
    const res = await deleteProductionRecord(editingCell.existingRecord.id);
    setSavingEdit(false);
    if (res.success) {
      setEditingCell(null);
    } else {
      setEditFeedback(res.message || 'Failed to delete');
    }
  };

  // Open Edit Rate modal (Admin only)
  const handleOpenEditRate = (pieceSizeId: string, pieceSizeName: string, currentRate: number) => {
    if (!isAdmin) return;
    if (isLocked) {
      setRateFeedback({
        type: 'error',
        message: `Month ${selectedMonth} is locked. Rate modifications are blocked.`,
      });
      return;
    }
    setEditingRate({
      pieceSizeId,
      pieceSizeName,
      currentRate,
      newRate: String(currentRate),
    });
    setRateFeedback(null);
  };

  // Save Piece Rate (Admin only)
  const handleSaveRate = async () => {
    if (!editingRate) return;
    const num = Number(editingRate.newRate);
    if (isNaN(num) || num < 0) {
      setRateFeedback({ type: 'error', message: 'Please enter a valid non-negative rate.' });
      return;
    }

    setSavingRate(true);
    setRateFeedback(null);

    const res = await saveMonthlyRate(selectedMonth, editingRate.pieceSizeId, num);

    setSavingRate(false);

    if (res.success) {
      setRateFeedback({
        type: 'success',
        message: `Rate for ${editingRate.pieceSizeName} updated to ₹${num.toFixed(2)} for ${getMonthName(selectedMonth)}.`,
      });
      setTimeout(() => {
        setEditingRate(null);
        setRateFeedback(null);
      }, 1200);
    } else {
      setRateFeedback({ type: 'error', message: res.message || 'Failed to update rate.' });
    }
  };

  const handleDownloadWorkerSlip = () => {
    if (!selectedWorker) return;
    generateWorkerMonthlySlipPdf({
      companyName: db.settings.companyName || 'Factory Production Works',
      month: selectedMonth,
      worker: selectedWorker,
      pieceSizes: activePieceSizes,
      monthlyRates: db.monthlyRates,
      productionRecords: db.productionRecords,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Rate update feedback message */}
      {rateFeedback && !editingRate && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center space-x-2 animate-fadeIn ${
            rateFeedback.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {rateFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span>{rateFeedback.message}</span>
        </div>
      )}

      {/* Top Banner & Controls: Worker, Month, Status Badge */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        {/* Worker Spotlight Card */}
        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
              WORKER PRODUCTION CALENDAR
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                {selectedWorker?.firstName || 'WORKER'}
              </h2>
              <span className="text-sm font-semibold text-slate-300">({selectedWorker?.fullName})</span>
            </div>
            <p className="text-xs text-blue-400 font-medium flex items-center space-x-1.5 mt-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {getMonthName(selectedMonth)} • Factory Notebook Register (Days 1–{daysCount})
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadWorkerSlip}
              className="flex items-center space-x-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-colors shadow-xs cursor-pointer"
              title="Download individual worker payment slip"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Worker Slip (PDF)</span>
            </button>

            <span
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                isLocked
                  ? 'bg-red-950/80 text-red-300 border border-red-800'
                  : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
              }`}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{isLocked ? 'MONTH LOCKED' : 'MONTH OPEN'}</span>
            </span>

            {isSupervisor && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
                <Info className="w-3.5 h-3.5" />
                <span>SUPERVISOR FULL ACCESS</span>
              </span>
            )}
          </div>
        </div>

        {/* Worker & Month Selectors Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Worker Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              WORKER
            </label>
            <select
              value={selectedWorker?.id || ''}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              className="w-full text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-slate-50 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900"
            >
              {activeWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.firstName} ({w.fullName}) {w.status === 'inactive' ? '— Inactive' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Month Selector with Prev/Next Controls */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              MONTH
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="flex-1 text-xs sm:text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-slate-50 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900"
              >
                {['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'].map((m) => (
                  <option key={m} value={m}>
                    {getMonthName(m)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-2.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* The Excel-Style High-Density Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] relative">
          <table className="w-full border-collapse text-xs text-left">
            {/* Sticky Header */}
            <thead className="sticky top-0 bg-slate-100 z-20 text-slate-700 border-b border-slate-200 select-none shadow-xs">
              <tr>
                <th className="border border-slate-200 p-2.5 w-16 text-center bg-slate-200 font-bold text-slate-800 uppercase tracking-wider sticky left-0 z-30">
                  DATE
                </th>
                {activePieceSizes.map((ps) => {
                  const rate = getMonthlyRate(db.monthlyRates, ps.id, selectedMonth, 0);
                  return (
                    <th
                      key={ps.id}
                      className="border border-slate-200 p-2.5 font-bold uppercase text-slate-700 text-right min-w-[130px]"
                    >
                      <div>{ps.displayName}</div>
                      <div className="text-[10px] font-mono text-slate-500 font-normal">
                        Rate: ₹{rate.toFixed(2)}
                      </div>
                    </th>
                  );
                })}
                <th className="border border-slate-200 p-2.5 font-bold uppercase text-right min-w-[120px] bg-slate-100 text-slate-900">
                  DAY TOTAL
                </th>
              </tr>
            </thead>

            {/* Grid of Dates 1 to 31 */}
            <tbody className="divide-y divide-slate-200 font-mono">
              {rows.map((row) => {
                return (
                  <tr key={row.day} className="hover:bg-blue-50/70 transition-colors">
                    {/* Sticky Date Column */}
                    <td className="border border-slate-200 p-2 text-center bg-slate-50 font-bold text-slate-800 sticky left-0 z-10 text-xs">
                      {String(row.day).padStart(2, '0')}
                    </td>

                    {/* Piece Size Quantity Cells */}
                    {activePieceSizes.map((ps) => {
                      const cell = row.cellMap[ps.id];
                      const hasValue = cell && cell.display !== '-';

                      return (
                        <td
                          key={ps.id}
                          onClick={() => handleOpenCell(row.day, ps.id, ps.displayName)}
                          className={`border border-slate-200 p-2 text-right cursor-pointer select-none transition-colors ${
                            hasValue
                              ? cell.status === 'P'
                                ? 'text-green-600 font-black bg-green-50'
                                : cell.status === 'X'
                                ? 'text-red-500 font-black bg-red-50'
                                : 'text-blue-600 font-bold hover:bg-blue-100/50'
                              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'
                          }`}
                          title={`Click to inspect entry for ${selectedWorker?.firstName} on Day ${row.day}`}
                        >
                          <span>{cell ? cell.display : '-'}</span>
                        </td>
                      );
                    })}

                    {/* Daily Total Pieces Column */}
                    <td className="border border-slate-200 p-2 text-right bg-slate-50 font-bold text-slate-900">
                      {row.dayTotalPieces > 0 ? formatNumber(row.dayTotalPieces) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer: Column Calculations Hierarchy */}
            <tfoot className="sticky bottom-0 bg-slate-900 text-white z-20 shadow-md">
              {/* Row 1: Simple Total Quantity */}
              <tr className="border-t-2 border-slate-700 bg-slate-800 text-slate-200 font-bold">
                <td className="border border-slate-700 p-2.5 text-center sticky left-0 z-30 bg-slate-800 text-xs text-slate-300 font-sans">
                  TOTAL QTY
                </td>
                {columnSummaries.map((summary) => (
                  <td key={summary.pieceSizeId} className="border border-slate-700 p-2 text-right font-mono text-xs">
                    {formatNumber(summary.totalQty)}
                  </td>
                ))}
                <td className="border border-slate-700 p-2 text-right font-mono text-blue-400 text-sm">
                  {formatNumber(workerGrandTotalPieces)}
                </td>
              </tr>

              {/* Row 2: Comprehensive Order Breakdown per Requirement:
                  PIECE SIZE -> PRICE -> TOTAL -> PIECES -> RATE -> AMOUNT */}
              <tr className="bg-slate-900">
                <td className="border border-slate-800 p-3 text-center sticky left-0 z-30 bg-slate-900 text-slate-400 text-[11px] font-sans font-bold align-top">
                  <div>RATE &</div>
                  <div>AMOUNT</div>
                  <div>BREAKDOWN</div>
                </td>

                {columnSummaries.map((summary) => (
                  <td
                    key={summary.pieceSizeId}
                    className="border border-slate-800 p-3 align-top font-sans text-left bg-slate-900/95"
                  >
                    <div className="space-y-2 text-xs">
                      {/* 1. PIECE SIZE */}
                      <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                        <span className="font-black uppercase text-white tracking-wide text-xs">
                          {summary.displayName}
                        </span>
                        {(isAdmin || isSupervisor) && !isLocked && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenEditRate(summary.pieceSizeId, summary.displayName, summary.rate)
                            }
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                            title={`Edit rate for ${summary.displayName} in ${getMonthName(selectedMonth)}`}
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                            <span>EDIT</span>
                          </button>
                        )}
                      </div>

                      {/* 2. PRICE */}
                      <div className="text-[11px] flex justify-between items-center text-slate-300">
                        <span className="text-slate-400">Price:</span>
                        <span className="font-mono font-bold text-amber-300">₹{summary.rate.toFixed(2)}</span>
                      </div>

                      {/* 3. TOTAL */}
                      <div className="pt-1 border-t border-slate-800 flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">TOTAL</span>
                        <span className="font-mono font-bold text-slate-100">{formatNumber(summary.totalQty)}</span>
                      </div>

                      {/* 4. PIECES */}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">PIECES</span>
                        <span className="font-mono font-bold text-slate-100">{formatNumber(summary.totalQty)}</span>
                      </div>

                      {/* 5. RATE */}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">RATE</span>
                        <span className="font-mono font-bold text-amber-300">₹{summary.rate.toFixed(2)}</span>
                      </div>

                      {/* 6. AMOUNT */}
                      <div className="pt-1.5 border-t border-slate-700 flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">AMOUNT</span>
                        <span className="font-mono font-black text-sm text-green-400">
                          {formatINR(summary.amount)}
                        </span>
                      </div>
                    </div>
                  </td>
                ))}

                {/* Day Total Column Footer */}
                <td className="border border-slate-800 p-3 align-top font-sans text-left bg-slate-950">
                  <div className="space-y-2 text-xs">
                    <div className="border-b border-slate-700 pb-1">
                      <span className="font-black uppercase text-blue-400 text-xs">GRAND TOTAL</span>
                    </div>

                    <div className="text-[11px] flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Active Sizes:</span>
                      <span className="font-mono font-bold text-white">{activePieceSizes.length}</span>
                    </div>

                    <div className="pt-1 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">TOTAL PIECES</span>
                      <span className="font-mono font-bold text-slate-100">{formatNumber(workerGrandTotalPieces)}</span>
                    </div>

                    <div className="pt-1.5 border-t border-slate-700">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                        TOTAL AMOUNT
                      </div>
                      <div className="font-mono font-black text-base text-green-400 mt-0.5">
                        {formatINR(workerGrandTotalAmount)}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ========================================================================= */}
        {/* Requirement 10: MONTHLY CALENDAR TOTAL SECTION (Bottom Summary Cards)     */}
        {/* ========================================================================= */}
        <div className="bg-slate-50 p-5 border-t border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                MONTHLY CALENDAR TOTAL SECTION
              </span>
              <h3 className="text-base font-bold text-slate-900">
                {selectedWorker?.fullName} • {getMonthName(selectedMonth)} Summary
              </h3>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleDownloadWorkerSlip}
                className="flex items-center space-x-1.5 py-1.5 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Export Slip (PDF)</span>
              </button>
            </div>
          </div>

          {/* Piece Size Summary Cards with Exact Hierarchy */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {columnSummaries.map((summary) => (
              <div
                key={summary.pieceSizeId}
                className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-3"
              >
                {/* Header: Piece Size + Rate */}
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      {summary.displayName}
                    </span>
                    {(isAdmin || isSupervisor) && !isLocked && (
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenEditRate(summary.pieceSizeId, summary.displayName, summary.rate)
                        }
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                        <span>EDIT RATE</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-2 text-xs font-medium text-slate-500 flex justify-between items-baseline">
                    <span>Price:</span>
                    <span className="font-mono font-bold text-slate-800">₹{summary.rate.toFixed(2)}</span>
                  </div>
                </div>

                {/* Body: TOTAL, PIECES, RATE, AMOUNT */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs font-mono">
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500 font-sans text-[11px] uppercase">TOTAL:</span>
                    <span className="font-bold text-slate-900">{formatNumber(summary.totalQty)} PCS</span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500 font-sans text-[11px] uppercase">PIECES:</span>
                    <span className="font-bold text-slate-900">{formatNumber(summary.totalQty)}</span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-500 font-sans text-[11px] uppercase">RATE:</span>
                    <span className="font-bold text-slate-800">₹{summary.rate.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                    <span className="text-slate-700 font-sans font-bold text-[11px] uppercase">AMOUNT:</span>
                    <span className="font-black text-blue-600 text-sm">{formatINR(summary.amount)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* GRAND TOTAL Card */}
            <div className="p-4 rounded-xl bg-slate-900 text-white shadow-sm flex flex-col justify-between space-y-3 border border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  ALL SIZES COMBINED
                </span>
                <h4 className="text-sm font-black text-white uppercase tracking-tight mt-0.5">
                  GRAND TOTAL
                </h4>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-xs font-mono">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-400 font-sans text-[11px] uppercase">TOTAL PIECES:</span>
                  <span className="font-bold text-white">{formatNumber(workerGrandTotalPieces)} PCS</span>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-slate-400 font-sans text-[10px] font-bold uppercase tracking-wider block">
                    TOTAL PAYABLE
                  </span>
                  <div className="text-xl font-black text-green-400 mt-0.5">
                    {formatINR(workerGrandTotalAmount)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Admin Edit Rate Modal                                                     */}
      {/* ========================================================================= */}
      {editingRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                  <IndianRupee className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase">
                    Edit Piece Rate • {editingRate.pieceSizeName}
                  </h3>
                  <p className="text-xs text-slate-500">{getMonthName(selectedMonth)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRate(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {rateFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-bold flex items-center space-x-2 ${
                  rateFeedback.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {rateFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                )}
                <span>{rateFeedback.message}</span>
              </div>
            )}

            <div className="space-y-3 font-sans">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="text-slate-500 font-medium">Current Active Rate:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  ₹{editingRate.currentRate.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  New Rate for {getMonthName(selectedMonth)} (₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingRate.newRate}
                    onChange={(e) => setEditingRate({ ...editingRate, newRate: e.target.value })}
                    placeholder="e.g. 3.00"
                    className="w-full pl-8 pr-3 py-2.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                <strong>Important:</strong> This rate applies specifically to {getMonthName(selectedMonth)}.
                Historical locked months (such as August 2026) maintain their original rates.
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingRate(null)}
                className="py-2.5 px-4 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingRate}
                onClick={handleSaveRate}
                className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{savingRate ? 'Saving...' : 'Save Rate'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Edit / View Cell Modal                                                    */}
      {/* ========================================================================= */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  Day {editingCell.day} • {editingCell.pieceSizeName}
                </h3>
                <p className="text-xs text-slate-500">{editingCell.workerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isSupervisor && (
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-center space-x-2">
                <Info className="w-4 h-4 flex-shrink-0 text-blue-600" />
                <span>Supervisor Full Access: You can add, edit, and delete calendar records while the month is open.</span>
              </div>
            )}

            {isLocked && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center space-x-2">
                <Lock className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>Month is locked. Records are view-only.</span>
              </div>
            )}

            {editFeedback && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {editFeedback}
              </div>
            )}

            <div className="space-y-3 font-sans">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Shift Mode
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setEditingCell({ ...editingCell, attendanceStatus: 'normal' })}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editingCell.attendanceStatus === 'normal'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Pieces
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setEditingCell({ ...editingCell, attendanceStatus: 'P', quantity: 0 })}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editingCell.attendanceStatus === 'P'
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    P (Present)
                  </button>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => setEditingCell({ ...editingCell, attendanceStatus: 'X', quantity: 0 })}
                    className={`py-2 text-xs font-bold rounded-lg border cursor-pointer ${
                      editingCell.attendanceStatus === 'X'
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    X (Absent)
                  </button>
                </div>
              </div>

              {editingCell.attendanceStatus === 'normal' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Quantity (Pieces)
                  </label>
                  <input
                    type="number"
                    disabled={isLocked}
                    value={editingCell.quantity}
                    onChange={(e) => setEditingCell({ ...editingCell, quantity: Number(e.target.value) })}
                    className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono font-bold text-lg text-center focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  disabled={isLocked}
                  value={editingCell.notes}
                  onChange={(e) => setEditingCell({ ...editingCell, notes: e.target.value })}
                  placeholder="e.g. Overtime or machine change"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-3 border-t border-slate-100">
              {editingCell.existingRecord && !isLocked && (
                <button
                  type="button"
                  onClick={handleDeleteCellRecord}
                  disabled={savingEdit}
                  className="p-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-xs cursor-pointer"
                  title="Delete Entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              {isLocked ? (
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Close Inspection
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isLocked || savingEdit}
                  onClick={handleSaveCellEdit}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

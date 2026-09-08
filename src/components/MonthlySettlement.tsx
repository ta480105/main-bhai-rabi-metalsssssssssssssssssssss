import { useState } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { formatINR, formatNumber, getMonthName, getMonthlyRate } from '../utils/formatters';
import { generateMonthlyPaymentPdf } from '../utils/pdfReport';
import {
  Calculator,
  Download,
  Lock,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface MonthlySettlementProps {
  store: ProductionStore;
}

export function MonthlySettlement({ store }: MonthlySettlementProps) {
  const { db, selectedMonth, setSelectedMonth, closeMonth, setSelectedWorkerId, setAdminTab } = store;

  const [confirmCloseModal, setConfirmCloseModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const monthStatus = db.monthStatuses.find((m) => m.month === selectedMonth);
  const isMonthClosed = monthStatus?.isClosed || monthStatus?.status === 'CLOSED';

  const monthRecords = db.productionRecords.filter((r) => r.month === selectedMonth);
  const activeSizes = db.pieceSizes.filter((p) => p.status === 'active');

  // Compute aggregated summaries for all workers
  let factoryGrandTotalPieces = 0;
  let factoryGrandTotalAmount = 0;

  const workerSummaries = db.workers
    .filter((w) => {
      const hasRecords = monthRecords.some((r) => r.workerId === w.id);
      return w.status === 'active' || hasRecords;
    })
    .map((w) => {
      const wRecords = monthRecords.filter((r) => r.workerId === w.id);
      let totalPieces = 0;
      let totalAmount = 0;

      const sizeBreakdown: Record<string, { qty: number; rate: number; amt: number }> = {};

      activeSizes.forEach((ps) => {
        const pRecords = wRecords.filter((r) => r.pieceSizeId === ps.id);
        const qty = pRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);

        const rate = getMonthlyRate(db.monthlyRates, ps.id, selectedMonth, 0);
        const amt = qty * rate;

        sizeBreakdown[ps.id] = { qty, rate, amt };
        totalPieces += qty;
        totalAmount += amt;
      });

      factoryGrandTotalPieces += totalPieces;
      factoryGrandTotalAmount += totalAmount;

      return {
        worker: w,
        totalPieces,
        totalAmount,
        sizeBreakdown,
      };
    });

  const handleDownloadPdf = () => {
    generateMonthlyPaymentPdf({
      companyName: db.settings.companyName || 'Factory Production Works',
      month: selectedMonth,
      workers: db.workers,
      pieceSizes: db.pieceSizes,
      monthlyRates: db.monthlyRates,
      productionRecords: db.productionRecords,
    });
  };

  const handleConfirmClose = async () => {
    setIsClosing(true);
    setFeedback(null);
    const res = await closeMonth(selectedMonth);
    setIsClosing(false);
    setConfirmCloseModal(false);
    if (res.success) {
      setFeedback({ type: 'success', message: `Month ${selectedMonth} has been reviewed and closed permanently.` });
    } else {
      setFeedback({ type: 'error', message: res.message || 'Failed to close month' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">
              Monthly Settlement & Review
            </h2>
            <p className="text-xs text-slate-500">Audited factory wage aggregation and closing register</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center space-x-1.5 py-2 px-3.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Download PDF Slip</span>
          </button>

          {!isMonthClosed ? (
            <button
              type="button"
              onClick={() => setConfirmCloseModal(true)}
              className="flex items-center space-x-1.5 py-2 px-3.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer uppercase tracking-wider"
            >
              <FileCheck className="w-4 h-4" />
              <span>Finalize & Close Month</span>
            </button>
          ) : (
            <div className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold">
              <Lock className="w-3.5 h-3.5 text-red-600" />
              <span>Month Closed by Admin</span>
            </div>
          )}
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

      {/* High-Level Month Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Billing Period</div>
          <div className="text-lg font-bold text-slate-900">{getMonthName(selectedMonth)}</div>
          <div className="text-xs text-slate-500">
            Status:{' '}
            <strong className={isMonthClosed ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
              {isMonthClosed ? 'FINALIZED & CLOSED' : 'OPEN & ACCRUING'}
            </strong>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Factory Pieces</div>
          <div className="text-xl font-bold text-blue-600 font-mono">
            {formatNumber(factoryGrandTotalPieces)} <span className="text-xs text-slate-500 font-sans">pcs</span>
          </div>
          <div className="text-xs text-slate-500">Across {workerSummaries.length} recorded workers</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Net Factory Settlement</div>
          <div className="text-xl font-bold text-slate-900 font-mono">{formatINR(factoryGrandTotalAmount)}</div>
          <div className="text-xs text-slate-500">Total piece wages payable</div>
        </div>
      </div>

      {/* Workers Settlement Breakdown Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Worker Piece Settlement Roster</h3>
          <span className="text-xs text-slate-500">Click any worker to view individual calendar</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 text-xs uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-bold border-b border-slate-200">Worker</th>
                {activeSizes.map((ps) => (
                  <th key={ps.id} className="py-2.5 px-3 font-bold text-right border-b border-slate-200">
                    {ps.displayName}
                  </th>
                ))}
                <th className="py-2.5 px-3 font-bold text-right border-b border-slate-200">Total Pieces</th>
                <th className="py-2.5 px-3 font-bold text-right text-blue-700 border-b border-slate-200">Net Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {workerSummaries.map(({ worker, totalPieces, totalAmount, sizeBreakdown }) => (
                <tr
                  key={worker.id}
                  onClick={() => {
                    setSelectedWorkerId(worker.id);
                    setAdminTab('calendar');
                  }}
                  className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3 font-sans">
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">{worker.firstName}</div>
                    <div className="text-[11px] text-slate-500">{worker.fullName}</div>
                  </td>

                  {activeSizes.map((ps) => {
                    const b = sizeBreakdown[ps.id];
                    return (
                      <td key={ps.id} className="py-2.5 px-3 text-right">
                        <div className="text-slate-800 font-semibold">{b?.qty ? formatNumber(b.qty) : '-'}</div>
                        {b?.amt ? <div className="text-[10px] text-slate-500">₹{formatNumber(b.amt)}</div> : null}
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatNumber(totalPieces)} pcs</td>
                  <td className="py-2.5 px-3 text-right font-bold text-blue-600 text-sm">{formatINR(totalAmount)}</td>
                </tr>
              ))}

              {/* Grand Total Row */}
              <tr className="bg-slate-800 text-white font-bold border-t border-slate-700">
                <td className="py-3 px-3 uppercase text-xs tracking-wider text-slate-200 font-sans">
                  Factory Grand Total
                </td>
                {activeSizes.map((ps) => {
                  const sizeTotalQty = workerSummaries.reduce((sum, ws) => sum + (ws.sizeBreakdown[ps.id]?.qty || 0), 0);
                  return (
                    <td key={ps.id} className="py-3 px-3 text-right text-slate-200">
                      {formatNumber(sizeTotalQty)}
                    </td>
                  );
                })}
                <td className="py-3 px-3 text-right text-blue-300 text-xs">
                  {formatNumber(factoryGrandTotalPieces)} pcs
                </td>
                <td className="py-3 px-3 text-right text-emerald-400 text-sm">{formatINR(factoryGrandTotalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Month Close Confirmation Modal */}
      {confirmCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base text-slate-900 uppercase">Close Month Permanently?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Finalizing and closing <strong className="text-slate-900">{getMonthName(selectedMonth)}</strong> will lock all
              records for this month. Once closed, supervisors and operators cannot add or change production numbers.
            </p>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pieces:</span>
                <span className="text-slate-900 font-bold">{formatNumber(factoryGrandTotalPieces)} pcs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Net Wages:</span>
                <span className="text-blue-600 font-bold">{formatINR(factoryGrandTotalAmount)}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmCloseModal(false)}
                className="w-1/2 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isClosing}
                onClick={handleConfirmClose}
                className="w-1/2 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
              >
                {isClosing ? 'Finalizing...' : 'Confirm & Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

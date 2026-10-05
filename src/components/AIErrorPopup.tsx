import { useState } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { AlertTriangle, Sparkles, RefreshCw, X, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';

interface AIErrorPopupProps {
  store: ProductionStore;
}

export function AIErrorPopup({ store }: AIErrorPopupProps) {
  const { activeError, aiDiagnosis, isDiagnosing, executeSafeRecovery, dismissError, recoverySuccess } = store;
  const [showTechnical, setShowTechnical] = useState(false);
  const [recovering, setRecovering] = useState(false);

  if (!activeError && !recoverySuccess) return null;

  const handleAction = async (action: 'retry' | 'reconnect' | 'refresh' | 'recalculate') => {
    setRecovering(true);
    await executeSafeRecovery(action);
    setRecovering(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 p-5 text-slate-800 shadow-2xl space-y-3.5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-slate-900 uppercase">Problem Detected</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  MONITOR
                </span>
              </div>
              <p className="text-[11px] text-slate-500">AI Background Error Diagnostic</p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissError}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Recovery Success State */}
        {recoverySuccess && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs font-bold flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{recoverySuccess}</span>
          </div>
        )}

        {/* Main Error Explanation */}
        <div className="space-y-2.5 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">What Happened:</span>
            <p className="text-slate-900 font-medium leading-relaxed">{activeError?.message}</p>
          </div>

          {/* AI Diagnosis Block */}
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 space-y-1.5">
            <div className="flex items-center space-x-1.5 text-blue-700 font-bold uppercase tracking-wider text-[10px]">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>{isDiagnosing ? 'Gemini AI Diagnosing...' : 'AI Root Cause Analysis:'}</span>
            </div>

            <p className="text-slate-700 leading-relaxed">
              {aiDiagnosis?.likelyCause || 'Temporary network disruption or database validation condition.'}
            </p>

            {aiDiagnosis?.recommendedAction && (
              <div className="pt-1 border-t border-blue-100 text-slate-800">
                <strong className="text-blue-700 font-bold">Recommendation: </strong>
                {aiDiagnosis.recommendedAction}
              </div>
            )}
          </div>
        </div>

        {/* Technical Details Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowTechnical(!showTechnical)}
            className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center space-x-1 cursor-pointer"
          >
            <span>{showTechnical ? 'Hide Technical Details' : 'View Technical Details'}</span>
            {showTechnical ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showTechnical && (
            <div className="mt-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 space-y-0.5">
              <div>Type: {activeError?.type}</div>
              <div>Operation: {activeError?.operation}</div>
              <div>Component: {activeError?.component}</div>
            </div>
          )}
        </div>

        {/* Action Recovery Buttons */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={dismissError}
            className="w-1/3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 shadow-xs cursor-pointer"
          >
            Dismiss
          </button>

          <button
            type="button"
            disabled={recovering}
            onClick={() => handleAction((aiDiagnosis?.recoveryAction as any) || 'retry')}
            className="w-2/3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer uppercase tracking-wider"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recovering ? 'animate-spin' : ''}`} />
            <span>{recovering ? 'Recovering...' : 'Safe Auto-Recovery'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

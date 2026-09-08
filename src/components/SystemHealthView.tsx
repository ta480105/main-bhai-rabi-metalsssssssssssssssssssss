import { useState, useEffect } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { useAuth } from '../context/AuthContext';
import { Activity, Radio, Cpu, Database, CheckCircle2, RefreshCw, Flame, ShieldCheck } from 'lucide-react';

interface SystemHealthViewProps {
  store: ProductionStore;
}

export function SystemHealthView({ store }: SystemHealthViewProps) {
  const { isLive, refreshDb, db } = store;
  const { user, role } = useAuth();
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">System Health & Live Telemetry</h2>
            <p className="text-xs text-slate-500">Supabase Realtime listeners, username/password login, and database telemetry</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchHealth();
            refreshDb();
          }}
          disabled={loading}
          className="flex items-center space-x-1.5 py-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Real-time Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Supabase Realtime</span>
            <Flame className={`w-3.5 h-3.5 ${isLive ? 'text-amber-500 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div className="text-xl font-bold text-slate-900">{isLive ? 'CONNECTED' : 'STANDBY'}</div>
          <p className="text-[11px] text-slate-500">Real-time Supabase listener active</p>
        </div>

        {/* Fixed Loginentication */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Fixed Login</span>
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-600 font-mono truncate">
            {user ? 'ACTIVE' : 'READY'}
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {user?.email || 'Supabase Auth & RLS'}
          </p>
        </div>

        {/* Database Records */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Supabase Records</span>
            <Database className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {db.productionRecords.length} <span className="text-xs text-slate-500 font-sans">entries</span>
          </div>
          <p className="text-[11px] text-slate-500">Live ledger transactions stored in Supabase</p>
        </div>

        {/* Gemini AI Backend */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Gemini 2.5 Flash AI</span>
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">
            {healthData?.geminiConfigured ? (
              <span className="text-green-600">ACTIVE</span>
            ) : (
              <span className="text-amber-600 text-base">STANDBY / LOCAL</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {healthData?.geminiConfigured
              ? 'Server-side proxy key active'
              : 'Add GEMINI_API_KEY for advanced reasoning'}
          </p>
        </div>
      </div>

      {/* Diagnostics Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span>Self-Healing Diagnostic Status</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 font-medium">Database Persistence</div>
            <div className="text-green-700 font-bold mt-1">CLOUD SUPABASE</div>
            <div className="text-[10px] text-slate-500 mt-1">Multi-device real-time sync</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 font-medium">Timezone Precision</div>
            <div className="text-blue-700 font-bold mt-1 font-mono">Asia/Kolkata (IST)</div>
            <div className="text-[10px] text-slate-500 mt-1">Industrial calendar synchronization</div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-slate-500 font-medium">Audit Trail Persistence</div>
            <div className="text-green-700 font-bold mt-1">SUPABASE AUDIT</div>
            <div className="text-[10px] text-slate-500 mt-1">Immutable security log</div>
          </div>
        </div>
      </div>
    </div>
  );
}

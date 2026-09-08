import React, { useState } from 'react';
import { UserRole } from '../types';
import { ShieldCheck, HardHat, Factory, LogIn, CheckCircle2, Flame, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface OpeningScreenProps {
  onSelectRole: (role: UserRole) => void;
  isLive: boolean;
  companyName?: string;
}

export function OpeningScreen({ onSelectRole, isLive, companyName }: OpeningScreenProps) {
  const { signInFixed } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('SUPERVISOR');
  const [id, setId] = useState('supervisor');
  const [password, setPassword] = useState('1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectRole = (role: UserRole) => {
    setSelectedRole(role);
    setId(role === 'ADMIN' ? 'admin' : '');
    setPassword(role === 'ADMIN' ? '1234' : '');
    setError(null);
  };

  const handleLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signInFixed(selectedRole, id, password);
    if (!result.success) {
      setError(result.error || 'Invalid login.');
      setBusy(false);
      return;
    }
    onSelectRole(selectedRole);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between p-6 select-none">
      <div className="flex items-center justify-between max-w-md mx-auto w-full pt-4">
        <div className="flex items-center space-x-2 text-slate-600 text-xs font-mono font-bold">
          <Factory className="w-4 h-4 text-blue-600" />
          <span className="uppercase tracking-wider">{companyName || 'PRODUCTION MANAGEMENT'}</span>
        </div>
        <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-xs font-mono text-green-400">{isLive ? 'SUPABASE LIVE' : 'CONNECTING'}</span>
        </div>
      </div>

      <div className="max-w-md mx-auto w-full my-auto py-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center space-y-6">
          <div className="space-y-2">
            <div className="inline-flex p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 mb-1">
              <Factory className="w-8 h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 uppercase">Production Management</h1>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">Production register with real-time Supabase sync.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => selectRole('ADMIN')} className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedRole === 'ADMIN' ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <ShieldCheck className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <div className="text-xs font-bold">ADMIN</div>
            </button>
            <button type="button" onClick={() => selectRole('SUPERVISOR')} className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedRole === 'SUPERVISOR' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <HardHat className="w-6 h-6 mx-auto mb-2 text-slate-700" />
              <div className="text-xs font-bold">SUPERVISOR</div>
            </button>
          </div>

          <div className="space-y-3 text-left">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">{selectedRole} Login</div>
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ID" autoComplete="username" className="w-full px-3 py-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && handleLogin()} className="w-full px-3 py-3 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-200" />
            {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
            <button type="button" onClick={handleLogin} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-60 cursor-pointer">
              <LogIn className="w-4 h-4" /> {busy ? 'LOGIN...' : 'LOGIN'}
            </button>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800"><CheckCircle2 className="w-4 h-4" /> Admin + Supervisor accounts</div>
            <div className="text-[10px] text-emerald-700 mt-1">Admin login is preserved. Supervisors are created by the Admin.</div>
          </div>

          <div className="pt-2 text-[10px] text-slate-400 border-t border-slate-100 flex items-center justify-center gap-2">
            <Flame className="w-3 h-3 text-amber-500" /> SUPABASE REAL-TIME SYNC
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-slate-400 max-w-md mx-auto w-full pb-4">Username/password login • Supabase synchronization</div>
    </div>
  );
}

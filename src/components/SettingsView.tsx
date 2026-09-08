import { useEffect, useState, type FormEvent } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { Settings, Save, CheckCircle2, ShieldCheck, UserPlus, UserX, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SettingsViewProps {
  store: ProductionStore;
}

export function SettingsView({ store }: SettingsViewProps) {
  const { db, saveSettings } = store;
  const { user, role, listSupervisors, createSupervisor, setSupervisorActive, changeSupervisorPassword, logoutSupervisor } = useAuth();

  const [companyName, setCompanyName] = useState(db.settings.companyName || '');
  const [allowDuplicates, setAllowDuplicates] = useState(db.settings.allowDuplicateEntries || false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [supervisors, setSupervisors] = useState<Array<{ id: string; username: string; displayName: string; active: boolean }>>([]);
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorUsername, setSupervisorUsername] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [supervisorBusy, setSupervisorBusy] = useState(false);

  const refreshSupervisors = async () => {
    if (role !== 'ADMIN') return;
    setSupervisors(await listSupervisors());
  };

  useEffect(() => {
    void refreshSupervisors();
  }, [role]);

  const handleCreateSupervisor = async () => {
    setSupervisorBusy(true);
    const result = await createSupervisor(supervisorName, supervisorUsername, supervisorPassword);
    setSupervisorBusy(false);
    if (!result.success) {
      setFeedback({ type: 'error', message: result.error || 'Unable to create supervisor.' });
      return;
    }
    setSupervisorName('');
    setSupervisorUsername('');
    setSupervisorPassword('');
    setFeedback({ type: 'success', message: result.message || 'Supervisor created.' });
    await refreshSupervisors();
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const res = await saveSettings({
      companyName,
      allowDuplicateEntries: allowDuplicates,
    });

    setSaving(false);
    if (res.success) {
      setFeedback({ type: 'success', message: 'Settings saved successfully.' });
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setFeedback({ type: 'error', message: res.message || 'Failed to save settings.' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 max-w-2xl">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center space-x-3">
        <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">System Settings</h2>
          <p className="text-xs text-slate-500">Configure factory profile and print header metadata</p>
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
          <CheckCircle2 className="w-4 h-4" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Company / Factory Name (Appears on PDF Reports)
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Al-Haramain Bottling Works"
              className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Security & Authentication Info Panel */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs uppercase">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Authentication & Role Security</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The app uses Supabase username/password authentication and Supabase Realtime synchronization. Signed in as{' '}
              <strong className="text-slate-900">{user?.email || 'Authenticated User'}</strong> ({role || 'Admin'}).
            </p>
          </div>

          <div className="pt-1">
            <label className="flex items-center space-x-3 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={allowDuplicates}
                onChange={(e) => setAllowDuplicates(e.target.checked)}
                className="accent-blue-600 w-4 h-4 rounded cursor-pointer"
              />
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase">Allow Multiple Separate Entries for Same Worker & Size on Same Date</div>
                <div className="text-[11px] text-slate-500">
                  When disabled, system prompts Supervisor to Add or Overwrite existing counts for today.
                </div>
              </div>
            </label>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs uppercase tracking-wider shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {role === 'ADMIN' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm uppercase">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Supervisor Management</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Supervisor name" className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-xs" />
            <input value={supervisorUsername} onChange={(e) => setSupervisorUsername(e.target.value)} placeholder="Username" autoComplete="off" className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-xs" />
            <input value={supervisorPassword} onChange={(e) => setSupervisorPassword(e.target.value)} placeholder="Password (6+ chars)" type="password" autoComplete="new-password" className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-xs" />
          </div>
          <button type="button" onClick={handleCreateSupervisor} disabled={supervisorBusy || !supervisorName || !supervisorUsername || supervisorPassword.length < 6} className="py-2 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">
            <UserPlus className="w-3.5 h-3.5" /> Create Supervisor
          </button>
          <div className="space-y-2">
            {supervisors.map((supervisor) => (
              <div key={supervisor.id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div><div className="text-xs font-bold text-slate-800">{supervisor.displayName}</div><div className="text-[11px] text-slate-500">@{supervisor.username} · {supervisor.active ? 'Active' : 'Disabled'}</div></div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={async () => { const r = await setSupervisorActive(supervisor.username, !supervisor.active); setFeedback({ type: r.success ? 'success' : 'error', message: r.message || r.error || 'Status update failed.' }); await refreshSupervisors(); }} className="px-2 py-1.5 rounded bg-white border border-slate-300 text-[10px] font-bold flex items-center gap-1">{supervisor.active ? <UserX className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}{supervisor.active ? 'Disable' : 'Enable'}</button>
                  <button type="button" onClick={async () => { const password = window.prompt('New supervisor password (minimum 6 characters):'); if (!password) return; const r = await changeSupervisorPassword(supervisor.username, password); setFeedback({ type: r.success ? 'success' : 'error', message: r.message || r.error || 'Password change failed.' }); }} className="px-2 py-1.5 rounded bg-white border border-slate-300 text-[10px] font-bold flex items-center gap-1"><KeyRound className="w-3 h-3" /> Password</button>
                  <button type="button" onClick={async () => { const r = await logoutSupervisor(supervisor.username); setFeedback({ type: r.success ? 'success' : 'error', message: r.message || r.error || 'Logout failed.' }); }} className="px-2 py-1.5 rounded bg-white border border-slate-300 text-[10px] font-bold flex items-center gap-1"><LogOut className="w-3 h-3" /> Logout All</button>
                </div>
              </div>
            ))}
            {supervisors.length === 0 && <div className="text-xs text-slate-500">No supervisors created yet.</div>}
          </div>
        </div>
      )}

    </div>
  );
}

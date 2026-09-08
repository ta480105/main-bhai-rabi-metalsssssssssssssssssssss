import { useState, type FormEvent } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { Worker } from '../types';
import { Users, UserPlus, Search, Edit3, UserCheck, UserX, Phone, History } from 'lucide-react';
import { formatNumber } from '../utils/formatters';

interface WorkerManagementProps {
  store: ProductionStore;
}

export function WorkerManagement({ store }: WorkerManagementProps) {
  const { db, addWorker, updateWorker, selectedMonth, setSelectedWorkerId, setAdminTab } = store;

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal for Add / Edit
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // History modal
  const [historyWorker, setHistoryWorker] = useState<Worker | null>(null);

  const filteredWorkers = db.workers.filter((w) => {
    const matchesSearch =
      w.firstName.toLowerCase().includes(search.toLowerCase()) ||
      w.fullName.toLowerCase().includes(search.toLowerCase()) ||
      w.id.toLowerCase().includes(search.toLowerCase()) ||
      w.mobile.includes(search);
    const matchesStatus = filterStatus === 'all' || w.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleOpenAdd = () => {
    setIsAdding(true);
    setEditingWorker(null);
    setFirstName('');
    setLastName('');
    setMobile('');
    setFeedback(null);
  };

  const handleOpenEdit = (w: Worker) => {
    setEditingWorker(w);
    setIsAdding(false);
    setFirstName(w.firstName);
    setLastName(w.lastName || '');
    setMobile(w.mobile || '');
    setFeedback(null);
  };

  const handleSaveWorker = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setFeedback('Worker first name is required.');
      return;
    }
    setSubmitting(true);
    setFeedback(null);

    if (isAdding) {
      const res = await addWorker({ firstName, lastName, mobile });
      setSubmitting(false);
      if (res.success) {
        setIsAdding(false);
      } else {
        setFeedback(res.message || 'Error creating worker');
      }
    } else if (editingWorker) {
      const res = await updateWorker(editingWorker.id, { firstName, lastName, mobile });
      setSubmitting(false);
      if (res.success) {
        setEditingWorker(null);
      } else {
        setFeedback(res.message || 'Error updating worker');
      }
    }
  };

  const handleToggleStatus = async (w: Worker) => {
    const nextStatus = w.status === 'active' ? 'inactive' : 'active';
    await updateWorker(w.id, { status: nextStatus });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header and Add Button */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">Worker Directory</h2>
            <p className="text-xs text-slate-500">Manage factory workforce profiles and active rosters</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 py-2 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Worker</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers by first name, full name, ID, or phone..."
            className="w-full py-2 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex space-x-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase transition-colors cursor-pointer ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Workers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredWorkers.map((w) => {
          const workerRecords = db.productionRecords.filter((r) => r.workerId === w.id && r.month === selectedMonth);
          const monthPieces = workerRecords.reduce((s, r) => s + (r.quantity || 0), 0);

          return (
            <div
              key={w.id}
              className={`rounded-xl p-4 border transition-all ${
                w.status === 'active'
                  ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base ${
                      w.status === 'active'
                        ? 'bg-blue-50 text-blue-600 border border-blue-100'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {w.firstName.charAt(0)}
                  </div>
                  <div>
                    {/* First Name Prominently Displayed per Specification */}
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-slate-900 text-sm leading-tight">{w.firstName}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          w.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {w.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{w.fullName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">ID: {w.id}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(w)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 rounded-md hover:bg-slate-100 cursor-pointer"
                    title="Edit Worker"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(w)}
                    className={`p-1.5 rounded-md cursor-pointer ${
                      w.status === 'active'
                        ? 'text-red-500 hover:bg-red-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={w.status === 'active' ? 'Deactivate Worker' : 'Reactivate Worker'}
                  >
                    {w.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {w.mobile && (
                <div className="flex items-center space-x-1.5 mt-2.5 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{w.mobile}</span>
                </div>
              )}

              {/* Monthly stats snippet */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">This Month</span>
                  <span className="font-mono font-bold text-slate-900">{formatNumber(monthPieces)} pcs</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedWorkerId(w.id);
                    setAdminTab('calendar');
                  }}
                  className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold text-[11px] transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <History className="w-3 h-3" />
                  <span>View Register</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Worker Modal */}
      {(isAdding || editingWorker) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              {isAdding ? 'Add New Worker' : `Edit ${editingWorker?.firstName}`}
            </h3>

            {feedback && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {feedback}
              </div>
            )}

            <form onSubmit={handleSaveWorker} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Tabish"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Last Name (Optional)
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Ahmed"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Mobile Number (Optional)
                </label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingWorker(null);
                  }}
                  className="w-1/2 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { PieceSize } from '../types';
import { Layers, Plus, Edit2, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';

interface PieceSizeManagementProps {
  store: ProductionStore;
}

export function PieceSizeManagement({ store }: PieceSizeManagementProps) {
  const { db, addPieceSize, updatePieceSize } = store;

  const [isAdding, setIsAdding] = useState(false);
  const [editingSize, setEditingSize] = useState<PieceSize | null>(null);

  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('ml');
  const [displayName, setDisplayName] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenAdd = () => {
    setIsAdding(true);
    setEditingSize(null);
    setName('');
    setValue('');
    setUnit('ml');
    setDisplayName('');
    setFeedback(null);
  };

  const handleOpenEdit = (ps: PieceSize) => {
    setEditingSize(ps);
    setIsAdding(false);
    setName(ps.name);
    setValue(String(ps.value));
    setUnit(ps.unit);
    setDisplayName(ps.displayName);
    setFeedback(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFeedback('Piece size name is required');
      return;
    }
    const numVal = Number(value);
    if (isNaN(numVal) || numVal <= 0) {
      setFeedback('Value must be a number greater than 0');
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const dName = displayName.trim() || `${numVal} ${unit}`.trim();

    if (isAdding) {
      const res = await addPieceSize({ name, value: numVal, unit, displayName: dName });
      setSubmitting(false);
      if (res.success) setIsAdding(false);
      else setFeedback(res.message || 'Error adding size');
    } else if (editingSize) {
      const res = await updatePieceSize(editingSize.id, {
        name,
        value: numVal,
        unit,
        displayName: dName,
      });
      setSubmitting(false);
      if (res.success) setEditingSize(null);
      else setFeedback(res.message || 'Error updating size');
    }
  };

  const handleToggleStatus = async (ps: PieceSize) => {
    const nextStatus = ps.status === 'active' ? 'inactive' : 'active';
    await updatePieceSize(ps.id, { status: nextStatus });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight">
              Piece Size Catalog
            </h2>
            <p className="text-xs text-slate-500">Configure factory bottle formats, units, and piece variants</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 py-2 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs uppercase tracking-wider shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Piece Size</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {db.pieceSizes.map((ps) => {
          const isActive = ps.status === 'active';
          return (
            <div
              key={ps.id}
              className={`p-4 rounded-xl border transition-all ${
                isActive
                  ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                  : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900 text-sm">{ps.displayName}</h3>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {ps.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Internal Name: <span className="text-slate-800 font-medium">{ps.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    Specification: {ps.value} {ps.unit}
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(ps)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 rounded-md hover:bg-slate-100 cursor-pointer"
                    title="Edit Piece Size"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleStatus(ps)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
                    title={isActive ? 'Deactivate Size' : 'Reactivate Size'}
                  >
                    {isActive ? (
                      <ToggleRight className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {(isAdding || editingSize) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-6 text-slate-900 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              {isAdding ? 'Add Piece Size' : `Edit ${editingSize?.displayName}`}
            </h3>

            {feedback && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {feedback}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Format Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 220 ml or Cup 50"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Numeric Value <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="220"
                    className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-mono font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="ml / pcs / kg"
                    className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                  Display Label (Optional)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. 220 ml"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingSize(null);
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
                  {submitting ? 'Saving...' : 'Save Size'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

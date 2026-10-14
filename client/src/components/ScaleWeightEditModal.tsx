import React, { useState, useEffect } from 'react';
import { X, Trash2, Calendar, Weight, Check } from 'lucide-react';
import { ScaleWeightHistoryEntry } from '../types';

interface ScaleWeightEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ScaleWeightHistoryEntry | null;
  onSave: (data: { entryId?: number; date: string; weightKg: number; notes?: string }) => Promise<void>;
  onDelete?: (entryId: number) => Promise<void>;
}

export const ScaleWeightEditModal: React.FC<ScaleWeightEditModalProps> = ({
  isOpen,
  onClose,
  entry,
  onSave,
  onDelete
}) => {
  const [date, setDate] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setDate(entry.logDate);
      setWeight(entry.weightKg.toString());
      setNotes(entry.notes || '');
    } else {
      const today = new Date().toISOString().split('T')[0];
      setDate(today);
      setWeight('');
      setNotes('');
    }
    setError(null);
  }, [entry, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      setError('Please enter a valid scale weight (e.g. 77.8)');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave({
        entryId: entry?.entryId,
        date,
        weightKg: w,
        notes: notes.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save scale weight');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!entry || !onDelete) return;
    if (window.confirm(`Delete scale weight entry of ${entry.weightKg} kg on ${entry.formattedDate}?`)) {
      try {
        setDeleting(true);
        await onDelete(entry.entryId);
        onClose();
      } catch (err: any) {
        setError(err?.message || 'Failed to delete entry');
      } finally {
        setDeleting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#18191E] border border-[#26272F] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#26272F] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#25272E] border border-white/5 flex items-center justify-center text-[#4ADE80]">
              <Weight className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {entry ? 'Edit Scale Weight' : 'Log Scale Weight'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Weigh-in Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#121316] border border-[#2A2B33] rounded-xl px-4 py-2.5 text-white text-sm font-sans focus:outline-none focus:border-[#4ADE80] transition-colors"
                required
              />
              <Calendar className="w-4 h-4 text-gray-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Scale Weight Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Scale Weight (kg)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="20"
                max="300"
                placeholder="77.8"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full bg-[#121316] border border-[#2A2B33] rounded-xl px-4 py-2.5 text-white text-base font-mono font-bold focus:outline-none focus:border-[#4ADE80] transition-colors"
                autoFocus
                required
              />
              <span className="absolute right-4 top-3 text-xs font-semibold text-gray-400">
                kg
              </span>
            </div>
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Morning fasted weigh-in"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#121316] border border-[#2A2B33] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#4ADE80] transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {entry && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-3.5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-[#25272E] hover:bg-[#32353E] text-gray-300 hover:text-white text-xs font-bold transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#4ADE80] to-[#22C55E] hover:brightness-110 active:scale-95 text-[#0E0F12] text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{saving ? 'Saving...' : 'Save Weigh-in'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

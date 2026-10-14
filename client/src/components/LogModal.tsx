import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { LogItem } from '../types';

interface LogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogItem[];
  onSave: (data: {
    date: string;
    scaleWeight?: number | null;
    calories?: number | null;
    isFasting?: boolean;
    isPartial?: boolean;
  }) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
}

export const LogModal: React.FC<LogModalProps> = ({
  isOpen,
  onClose,
  logs,
  onSave,
  onDelete,
}) => {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [scaleWeight, setScaleWeight] = useState<string>('');
  const [calories, setCalories] = useState<string>('');
  const [isFasting, setIsFasting] = useState<boolean>(false);
  const [isPartial, setIsPartial] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const todayStr = new Date().toISOString().split('T')[0];
      setDate(todayStr);
      // Pre-fill if entry exists for today
      const existing = logs.find((l) => l.date === todayStr);
      if (existing) {
        setScaleWeight(existing.scaleWeight !== null ? existing.scaleWeight.toString() : '');
        setCalories(existing.calories !== null ? existing.calories.toString() : '');
        setIsFasting(existing.isFasting);
        setIsPartial(existing.isPartial ?? false);
      } else {
        setScaleWeight('');
        setCalories('');
        setIsFasting(false);
        setIsPartial(false);
      }
    }
  }, [isOpen, logs]);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    const existing = logs.find((l) => l.date === newDate);
    if (existing) {
      setScaleWeight(existing.scaleWeight !== null ? existing.scaleWeight.toString() : '');
      setCalories(existing.calories !== null ? existing.calories.toString() : '');
      setIsFasting(existing.isFasting);
      setIsPartial(existing.isPartial ?? false);
    } else {
      setScaleWeight('');
      setCalories('');
      setIsFasting(false);
      setIsPartial(false);
    }
  };

  const setQuickDate = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    handleDateChange(d.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;

    setSubmitting(true);
    try {
      const w = scaleWeight ? parseFloat(scaleWeight) : null;
      const c = isFasting ? 0 : calories ? parseInt(calories, 10) : null;
      await onSave({
        date,
        scaleWeight: w,
        calories: c,
        isFasting,
        isPartial,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#1c1d22] border-t sm:border border-[#272930] rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-200">
        <div className="flex justify-between items-center border-b border-[#272930] pb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#c7b8f5]">
              Daily Entry
            </span>
            <h3 className="text-base font-bold text-white">Log Scale Weight & Calories</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-gray-300">Date</label>
              <span className="text-xs text-[#c7b8f5] font-medium font-mono">
                {new Date(date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              required
              className="w-full bg-[#121316] border border-[#272930] rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:border-[#c7b8f5] outline-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className="px-2.5 py-1 bg-[#25272e] hover:bg-[#30333c] text-gray-300 rounded-lg text-[11px] font-medium"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(-1)}
                className="px-2.5 py-1 bg-[#25272e] hover:bg-[#30333c] text-gray-300 rounded-lg text-[11px] font-medium"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(-2)}
                className="px-2.5 py-1 bg-[#25272e] hover:bg-[#30333c] text-gray-300 rounded-lg text-[11px] font-medium"
              >
                2 Days Ago
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Morning Scale Weight (kg)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="30"
                max="300"
                placeholder="e.g. 78.2"
                value={scaleWeight}
                onChange={(e) => setScaleWeight(e.target.value)}
                className="w-full bg-[#121316] border border-[#272930] rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:border-[#c7b8f5] outline-none pr-12"
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-gray-400 font-semibold pointer-events-none">
                kg
              </span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-gray-300">
                Total Daily Calories (kcal)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-amber-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFasting}
                    onChange={(e) => {
                      setIsFasting(e.target.checked);
                      if (e.target.checked) {
                        setCalories('0');
                        setIsPartial(false);
                      }
                    }}
                    className="rounded bg-[#121316] border-gray-700 text-orange-500"
                  />
                  <span>Full Fast</span>
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-[#c7b8f5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPartial}
                    onChange={(e) => {
                      setIsPartial(e.target.checked);
                      if (e.target.checked) {
                        setIsFasting(false);
                      }
                    }}
                    className="rounded bg-[#121316] border-gray-700 text-purple-400"
                  />
                  <span>Partial Day</span>
                </label>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                max="10000"
                placeholder={isPartial ? "Optional (e.g. 850)" : "e.g. 1865"}
                disabled={isFasting}
                value={isFasting ? '0' : calories}
                onChange={(e) => setCalories(e.target.value)}
                className="w-full bg-[#121316] border border-[#272930] rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:border-[#c7b8f5] outline-none pr-14 disabled:opacity-50"
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-gray-400 font-semibold pointer-events-none">
                kcal
              </span>
            </div>
            {isPartial && (
              <p className="text-[11px] text-purple-300/80 mt-1.5 leading-relaxed bg-purple-950/30 border border-purple-900/40 rounded-lg p-2">
                Marked as incomplete. This entry is excluded from expenditure rolling averages to prevent under-eating distortion.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-[#6e46e5] to-[#8250df] text-white font-semibold rounded-xl text-xs shadow-lg hover:opacity-95 active:scale-98 transition-all disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Entry'}
          </button>
        </form>

        {/* Recent Entries */}
        <div className="pt-3 border-t border-[#272930]">
          <h4 className="text-xs font-bold text-gray-300 mb-2 flex justify-between items-center">
            <span>Recent Logged Entries</span>
            <span className="text-[10px] text-gray-400 font-normal">
              {logs.length} entries
            </span>
          </h4>
          <div className="max-h-40 overflow-y-auto no-scrollbar space-y-1.5 text-xs">
            {logs.length === 0 ? (
              <div className="text-center py-4 text-gray-500">No logs recorded yet.</div>
            ) : (
              logs.map((item) => (
                <div
                  key={item.date}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#121316] border border-[#272930]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono text-[11px]">{item.date}</span>
                    <span className="font-bold text-white font-mono tabular-nums">
                      {item.scaleWeight !== null ? `${item.scaleWeight.toFixed(1)} kg` : '--'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.isPartial ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-[#c7b8f5] font-semibold">
                        Partial ({item.calories !== null ? `${item.calories} kcal` : 'Unlogged'})
                      </span>
                    ) : (
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          item.isFasting ? 'text-amber-400' : 'text-gray-300'
                        }`}
                      >
                        {item.isFasting ? 'Fasted (0)' : item.calories !== null ? `${item.calories} kcal` : '--'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(item.date)}
                      className="text-gray-500 hover:text-red-400 transition-colors p-1"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

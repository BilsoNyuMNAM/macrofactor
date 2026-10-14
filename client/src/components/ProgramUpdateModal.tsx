import React, { useState } from 'react';
import { X, Check, Sparkles, AlertCircle } from 'lucide-react';
import { calculateMacros } from '../utils/macroMath';

interface ProgramUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTargets: {
    calories: number;
    proteinGrams?: number;
    fatGrams?: number;
    carbGrams?: number;
  };
  newCalories: number;
  currentTrendWeight: number;
  onApply: () => Promise<void>;
}

export const ProgramUpdateModal: React.FC<ProgramUpdateModalProps> = ({
  isOpen,
  onClose,
  currentTargets,
  newCalories,
  currentTrendWeight,
  onApply,
}) => {
  if (!isOpen) return null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevMacros = calculateMacros(currentTargets.calories, currentTrendWeight);
  const nextMacros = calculateMacros(newCalories, currentTrendWeight);

  const calDelta = nextMacros.calories - prevMacros.calories;
  const protDelta = nextMacros.proteinGrams - prevMacros.proteinGrams;
  const fatDelta = nextMacros.fatGrams - prevMacros.fatGrams;
  const carbDelta = nextMacros.carbGrams - prevMacros.carbGrams;

  const renderBullet = (diff: number, unit = 'g') => {
    if (diff === 0) {
      return (
        <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-[#1C1D22] border border-[#272930] text-gray-400">
          0 {unit}
        </span>
      );
    }
    const isPositive = diff > 0;
    return (
      <span
        className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
          isPositive
            ? 'bg-emerald-500/10 border-emerald-500/25 text-[#43AA71]'
            : 'bg-amber-500/10 border-amber-500/25 text-[#F5BC43]'
        }`}
      >
        {isPositive ? `+${diff}` : `${diff}`} {unit}
      </span>
    );
  };

  const handleApply = async () => {
    try {
      setSaving(true);
      setError(null);
      await onApply();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to apply updated targets');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#16171B] border border-[#272930] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#272930] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#15271E] text-[#43AA71] border border-[#1E432E] flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Program Update
              </span>
              <h2 className="text-base font-bold text-white">Updated Targets</h2>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Your targets have been recalibrated based on your new goal velocity.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22242B] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Side-by-Side Target Comparison Grid */}
          <div className="bg-[#18191E] border border-[#24262E] rounded-xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-12 bg-[#121316] border-b border-[#24262E] px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <span className="col-span-4">Nutrient</span>
              <span className="col-span-3 text-right">Current</span>
              <span className="col-span-3 text-right text-white">New</span>
              <span className="col-span-2 text-right">Delta</span>
            </div>

            <div className="divide-y divide-[#24262E] text-xs">
              {/* Daily Calories */}
              <div className="grid grid-cols-12 px-4 py-3.5 items-center">
                <div className="col-span-4 font-bold text-white flex items-center gap-1.5">
                  <span>Calories</span>
                </div>
                <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                  {prevMacros.calories.toLocaleString()} <span className="text-[10px]">kcal</span>
                </div>
                <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                  {nextMacros.calories.toLocaleString()} <span className="text-[10px] text-gray-400">kcal</span>
                </div>
                <div className="col-span-2 text-right flex justify-end">
                  {renderBullet(calDelta, 'kcal')}
                </div>
              </div>

              {/* Protein */}
              <div className="grid grid-cols-12 px-4 py-3 items-center">
                <div className="col-span-4 font-semibold text-gray-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  <span>Protein</span>
                </div>
                <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                  {prevMacros.proteinGrams}g
                </div>
                <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                  {nextMacros.proteinGrams}g
                </div>
                <div className="col-span-2 text-right flex justify-end">
                  {renderBullet(protDelta, 'g')}
                </div>
              </div>

              {/* Fat */}
              <div className="grid grid-cols-12 px-4 py-3 items-center">
                <div className="col-span-4 font-semibold text-gray-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                  <span>Fat</span>
                </div>
                <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                  {prevMacros.fatGrams}g
                </div>
                <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                  {nextMacros.fatGrams}g
                </div>
                <div className="col-span-2 text-right flex justify-end">
                  {renderBullet(fatDelta, 'g')}
                </div>
              </div>

              {/* Carbohydrates */}
              <div className="grid grid-cols-12 px-4 py-3 items-center">
                <div className="col-span-4 font-semibold text-gray-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  <span>Carbs</span>
                </div>
                <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                  {prevMacros.carbGrams}g
                </div>
                <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                  {nextMacros.carbGrams}g
                </div>
                <div className="col-span-2 text-right flex justify-end">
                  {renderBullet(carbDelta, 'g')}
                </div>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#1C1D22] border border-[#272930] text-xs text-gray-400 leading-relaxed">
            <span className="text-gray-200 font-semibold block mb-0.5">Program Calibration:</span>
            Applying these updates updates your active nutritional program targets immediately. Your check-in schedule and historical adherence logs remain preserved.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#272930] bg-[#16171B] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#23242A] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleApply}
            className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
          >
            {saving ? (
              <span>Applying...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-black" />
                <span>Apply Updates</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

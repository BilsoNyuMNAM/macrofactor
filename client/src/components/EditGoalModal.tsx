import React, { useState } from 'react';
import { X, Lock, Check, AlertCircle, Calendar, Minus, Plus } from 'lucide-react';
import { Goal } from '../types';
import { GoalRatePicker } from './GoalRatePicker';

interface EditGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: Goal | null;
  currentTrendWeight: number;
  currentTdee: number;
  biologicalSex?: string;
  onSave: (data: {
    targetWeightKg?: number | null;
    weeklyRatePercent?: number;
    recalculateProgramNow?: boolean;
  }) => Promise<void>;
  onOpenProgramUpdate?: (pendingRate: number) => void;
}

export const EditGoalModal: React.FC<EditGoalModalProps> = ({
  isOpen,
  onClose,
  goal,
  currentTrendWeight,
  currentTdee,
  biologicalSex = 'male',
  onSave,
  onOpenProgramUpdate,
}) => {
  if (!isOpen || !goal) return null;

  const isMaintenance = goal.goalType === 'maintenance';
  const isLoss = goal.goalType === 'weight_loss' || goal.goalType === 'fat_loss';
  const isGain = goal.goalType === 'weight_gain' || goal.goalType === 'muscle_gain';

  const goalTypeDisplay = isLoss
    ? 'Weight Loss'
    : isGain
    ? 'Weight Gain'
    : 'Maintain Weight';

  const [targetWeight, setTargetWeight] = useState<string>(
    goal.targetWeightKg !== null && goal.targetWeightKg !== undefined
      ? goal.targetWeightKg.toFixed(1)
      : currentTrendWeight.toFixed(1)
  );
  const [ratePercent, setRatePercent] = useState<number>(goal.weeklyRatePercent);
  const [isFloorViolated, setIsFloorViolated] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog state for rate change prompt (Section 4.9 Trigger Branching)
  const [showRateChangePrompt, setShowRateChangePrompt] = useState<boolean>(false);

  const parsedTarget = isMaintenance ? null : parseFloat(targetWeight);
  const rateChanged = !isMaintenance && Math.abs(ratePercent - goal.weeklyRatePercent) > 0.01;

  const adjustTargetWeight = (delta: number) => {
    const currentVal = isNaN(parsedTarget!) ? currentTrendWeight : parsedTarget!;
    const nextVal = Math.round((currentVal + delta) * 10) / 10;
    setTargetWeight(nextVal.toFixed(1));
  };

  // Re-evaluated ETA (Section 4.9)
  const absRate = Math.abs(ratePercent);
  const weeklyRateKg = Number(((absRate / 100.0) * currentTrendWeight).toFixed(2));
  const totalDeltaKg = parsedTarget !== null ? Math.abs(currentTrendWeight - parsedTarget) : 0;
  const etaWeeks = (weeklyRateKg > 0 && !isMaintenance) ? Math.ceil(totalDeltaKg / weeklyRateKg) : null;
  const etaDate = etaWeeks ? new Date(Date.now() + etaWeeks * 7 * 24 * 60 * 60 * 1000) : null;
  const formattedNewEta = etaDate
    ? etaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Ongoing';

  const handlePrimaryClick = async () => {
    setError(null);
    if (!isMaintenance) {
      if (isNaN(parsedTarget!) || parsedTarget! <= 30 || parsedTarget! >= 300) {
        setError('Please provide a valid target weight between 30 kg and 300 kg.');
        return;
      }
      if (isLoss && parsedTarget! >= currentTrendWeight) {
        setError(`Target weight must be below your current trend weight (${currentTrendWeight.toFixed(1)} kg) for a weight loss goal.`);
        return;
      }
      if (isGain && parsedTarget! <= currentTrendWeight) {
        setError(`Target weight must be above your current trend weight (${currentTrendWeight.toFixed(1)} kg) for a weight gain goal.`);
        return;
      }
      if (isFloorViolated) {
        setError('Choose a slower rate of weight loss to stay above the safe physiological floor.');
        return;
      }
    }

    if (rateChanged) {
      // Fire action alert dialog (Section 4.9 Trigger Branching)
      setShowRateChangePrompt(true);
    } else {
      // Target weight only changed -> save in place & dismiss
      try {
        setSaving(true);
        await onSave({
          targetWeightKg: parsedTarget,
          weeklyRatePercent: ratePercent,
          recalculateProgramNow: false,
        });
        onClose();
      } catch (err: any) {
        setError(err?.message || 'Failed to save goal changes');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleApplyNow = async () => {
    setShowRateChangePrompt(false);
    if (onOpenProgramUpdate) {
      // Launch Program Update Module (Screen 10)
      onClose();
      onOpenProgramUpdate(ratePercent);
    } else {
      try {
        setSaving(true);
        await onSave({
          targetWeightKg: parsedTarget,
          weeklyRatePercent: ratePercent,
          recalculateProgramNow: true,
        });
        onClose();
      } catch (err: any) {
        setError(err?.message || 'Failed to update program targets');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleApplyAtNextCheckIn = async () => {
    setShowRateChangePrompt(false);
    try {
      setSaving(true);
      await onSave({
        targetWeightKg: parsedTarget,
        weeklyRatePercent: ratePercent,
        recalculateProgramNow: false,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update goal');
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
            <h2 className="text-base font-bold text-white">Edit Goal</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Modify active goal target weight and weekly velocity in place.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22242B] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Screen 9 Specification) */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Locked Goal Type Indicator (Section 4.9) */}
          <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold">Goal Type</span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                <Lock className="w-3.5 h-3.5 text-[#8E8E93]" />
                <span>{goalTypeDisplay}</span>
              </div>
            </div>
            <p className="text-[11px] text-[#8E8E93] mt-2 leading-relaxed">
              Goal type cannot be changed while editing. To change your goal type, set a new goal.
            </p>
          </div>

          {!isMaintenance ? (
            <>
              {/* Target Weight Input Field with Stepper Controls (Section 4.9) */}
              <div className="bg-[#1C1D22] border border-[#272930] rounded-xl p-4 space-y-2">
                <label className="text-xs uppercase tracking-wider text-gray-400 font-bold block text-center">
                  Target Weight
                </label>

                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => adjustTargetWeight(-0.1)}
                    className="w-10 h-10 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white flex items-center justify-center transition-all active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <div className="flex items-baseline justify-center gap-1.5 w-48">
                    <input
                      type="number"
                      step="0.1"
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      className="w-28 text-center bg-transparent border-b-2 border-white/40 focus:border-[#43AA71] text-3xl font-bold font-mono text-white outline-none tabular-nums"
                    />
                    <span className="text-base text-gray-400 font-medium">kg</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => adjustTargetWeight(0.1)}
                    className="w-10 h-10 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white flex items-center justify-center transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-center text-xs text-gray-400 mt-2 font-mono">
                  Current Trend Weight anchor: <strong className="text-white">{currentTrendWeight.toFixed(1)} kg</strong>
                </div>
              </div>

              {/* GoalRatePicker Slider (Section 4.9) */}
              <GoalRatePicker
                ratePercent={ratePercent}
                onChange={(newRate, violated) => {
                  setRatePercent(newRate);
                  setIsFloorViolated(!!violated);
                }}
                currentTrendWeight={currentTrendWeight}
                currentTdee={currentTdee}
                goalType={goal.goalType}
                biologicalSex={biologicalSex}
              />

              {/* Dynamic Projected ETA Chip (Section 4.9) */}
              <div className="p-3.5 rounded-xl bg-[#18191E] border border-[#24262E] flex items-center justify-between text-xs">
                <span className="text-[#8E8E93] font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#43AA71]" />
                  <span>Estimated Target Date:</span>
                </span>
                <span className="font-bold text-white font-mono tabular-nums">{formattedNewEta}</span>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-xl bg-[#1C1D22] border border-[#272930] text-xs text-gray-300 leading-relaxed space-y-2">
              <h4 className="text-sm font-bold text-white">Maintenance Phase</h4>
              <p>
                Target weight is locked to expenditure. Calorie targets adapt dynamically at each check-in without deficit or surplus.
              </p>
            </div>
          )}
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
            disabled={saving || (!isMaintenance && isFloorViolated)}
            onClick={handlePrimaryClick}
            className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
          >
            {saving ? (
              <span>Saving...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Action Alert Dialog: Update Program Targets? (Section 4.9) */}
      {showRateChangePrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#18191E] border border-[#24262E] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Update Program Targets?</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              You changed your goal rate. Would you like to update your program targets now or wait until your next check-in?
            </p>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleApplyNow}
                className="w-full py-2.5 rounded-xl bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
              >
                Update Program Now
              </button>
              <button
                type="button"
                onClick={handleApplyAtNextCheckIn}
                className="w-full py-2.5 rounded-xl bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-gray-200 hover:text-white text-xs font-semibold transition-all active:scale-95"
              >
                Apply at Next Check-In
              </button>
              <button
                type="button"
                onClick={() => setShowRateChangePrompt(false)}
                className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

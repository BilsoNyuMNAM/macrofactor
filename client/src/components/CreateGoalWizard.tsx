import React, { useState } from 'react';
import {
  X,
  TrendingDown,
  TrendingUp,
  Anchor,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Calendar,
  ShieldAlert,
  Minus,
  Plus
} from 'lucide-react';
import { GoalRatePicker } from './GoalRatePicker';

interface CreateGoalWizardProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrendWeight: number;
  currentTdee: number;
  biologicalSex?: string;
  isHolding?: boolean;
  onCommitGoal: (data: {
    goalType: string;
    targetWeightKg?: number | null;
    weeklyRatePercent: number;
  }) => Promise<void>;
}

export const CreateGoalWizard: React.FC<CreateGoalWizardProps> = ({
  isOpen,
  onClose,
  currentTrendWeight,
  currentTdee,
  biologicalSex = 'male',
  isHolding = false,
  onCommitGoal,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [goalType, setGoalType] = useState<'weight_loss' | 'weight_gain' | 'maintenance'>('weight_loss');
  const [targetWeight, setTargetWeight] = useState<string>(
    (currentTrendWeight - 5.0).toFixed(1)
  );
  const [ratePercent, setRatePercent] = useState<number>(-0.50);
  const [isFloorViolated, setIsFloorViolated] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectGoalType = (type: 'weight_loss' | 'weight_gain' | 'maintenance') => {
    setGoalType(type);
    if (type === 'weight_loss') {
      setTargetWeight((currentTrendWeight - 5.0).toFixed(1));
      setRatePercent(-0.50);
    } else if (type === 'weight_gain') {
      setTargetWeight((currentTrendWeight + 4.0).toFixed(1));
      setRatePercent(0.25);
    } else {
      setTargetWeight(currentTrendWeight.toFixed(1));
      setRatePercent(0);
    }
    setIsFloorViolated(false);
  };

  const isMaintenance = goalType === 'maintenance';
  const parsedTargetWeight = isMaintenance ? currentTrendWeight : parseFloat(targetWeight);

  const adjustTargetWeight = (delta: number) => {
    const currentVal = isNaN(parsedTargetWeight) ? currentTrendWeight : parsedTargetWeight;
    const nextVal = Math.round((currentVal + delta) * 10) / 10;
    setTargetWeight(nextVal.toFixed(1));
  };

  const handleProceedToSummary = () => {
    setError(null);
    if (!isMaintenance) {
      if (isNaN(parsedTargetWeight) || parsedTargetWeight <= 30 || parsedTargetWeight >= 300) {
        setError('Please enter a valid target weight between 30 kg and 300 kg.');
        return;
      }
      if (goalType === 'weight_loss' && parsedTargetWeight >= currentTrendWeight) {
        setError(`Target weight must be below your current weight (${currentTrendWeight.toFixed(1)} kg) for a weight loss goal.`);
        return;
      }
      if (goalType === 'weight_gain' && parsedTargetWeight <= currentTrendWeight) {
        setError(`Target weight must be above your current weight (${currentTrendWeight.toFixed(1)} kg) for a weight gain goal.`);
        return;
      }
      if (isFloorViolated) {
        setError('Choose a slower rate of weight loss to stay above the safe physiological floor.');
        return;
      }
    }
    setStep(3);
  };

  const absRate = Math.abs(ratePercent);
  const weeklyRateKg = Number(((absRate / 100.0) * currentTrendWeight).toFixed(2));
  const totalDeltaKg = Number(Math.abs(currentTrendWeight - parsedTargetWeight).toFixed(2));
  const tissueKcal = goalType === 'weight_gain' ? 8500 : 7700;
  const signedDailyDeficit = isMaintenance
    ? 0
    : (goalType === 'weight_gain'
        ? Math.round((weeklyRateKg * tissueKcal) / 7.0)
        : -Math.round((weeklyRateKg * tissueKcal) / 7.0));
  const projectedTargetCalories = Math.max(800, currentTdee + signedDailyDeficit);

  const etaWeeks = (weeklyRateKg > 0 && !isMaintenance) ? Math.ceil(totalDeltaKg / weeklyRateKg) : null;
  const etaDate = etaWeeks ? new Date(Date.now() + etaWeeks * 7 * 24 * 60 * 60 * 1000) : null;
  const formattedEtaDate = etaDate
    ? etaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const handleCommit = async () => {
    try {
      setSaving(true);
      setError(null);
      await onCommitGoal({
        goalType,
        targetWeightKg: isMaintenance ? null : parsedTargetWeight,
        weeklyRatePercent: isMaintenance ? 0 : ratePercent,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to activate new goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#16171B] border border-[#272930] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Wizard Header & Stepper */}
        <div className="p-5 border-b border-[#272930] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#23242A] text-gray-300 border border-[#2E3038]">
                Step {step} of 3
              </span>
              <h2 className="text-base font-bold text-white">
                {step === 1 && 'Select Your Goal'}
                {step === 2 && 'Target Weight & Rate'}
                {step === 3 && 'Goal Summary'}
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 1 && 'What is your primary body composition objective?'}
              {step === 2 && 'Set your target weight and desired rate of change.'}
              {step === 3 && 'Review your goal parameters before starting.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22242B] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="w-full bg-[#1F2026] h-1">
          <div
            className="bg-[#43AA71] h-full transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Wizard Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {isHolding && (
            <div className="p-3.5 rounded-xl bg-[#1C1D22] border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5 shadow-sm">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-amber-300 block">Holding Safeguard Active</span>
                <p className="text-gray-300 leading-relaxed">
                  Expenditure is currently held steady at <strong className="text-white">{currentTdee} kcal</strong> until recent logging resumes.
                </p>
              </div>
            </div>
          )}

          {/* STEP 1: Select Your Goal (Section 4.8.1) */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 gap-3">
                {/* Option 1: Lose Weight (Cut) */}
                <div
                  onClick={() => handleSelectGoalType('weight_loss')}
                  className={`p-4 rounded-xl border cursor-pointer text-left flex items-start gap-3.5 transition-all ${
                    goalType === 'weight_loss'
                      ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                      : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-white shrink-0">
                    <TrendingDown className="w-5 h-5 text-[#43AA71]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">Lose Weight</h4>
                      {goalType === 'weight_loss' && (
                        <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Drop body weight and fat mass at your preferred rate.
                    </p>
                  </div>
                </div>

                {/* Option 2: Maintain Weight (Maintenance) */}
                <div
                  onClick={() => handleSelectGoalType('maintenance')}
                  className={`p-4 rounded-xl border cursor-pointer text-left flex items-start gap-3.5 transition-all ${
                    goalType === 'maintenance'
                      ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                      : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-white shrink-0">
                    <Anchor className="w-5 h-5 text-gray-300" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">Maintain Weight</h4>
                      {goalType === 'maintenance' && (
                        <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Keep your current weight stable while optimizing energy and fueling performance.
                    </p>
                  </div>
                </div>

                {/* Option 3: Gain Weight (Bulk) */}
                <div
                  onClick={() => handleSelectGoalType('weight_gain')}
                  className={`p-4 rounded-xl border cursor-pointer text-left flex items-start gap-3.5 transition-all ${
                    goalType === 'weight_gain'
                      ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                      : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-white shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white">Gain Weight</h4>
                      {goalType === 'weight_gain' && (
                        <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Build muscle mass with a controlled caloric surplus to minimize fat gain.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-3.5 flex items-center justify-between text-xs">
                <span className="text-gray-400">Starting Trend Weight Anchor:</span>
                <span className="font-bold text-white font-mono tabular-nums">{currentTrendWeight.toFixed(1)} kg</span>
              </div>
            </div>
          )}

          {/* STEP 2: Target Weight & Goal Rate (Section 4.8.2) */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Current Trend Weight Anchor Pill */}
              <div className="p-3 rounded-xl bg-[#18191E] border border-[#24262E] flex items-center justify-between text-xs">
                <span className="text-[#8E8E93] font-medium">Current Trend Weight Anchor:</span>
                <span className="font-mono font-bold text-white tabular-nums">{currentTrendWeight.toFixed(1)} kg</span>
              </div>

              {!isMaintenance ? (
                <>
                  {/* Target Weight Numeric Input with Stepper */}
                  <div className="space-y-2 bg-[#1C1D22] border border-[#272930] rounded-xl p-4">
                    <label className="text-xs uppercase tracking-wider text-gray-400 font-bold block text-center">
                      Target Scale Weight
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
                      Delta:{' '}
                      <strong className="text-white">
                        {goalType === 'weight_loss' ? '−' : '+'}
                        {totalDeltaKg} kg
                      </strong>{' '}
                      from baseline
                    </div>
                  </div>

                  {/* GoalRatePicker Slider */}
                  <GoalRatePicker
                    ratePercent={ratePercent}
                    onChange={(newRate, violated) => {
                      setRatePercent(newRate);
                      setIsFloorViolated(!!violated);
                    }}
                    currentTrendWeight={currentTrendWeight}
                    currentTdee={currentTdee}
                    goalType={goalType}
                    biologicalSex={biologicalSex}
                  />
                </>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-[#1C1D22] border border-[#272930] text-xs text-gray-300">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <Anchor className="w-4 h-4 text-[#43AA71]" />
                    <span>Weight Maintenance Selected</span>
                  </div>
                  <p>
                    Target weight is pinned to your current Trend Weight of <strong className="text-white">{currentTrendWeight.toFixed(1)} kg</strong>.
                  </p>
                  <p className="text-gray-400 leading-relaxed">
                    No calorie deficit or surplus is applied. Daily calorie targets will match your calculated expenditure of <strong className="text-white">{Math.round(currentTdee)} kcal/day</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Goal Summary & Handoff (Section 4.8.3) */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-5 space-y-4 shadow-sm">
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold block">
                  Goal Parameters Review
                </span>

                {/* 4 Summary Metric Tiles */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#8E8E93] block">Starting Trend Weight</span>
                    <strong className="text-base font-bold font-mono text-white mt-0.5 block tabular-nums">
                      {currentTrendWeight.toFixed(1)} kg
                    </strong>
                  </div>

                  <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#8E8E93] block">Target Weight</span>
                    <strong className="text-base font-bold font-mono text-white mt-0.5 block tabular-nums">
                      {isMaintenance ? 'Holding Stable' : `${parsedTargetWeight.toFixed(1)} kg`}
                    </strong>
                    {!isMaintenance && (
                      <span className="text-[10px] text-gray-400">({totalDeltaKg} kg delta)</span>
                    )}
                  </div>

                  <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#8E8E93] block">Weekly Rate</span>
                    <strong className="text-base font-bold font-mono text-white mt-0.5 block tabular-nums">
                      {isMaintenance ? '0.00 kg/wk' : `${Math.abs(ratePercent).toFixed(2)}% BW/wk`}
                    </strong>
                    {!isMaintenance && (
                      <span className="text-[10px] text-[#43AA71]">({weeklyRateKg.toFixed(2)} kg/wk)</span>
                    )}
                  </div>

                  <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-[#8E8E93] block">Projected Target Date</span>
                    <strong className="text-base font-bold font-mono text-white mt-0.5 block flex items-center gap-1.5 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-[#43AA71]" />
                      <span>{isMaintenance ? 'Ongoing' : (formattedEtaDate || 'N/A')}</span>
                    </strong>
                    {!isMaintenance && etaWeeks && (
                      <span className="text-[10px] text-gray-400">~{etaWeeks} weeks remaining</span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#24262E] flex items-center justify-between">
                  <span className="text-xs text-[#8E8E93]">Estimated Daily Baseline:</span>
                  <span className="text-xl font-black font-mono text-white tabular-nums">
                    {projectedTargetCalories.toLocaleString()} <span className="text-xs font-normal text-gray-400">kcal/day</span>
                  </span>
                </div>
              </div>

              {/* Active Goal Retirement Warning (Section 4.8.3) */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-relaxed">
                <strong className="text-amber-200 block mb-0.5">Mandatory Program Rebuild:</strong>
                Confirming this goal will complete/archive your existing goal and require creating a new nutrition program.
              </div>

              {/* Ethical Dieting Note (Section 4.8.3) */}
              <p className="text-[11px] text-[#8E8E93] text-center italic">
                A reminder to diet responsibly, and a note about respecting your privacy.
              </p>
            </div>
          )}
        </div>

        {/* Stepper Navigation Footer */}
        <div className="p-4 border-t border-[#272930] bg-[#16171B] flex items-center justify-between">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((s) => (s - 1) as any) : onClose())}
            className="px-4 py-2 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#23242A] text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{step === 1 ? 'Cancel' : 'Back'}</span>
          </button>

          {step < 3 ? (
            <button
              type="button"
              disabled={step === 2 && isFloorViolated}
              onClick={() => (step === 1 ? setStep(2) : handleProceedToSummary())}
              className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] disabled:opacity-40 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={handleCommit}
              className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
            >
              {saving ? (
                <span>Starting Goal...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Start Goal</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

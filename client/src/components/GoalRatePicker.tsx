import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';

interface GoalRatePickerProps {
  ratePercent: number; // e.g. -0.50 for -0.5% BW/wk
  onChange: (newRate: number, isFloorViolated?: boolean) => void;
  currentTrendWeight: number;
  currentTdee: number;
  goalType: 'weight_loss' | 'weight_gain' | 'maintenance' | string;
  biologicalSex?: string;
  disabled?: boolean;
}

export const GoalRatePicker: React.FC<GoalRatePickerProps> = ({
  ratePercent,
  onChange,
  currentTrendWeight,
  currentTdee,
  goalType,
  biologicalSex = 'male',
  disabled = false,
}) => {
  const isLoss = goalType === 'weight_loss' || goalType === 'fat_loss';
  const isGain = goalType === 'weight_gain' || goalType === 'muscle_gain';

  const absRate = Math.abs(ratePercent);
  const weeklyRateKg = Number(((absRate / 100.0) * currentTrendWeight).toFixed(2));

  // Tissue density: 7700 kcal/kg loss, 8500 kcal/kg gain
  const tissueKcal = isGain ? 8500 : 7700;
  const signedDailyDeficit = isGain
    ? Math.round((weeklyRateKg * tissueKcal) / 7.0)
    : -Math.round((weeklyRateKg * tissueKcal) / 7.0);

  const projectedCalories = Math.max(500, currentTdee + signedDailyDeficit);

  // Calorie floors (Section 2.3)
  const isFemale = biologicalSex.toLowerCase() === 'female';
  const standardFloor = isFemale ? 1200 : 1500;
  const lowFloor = isFemale ? 1000 : 1200;

  let floorWarning: 'none' | 'standard_floor' | 'low_floor' = 'none';
  if (isLoss) {
    if (projectedCalories < lowFloor) floorWarning = 'low_floor';
    else if (projectedCalories < standardFloor) floorWarning = 'standard_floor';
  }

  // Classification zones (Section 4.8.2)
  let bandLabel = 'Moderate';
  let bandColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  if (absRate <= 0.40) {
    bandLabel = 'Slow / Sustainable';
    bandColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  } else if (absRate <= 0.80) {
    bandLabel = 'Moderate / Balanced';
    bandColor = 'text-[#43AA71] bg-[#15271E] border-[#1E432E]';
  } else {
    bandLabel = 'Fast / Aggressive';
    bandColor = 'text-[#F5BC43] bg-amber-500/10 border-amber-500/20';
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const nextSignedRate = isGain ? val : -val;
    const nextWeeklyRateKg = (val / 100.0) * currentTrendWeight;
    const nextDeficit = isGain ? Math.round((nextWeeklyRateKg * 8500) / 7) : -Math.round((nextWeeklyRateKg * 7700) / 7);
    const nextCalories = currentTdee + nextDeficit;
    const nextFloorViolated = isLoss && nextCalories < lowFloor;
    onChange(nextSignedRate, nextFloorViolated);
  };

  return (
    <div className="space-y-4 bg-[#1C1D22] border border-[#272930] rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">
            Desired Rate of {isGain ? 'Weight Gain' : 'Weight Loss'}
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-black font-mono text-white tabular-nums">
              {isLoss ? '−' : '+'}{absRate.toFixed(2)}%
            </span>
            <span className="text-xs text-gray-400 font-medium">BW / week</span>
            <span className="text-xs text-[#43AA71] font-mono font-semibold ml-1">
              ({isLoss ? '−' : '+'}{weeklyRateKg.toFixed(2)} kg/wk)
            </span>
          </div>
        </div>

        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border uppercase tracking-wide ${bandColor}`}>
          {bandLabel}
        </span>
      </div>

      {/* Continuous Slider with Color Accent */}
      <div className="space-y-1.5 pt-1">
        <input
          type="range"
          min="0.10"
          max="1.50"
          step="0.05"
          value={absRate}
          disabled={disabled}
          onChange={handleSliderChange}
          className={`w-full h-2 rounded-lg appearance-none cursor-pointer border border-[#272930] ${
            floorWarning === 'low_floor'
              ? 'accent-[#FF453A] bg-rose-950/40'
              : floorWarning === 'standard_floor'
              ? 'accent-[#F5BC43] bg-amber-950/30'
              : 'accent-[#43AA71] bg-[#121316]'
          }`}
        />
        <div className="flex justify-between text-[10px] text-gray-500 font-mono">
          <span>0.10% (Slow)</span>
          <span>0.60% (Moderate)</span>
          <span>1.50% (Fast)</span>
        </div>
      </div>

      {/* Real-time Program Projections */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="bg-[#16171B] border border-[#272930] rounded-lg p-2.5">
          <span className="text-[10px] text-gray-400 uppercase font-medium">Daily Target</span>
          <div className="text-base font-black font-mono text-white mt-0.5 tabular-nums">
            {projectedCalories.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">kcal</span>
          </div>
        </div>

        <div className="bg-[#16171B] border border-[#272930] rounded-lg p-2.5">
          <span className="text-[10px] text-gray-400 uppercase font-medium">Daily {isGain ? 'Surplus' : 'Deficit'}</span>
          <div className={`text-base font-black font-mono mt-0.5 tabular-nums ${isGain ? 'text-emerald-400' : 'text-blue-400'}`}>
            {signedDailyDeficit > 0 ? `+${signedDailyDeficit}` : signedDailyDeficit}{' '}
            <span className="text-[10px] font-normal text-gray-400">kcal</span>
          </div>
        </div>
      </div>

      {/* Standard Floor Caution Banner (Section 2.3) */}
      {floorWarning === 'standard_floor' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs leading-snug">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Calorie Floor Notice:</strong> This rate approaches the standard safe floor ({standardFloor} kcal/day). Slower velocities are recommended for satiety and training energy.
          </span>
        </div>
      )}

      {/* Low Redline Floor Alert (Section 2.3 & 4.8.2) */}
      {floorWarning === 'low_floor' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs leading-snug">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
          <div>
            <strong className="block mb-0.5 text-rose-200">Rate Limit Exceeded:</strong>
            <span>Choose a slower rate of weight loss to maintain safe energy availability (minimum safe floor: {lowFloor} kcal/day). Confirmation is blocked until velocity is reduced.</span>
          </div>
        </div>
      )}
    </div>
  );
};

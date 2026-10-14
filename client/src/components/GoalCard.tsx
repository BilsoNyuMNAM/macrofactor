import React from 'react';
import { Target, Plus, Pencil, CheckCircle2, History, Sparkles } from 'lucide-react';
import { Goal } from '../types';
import { triggerGoalCelebration } from '../utils/confetti';

interface GoalCardProps {
  goal: Goal | null;
  currentTrendWeight: number;
  currentTdee?: number;
  onOpenEditModal: () => void;
  onOpenCreateModal: () => void;
  onOpenHistoryModal: () => void;
  onTransitionToMaintenance?: () => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  currentTrendWeight,
  currentTdee: _currentTdee,
  onOpenEditModal,
  onOpenCreateModal,
  onOpenHistoryModal,
  onTransitionToMaintenance,
}) => {
  if (!goal) {
    return (
      <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-[#23242A] border border-[#2E3038] flex items-center justify-center text-gray-400 mx-auto">
          <Target className="w-6 h-6 text-[#43AA71]" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">No Active Goal Set</h3>
          <p className="text-xs text-[#8E8E93] mt-1 max-w-sm mx-auto">
            Set a weight loss, weight gain, or maintenance goal to get personalized caloric coaching targets.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2.5 pt-2">
          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-gray-300" />
            <span>Set New Goal</span>
          </button>
          <button
            onClick={onOpenHistoryModal}
            className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
          >
            <History className="w-3.5 h-3.5 text-gray-300" />
            <span>View History</span>
          </button>
        </div>
      </div>
    );
  }

  const isLoss = goal.goalType === 'weight_loss' || goal.goalType === 'fat_loss';
  const isGain = goal.goalType === 'weight_gain' || goal.goalType === 'muscle_gain';
  const isMaintenance = goal.goalType === 'maintenance';

  const goalTypeLabel = isLoss ? 'Weight Loss' : isGain ? 'Weight Gain' : 'Weight Maintenance';

  const targetWeight = goal.targetWeightKg;

  const isGoalReached = Boolean(
    goal.isGoalReached ||
    (targetWeight !== null && targetWeight !== undefined && (
      (isLoss && currentTrendWeight <= targetWeight) ||
      (isGain && currentTrendWeight >= targetWeight)
    ))
  );

  const weeklyRateKg = Math.abs(goal.metrics?.weeklyRateKg ?? goal.weeklyRateKg ?? 0.39);
  const weeklyRatePercent = Math.abs(goal.metrics?.weeklyRatePercent ?? goal.weeklyRatePercent ?? 0.50);
  const rateSign = isLoss ? '−' : isGain ? '+' : '';

  const formatGoalDateRange = (startDateStr?: string, endDateStr?: string | null) => {
    try {
      const start = startDateStr ? new Date(startDateStr) : new Date();
      const startStr = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      if (endDateStr) {
        const end = new Date(endDateStr);
        const endStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return `${startStr} – ${endStr}`;
      }
      return `${startStr} – Now`;
    } catch {
      return '13 Oct – Now';
    }
  };

  return (
    <div className="space-y-4">
      {/* Celebration Banner if Goal is Reached */}
      {isGoalReached && (
        <div className="bg-[#14231B] border border-[#1E432E] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1E432E] text-[#43AA71] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Target Weight Reached!</h4>
              <p className="text-xs text-emerald-300/80 mt-0.5">
                Congratulations! Current trend weight has achieved your target of {targetWeight} kg.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => triggerGoalCelebration()}
              className="px-3.5 py-1.5 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#43AA71]" />
              <span>Celebrate 🎉</span>
            </button>
            <button
              onClick={onTransitionToMaintenance || onOpenCreateModal}
              className="px-4 py-1.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95"
            >
              Maintain Weight
            </button>
          </div>
        </div>
      )}

      {/* Goal Card (Matching Image 3 Simple UI Specification) */}
      <section className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 shadow-sm space-y-6">
        {/* Header: Title + Date Range Subtitle */}
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">{goalTypeLabel} Goal</h3>
          <div className="text-xs text-[#8E8E93] font-medium mt-1">
            {formatGoalDateRange(goal.startDate, goal.endDate)}
          </div>
        </div>

        {/* 3 Metric Columns: Goal Weight, Goal Rate (kg), Goal Rate (%) */}
        <div className="flex items-start justify-between pt-1">
          {/* Column 1: Goal Weight */}
          <div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
              {targetWeight !== null && targetWeight !== undefined ? (
                <>
                  {targetWeight.toFixed(1)}
                  <span className="text-sm font-normal text-white ml-1">kg</span>
                </>
              ) : (
                <>
                  {currentTrendWeight.toFixed(1)}
                  <span className="text-sm font-normal text-white ml-1">kg</span>
                </>
              )}
            </div>
            <div className="text-xs text-[#8E8E93] font-medium mt-1">Goal Weight</div>
          </div>

          {/* Column 2: Goal Rate (kg) */}
          <div className="text-center sm:text-left">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
              {isMaintenance ? (
                '0.00'
              ) : (
                `${rateSign}${weeklyRateKg.toFixed(2)}`
              )}
              <span className="text-sm font-normal text-white ml-1">kg</span>
            </div>
            <div className="text-xs text-[#8E8E93] font-medium mt-1">Goal Rate</div>
          </div>

          {/* Column 3: Goal Rate (%) */}
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
              {isMaintenance ? (
                '0.0'
              ) : (
                `${rateSign}${weeklyRatePercent.toFixed(1)}`
              )}
              <span className="text-sm font-normal text-white ml-0.5">%</span>
            </div>
            <div className="text-xs text-[#8E8E93] font-medium mt-1">Goal Rate</div>
          </div>
        </div>

        {/* Action Buttons: New Goal & Edit Goal */}
        <div className="flex items-center gap-2.5 pt-2">
          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-gray-300" />
            <span>New Goal</span>
          </button>
          <button
            onClick={onOpenEditModal}
            className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-300" />
            <span>Edit Goal</span>
          </button>
        </div>
      </section>
    </div>
  );
};

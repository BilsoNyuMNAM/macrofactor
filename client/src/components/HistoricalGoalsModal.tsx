import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  TrendingDown,
  TrendingUp,
  Anchor,
  CheckCircle2,
  Calendar,
  Award,
  Clock,
  Filter,
  Trash2,
  AlertTriangle,
  Sparkles,
  Plus
} from 'lucide-react';
import { api } from '../api';
import { Goal } from '../types';
import { getIsDemoUser } from '../utils/userContext';

interface HistoricalGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrendWeight?: number;
  onDeleteGoal?: (goalId: number) => Promise<void>;
  onOpenNewProgramModal?: () => void;
  onOpenCreateGoalModal?: () => void;
  activeGoal?: Goal | null;
  userEmail?: string;
}

export const HistoricalGoalsModal: React.FC<HistoricalGoalsModalProps> = ({
  isOpen,
  onClose,
  currentTrendWeight,
  onDeleteGoal,
  onOpenNewProgramModal,
  onOpenCreateGoalModal,
  activeGoal,
  userEmail,
}) => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'retired' | 'active'>('all');

  // Deletion dialog states (Section 4.11 & 7)
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showSoleGoalAlert, setShowSoleGoalAlert] = useState<boolean>(false);
  const [showReopenedRebuildAlert, setShowReopenedRebuildAlert] = useState<boolean>(false);

  const reloadGoals = async () => {
    try {
      setLoading(true);
      const email = userEmail || localStorage.getItem('mf_user_email');
      if (email && !getIsDemoUser(email)) {
        setGoals(activeGoal ? [activeGoal] : []);
        return;
      }
      const data = await api.getGoals();
      setGoals(data.goals || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load historical goals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setGoalToDelete(null);
      setShowSoleGoalAlert(false);
      setShowReopenedRebuildAlert(false);
      return;
    }

    let isMounted = true;
    const fetchGoals = async () => {
      try {
        setLoading(true);
        setError(null);
        const email = userEmail || localStorage.getItem('mf_user_email');
        if (email && !getIsDemoUser(email)) {
          if (isMounted) {
            setGoals(activeGoal ? [activeGoal] : []);
          }
          return;
        }
        const data = await api.getGoals();
        if (isMounted) {
          setGoals(data.goals || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to load historical goals');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchGoals();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeGoal, userEmail]);

  if (!isOpen) return null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Present';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const calculateDuration = (startStr: string, endStr?: string | null) => {
    try {
      const start = new Date(startStr);
      const end = endStr ? new Date(endStr) : new Date();
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      const weeks = Math.floor(diffDays / 7);
      const remainingDays = diffDays % 7;

      if (weeks === 0) return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
      if (remainingDays === 0) return `${weeks} wk${weeks === 1 ? '' : 's'}`;
      return `${weeks} wk${weeks === 1 ? '' : 's'} ${remainingDays} d`;
    } catch {
      return 'N/A';
    }
  };

  const filteredGoals = goals.filter((g) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return g.status === 'active';
    if (activeTab === 'completed') return g.status === 'completed';
    if (activeTab === 'retired') return g.status === 'abandoned' || g.status === 'paused';
    return true;
  });

  const completedCount = goals.filter((g) => g.status === 'completed').length;
  const retiredCount = goals.filter((g) => g.status === 'abandoned' || g.status === 'paused').length;
  const activeCount = goals.filter((g) => g.status === 'active').length;

  // Handle click on delete trash icon
  const handleInitiateDelete = (goal: Goal) => {
    if (goal.status === 'active') {
      // Check if there is a previous goal (Section 7.3 Edge Case)
      const nonActiveGoals = goals.filter((g) => g.goalId !== goal.goalId && !g.hidden);
      if (nonActiveGoals.length === 0) {
        setShowSoleGoalAlert(true);
        return;
      }
    }
    setGoalToDelete(goal);
  };

  const handleConfirmDelete = async () => {
    if (!goalToDelete) return;
    const isTargetActive = goalToDelete.status === 'active';
    try {
      setIsDeleting(true);
      if (onDeleteGoal) {
        await onDeleteGoal(goalToDelete.goalId);
      } else {
        await api.deleteGoal(goalToDelete.goalId);
      }
      setGoalToDelete(null);
      await reloadGoals();

      if (isTargetActive) {
        // Fire Mandatory Rebuild Dialog (Section 4.11 & Section 7.2)
        setShowReopenedRebuildAlert(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete goal');
      setGoalToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#16171B] border border-[#272930] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#272930] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1C1D22] border border-[#2D2F38] flex items-center justify-center text-[#43AA71]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Goal History</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#1C1D22] text-gray-300 border border-[#2D2F38]">
                  {goals.length} Total
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Audit trail of active, completed, and archived body composition goals.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22242B] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="px-5 py-3 border-b border-[#272930] bg-[#121316] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#1F2026] text-white border border-[#2D2F38]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All ({goals.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'bg-emerald-500/15 text-[#43AA71] border border-emerald-500/30'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Completed ({completedCount})
            </button>
            <button
              onClick={() => setActiveTab('retired')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'retired'
                  ? 'bg-[#1F2026] text-gray-200 border border-[#2D2F38]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Archived ({retiredCount})
            </button>
            {activeCount > 0 && (
              <button
                onClick={() => setActiveTab('active')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === 'active'
                    ? 'bg-emerald-500/15 text-[#43AA71] border border-emerald-500/30'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Active ({activeCount})
              </button>
            )}
          </div>

          <div className="text-[11px] text-gray-500 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3" />
            <span>Sorted by newest</span>
          </div>
        </div>

        {/* Goal List */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-7 h-7 border-2 border-[#43AA71] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400 font-mono">Loading goals...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center">
              {error}
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <Clock className="w-8 h-8 text-gray-600" />
              <p className="text-sm font-semibold text-gray-300">No goals found</p>
              <p className="text-xs text-gray-500 max-w-xs">
                {activeTab === 'all'
                  ? 'No goals have been recorded yet.'
                  : `No goals matching the "${activeTab}" filter.`}
              </p>
            </div>
          ) : (
            filteredGoals.map((g) => {
              const isLoss = g.goalType === 'weight_loss' || g.goalType === 'fat_loss';
              const isGain = g.goalType === 'weight_gain' || g.goalType === 'muscle_gain';
              const isMaintenance = g.goalType === 'maintenance';

              const startTrend = g.initialTrendWeightKg ?? g.startWeightKg;
              const finalTrend =
                g.finalTrendWeightKg ??
                (g.status === 'active' && currentTrendWeight ? currentTrendWeight : g.targetWeightKg);
              const totalDelta = finalTrend !== null && finalTrend !== undefined ? finalTrend - startTrend : 0;
              const durationStr = calculateDuration(g.startDate, g.endDate);

              const isActive = g.status === 'active';
              const isCompleted = g.status === 'completed';

              return (
                <div
                  key={g.goalId}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-[#1C1D22] border-[#43AA71]/40 shadow-sm'
                      : 'bg-[#16171B] border-[#272930] hover:border-[#383a45]'
                  }`}
                >
                  {/* Top Row: Type, Status, & Dates */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#22242B] border border-[#2D2F38] flex items-center justify-center shrink-0">
                        {isLoss && <TrendingDown className="w-4 h-4 text-[#43AA71]" />}
                        {isGain && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                        {isMaintenance && <Anchor className="w-4 h-4 text-gray-300" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white capitalize">
                            {g.goalType.replace('_', ' ')}
                          </h3>
                          {isActive ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#15271E] text-[#43AA71] border border-[#1E432E]">
                              In Progress
                            </span>
                          ) : isCompleted ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/20 text-[#43AA71] border border-emerald-500/30 flex items-center gap-1">
                              <Award className="w-2.5 h-2.5" />
                              Completed
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-gray-500/15 text-gray-400 border border-gray-500/30">
                              Archived
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right text-[11px] text-gray-400">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Calendar className="w-3 h-3 text-gray-500" />
                          <span>
                            {formatDate(g.startDate)} &rarr; {formatDate(g.endDate)}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">
                          Duration: {durationStr}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInitiateDelete(g);
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-[#22242B] transition-colors"
                        title={isActive ? 'Delete goal & reopen previous' : 'Delete past goal'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#121316] border border-[#22242B] rounded-lg p-2.5 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Start Trend</span>
                      <span className="font-mono font-semibold text-white">
                        {startTrend.toFixed(1)} kg
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">
                        {isActive ? 'Target Weight' : 'Final Trend'}
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {finalTrend !== null && finalTrend !== undefined ? `${finalTrend.toFixed(1)} kg` : 'N/A'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Net Change</span>
                      <span
                        className={`font-mono font-bold ${
                          totalDelta < 0
                            ? 'text-[#43AA71]'
                            : totalDelta > 0
                            ? 'text-emerald-400'
                            : 'text-gray-300'
                        }`}
                      >
                        {totalDelta > 0 ? `+${totalDelta.toFixed(2)}` : totalDelta.toFixed(2)} kg
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Target Velocity</span>
                      <span className="font-mono text-gray-300">
                        {isMaintenance
                          ? '0.00 kg/wk'
                          : `${Math.abs(g.weeklyRatePercent).toFixed(2)}% (${Math.abs(g.weeklyRateKg).toFixed(2)} kg/wk)`}
                      </span>
                    </div>
                  </div>

                  {g.scaleReached && (
                    <div className="mt-2 text-[10px] text-[#43AA71] flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Scale weight touched target during this episode</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#272930] bg-[#16171B] flex items-center justify-between text-xs text-gray-400">
          <span>
            Showing <strong className="text-white">{filteredGoals.length}</strong> goal records
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#1F2026] hover:bg-[#272930] text-gray-200 font-semibold transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </div>

      {/* DELETION DIALOG A & B (Section 4.11 & Section 7) */}
      {goalToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#18191E] border border-[#24262E] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-[#FF453A] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">
                  {goalToDelete.status === 'active' ? 'Delete Active Goal?' : 'Delete Past Goal?'}
                </h4>
                <span className="text-[11px] text-gray-400">This action cannot be undone.</span>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              {goalToDelete.status === 'active'
                ? 'This will delete your active goal and reopen the goal you were pursuing previously. This action cannot be undone. Would you like to continue?'
                : 'This action will permanently delete this goal and remove it from your history. Would you like to continue?'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setGoalToDelete(null)}
                className="px-4 py-2 rounded-full border border-[#2E3038] bg-[#23242A] hover:bg-[#2C2E35] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-full bg-[#FF453A] hover:bg-rose-600 text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-rose-950/30"
              >
                {isDeleting
                  ? 'Deleting...'
                  : goalToDelete.status === 'active'
                  ? 'Delete Goal & Reopen Previous'
                  : 'Delete Past Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDGE CASE: SOLE REMAINING GOAL ALERT (Section 7.3) */}
      {showSoleGoalAlert && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#18191E] border border-[#24262E] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-[#F5BC43] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Cannot Delete Active Goal</h4>
                <span className="text-[11px] text-gray-400">No prior goal exists in history</span>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              MacroFactor requires at least one active goal context to calculate your calorie targets and nutritional prescription. To change your direction, please set a new goal instead.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSoleGoalAlert(false)}
                className="px-4 py-2 rounded-full border border-[#2E3038] bg-[#23242A] hover:bg-[#2C2E35] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSoleGoalAlert(false);
                  onClose();
                  if (onOpenCreateGoalModal) {
                    onOpenCreateGoalModal();
                  }
                }}
                className="px-5 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Set New Goal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REOPENED GOAL MANDATORY REBUILD DIALOG (Section 4.11 & Section 7.2) */}
      {showReopenedRebuildAlert && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#18191E] border border-[#24262E] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#15271E] border border-[#1E432E] text-[#43AA71] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Goal Reopened</h4>
                <span className="text-[11px] text-[#43AA71] font-semibold">Previous goal restored</span>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              To continue with your reopened goal, you will need to update your macro targets by creating a new program.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowReopenedRebuildAlert(false);
                  onClose();
                  if (onOpenNewProgramModal) {
                    onOpenNewProgramModal();
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 uppercase tracking-wider"
              >
                Create New Program
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

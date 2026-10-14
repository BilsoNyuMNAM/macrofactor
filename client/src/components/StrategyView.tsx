import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Calendar,
  RotateCcw,
  Hourglass,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Lock,
  User,
  ChevronRight,
  Sliders,
  Pencil
} from 'lucide-react';
import { StrategyResponse, Goal } from '../types';
import { GoalCard } from './GoalCard';
import { triggerGoalCelebration } from '../utils/confetti';
import { api } from '../api';

interface StrategyViewProps {
  data: StrategyResponse;
  onOpenCheckInModal: () => void;
  onOpenChangeDayModal: () => void;
  onToggleFastCheckIn: () => void;
  onOpenOnboardingModal: () => void;
  onOpenEditGoalModal: () => void;
  onOpenCreateGoalModal: () => void;
  onOpenNewProgramModal: () => void;
  onOpenChangeProgramModal: () => void;
  onOpenHistoryModal: () => void;
  onTransitionToMaintenance?: () => void;
}

export const StrategyView: React.FC<StrategyViewProps> = ({
  data,
  onOpenCheckInModal,
  onOpenChangeDayModal,
  onToggleFastCheckIn,
  onOpenOnboardingModal,
  onOpenEditGoalModal,
  onOpenCreateGoalModal,
  onOpenNewProgramModal,
  onOpenChangeProgramModal,
  onOpenHistoryModal,
  onTransitionToMaintenance,
}) => {
  const { schedule, compliance, activePlan, goal, currentTrendWeight, currentTdee } = data;
  const [activeTab, setActiveTab] = useState<'goal' | 'checkin'>('goal');
  const [historicalGoals, setHistoricalGoals] = useState<Goal[]>([]);

  // Load historical goals from API
  useEffect(() => {
    let isMounted = true;
    api.getGoals()
      .then((res) => {
        if (isMounted && res.goals) {
          setHistoricalGoals(res.goals);
        }
      })
      .catch(() => { });
    return () => {
      isMounted = false;
    };
  }, [goal]);

  // Goal Reached Detection (Section 2.2)
  const isLoss = goal?.goalType === 'weight_loss' || goal?.goalType === 'fat_loss';
  const isGain = goal?.goalType === 'weight_gain' || goal?.goalType === 'muscle_gain';
  const isMaintenance = goal?.goalType === 'maintenance';
  const targetWeight = goal?.targetWeightKg;
  const isGoalReached = Boolean(
    goal?.isGoalReached ||
    (targetWeight !== null && targetWeight !== undefined && (
      (isLoss && currentTrendWeight <= targetWeight) ||
      (isGain && currentTrendWeight >= targetWeight)
    ))
  );

  // Trigger celebration confetti on goal reached
  const hasCelebratedRef = useRef(false);
  useEffect(() => {
    if (isGoalReached && !hasCelebratedRef.current) {
      hasCelebratedRef.current = true;
      const timer = setTimeout(() => {
        triggerGoalCelebration();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isGoalReached]);

  // Dial Geometry & Concentric Track Lane (Section 4.1)
  const radius = 79;
  const trackInnerR = 72;
  const trackOuterR = 86;

  // Green accent radial tick positioned at 8°
  const tickAngleDeg = 8;
  const tickAngleRad = (tickAngleDeg * Math.PI) / 180;
  const tickX1 = 100 + trackInnerR * Math.cos(tickAngleRad);
  const tickY1 = 100 + trackInnerR * Math.sin(tickAngleRad);
  const tickX2 = 100 + trackOuterR * Math.cos(tickAngleRad);
  const tickY2 = 100 + trackOuterR * Math.sin(tickAngleRad);

  const daysRemaining = Math.max(0, Math.min(7, schedule.diffDays));
  const remainingFraction = isGoalReached || schedule.state === 'ready'
    ? 0.0
    : daysRemaining / 7.0;

  const gapDeg = 6;
  const endAngleDeg = tickAngleDeg + gapDeg;
  const arcSpanDeg = isGoalReached || schedule.state === 'ready'
    ? 0
    : Math.min(340, Math.max(25, remainingFraction * 360));
  const startAngleDeg = endAngleDeg + arcSpanDeg;

  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  const arcX1 = 100 + radius * Math.cos(startRad);
  const arcY1 = 100 + radius * Math.sin(startRad);
  const arcX2 = 100 + radius * Math.cos(endRad);
  const arcY2 = 100 + radius * Math.sin(endRad);

  const largeArcFlag = arcSpanDeg > 180 ? 1 : 0;
  const arcPath = arcSpanDeg > 0
    ? `M ${arcX1} ${arcY1} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${arcX2} ${arcY2}`
    : '';

  // Format goal history date range: e.g. "13 Oct 2026 – Now"
  const formatHistoryDate = (startDateStr?: string, endDateStr?: string | null) => {
    try {
      const start = startDateStr ? new Date(startDateStr) : new Date();
      const startStr = start.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      if (endDateStr) {
        const end = new Date(endDateStr);
        const endStr = end.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
        return `${startStr} – ${endStr}`;
      }
      return `${startStr} – Now`;
    } catch {
      return '13 Oct 2026 – Now';
    }
  };

  const latestHistoryDateStr = formatHistoryDate(goal?.startDate, goal?.endDate);
  const goalHistoryType = isLoss ? 'Loss' : isGain ? 'Gain' : isMaintenance ? 'Maintenance' : 'Goal';

  // Format program timeline subtitle e.g. "April 23 – Present"
  const programTimelineStr = useMemo(() => {
    if (activePlan?.startDate) {
      try {
        const d = new Date(activePlan.startDate);
        return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – Present`;
      } catch {
        return 'Active Cycle – Present';
      }
    }
    return 'Active Cycle – Present';
  }, [activePlan]);

  // Current day index (0=Sun..6=Sat)
  const todayDayOfWeek = new Date().getDay();

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 py-2 space-y-6 animate-in fade-in duration-200">
      {/* Top Header Row: STRATEGY & Profile Settings Button (Section 4.1) */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white tracking-wider uppercase font-sans">
          STRATEGY
        </h1>

        <button
          onClick={onOpenOnboardingModal}
          className="px-3.5 py-1.5 rounded-full bg-[#18191E] hover:bg-[#23242A] border border-[#24262E] text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
          title="Edit Profile & Preferences"
        >
          <User className="w-3.5 h-3.5 text-gray-400" />
          <span className="hidden sm:inline">Profile Settings</span>
        </button>
      </div>



      {/* Hero Concentric Check-In Dial (Section 4.1) */}
      <div className="flex flex-col items-center justify-center pt-2 pb-2">
        <div
          onClick={() => {
            if (isGoalReached) {
              // Section 6 Entry & Exit Matrix: Tap COMPLETE on CheckInCircle opens /create-goal-module
              onOpenCreateGoalModal();
            } else if (schedule.state === 'ready' || schedule.state === 'early_available' || schedule.state === 'overdue') {
              onOpenCheckInModal();
            } else {
              setActiveTab('checkin');
            }
          }}
          className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] select-none group"
          title={
            isGoalReached
              ? 'Target Reached! Click to Set New Goal'
              : schedule.state === 'ready'
                ? 'Click to Check In Now'
                : schedule.state === 'early_available'
                  ? 'Click to Check In Early'
                  : 'Click to View Check-In Schedule'
          }
        >
          <svg className="w-full h-full" viewBox="0 0 200 200">
            {/* Outer Track Border Ring */}
            <circle
              cx="100"
              cy="100"
              r={trackOuterR}
              fill="none"
              stroke="#2B2D35"
              strokeWidth="1.75"
            />

            {/* Inner Track Border Ring */}
            <circle
              cx="100"
              cy="100"
              r={trackInnerR}
              fill="none"
              stroke="#2B2D35"
              strokeWidth="1.75"
            />

            {/* Active Arc Progress */}
            {isGoalReached ? (
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke="#43AA71"
                strokeWidth="5.5"
                className="transition-all duration-700 ease-out"
              />
            ) : arcPath ? (
              <path
                d={arcPath}
                fill="none"
                stroke={schedule.state === 'overdue' ? '#F5BC43' : '#FFFFFF'}
                strokeWidth="5.5"
                strokeLinecap="round"
                className="transition-all duration-700 ease-out"
              />
            ) : null}

            {/* Green Accent Radial Tick at 8° */}
            <line
              x1={tickX1}
              y1={tickY1}
              x2={tickX2}
              y2={tickY2}
              stroke="#43AA71"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>

          {/* Central Dial Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none px-4">
            {isGoalReached ? (
              <>
                <span className="text-3xl sm:text-4xl font-black text-white uppercase tracking-wider font-sans">
                  COMPLETE
                </span>
                <span className="text-xs text-[#43AA71] font-bold mt-1 tracking-wide uppercase">
                  Target Reached 🎉
                </span>
                <span className="text-[10px] text-gray-400 mt-1">Tap to set new goal</span>
              </>
            ) : schedule.state === 'ready' ? (
              <>
                <span className="text-3xl sm:text-4xl font-black text-white uppercase tracking-wider font-sans">
                  Check In
                </span>
                <span className="text-xs text-[#43AA71] font-bold mt-0.5 tracking-wide lowercase">
                  it's time
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCheckInModal();
                  }}
                  className="mt-2.5 px-5 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-black transition-all active:scale-95 uppercase tracking-wider shadow-lg shadow-[#43AA71]/30"
                >
                  Check In Now
                </button>
              </>
            ) : schedule.state === 'overdue' ? (
              <>
                <span className="text-4xl sm:text-[44px] font-black text-white tracking-wider font-sans tabular-nums uppercase">
                  {Math.abs(schedule.diffDays)} DAYS
                </span>
                <span className="text-xs text-[#F5BC43] font-bold mt-0.5">
                  days overdue
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCheckInModal();
                  }}
                  className="mt-2 px-4 py-1.5 rounded-full bg-[#F5BC43] hover:bg-[#e0a934] text-black text-xs font-bold transition-all active:scale-95 uppercase tracking-wider shadow-lg shadow-[#F5BC43]/30"
                >
                  Check In Now
                </button>
              </>
            ) : schedule.state === 'early_available' ? (
              <>
                <span className="text-4xl sm:text-[44px] font-black text-white tracking-widest font-sans tabular-nums uppercase">
                  {schedule.diffDays} {schedule.diffDays === 1 ? 'DAY' : 'DAYS'}
                </span>
                <span className="text-xs text-[#8E8E93] font-normal mt-0.5 lowercase tracking-wide">
                  until check-in
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCheckInModal();
                  }}
                  className="mt-2 px-4 py-1.5 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#43AA71]/60 text-white text-xs font-semibold transition-all active:scale-95 shadow-sm flex items-center gap-1.5"
                >
                  <Zap className="w-3 h-3 text-[#43AA71]" />
                  <span>Check In Early</span>
                </button>
              </>
            ) : (
              <>
                <span className="text-4xl sm:text-[44px] font-black text-white tracking-widest font-sans tabular-nums uppercase">
                  {schedule.diffDays} DAYS
                </span>
                <span className="text-sm sm:text-base text-[#8E8E93] font-normal mt-1 lowercase tracking-wide">
                  until check-in
                </span>
              </>
            )}
          </div>
        </div>

        {/* Sub-Navigation Tabs under Dial (Section 4.1) */}
        <div className="flex items-center justify-center gap-14 mt-4 mb-5">
          {/* Goal Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('goal')}
            className="flex items-center gap-3 px-2 py-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <svg
              className={`w-6 h-6 transition-colors duration-200 ${activeTab === 'goal' ? 'text-[#43AA71]' : 'text-white group-hover:text-gray-300'
                }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2.5v5" />
              <path d="M16.5 7.5A6.5 6.5 0 1 1 7.5 7.5" />
              <path d="M19.5 4.5A10.5 10.5 0 1 1 4.5 4.5" />
            </svg>
            <span className={`text-lg font-semibold tracking-tight ${activeTab === 'goal' ? 'text-[#43AA71]' : 'text-white'}`}>
              Goal
            </span>
          </button>

          {/* Check-In Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('checkin')}
            className="flex items-center gap-3 px-2 py-1.5 transition-all active:scale-95 cursor-pointer group"
          >
            <svg
              className={`w-6 h-6 transition-colors duration-200 ${activeTab === 'checkin' ? 'text-[#43AA71]' : 'text-white group-hover:text-gray-300'
                }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="3" ry="3" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span className={`text-lg font-semibold tracking-tight ${activeTab === 'checkin' ? 'text-[#43AA71]' : 'text-white'}`}>
              Check-In
            </span>
          </button>
        </div>
      </div>

      {/* VIEW 1: GOAL VIEW (Section 4.1) */}
      {activeTab === 'goal' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* 1. CURRENTLY ACTIVE PROGRAM CARD (Section 4.1) */}
          {!activePlan ? (
            <section className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#FF8660]" />
                    <h3 className="text-base font-bold text-white tracking-tight">No Active Nutrition Program</h3>
                  </div>
                  <p className="text-xs text-[#8E8E93] leading-relaxed">
                    You do not currently have an active nutrition program. To continue receiving coached weekly macro targets, configure a new program.
                  </p>
                </div>
                <button
                  onClick={onOpenNewProgramModal}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-[#ff6b4a] to-[#f97316] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm whitespace-nowrap"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Configure Program Targets</span>
                </button>
              </div>
            </section>
          ) : (
            <section className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#8E8E93]" />
                    <h3 className="text-base font-bold text-white tracking-tight">Active Nutrition Program</h3>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#23242A] border border-[#2E3038] text-gray-200 capitalize">
                      {activePlan.programStyle}
                    </span>
                  </div>
                  <div className="text-xs text-[#8E8E93] font-medium pl-6">
                    {programTimelineStr}
                  </div>
                </div>

                <button
                  onClick={onOpenChangeProgramModal}
                  className="px-3.5 py-1.5 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                >
                  <Sliders className="w-3.5 h-3.5 text-gray-400" />
                  <span>Change Program</span>
                </button>
              </div>

              {/* Daily Calorie & Deficit Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3.5">
                  <span className="text-xs text-[#8E8E93] font-medium">Daily Calorie Target</span>
                  <div className="text-2xl font-bold font-mono text-white mt-1 tabular-nums">
                    {activePlan.targetCalories.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-[#8E8E93]">kcal/day</span>
                  </div>
                </div>

                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3.5">
                  <span className="text-xs text-[#8E8E93] font-medium">Planned Energy Deficit</span>
                  <div className="text-2xl font-bold font-mono text-white mt-1 tabular-nums">
                    {activePlan.dailyDeficitKcal}{' '}
                    <span className="text-xs font-normal text-[#8E8E93]">kcal/day</span>
                  </div>
                </div>
              </div>

              {/* 7-Day Day Chips Grid (Section 4.1) */}
              {activePlan.dailyTargets && activePlan.dailyTargets.length === 7 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] text-[#8E8E93] font-semibold uppercase tracking-wider block">
                    7-Day Schedule Distribution
                  </span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {activePlan.dailyTargets.map((t) => {
                      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      const isToday = t.dayOfWeek === todayDayOfWeek;
                      const isHigher = !!t.isHigherCalorieDay;

                      return (
                        <div
                          key={t.dayOfWeek}
                          className={`flex flex-col items-center justify-between py-2 px-1 rounded-xl border transition-all ${
                            isToday
                              ? 'border-[#FF8660] bg-[#FF8660]/10 shadow-sm'
                              : isHigher
                              ? 'border-[#383B46] bg-[#1C1E24]'
                              : 'border-[#24262E] bg-[#121316]'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                isToday ? 'text-[#FF8660]' : 'text-[#8E8E93]'
                              }`}
                            >
                              {dayLabels[t.dayOfWeek]}
                            </span>
                            {isHigher && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FF8660]" title="Higher Calorie Day" />
                            )}
                          </div>
                          <span
                            className={`text-xs font-bold font-mono tabular-nums mt-1 ${
                              isToday ? 'text-white' : 'text-gray-300'
                            }`}
                          >
                            {t.targetCalories.toLocaleString()}
                          </span>
                          <span className="text-[9px] text-[#8E8E93] font-mono">kcal</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[#24262E] flex items-center justify-between text-xs text-[#8E8E93]">
                <span>Expenditure: <strong className="text-gray-200">{Math.round(currentTdee)} kcal</strong></span>
                <button
                  onClick={() => setActiveTab('checkin')}
                  className="text-white hover:text-[#43AA71] font-medium transition-colors"
                >
                  View Check-In Schedule &rarr;
                </button>
              </div>
            </section>
          )}

          {/* Program Action Buttons above Goal Card (matching Image 3) */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenNewProgramModal}
              className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-300" />
              <span>New Program</span>
            </button>

            <button
              onClick={onOpenChangeProgramModal}
              className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
            >
              <Pencil className="w-3.5 h-3.5 text-gray-300" />
              <span>Edit Program</span>
            </button>
          </div>

          {/* 2. GOAL PROGRESS CARD (Section 4.1) */}
          <GoalCard
            goal={goal}
            currentTrendWeight={currentTrendWeight}
            currentTdee={currentTdee}
            onOpenEditModal={onOpenEditGoalModal}
            onOpenCreateModal={onOpenCreateGoalModal}
            onOpenHistoryModal={onOpenHistoryModal}
            onTransitionToMaintenance={onTransitionToMaintenance}
          />

          {/* 3. GOAL HISTORY SECTION PREVIEW (Section 4.1) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white tracking-tight">Goal History</h2>
              <button
                onClick={onOpenHistoryModal}
                className="text-xs text-[#8E8E93] hover:text-white transition-colors flex items-center gap-1 font-medium"
              >
                <span>View Full History</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Active History Item Card */}
            <div
              onClick={onOpenHistoryModal}
              className="bg-[#18191E] border border-[#24262E] hover:border-[#333640] transition-all cursor-pointer rounded-2xl p-5 shadow-sm group"
            >
              <div className="text-xs text-[#8E8E93] font-medium">
                {latestHistoryDateStr}
              </div>

              <div className="flex items-center justify-between mt-2">
                <div className="text-2xl font-bold text-white font-mono tabular-nums">
                  {currentTrendWeight.toFixed(1)} kg
                </div>

                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-300">
                  <span>{goalHistoryType}</span>
                  {isGoalReached ? (
                    <CheckCircle2 className="w-4 h-4 text-[#43AA71]" />
                  ) : (
                    <Hourglass className="w-4 h-4 text-gray-400 group-hover:text-gray-200 transition-colors" />
                  )}
                </div>
              </div>
            </div>

            {/* Additional Past Goals in Database */}
            {historicalGoals.filter((g) => g.status !== 'active').slice(0, 2).map((pastGoal) => {
              const pastIsLoss = pastGoal.goalType === 'weight_loss' || pastGoal.goalType === 'fat_loss';
              const pastType = pastIsLoss ? 'Loss' : pastGoal.goalType === 'maintenance' ? 'Maintenance' : 'Gain';
              const pastWeight = pastGoal.finalTrendWeightKg ?? pastGoal.startWeightKg;
              const pastDateRange = formatHistoryDate(pastGoal.startDate, pastGoal.endDate);

              return (
                <div
                  key={pastGoal.goalId}
                  onClick={onOpenHistoryModal}
                  className="bg-[#18191E] border border-[#24262E] hover:border-[#333640] transition-all cursor-pointer rounded-2xl p-5 shadow-sm group"
                >
                  <div className="text-xs text-[#8E8E93] font-medium">
                    {pastDateRange}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-2xl font-bold text-white font-mono tabular-nums">
                      {pastWeight.toFixed(1)} kg
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-300">
                      <span>{pastType}</span>
                      {pastGoal.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#43AA71]" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* VIEW 2: CHECK-IN VIEW (Section 4.1) */}
      {activeTab === 'checkin' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Header Row with Settings */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Check-In Schedule</h2>
              <p className="text-xs text-[#8E8E93] mt-0.5">
                MacroFactor locks caloric targets between check-ins to prevent grocery and routine friction.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenChangeDayModal}
                className="px-3.5 py-1.5 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
              >
                <Calendar className="w-3.5 h-3.5 text-gray-300" />
                <span>Day: <strong>{schedule.checkInWeekday}</strong></span>
              </button>

              <button
                onClick={onToggleFastCheckIn}
                className="px-3.5 py-1.5 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
              >
                <Zap className={`w-3.5 h-3.5 ${data.fastCheckIn ? 'text-[#43AA71]' : 'text-gray-400'}`} />
                <span>Fast Check-In: <strong>{data.fastCheckIn ? 'On' : 'Off'}</strong></span>
              </button>
            </div>
          </div>

          {/* Next Scheduled Check-In Card */}
          <section className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold">
                  Next Scheduled Check-In
                </span>
                <div className="text-xl font-bold text-white mt-1">
                  {schedule.checkInWeekday},{' '}
                  {new Date(schedule.nextCheckInDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </div>
              </div>

              {schedule.state === 'ready' ? (
                <button
                  onClick={onOpenCheckInModal}
                  className="px-5 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold shadow-sm transition-all active:scale-95 uppercase tracking-wider"
                >
                  Check In Now
                </button>
              ) : schedule.state === 'early_available' ? (
                <button
                  onClick={onOpenCheckInModal}
                  className="px-4 py-2 rounded-full bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold transition-all active:scale-95"
                >
                  Check In Early
                </button>
              ) : (
                <span className="text-xs px-3 py-1 rounded-full bg-[#23242A] border border-[#2E3038] text-gray-300 font-medium">
                  {schedule.diffDays} days remaining
                </span>
              )}
            </div>
          </section>

          {/* 7-Day Logging Compliance Card */}
          <section className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {compliance.isHolding ? (
                  <ShieldAlert className="w-5 h-5 text-[#F5BC43]" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-[#43AA71]" />
                )}
                <h3 className="text-base font-bold text-white">7-Day Logging Compliance</h3>
              </div>

              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${compliance.isHolding
                  ? 'bg-[#2A2318] text-[#F5BC43] border border-[#3E3420]'
                  : 'bg-[#15271E] text-[#43AA71] border border-[#1E432E]'
                  }`}
              >
                {compliance.isHolding ? 'Holding Safeguard' : 'Updating Dynamically'}
              </span>
            </div>

            <p className="text-xs text-[#8E8E93] leading-relaxed">
              MacroFactor enforces strict algorithmic safeguards: at least <strong className="text-white">4 days of calorie logging</strong> and{' '}
              <strong className="text-white">1 scale weigh-in</strong> per 7-day rolling window are required to safely update your metabolic expenditure.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Calorie Intake Bar */}
              <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-300 font-semibold">Calorie Days Logged</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {compliance.nutritionDays} / 4 days
                  </span>
                </div>
                <div className="w-full bg-[#1F2026] rounded-full h-2 overflow-hidden border border-[#24262E]">
                  <div
                    className="h-full bg-[#43AA71] rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (compliance.nutritionDays / 4) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Scale Weigh-Ins Bar */}
              <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-300 font-semibold">Scale Weigh-Ins</span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {compliance.weightDays} / 1 day
                  </span>
                </div>
                <div className="w-full bg-[#1F2026] rounded-full h-2 overflow-hidden border border-[#24262E]">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (compliance.weightDays / 1) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {compliance.partialDays && compliance.partialDays.length > 0 && (
              <div className="text-xs text-gray-300 bg-[#1A1C22] border border-[#282B33] rounded-xl p-3 leading-relaxed">
                Note: {compliance.partialDays.length} day{compliance.partialDays.length > 1 ? 's were' : ' was'} logged as partial/incomplete and excluded from your 7-day rolling intake calculation to protect your expenditure estimate from under-eating distortion.
              </div>
            )}
          </section>

          {/* Locked Active Plan Details Card */}
          <section className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8E8E93] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Locked 7-Day Program
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">Active Nutrition Targets</h3>
              </div>
              <span className="text-xs text-[#8E8E93] font-mono px-2 py-0.5 rounded bg-[#121316] border border-[#24262E]">
                Protected from daily noise
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#121316] border border-[#24262E] rounded-xl p-4">
                <span className="text-xs text-[#8E8E93] font-medium">Daily Calorie Target</span>
                <div className="text-3xl font-bold font-mono text-white mt-1 tabular-nums">
                  {activePlan?.targetCalories
                    ? activePlan.targetCalories.toLocaleString()
                    : (goal?.metrics?.projectedTargetCalories ? goal.metrics.projectedTargetCalories.toLocaleString() : '—')}{' '}
                  <span className="text-xs font-normal text-[#8E8E93]">kcal/day</span>
                </div>
              </div>

              <div className="bg-[#121316] border border-[#24262E] rounded-xl p-4">
                <span className="text-xs text-[#8E8E93] font-medium">Target Energy Deficit</span>
                <div className="text-3xl font-bold font-mono text-white mt-1 tabular-nums">
                  {activePlan?.dailyDeficitKcal !== undefined
                    ? activePlan.dailyDeficitKcal
                    : (goal?.metrics?.dailyDeficitKcal ?? '—')}{' '}
                  <span className="text-xs font-normal text-[#8E8E93]">kcal/day</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#8E8E93] leading-relaxed">
              In accordance with Section 8 of the MacroFactor specification, caloric targets remain firmly locked between weekly check-in dates. Your dynamic expenditure adapts behind the scenes, but your meal planning targets remain stable to prevent grocery and schedule whiplash.
            </p>
          </section>
        </div>
      )}
    </div>
  );
};

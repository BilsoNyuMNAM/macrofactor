import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  ArrowRight,
  Check,
  Sparkles,
  HelpCircle,
  Scale,
  Minus,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Award,
  Layers,
  Utensils
} from 'lucide-react';
import { StrategyResponse, LogItem, ExpenditureResponse, TrendResponse } from '../types';
import { calculateMacros } from '../utils/macroMath';
import { triggerGoalCelebration } from '../utils/confetti';

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: StrategyResponse;
  logs?: LogItem[];
  expenditureData?: ExpenditureResponse | null;
  trendData?: TrendResponse | null;
  onComplete: (holdExisting: boolean, goalRatePercent?: number) => Promise<void>;
  onToggleFastCheckIn: (val: boolean) => Promise<void>;
  onSaveLog?: (data: {
    date: string;
    scaleWeight?: number | null;
    calories?: number | null;
    isFasting?: boolean;
    isPartial?: boolean;
  }) => Promise<void>;
}

export type ModuleType =
  | 'notice'
  | 'intro'
  | 'break'
  | 'partial'
  | 'fasting'
  | 'weigh_in'
  | 'program_update';

interface ModuleDef {
  id: ModuleType;
  title: string;
  isMandatory: boolean;
}

export const CheckInModal: React.FC<CheckInModalProps> = ({
  isOpen,
  onClose,
  data,
  logs = [],
  expenditureData: _expenditureData,
  trendData: _trendData,
  onComplete,
  onToggleFastCheckIn,
  onSaveLog,
}) => {
  const { compliance, currentTdee, currentTrendWeight, activePlan, goal, fastCheckIn, biologicalSex } = data;

  // Active module queue and navigation index
  const [activeQueue, setActiveQueue] = useState<ModuleDef[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Sub-step inside Intro module (0 to 3)
  const [introSlide, setIntroSlide] = useState<number>(0);

  // Partial logging module state
  const [selectedPartialDates, setSelectedPartialDates] = useState<Set<string>>(new Set());

  // Fasting module state: mapping date -> 'fasting' | 'partial'
  const [fastingDecisions, setFastingDecisions] = useState<Record<string, 'fasting' | 'partial'>>({});

  // Weigh-in module state
  const [todayWeight, setTodayWeight] = useState<string>(currentTrendWeight.toFixed(1));

  // Program update rate & submission
  const [ratePercent, setRatePercent] = useState<number>(goal?.weeklyRatePercent ?? -0.5);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Safety Dialogs
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState<boolean>(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filter logs for the rolling 7-day window
  const past7DaysLogs = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const logMap = new Map<string, LogItem>();
    logs.forEach((l) => logMap.set(l.date, l));

    return dates.map((dateStr) => {
      const l = logMap.get(dateStr);
      const d = new Date(dateStr + 'T00:00:00Z');
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
      return {
        date: dateStr,
        weekday,
        calories: l?.calories ?? null,
        scaleWeight: l?.scaleWeight ?? null,
        isFasting: l?.isFasting ?? false,
        isPartial: l?.isPartial ?? false,
      };
    });
  }, [logs]);

  // Check if today already has a scale weight
  const hasWeighedInToday = useMemo(() => {
    const todayLog = logs.find((l) => l.date === todayStr);
    return todayLog?.scaleWeight !== null && todayLog?.scaleWeight !== undefined;
  }, [logs, todayStr]);

  // Find suspicious low-calorie days (<500 kcal and >0 kcal, or in compliance.partialDays)
  const suspiciousPartialDays = useMemo(() => {
    return past7DaysLogs.filter(
      (d) =>
        (d.calories !== null && d.calories > 0 && d.calories < 500 && !d.isFasting) ||
        (compliance.partialDays && compliance.partialDays.includes(d.date)) ||
        d.isPartial
    );
  }, [past7DaysLogs, compliance.partialDays]);

  // Find days with exactly 0 kcal logged
  const zeroCalorieDays = useMemo(() => {
    return past7DaysLogs.filter((d) => d.calories === 0 || d.isFasting);
  }, [past7DaysLogs]);

  // Determine if active goal reached
  const isLoss = goal?.goalType === 'weight_loss' || goal?.goalType === 'fat_loss';
  const isGain = goal?.goalType === 'weight_gain' || goal?.goalType === 'muscle_gain';
  const targetWeight = goal?.targetWeightKg;
  const isGoalReached = Boolean(
    goal?.isGoalReached ||
    (targetWeight !== null && targetWeight !== undefined && (
      (isLoss && currentTrendWeight <= targetWeight) ||
      (isGain && currentTrendWeight >= targetWeight)
    ))
  );

  const isFloorViolated = goal?.metrics?.calorieFloorWarning && goal.metrics.calorieFloorWarning !== 'none';
  const minFloor = biologicalSex === 'female' ? 1200 : 1500;

  // Build Dynamic Module Queue on Open
  useEffect(() => {
    if (!isOpen) return;

    const queue: ModuleDef[] = [];

    // 1. Notice Module (Priority 10)
    if (isGoalReached || isFloorViolated) {
      queue.push({ id: 'notice', title: 'Milestone Notice', isMandatory: false });
    }

    // 2. Introduction Module (Priority 20)
    // If fastCheckIn is true, bypass intro module
    const isFirstCheckIn = !activePlan || activePlan.startDate === activePlan.checkInDate;
    if (isFirstCheckIn && !fastCheckIn) {
      queue.push({ id: 'intro', title: 'Welcome', isMandatory: true });
    }

    // 3. Logging Break Module (Priority 30)
    if (compliance.nutritionDays === 0) {
      queue.push({ id: 'break', title: 'Logging Hiatus', isMandatory: false });
    }

    // 4. Partial Logging Module (Priority 40)
    if (suspiciousPartialDays.length > 0) {
      queue.push({ id: 'partial', title: 'Incomplete Days', isMandatory: false });
      setSelectedPartialDates(new Set(suspiciousPartialDays.map((d) => d.date)));
    }

    // 5. Fasting Module (Priority 50)
    if (zeroCalorieDays.length > 0) {
      queue.push({ id: 'fasting', title: 'Fasting Review', isMandatory: false });
      const initialDecisions: Record<string, 'fasting' | 'partial'> = {};
      zeroCalorieDays.forEach((d) => {
        initialDecisions[d.date] = d.isFasting ? 'fasting' : 'partial';
      });
      setFastingDecisions(initialDecisions);
    }

    // 6. Weigh-In Module (Priority 60)
    if (!hasWeighedInToday) {
      queue.push({ id: 'weigh_in', title: 'Morning Weigh-In', isMandatory: false });
      setTodayWeight(currentTrendWeight.toFixed(1));
    }

    // 7. Program Update Module (Priority 100 - MANDATORY)
    queue.push({ id: 'program_update', title: 'Updated Targets', isMandatory: true });

    setActiveQueue(queue);
    setCurrentIndex(0);
    setIntroSlide(0);
    setRatePercent(goal?.weeklyRatePercent ?? -0.5);
    setShowExitConfirm(false);
    setShowSkipConfirm(false);
  }, [
    isOpen,
    isGoalReached,
    isFloorViolated,
    fastCheckIn,
    compliance.nutritionDays,
    suspiciousPartialDays.length,
    zeroCalorieDays.length,
    hasWeighedInToday,
    currentTrendWeight,
    goal,
    activePlan
  ]);

  const currentModule = activeQueue[currentIndex] || { id: 'program_update', title: 'Program Update', isMandatory: true };

  // Macro Calculation for Program Update Step
  const preview = useMemo(() => {
    const isMaint = goal?.goalType === 'maintenance';
    const tissueKcal = isGain ? 8500 : 7700;
    const rateFraction = Math.abs(ratePercent) / 100.0;
    const weeklyMassDeltaKg = currentTrendWeight * rateFraction;
    const signedDeficit = isMaint
      ? 0
      : isGain
      ? Math.round((weeklyMassDeltaKg * tissueKcal) / 7.0)
      : -Math.round((weeklyMassDeltaKg * tissueKcal) / 7.0);

    const calculatedCalories = Math.max(minFloor, Math.round(currentTdee + signedDeficit));

    const currentCalories = activePlan?.targetCalories ?? calculatedCalories;
    const newCalories = compliance.isHolding ? currentCalories : calculatedCalories;
    const calorieDelta = newCalories - currentCalories;

    const prevMacros = calculateMacros(currentCalories, currentTrendWeight);
    const nextMacros = calculateMacros(newCalories, currentTrendWeight);

    const protDelta = nextMacros.proteinGrams - prevMacros.proteinGrams;
    const fatDelta = nextMacros.fatGrams - prevMacros.fatGrams;
    const carbDelta = nextMacros.carbGrams - prevMacros.carbGrams;

    return {
      currentCalories,
      newCalories,
      calorieDelta,
      dailyDeficit: compliance.isHolding ? (activePlan?.dailyDeficitKcal ?? 0) : signedDeficit,
      prevMacros,
      nextMacros,
      protDelta,
      fatDelta,
      carbDelta,
    };
  }, [ratePercent, isGain, currentTrendWeight, currentTdee, minFloor, activePlan, compliance.isHolding, goal]);

  // Stepper advancement
  const handleNext = () => {
    if (currentIndex < activeQueue.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleSkipModule = () => {
    setShowSkipConfirm(false);
    handleNext();
  };

  // Save Partial Logging days
  const handleConfirmPartialDays = async () => {
    if (onSaveLog) {
      for (const d of past7DaysLogs) {
        const shouldBePartial = selectedPartialDates.has(d.date);
        if (d.isPartial !== shouldBePartial) {
          await onSaveLog({
            date: d.date,
            isPartial: shouldBePartial,
            calories: d.calories,
          });
        }
      }
    }
    handleNext();
  };

  // Save Fasting days
  const handleConfirmFastingDays = async () => {
    if (onSaveLog) {
      for (const [dateStr, choice] of Object.entries(fastingDecisions)) {
        await onSaveLog({
          date: dateStr,
          isFasting: choice === 'fasting',
          isPartial: choice === 'partial',
          calories: choice === 'fasting' ? 0 : null,
        });
      }
    }
    handleNext();
  };

  // Save today's scale weight entry
  const handleSaveWeighIn = async () => {
    const val = parseFloat(todayWeight);
    if (!isNaN(val) && val >= 30 && val <= 300 && onSaveLog) {
      await onSaveLog({
        date: todayStr,
        scaleWeight: val,
      });
    }
    handleNext();
  };

  // Finalize check-in
  const handleFinalize = async (hold: boolean) => {
    setSubmitting(true);
    try {
      await onComplete(hold, hold ? undefined : ratePercent);
      // Trigger confetti celebration on successful acceptance
      triggerGoalCelebration();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#16171B] border border-[#272930] rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Top App Bar Header */}
        <div className="px-5 py-3.5 border-b border-[#24262E] flex items-center justify-between bg-[#121316]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1C1D22] transition-colors"
              title="Close Check-In"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#43AA71] flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Weekly Check-In
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1D22] border border-[#272930] text-gray-300 font-mono">
                  {currentIndex + 1} of {activeQueue.length}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight mt-0.5">
                {currentModule.title}
              </h3>
            </div>
          </div>

          {/* Right Header Action: Skip Button for non-mandatory modules */}
          <div>
            {!currentModule.isMandatory ? (
              <button
                type="button"
                onClick={() => setShowSkipConfirm(true)}
                className="px-3 py-1 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#25272F] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
              >
                Skip
              </button>
            ) : (
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 px-2 py-1">
                Required
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Module Progress Track */}
        <div className="w-full bg-[#1F2026] h-1 flex">
          {activeQueue.map((m, idx) => (
            <div
              key={m.id}
              className={`flex-1 h-full transition-all duration-300 ${
                idx < currentIndex
                  ? 'bg-[#43AA71]'
                  : idx === currentIndex
                  ? 'bg-white'
                  : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Modal Body: Active Module View */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* ========================================================= */}
          {/* MODULE 1: NOTICE MODULE (Priority 10)                     */}
          {/* ========================================================= */}
          {currentModule.id === 'notice' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {isGoalReached ? (
                <div className="p-5 rounded-2xl bg-gradient-to-b from-[#15271E] to-[#121316] border border-[#1E432E] text-center space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-[#1E432E] text-[#43AA71] flex items-center justify-center shadow-lg shadow-[#43AA71]/20">
                    <Award className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#43AA71]">
                      Milestone Reached
                    </span>
                    <h4 className="text-xl font-black text-white mt-0.5">Goal Weight Achieved!</h4>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed max-w-sm mx-auto">
                    Congratulations! Your smoothed trend weight is now{' '}
                    <strong className="text-white">{currentTrendWeight.toFixed(1)} kg</strong>, reaching your target of{' '}
                    <strong className="text-white">{targetWeight?.toFixed(1)} kg</strong>.
                  </p>
                  <div className="p-3 bg-[#18191E] border border-[#24262E] rounded-xl text-[11px] text-[#8E8E93]">
                    You can finalize your program today or transition to a Maintenance Goal in Strategy anytime.
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-[#1C1D22] border border-amber-500/30 space-y-3">
                  <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>Calorie Floor Guardrail Active</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Based on your requested rate of change, your daily energy prescription would drop below your safe physiological floor of{' '}
                    <strong className="text-white">{minFloor} kcal/day</strong>.
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    To protect your hormonal, metabolic, and lean mass health, MacroFactor has clamped your target calories to{' '}
                    <strong className="text-white">{minFloor} kcal</strong>. Weight loss velocity will naturally adapt to this safe floor.
                  </p>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5"
                >
                  <span>Continue Check-In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODULE 2: INTRODUCTION MODULE (Priority 20)               */}
          {/* ========================================================= */}
          {currentModule.id === 'intro' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#121316] border border-[#24262E] rounded-2xl p-5 space-y-4">
                {introSlide === 0 && (
                  <div className="space-y-2.5 text-center py-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-[#23242A] border border-[#2E3038] text-[#43AA71] flex items-center justify-center">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h4 className="text-base font-bold text-white">Welcome to Weekly Check-In</h4>
                    <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                      Your weekly check-in is the heartbeat of MacroFactor's smart coaching engine. Each week, your coach reviews your metabolic response and recalibrates your nutritional program.
                    </p>
                  </div>
                )}

                {introSlide === 1 && (
                  <div className="space-y-2.5 text-center py-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-[#23242A] border border-[#2E3038] text-white flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6 text-[#43AA71]" />
                    </div>
                    <h4 className="text-base font-bold text-white">Adherence-Neutral Coaching</h4>
                    <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                      MacroFactor never judges, penalizes, or assigns guilt for eating over or under targets. Your metabolism is what guides the math, using 7,700 kcal per kg of tissue flux.
                    </p>
                  </div>
                )}

                {introSlide === 2 && (
                  <div className="space-y-2.5 text-center py-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-[#23242A] border border-[#2E3038] text-white flex items-center justify-center">
                      <Layers className="w-6 h-6 text-[#43AA71]" />
                    </div>
                    <h4 className="text-base font-bold text-white">Dynamic Context-Aware Steps</h4>
                    <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                      Rather than a rigid checklist, your coach dynamically inserts modules based on your logs—reviewing morning weigh-ins, logging breaks, or fasting days as needed.
                    </p>
                  </div>
                )}

                {introSlide === 3 && (
                  <div className="space-y-2.5 text-center py-2">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-[#23242A] border border-[#2E3038] text-white flex items-center justify-center">
                      <Utensils className="w-6 h-6 text-[#43AA71]" />
                    </div>
                    <h4 className="text-base font-bold text-white">Locked 7-Day Programs</h4>
                    <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                      Once committed, your calorie and macronutrient targets remain locked for the next 7 days, eliminating daily grocery and meal planning whiplash.
                    </p>
                  </div>
                )}

                {/* Carousel Indicator Dots */}
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all ${
                        introSlide === idx ? 'w-5 bg-[#43AA71]' : 'w-1.5 bg-[#2E3038]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                {introSlide > 0 && (
                  <button
                    type="button"
                    onClick={() => setIntroSlide((s) => s - 1)}
                    className="w-1/3 py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] text-gray-300 font-semibold text-xs hover:bg-[#25272F]"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (introSlide < 3) {
                      setIntroSlide((s) => s + 1);
                    } else {
                      handleNext();
                    }
                  }}
                  className="flex-1 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5"
                >
                  <span>{introSlide < 3 ? 'Next' : "Let's Check In"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODULE 3: LOGGING BREAK MODULE (Priority 30)              */}
          {/* ========================================================= */}
          {currentModule.id === 'break' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  <span>Logging Hiatus Detected</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  We noticed that no food was tracked across the entire prior 7-day period.
                </p>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Rather than assuming you ate 0 calories and triggering an artificial expenditure collapse, your MF Coach held your expenditure steady at{' '}
                  <strong className="text-white font-mono">{currentTdee} kcal</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#121316] border border-[#24262E] space-y-2 text-xs">
                <span className="text-[#8E8E93] font-semibold uppercase tracking-wider text-[10px]">
                  Safeguard Strategy
                </span>
                <p className="text-gray-300 leading-relaxed">
                  Holding your numbers steady protects against dietary whiplash. When you resume tracking consistently, the dynamic expenditure engine will automatically resume calibrating.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-1/3 py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] text-gray-300 font-semibold text-xs hover:bg-[#25272F]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5"
                >
                  <span>Resume Coaching</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODULE 4: PARTIAL LOGGING MODULE (Priority 40)            */}
          {/* ========================================================= */}
          {currentModule.id === 'partial' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Did you eat on any of these days without logging everything? Incomplete days should be marked so they don't artificially drag down your expenditure calculation.
                </p>
              </div>

              {/* 7-Day Interactive Day Cards */}
              <div className="space-y-2">
                {past7DaysLogs.map((d) => {
                  const isSuspicious = d.calories !== null && d.calories > 0 && d.calories < 500 && !d.isFasting;
                  const isMarked = selectedPartialDates.has(d.date);

                  return (
                    <div
                      key={d.date}
                      onClick={() => {
                        const next = new Set(selectedPartialDates);
                        if (next.has(d.date)) {
                          next.delete(d.date);
                        } else {
                          next.add(d.date);
                        }
                        setSelectedPartialDates(next);
                      }}
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isMarked
                          ? 'bg-[#2A2016] border-orange-500/50 text-white shadow-sm'
                          : isSuspicious
                          ? 'bg-[#18191E] border-amber-500/40 text-gray-300 hover:border-amber-400'
                          : 'bg-[#121316] border-[#24262E] text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                            isMarked
                              ? 'bg-orange-500 border-orange-500 text-white'
                              : 'border-gray-600 bg-[#16171B]'
                          }`}
                        >
                          {isMarked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">
                            {d.weekday}, {d.date}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {d.calories !== null ? `${d.calories.toLocaleString()} kcal logged` : 'No food tracked'}
                          </span>
                        </div>
                      </div>

                      {isSuspicious && !isMarked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                          <HelpCircle className="w-2.5 h-2.5" />
                          Suspiciously Low
                        </span>
                      )}

                      {isMarked && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-semibold">
                          Excluded (Partial)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-1/3 py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] text-gray-300 font-semibold text-xs hover:bg-[#25272F]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPartialDays}
                  className="flex-1 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5"
                >
                  <span>Confirm Incomplete Days</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODULE 5: FASTING MODULE (Priority 50)                     */}
          {/* ========================================================= */}
          {currentModule.id === 'fasting' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <p className="text-xs text-gray-300 leading-relaxed">
                Zero calories were recorded on the following days. Please confirm whether these were intentional fasts or forgotten food logs:
              </p>

              <div className="space-y-3">
                {zeroCalorieDays.map((d) => {
                  const decision = fastingDecisions[d.date] || 'fasting';

                  return (
                    <div
                      key={d.date}
                      className="p-4 rounded-xl bg-[#121316] border border-[#24262E] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          {d.weekday}, {d.date}
                        </span>
                        <span className="text-[10px] font-mono text-[#8E8E93]">0 kcal logged</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setFastingDecisions((prev) => ({ ...prev, [d.date]: 'fasting' }))
                          }
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                            decision === 'fasting'
                              ? 'bg-[#15271E] border-[#43AA71] text-[#43AA71]'
                              : 'bg-[#18191E] border-[#24262E] text-gray-400 hover:text-white'
                          }`}
                        >
                          <span>Yes, Intentional Fast</span>
                          <span className="text-[9px] font-normal text-gray-400">Counts as 0 kcal</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setFastingDecisions((prev) => ({ ...prev, [d.date]: 'partial' }))
                          }
                          className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                            decision === 'partial'
                              ? 'bg-[#2A2016] border-orange-500 text-orange-400'
                              : 'bg-[#18191E] border-[#24262E] text-gray-400 hover:text-white'
                          }`}
                        >
                          <span>No, Forgot to Track</span>
                          <span className="text-[9px] font-normal text-gray-400">Excluded from TDEE</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-1/3 py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] text-gray-300 font-semibold text-xs hover:bg-[#25272F]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFastingDays}
                  className="flex-1 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5"
                >
                  <span>Confirm Fasting Days</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODULE 6: WEIGH-IN MODULE (Priority 60)                   */}
          {/* ========================================================= */}
          {currentModule.id === 'weigh_in' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="text-center space-y-1">
                <h4 className="text-sm font-bold text-white">Morning Scale Weigh-In</h4>
                <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                  Aim to weigh yourself at the same time each morning. Entering your weight today provides the sharpest anchor for your updated trend weight.
                </p>
              </div>

              {/* Large Stepper Control */}
              <div className="bg-[#121316] border border-[#24262E] rounded-2xl p-6 flex flex-col items-center justify-center space-y-3">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      const v = parseFloat(todayWeight) || currentTrendWeight;
                      setTodayWeight((v - 0.1).toFixed(1));
                    }}
                    className="w-10 h-10 rounded-full bg-[#1C1D22] border border-[#272930] hover:bg-[#25272F] text-white flex items-center justify-center transition-all active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <div className="flex items-baseline gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      value={todayWeight}
                      onChange={(e) => setTodayWeight(e.target.value)}
                      className="w-32 text-center bg-transparent border-b-2 border-white/30 focus:border-[#43AA71] text-4xl font-black font-mono text-white outline-none tabular-nums"
                    />
                    <span className="text-sm text-gray-400 font-bold">kg</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const v = parseFloat(todayWeight) || currentTrendWeight;
                      setTodayWeight((v + 0.1).toFixed(1));
                    }}
                    className="w-10 h-10 rounded-full bg-[#1C1D22] border border-[#272930] hover:bg-[#25272F] text-white flex items-center justify-center transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-[11px] text-[#8E8E93] font-mono">
                  Current smoothed trend: <strong className="text-white">{currentTrendWeight.toFixed(1)} kg</strong>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveWeighIn}
                  className="w-full py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Save Weigh-In & Continue</span>
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                >
                  No, I simply did not track today
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODULE 7: PROGRAM UPDATE MODULE (Priority 100 - MANDATORY)*/}
          {/* ========================================================= */}
          {currentModule.id === 'program_update' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Holding Warning Alert */}
              {compliance.isHolding ? (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5 text-xs text-amber-300">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Holding Safeguard Recommendation</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-200/90">
                    Fewer than 4 calorie days or 1 weigh-in were logged this week. To protect against inaccurate target whiplash, MacroFactor recommends holding your current targets steady.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#15271E] border border-[#1E432E] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#43AA71]" />
                    <span className="font-bold text-white">Dynamic Recalibration Ready</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#43AA71] font-bold">
                    {compliance.nutritionDays}/4 food • {compliance.weightDays}/1 wt
                  </span>
                </div>
              )}

              {/* Side-by-Side Macronutrient Target Comparison Grid */}
              <div className="bg-[#121316] border border-[#24262E] rounded-xl overflow-hidden shadow-sm">
                <div className="grid grid-cols-12 bg-[#18191E] border-b border-[#24262E] px-4 py-2 text-[10px] font-bold text-[#8E8E93] uppercase tracking-wider">
                  <span className="col-span-4">Nutrient</span>
                  <span className="col-span-3 text-right">Current</span>
                  <span className="col-span-3 text-right text-white">New</span>
                  <span className="col-span-2 text-right">Delta</span>
                </div>

                <div className="divide-y divide-[#24262E] text-xs">
                  {/* Daily Calories */}
                  <div className="grid grid-cols-12 px-4 py-3 items-center">
                    <div className="col-span-4 font-bold text-white flex items-center gap-1.5">
                      <span>Calories</span>
                    </div>
                    <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                      {preview.currentCalories.toLocaleString()} <span className="text-[10px]">kcal</span>
                    </div>
                    <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                      {preview.newCalories.toLocaleString()} <span className="text-[10px] text-gray-400">kcal</span>
                    </div>
                    <div className="col-span-2 text-right flex justify-end">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          preview.calorieDelta === 0
                            ? 'bg-[#1C1D22] border-[#272930] text-gray-400'
                            : preview.calorieDelta > 0
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-[#43AA71]'
                            : 'bg-amber-500/10 border-amber-500/25 text-[#F5BC43]'
                        }`}
                      >
                        {preview.calorieDelta > 0 ? `+${preview.calorieDelta}` : `${preview.calorieDelta}`}
                      </span>
                    </div>
                  </div>

                  {/* Protein */}
                  <div className="grid grid-cols-12 px-4 py-2.5 items-center">
                    <div className="col-span-4 font-semibold text-gray-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                      <span>Protein</span>
                    </div>
                    <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                      {preview.prevMacros.proteinGrams}g
                    </div>
                    <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                      {preview.nextMacros.proteinGrams}g
                    </div>
                    <div className="col-span-2 text-right flex justify-end">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#1C1D22] border border-[#272930] text-gray-400">
                        {preview.protDelta >= 0 ? `+${preview.protDelta}g` : `${preview.protDelta}g`}
                      </span>
                    </div>
                  </div>

                  {/* Fat */}
                  <div className="grid grid-cols-12 px-4 py-2.5 items-center">
                    <div className="col-span-4 font-semibold text-gray-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                      <span>Fat</span>
                    </div>
                    <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                      {preview.prevMacros.fatGrams}g
                    </div>
                    <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                      {preview.nextMacros.fatGrams}g
                    </div>
                    <div className="col-span-2 text-right flex justify-end">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#1C1D22] border border-[#272930] text-gray-400">
                        {preview.fatDelta >= 0 ? `+${preview.fatDelta}g` : `${preview.fatDelta}g`}
                      </span>
                    </div>
                  </div>

                  {/* Carbohydrates */}
                  <div className="grid grid-cols-12 px-4 py-2.5 items-center">
                    <div className="col-span-4 font-semibold text-gray-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                      <span>Carbs</span>
                    </div>
                    <div className="col-span-3 text-right font-mono text-[#8E8E93] tabular-nums">
                      {preview.prevMacros.carbGrams}g
                    </div>
                    <div className="col-span-3 text-right font-mono font-bold text-white tabular-nums">
                      {preview.nextMacros.carbGrams}g
                    </div>
                    <div className="col-span-2 text-right flex justify-end">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#1C1D22] border border-[#272930] text-gray-400">
                        {preview.carbDelta >= 0 ? `+${preview.carbDelta}g` : `${preview.carbDelta}g`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 7-Day Day Chips Distribution (if active plan has configured day targets) */}
              {activePlan?.dailyTargets && activePlan.dailyTargets.length === 7 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-wider block">
                    7-Day Calorie Distribution Preview
                  </span>
                  <div className="grid grid-cols-7 gap-1">
                    {activePlan.dailyTargets.map((t) => {
                      const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      return (
                        <div
                          key={t.dayOfWeek}
                          className="bg-[#121316] border border-[#24262E] rounded-lg p-1.5 text-center"
                        >
                          <div className="text-[9px] uppercase font-bold text-[#8E8E93]">
                            {labels[t.dayOfWeek]}
                          </div>
                          <div className="text-[11px] font-bold font-mono text-white mt-0.5 tabular-nums">
                            {compliance.isHolding
                              ? t.targetCalories.toLocaleString()
                              : Math.round(preview.newCalories * (t.targetCalories / (activePlan.targetCalories || 1))).toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fast Check-In Option Toggle */}
              <div className="flex items-center justify-between p-3 bg-[#121316] border border-[#24262E] rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ciFastToggle"
                    checked={fastCheckIn}
                    onChange={(e) => onToggleFastCheckIn(e.target.checked)}
                    className="rounded bg-[#1C1D22] border-gray-700 text-[#43AA71] focus:ring-[#43AA71]"
                  />
                  <label htmlFor="ciFastToggle" className="text-gray-300 font-semibold cursor-pointer">
                    Enable Fast Check-In
                  </label>
                </div>
                <span className="text-[10px] text-[#8E8E93]">Skip educational slides</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2">
                {compliance.isHolding ? (
                  <>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleFinalize(false)}
                      className="flex-1 py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#25272F] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95 text-center disabled:opacity-50"
                    >
                      Adjust Anyway
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleFinalize(true)}
                      className="flex-1 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Hold Targets (Recommended)</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleFinalize(true)}
                      className="w-1/3 py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#25272F] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95 text-center disabled:opacity-50"
                    >
                      Hold Current
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleFinalize(false)}
                      className="flex-1 py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Accept Program Update</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* EXIT POINT 2: CLOSE / CANCEL CONFIRMATION DIALOG          */}
      {/* ========================================================= */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#18191E] border border-[#24262E] rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Close the Check-In?</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              You will still be able to check in later, but the MF Coach may surface different modules at that time. You will not receive your updated macro program until you come back to check in.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
              >
                Continue Check-In
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  onClose();
                }}
                className="w-full py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#25272F] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
              >
                Exit Without Saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EXIT POINT 3: SKIP MODULE CONFIRMATION DIALOG             */}
      {/* ========================================================= */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#18191E] border border-[#24262E] rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Skip Module?</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              This module will not be available until the same situation arises in a future check-in. Would you like to skip it?
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleSkipModule}
                className="w-full py-2.5 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
              >
                Skip Module
              </button>
              <button
                type="button"
                onClick={() => setShowSkipConfirm(false)}
                className="w-full py-2.5 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#25272F] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
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

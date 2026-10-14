import React, { useState, useMemo } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  ShieldAlert,
  Dumbbell,
  Heart,
  Activity,
  UserCheck,
  Scale,
  Sliders,
  Pencil,
  Lock,
  Minus,
  Plus
} from 'lucide-react';
import { Goal } from '../types';
import {
  DietStyle,
  ProteinTier,
  TrainingSchedule,
  DIET_STYLES,
  PROTEIN_TIERS,
  calculateMacros,
} from '../utils/macroMath';

interface NewProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTdee: number;
  currentTrendWeight: number;
  goal: Goal | null;
  biologicalSex?: string;
  onCommitProgram: (data: {
    programStyle: string;
    targetCalories?: number;
    dailyTargets?: Array<{ dayOfWeek: number; targetCalories: number; isHigherCalorieDay?: boolean }>;
    higherCalorieDays?: number[];
    higherCalorieSurplus?: number;
  }) => Promise<void>;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const NewProgramModal: React.FC<NewProgramModalProps> = ({
  isOpen,
  onClose,
  currentTdee,
  currentTrendWeight,
  goal,
  biologicalSex = 'male',
  onCommitProgram,
}) => {
  if (!isOpen) return null;

  // Program Style: coached | collaborative | manual
  const [programStyle, setProgramStyle] = useState<'coached' | 'collaborative' | 'manual'>('coached');

  // Coached Wizard Steps:
  // 1: Style
  // 2: Training Schedule
  // 3: Calorie Distribution Preference
  // 4: Higher Calorie Days (conditional)
  // 5: Preferred Diet Style
  // 6: Protein Preference
  // 7: Floor Check (conditional)
  // 8: Review & Start
  const [coachedStep, setCoachedStep] = useState<number>(1);

  // Training Schedule
  const [trainingSchedule, setTrainingSchedule] = useState<TrainingSchedule>('lifting');

  // Calorie Distribution
  const [distributionPreference, setDistributionPreference] = useState<'equal' | 'higher_days'>('equal');
  const [higherDays, setHigherDays] = useState<number[]>([5, 6]); // Friday, Saturday
  const [higherSurplus, setHigherSurplus] = useState<number>(200);

  // Diet Style & Protein Tier
  const [dietStyle, setDietStyle] = useState<DietStyle>('balanced');
  const [proteinTier, setProteinTier] = useState<ProteinTier>('moderate');

  // Floor Confirmation checkbox
  const [floorAcknowledged, setFloorAcknowledged] = useState<boolean>(false);

  // Saving & error states
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Recommended base calories from active goal and TDEE
  const recommendedBaseCalories = useMemo(() => {
    if (!goal) return Math.round(currentTdee);
    const isGain = goal.goalType === 'weight_gain' || goal.goalType === 'muscle_gain';
    const isMaintenance = goal.goalType === 'maintenance';
    if (isMaintenance) return Math.round(currentTdee);

    const tissueKcal = isGain ? 8500 : 7700;
    const weeklyRateKg = (Math.abs(goal.weeklyRatePercent) / 100.0) * currentTrendWeight;
    const signedDeficit = isGain
      ? Math.round((weeklyRateKg * tissueKcal) / 7.0)
      : -Math.round((weeklyRateKg * tissueKcal) / 7.0);

    const minFloor = biologicalSex === 'female' ? 1200 : 1500;
    return Math.max(minFloor, Math.round(currentTdee + signedDeficit));
  }, [goal, currentTdee, currentTrendWeight, biologicalSex]);

  // Total weekly budget
  const weeklyCalorieBudget = recommendedBaseCalories * 7;

  // Collaborative State: Day-by-day calories & macros
  const [collaborativeDays, setCollaborativeDays] = useState<
    Array<{
      dayOfWeek: number;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>
  >(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const macros = calculateMacros(recommendedBaseCalories, currentTrendWeight, dietStyle, proteinTier);
      return {
        dayOfWeek: i,
        calories: recommendedBaseCalories,
        protein: macros.proteinGrams,
        fat: macros.fatGrams,
        carbs: macros.carbGrams,
      };
    });
  });

  // Manual State: Same vs Different, inputs
  const [manualMode, setManualMode] = useState<'same' | 'different'>('same');
  const [manualSameDay, setManualSameDay] = useState<{
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }>({
    calories: recommendedBaseCalories,
    protein: Math.round(currentTrendWeight * 2.0),
    fat: Math.round((recommendedBaseCalories * 0.25) / 9),
    carbs: Math.max(0, Math.round((recommendedBaseCalories - currentTrendWeight * 2.0 * 4 - (recommendedBaseCalories * 0.25)) / 4)),
  });

  const [manualDifferentDays, setManualDifferentDays] = useState<
    Array<{
      dayOfWeek: number;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>
  >(() => {
    return Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      calories: recommendedBaseCalories,
      protein: Math.round(currentTrendWeight * 2.0),
      fat: Math.round((recommendedBaseCalories * 0.25) / 9),
      carbs: Math.max(0, Math.round((recommendedBaseCalories - currentTrendWeight * 2.0 * 4 - (recommendedBaseCalories * 0.25)) / 4)),
    }));
  });

  // Safe floor check
  const isFemale = biologicalSex.toLowerCase() === 'female';
  const standardFloor = isFemale ? 1200 : 1500;
  const isBelowFloor = recommendedBaseCalories < standardFloor;

  // Coached 7-day schedule with higher calorie redistribution
  const coached7DaySchedule = useMemo(() => {
    if (distributionPreference === 'equal' || higherDays.length === 0 || higherDays.length === 7) {
      return Array.from({ length: 7 }, (_, day) => {
        const macros = calculateMacros(recommendedBaseCalories, currentTrendWeight, dietStyle, proteinTier);
        return {
          dayOfWeek: day,
          dayName: DAY_LABELS[day],
          fullName: FULL_DAY_NAMES[day],
          calories: recommendedBaseCalories,
          isHigher: false,
          macros,
        };
      });
    }

    const numHigher = higherDays.length;
    const numStandard = 7 - numHigher;
    const higherCal = recommendedBaseCalories + higherSurplus;
    const remainingForStandard = weeklyCalorieBudget - numHigher * higherCal;
    const standardCal = Math.round(remainingForStandard / numStandard);

    return Array.from({ length: 7 }, (_, day) => {
      const isHigher = higherDays.includes(day);
      const cals = isHigher ? higherCal : standardCal;
      const macros = calculateMacros(cals, currentTrendWeight, dietStyle, proteinTier);
      return {
        dayOfWeek: day,
        dayName: DAY_LABELS[day],
        fullName: FULL_DAY_NAMES[day],
        calories: cals,
        isHigher,
        macros,
      };
    });
  }, [distributionPreference, higherDays, higherSurplus, recommendedBaseCalories, currentTrendWeight, dietStyle, proteinTier, weeklyCalorieBudget]);

  const toggleHigherDay = (day: number) => {
    if (higherDays.includes(day)) {
      if (higherDays.length > 1) {
        setHigherDays(higherDays.filter((d) => d !== day));
      }
    } else {
      if (higherDays.length < 6) {
        setHigherDays([...higherDays, day].sort());
      }
    }
  };

  // Collaborative budget calculations
  const collaborativeAllocatedTotal = useMemo(() => {
    return collaborativeDays.reduce((acc, curr) => acc + curr.calories, 0);
  }, [collaborativeDays]);

  const collaborativeRemaining = weeklyCalorieBudget - collaborativeAllocatedTotal;
  const isCollaborativeBalanced = collaborativeRemaining === 0;

  const updateCollaborativeCalories = (dayIndex: number, delta: number) => {
    setCollaborativeDays((prev) => {
      const next = [...prev];
      const targetCals = Math.max(500, next[dayIndex].calories + delta);
      const m = calculateMacros(targetCals, currentTrendWeight, dietStyle, proteinTier);
      next[dayIndex] = {
        ...next[dayIndex],
        calories: targetCals,
        protein: m.proteinGrams,
        fat: m.fatGrams,
        carbs: m.carbGrams,
      };
      return next;
    });
  };

  // Coached Step Navigation
  const handleCoachedNext = () => {
    setError(null);
    if (coachedStep === 1) {
      setCoachedStep(2);
    } else if (coachedStep === 2) {
      setCoachedStep(3);
    } else if (coachedStep === 3) {
      if (distributionPreference === 'higher_days') {
        setCoachedStep(4);
      } else {
        setCoachedStep(5);
      }
    } else if (coachedStep === 4) {
      setCoachedStep(5);
    } else if (coachedStep === 5) {
      setCoachedStep(6);
    } else if (coachedStep === 6) {
      if (isBelowFloor && !floorAcknowledged) {
        setCoachedStep(7);
      } else {
        setCoachedStep(8);
      }
    } else if (coachedStep === 7) {
      if (!floorAcknowledged) {
        setError('Please acknowledge the calorie floor notice before continuing.');
        return;
      }
      setCoachedStep(8);
    }
  };

  const handleCoachedBack = () => {
    setError(null);
    if (coachedStep === 8) {
      if (isBelowFloor) setCoachedStep(7);
      else setCoachedStep(6);
    } else if (coachedStep === 7) {
      setCoachedStep(6);
    } else if (coachedStep === 6) {
      setCoachedStep(5);
    } else if (coachedStep === 5) {
      if (distributionPreference === 'higher_days') setCoachedStep(4);
      else setCoachedStep(3);
    } else if (coachedStep === 4) {
      setCoachedStep(3);
    } else if (coachedStep === 3) {
      setCoachedStep(2);
    } else if (coachedStep === 2) {
      setCoachedStep(1);
    } else {
      onClose();
    }
  };

  // Submission handler
  const handleCommitProgram = async () => {
    try {
      setSaving(true);
      setError(null);

      if (programStyle === 'coached') {
        await onCommitProgram({
          programStyle: 'coached',
          targetCalories: recommendedBaseCalories,
          higherCalorieDays: distributionPreference === 'higher_days' ? higherDays : [],
          higherCalorieSurplus: distributionPreference === 'higher_days' ? higherSurplus : 0,
        });
      } else if (programStyle === 'collaborative') {
        if (!isCollaborativeBalanced) {
          setError(`Please allocate your full weekly budget (${weeklyCalorieBudget.toLocaleString()} kcal). Currently ${collaborativeRemaining > 0 ? `${collaborativeRemaining} kcal remaining` : `${Math.abs(collaborativeRemaining)} kcal over budget`}.`);
          setSaving(false);
          return;
        }
        await onCommitProgram({
          programStyle: 'collaborative',
          targetCalories: Math.round(collaborativeAllocatedTotal / 7),
          dailyTargets: collaborativeDays.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            targetCalories: d.calories,
            isHigherCalorieDay: d.calories > recommendedBaseCalories,
          })),
        });
      } else {
        // Manual mode
        if (manualMode === 'same') {
          await onCommitProgram({
            programStyle: 'manual',
            targetCalories: manualSameDay.calories,
          });
        } else {
          const avg = Math.round(manualDifferentDays.reduce((a, b) => a + b.calories, 0) / 7);
          await onCommitProgram({
            programStyle: 'manual',
            targetCalories: avg,
            dailyTargets: manualDifferentDays.map((d) => ({
              dayOfWeek: d.dayOfWeek,
              targetCalories: d.calories,
            })),
          });
        }
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to activate new program');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#16171B] border border-[#272930] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header & Stepper */}
        <div className="p-5 border-b border-[#272930] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#23242A] text-gray-300 border border-[#2E3038]">
                {programStyle === 'coached'
                  ? `Step ${coachedStep} of 7`
                  : programStyle === 'collaborative'
                  ? 'Collaborative Setup'
                  : 'Manual Setup'}
              </span>
              <h2 className="text-base font-bold text-white">
                {programStyle === 'coached'
                  ? coachedStep === 1
                    ? 'Program Style'
                    : coachedStep === 2
                    ? 'Training Schedule'
                    : coachedStep === 3
                    ? 'Calorie Distribution'
                    : coachedStep === 4
                    ? 'Higher Calorie Days'
                    : coachedStep === 5
                    ? 'Preferred Diet Style'
                    : coachedStep === 6
                    ? 'Protein Preference'
                    : coachedStep === 7
                    ? 'Calorie Floor Check'
                    : 'Review Coached Program'
                  : programStyle === 'collaborative'
                  ? 'Collaborative Program'
                  : 'Manual Program'}
              </h2>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {programStyle === 'coached' && coachedStep === 1 && 'Choose how you would like MacroFactor to manage your nutrition.'}
              {programStyle === 'coached' && coachedStep === 2 && 'MacroFactor uses your training modality to inform calorie allocation.'}
              {programStyle === 'coached' && coachedStep === 3 && 'Choose how calories are divided throughout the week.'}
              {programStyle === 'coached' && coachedStep === 4 && 'Choose which days receive extra calories while conserving your budget.'}
              {programStyle === 'coached' && coachedStep === 5 && 'Select your preferred macronutrient distribution.'}
              {programStyle === 'coached' && coachedStep === 6 && 'Select your daily protein target based on research tiers.'}
              {programStyle === 'coached' && coachedStep === 7 && 'Verify physiological safety safeguards for low calorie intake.'}
              {programStyle === 'coached' && coachedStep === 8 && 'Here are your personalized weekly nutrition targets.'}
              {programStyle === 'collaborative' && 'Allocate daily calories within your algorithmically enforced weekly budget.'}
              {programStyle === 'manual' && 'Set your own calorie and macronutrient targets directly.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22242B] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Line */}
        <div className="w-full bg-[#1F2026] h-1">
          <div
            className="bg-[#43AA71] h-full transition-all duration-300"
            style={{
              width:
                programStyle === 'coached'
                  ? `${Math.min(100, Math.round((coachedStep / 7) * 100))}%`
                  : '100%',
            }}
          />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* COACHED STEP 1: Program Style Selection (Section 4.2.1) */}
          {programStyle === 'coached' && coachedStep === 1 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {/* Coached Card */}
              <div
                onClick={() => setProgramStyle('coached')}
                className="p-4 rounded-xl border border-[#43AA71] bg-[#23242A] text-white cursor-pointer transition-all shadow-sm flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-[#43AA71] shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Coached</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#15271E] text-[#43AA71] border border-[#1E432E]">
                        Recommended
                      </span>
                    </div>
                    <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    MacroFactor will automatically adjust your macro targets each week based on your expenditure and weight trends.
                  </p>
                </div>
              </div>

              {/* Collaborative Card */}
              <div
                onClick={() => setProgramStyle('collaborative')}
                className="p-4 rounded-xl border border-[#272930] bg-[#1C1D22] text-gray-300 hover:border-gray-600 cursor-pointer transition-all flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-gray-300 shrink-0">
                  <Scale className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white">Collaborative</h4>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    You set your own daily macros, and MacroFactor guides your weekly calorie total based on your expenditure.
                  </p>
                </div>
              </div>

              {/* Manual Card */}
              <div
                onClick={() => setProgramStyle('manual')}
                className="p-4 rounded-xl border border-[#272930] bg-[#1C1D22] text-gray-300 hover:border-gray-600 cursor-pointer transition-all flex items-start gap-3.5"
              >
                <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-gray-300 shrink-0">
                  <Pencil className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-white">Manual</h4>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    You set your own calorie and macronutrient targets. MacroFactor will never adjust them automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* COACHED STEP 2: Training Schedule (Section 4.2.2) */}
          {programStyle === 'coached' && coachedStep === 2 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {[
                {
                  id: 'lifting',
                  title: 'Lifting',
                  subtitle: 'Resistance training with weights or machines',
                  icon: Dumbbell,
                },
                {
                  id: 'hybrid',
                  title: 'Cardio & Lifting',
                  subtitle: 'Hybrid resistance and endurance training',
                  icon: Activity,
                },
                {
                  id: 'cardio',
                  title: 'Cardio',
                  subtitle: 'Running, cycling, swimming, or endurance sports',
                  icon: Heart,
                },
                {
                  id: 'none',
                  title: 'None / Other',
                  subtitle: 'General activity, yoga, or no structured training',
                  icon: UserCheck,
                },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = trainingSchedule === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setTrainingSchedule(item.id as TrainingSchedule)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3.5 ${
                      isSelected
                        ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                        : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-white shrink-0">
                      <Icon className="w-5 h-5 text-[#43AA71]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-white">{item.title}</h4>
                      <p className="text-xs text-gray-400 mt-0.5">{item.subtitle}</p>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* COACHED STEP 3: Calorie Distribution (Section 4.2.3) */}
          {programStyle === 'coached' && coachedStep === 3 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div
                onClick={() => setDistributionPreference('equal')}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3.5 ${
                  distributionPreference === 'equal'
                    ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                    : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-white shrink-0">
                  <Scale className="w-5 h-5 text-[#43AA71]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">Equal Every Day</h4>
                    {distributionPreference === 'equal' && (
                      <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Eat the exact same calorie and macro targets Monday through Sunday.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setDistributionPreference('higher_days')}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3.5 ${
                  distributionPreference === 'higher_days'
                    ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                    : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-[#16171B] border border-[#272930] flex items-center justify-center text-white shrink-0">
                  <Sliders className="w-5 h-5 text-[#43AA71]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">Shift Calories to Specific Days</h4>
                    {distributionPreference === 'higher_days' && (
                      <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Eat more calories on workout days or weekends, with fewer calories on non-training days. Total weekly calories remain identical.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* COACHED STEP 4: Higher Calorie Days (Section 4.2.4) */}
          {programStyle === 'coached' && coachedStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-4 space-y-4 shadow-sm">
                <div>
                  <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold block mb-2">
                    Select Higher Calorie Days
                  </span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAY_LABELS.map((dayLabel, idx) => {
                      const isSelected = higherDays.includes(idx);
                      return (
                        <button
                          key={dayLabel}
                          type="button"
                          onClick={() => toggleHigherDay(idx)}
                          className={`py-2 rounded-lg text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-[#43AA71] text-black shadow-sm'
                              : 'bg-[#121316] text-gray-400 hover:text-white border border-[#24262E]'
                          }`}
                        >
                          {dayLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold">
                      Surplus Magnitude
                    </span>
                    <span className="text-sm font-mono font-bold text-[#43AA71] tabular-nums">
                      +{higherSurplus} kcal/day
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[100, 150, 200, 250, 300, 400].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setHigherSurplus(val)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                          higherSurplus === val
                            ? 'bg-[#23242A] border border-[#43AA71] text-white'
                            : 'bg-[#121316] border border-[#24262E] text-gray-400 hover:text-white'
                        }`}
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dynamic Weekly Budget Balance Callout */}
              <div className="p-3.5 rounded-xl bg-[#1A1C22] border border-[#282B33] text-xs text-gray-300 leading-relaxed">
                Selected <strong className="text-white">{higherDays.length} days</strong> (+{higherSurplus} kcal on {higherDays.map(d => DAY_LABELS[d]).join(', ')}). Remaining {7 - higherDays.length} days reduced to maintain your exact weekly budget of <strong className="text-white">{weeklyCalorieBudget.toLocaleString()} kcal</strong>.
              </div>
            </div>
          )}

          {/* COACHED STEP 5: Preferred Diet Style (Section 4.2.5) */}
          {programStyle === 'coached' && coachedStep === 5 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {(Object.keys(DIET_STYLES) as DietStyle[]).map((key) => {
                const item = DIET_STYLES[key];
                const isSelected = dietStyle === key;
                return (
                  <div
                    key={key}
                    onClick={() => setDietStyle(key)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                        : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-bold text-white">{item.label}</h4>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-3">{item.subtitle}</p>

                    {/* Proportional Mini-Bar */}
                    <div className="w-full h-2 rounded-full overflow-hidden flex bg-[#16171B]">
                      <div className="bg-blue-400 h-full" style={{ width: '25%' }} title="Protein" />
                      <div className="bg-yellow-400 h-full" style={{ width: `${item.fatRatio * 100}%` }} title="Fat" />
                      <div className="bg-orange-400 h-full flex-1" title="Carbohydrates" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* COACHED STEP 6: Protein Preference (Section 4.2.6) */}
          {programStyle === 'coached' && coachedStep === 6 && (
            <div className="space-y-3 animate-in fade-in duration-150">
              {(Object.keys(PROTEIN_TIERS) as ProteinTier[]).map((key) => {
                const item = PROTEIN_TIERS[key];
                const isSelected = proteinTier === key;
                const calculatedGrams = Math.round(currentTrendWeight * item.perKg);

                return (
                  <div
                    key={key}
                    onClick={() => setProteinTier(key)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                        : 'bg-[#1C1D22] border-[#272930] text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <h4 className="text-sm font-bold text-white">{item.label}</h4>
                        <span className="text-xs font-mono font-bold text-[#43AA71] tabular-nums">
                          {calculatedGrams} g/day
                        </span>
                      </div>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-[#43AA71] text-black flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{item.subtitle}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* COACHED STEP 7: Calorie Floor Verification (Section 4.2.7) */}
          {programStyle === 'coached' && coachedStep === 7 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#2A2318] border border-[#3E3420] rounded-xl p-5 space-y-3 text-amber-200">
                <div className="flex items-center gap-2 text-[#F5BC43]">
                  <ShieldAlert className="w-5 h-5" />
                  <h4 className="text-sm font-bold text-white">Low Calorie Intake Warning</h4>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Your prescribed daily intake falls near or below your standard safe floor ({standardFloor} kcal/day). Extreme caloric deficits can lead to metabolic adaptation, micronutrient deficiencies, and fatigue.
                </p>
                <div className="p-3 bg-[#18191E] border border-[#24262E] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-gray-400">Target Calorie Intake:</span>
                  <span className="text-lg font-bold font-mono text-white tabular-nums">
                    {recommendedBaseCalories.toLocaleString()} kcal/day
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#1C1D22] border border-[#272930] cursor-pointer">
                <input
                  type="checkbox"
                  checked={floorAcknowledged}
                  onChange={(e) => setFloorAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded text-[#43AA71] focus:ring-0"
                />
                <span className="text-xs text-gray-200">
                  I understand the risks of pursuing a low-calorie intake and wish to proceed.
                </span>
              </label>
            </div>
          )}

          {/* COACHED STEP 8: Coached Program Result (Section 4.2.8) */}
          {programStyle === 'coached' && coachedStep === 8 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Weekly Average Banner */}
              <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8E8E93]">Daily Average Target</span>
                  <div className="text-2xl font-bold font-mono text-white mt-0.5 tabular-nums">
                    {recommendedBaseCalories.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-[#8E8E93]">kcal/day</span>
                  </div>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#23242A] border border-[#2E3038] text-gray-300 capitalize">
                  {dietStyle.replace('_', ' ')} · {proteinTier} Protein
                </span>
              </div>

              {/* 7-Day Day Column Matrix */}
              <div className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold block">
                  7-Day Targets Schedule
                </span>
                <div className="grid grid-cols-7 gap-1.5">
                  {coached7DaySchedule.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className={`rounded-xl p-2 text-center border transition-all ${
                        day.isHigher
                          ? 'bg-[#23242A] border-[#43AA71] text-white shadow-sm'
                          : 'bg-[#121316] border-[#24262E] text-gray-300'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold text-[#8E8E93]">{day.dayName}</div>
                      <div className="text-xs font-bold font-mono text-white mt-1 tabular-nums">
                        {day.calories.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-[#43AA71] font-mono mt-0.5">{day.macros.proteinGrams}P</div>
                      <div className="text-[9px] text-gray-400 font-mono">{day.macros.fatGrams}F·{day.macros.carbGrams}C</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notice Callout */}
              <div className="p-3.5 rounded-xl bg-[#18191E] border border-[#24262E] text-xs text-[#8E8E93] leading-relaxed">
                Targets will automatically adjust next week based on your check-in and ongoing expenditure.
              </div>
            </div>
          )}

          {/* COLLABORATIVE SETUP (Section 4.3 Screen 3) */}
          {programStyle === 'collaborative' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Weekly Budget Locked Banner */}
              <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#8E8E93]" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#8E8E93]">Weekly Calorie Budget</span>
                    <div className="text-xl font-bold font-mono text-white mt-0.5 tabular-nums">
                      {weeklyCalorieBudget.toLocaleString()} <span className="text-xs text-[#8E8E93]">kcal/week</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-[#8E8E93]">Remaining</span>
                  <div
                    className={`text-sm font-bold font-mono tabular-nums ${
                      isCollaborativeBalanced
                        ? 'text-[#43AA71]'
                        : collaborativeRemaining > 0
                        ? 'text-[#F5BC43]'
                        : 'text-rose-400'
                    }`}
                  >
                    {collaborativeRemaining > 0 ? `+${collaborativeRemaining}` : collaborativeRemaining} kcal
                  </div>
                </div>
              </div>

              {/* 7 Expandable Day Cards with Steppers */}
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold block">
                  Daily Calorie Allocation
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {collaborativeDays.map((day, idx) => (
                    <div
                      key={day.dayOfWeek}
                      className="bg-[#18191E] border border-[#24262E] rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 text-xs font-bold text-[#8E8E93] uppercase">{DAY_LABELS[day.dayOfWeek]}</span>
                        <div className="text-sm font-bold font-mono text-white tabular-nums">
                          {day.calories.toLocaleString()} <span className="text-xs font-normal text-[#8E8E93]">kcal</span>
                        </div>
                        <span className="text-xs font-mono text-gray-400 ml-2">
                          ({day.protein}P · {day.fat}F · {day.carbs}C)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCollaborativeCalories(idx, -50)}
                          className="w-8 h-8 rounded-lg bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white flex items-center justify-center transition-all active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCollaborativeCalories(idx, 50)}
                          className="w-8 h-8 rounded-lg bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white flex items-center justify-center transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* MANUAL SETUP (Section 4.4 Screen 4) */}
          {programStyle === 'manual' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Editor Choice Toggle */}
              <div className="flex rounded-xl bg-[#121316] p-1 border border-[#24262E]">
                <button
                  type="button"
                  onClick={() => setManualMode('same')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    manualMode === 'same'
                      ? 'bg-[#23242A] text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Same Every Day
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode('different')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    manualMode === 'different'
                      ? 'bg-[#23242A] text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Different Each Day
                </button>
              </div>

              {manualMode === 'same' ? (
                <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Calories (kcal)</label>
                      <input
                        type="number"
                        value={manualSameDay.calories}
                        onChange={(e) => setManualSameDay({ ...manualSameDay, calories: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#121316] border border-[#24262E] focus:border-[#43AA71] rounded-xl px-3 py-2 text-white font-mono font-bold text-sm outline-none tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Protein (g)</label>
                      <input
                        type="number"
                        value={manualSameDay.protein}
                        onChange={(e) => setManualSameDay({ ...manualSameDay, protein: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#121316] border border-[#24262E] focus:border-[#43AA71] rounded-xl px-3 py-2 text-white font-mono font-bold text-sm outline-none tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Fat (g)</label>
                      <input
                        type="number"
                        value={manualSameDay.fat}
                        onChange={(e) => setManualSameDay({ ...manualSameDay, fat: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#121316] border border-[#24262E] focus:border-[#43AA71] rounded-xl px-3 py-2 text-white font-mono font-bold text-sm outline-none tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Carbs (g)</label>
                      <input
                        type="number"
                        value={manualSameDay.carbs}
                        onChange={(e) => setManualSameDay({ ...manualSameDay, carbs: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#121316] border border-[#24262E] focus:border-[#43AA71] rounded-xl px-3 py-2 text-white font-mono font-bold text-sm outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#24262E] text-xs text-[#8E8E93] flex justify-between">
                    <span>Macro Calorie Sum:</span>
                    <span className="font-mono font-bold text-white tabular-nums">
                      {manualSameDay.protein * 4 + manualSameDay.fat * 9 + manualSameDay.carbs * 4} kcal
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {manualDifferentDays.map((d, idx) => (
                    <div key={d.dayOfWeek} className="bg-[#18191E] border border-[#24262E] rounded-xl p-3 flex items-center justify-between">
                      <span className="w-10 text-xs font-bold text-[#8E8E93] uppercase">{DAY_LABELS[d.dayOfWeek]}</span>
                      <input
                        type="number"
                        value={d.calories}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setManualDifferentDays((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], calories: val };
                            return n;
                          });
                        }}
                        className="w-24 bg-[#121316] border border-[#24262E] focus:border-[#43AA71] rounded-lg px-2 py-1 text-center font-mono font-bold text-xs text-white"
                      />
                      <span className="text-xs text-gray-400">kcal</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#272930] bg-[#16171B] flex items-center justify-between">
          <button
            type="button"
            onClick={
              programStyle === 'coached'
                ? handleCoachedBack
                : () => setProgramStyle('coached')
            }
            className="px-4 py-2 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#23242A] text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{programStyle === 'coached' && coachedStep === 1 ? 'Cancel' : 'Back'}</span>
          </button>

          {programStyle === 'coached' && coachedStep < 8 ? (
            <button
              type="button"
              onClick={handleCoachedNext}
              className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || (programStyle === 'collaborative' && !isCollaborativeBalanced)}
              onClick={handleCommitProgram}
              className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
            >
              {saving ? (
                <span>Starting Program...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Start Program</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

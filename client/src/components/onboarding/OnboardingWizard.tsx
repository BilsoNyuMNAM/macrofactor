import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  Calendar,
  Flame,
  Dumbbell,
  Award,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Anchor,
  Clock,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import {
  BiologicalSex,
  ActivityLevel,
  ExperienceLevel,
  CardioLevel,
  GoalType,
  calculateAge,
  calculateInitialTDEE,
  solveGoalParameters,
  redistributeShiftedCalories,
  LIFESTYLE_PAL,
} from '../../utils/onboardingMath';
import { calculateMacros, ProteinTier, DietStyle, PROTEIN_TIERS, DIET_STYLES } from '../../utils/macroMath';
import { triggerGoalCelebration } from '../../utils/confetti';
import { api } from '../../api';
import { setUserOnboarding, seedUserInitialLog } from '../../utils/userContext';

interface OnboardingWizardProps {
  userEmail?: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  userEmail,
  onComplete,
  onCancel,
}) => {
  // --- FORM STATE ---
  const [isFastLane, setIsFastLane] = useState<boolean>(false);
  const [birthDate, setBirthDate] = useState<string>('1998-05-15');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>('male');
  const [heightCm, setHeightCm] = useState<number>(178);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft_in'>('cm');
  const [weightKg, setWeightKg] = useState<number>(78.0);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs' | 'st'>('kg');
  const [bodyFatPercent, setBodyFatPercent] = useState<number | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('mostlySedentary');

  // Deep questions (skipped in fast lane)
  const [exerciseDays, setExerciseDays] = useState<number>(3);
  const [strengthExperience, setStrengthExperience] = useState<ExperienceLevel>('intermediate');
  const [cardioLevel, setCardioLevel] = useState<CardioLevel>('moderate');
  const [isAthlete, setIsAthlete] = useState<boolean>(false);
  const [lifetimeHistory, setLifetimeHistory] = useState<string>('stable');

  // Manual TDEE override
  const [manualTdee, setManualTdee] = useState<number | null>(null);
  const [isManualTdeeOpen, setIsManualTdeeOpen] = useState<boolean>(false);

  // Module 2: Goal
  const [goalType, setGoalType] = useState<GoalType>('weight_loss');
  const [targetWeightKg, setTargetWeightKg] = useState<number>(74.0);
  const [goalRatePercent, setGoalRatePercent] = useState<number>(-0.50);

  // Module 3: Program
  const [programStyle, setProgramStyle] = useState<'coached' | 'collaborative' | 'manual'>('coached');
  const [proteinTier, setProteinTier] = useState<ProteinTier>('moderate');
  const [dietStyle, setDietStyle] = useState<DietStyle>('balanced');
  const [distributionMode, setDistributionMode] = useState<'flat' | 'shifted'>('flat');
  const [higherCalorieDays, setHigherCalorieDays] = useState<number[]>([5, 6]); // Fri & Sat
  const [higherCalorieSurplus, setHigherCalorieSurplus] = useState<number>(300);

  // Module 4: Education Slide Index (0 to 3)
  const [eduSlide, setEduSlide] = useState<number>(0);

  // --- WIZARD NAVIGATION STEP POINTER ---
  // Steps list:
  // 0: FastLaneStep
  // 1: BirthdayStep
  // 2: SexStep
  // 3: HeightStep
  // 4: WeightStep
  // 5: BodyCompositionStep
  // 6: ActivityStep
  // 7: ExerciseStep (conditional)
  // 8: StrengthExperienceStep (conditional)
  // 9: CardioExperienceStep (conditional)
  // 10: AthleteOptionsStep (conditional)
  // 11: LifetimeWeightStep (conditional)
  // 12: InitialExpenditureStep (TDEE Result & Solver)
  // 13: GoalTypeStep
  // 14: GoalWeightRateStep
  // 15: GoalSummaryStep
  // 16: ProgramStyleStep
  // 17: ProteinPreferenceStep
  // 18: PreferredDietStep & HigherCalorieDaysStep
  // 19: CalorieFloorStep & CoachedResultStep
  // 20: EducationTour (Slides 1-4)
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Restore draft state from localStorage if available
  useEffect(() => {
    try {
      const draft = localStorage.getItem('mf_onboarding_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.birthDate) setBirthDate(parsed.birthDate);
        if (parsed.biologicalSex) setBiologicalSex(parsed.biologicalSex);
        if (parsed.heightCm) setHeightCm(parsed.heightCm);
        if (parsed.weightKg) setWeightKg(parsed.weightKg);
        if (parsed.weightUnit) setWeightUnit(parsed.weightUnit);
        if (parsed.bodyFatPercent !== undefined) setBodyFatPercent(parsed.bodyFatPercent);
        if (parsed.activityLevel) setActivityLevel(parsed.activityLevel);
        if (parsed.goalType) setGoalType(parsed.goalType);
        if (parsed.targetWeightKg) setTargetWeightKg(parsed.targetWeightKg);
        if (parsed.goalRatePercent) setGoalRatePercent(parsed.goalRatePercent);
        if (parsed.proteinTier) setProteinTier(parsed.proteinTier);
        if (parsed.dietStyle) setDietStyle(parsed.dietStyle);
      } else {
        const effectiveEmail = userEmail || localStorage.getItem('mf_user_email');
        if (effectiveEmail) {
          const key = `mf_user_onboarding_${effectiveEmail.trim().toLowerCase()}`;
          const savedRaw = localStorage.getItem(key) || localStorage.getItem('mf_user_onboarding');
          if (savedRaw) {
            const saved = JSON.parse(savedRaw);
            if (saved.birthDate) setBirthDate(saved.birthDate);
            if (saved.biologicalSex) setBiologicalSex(saved.biologicalSex);
            if (saved.heightCm) setHeightCm(saved.heightCm);
            if (saved.startingWeightKg) setWeightKg(saved.startingWeightKg);
            if (saved.weightUnit) setWeightUnit(saved.weightUnit);
            if (saved.goal?.goalType) setGoalType(saved.goal.goalType);
            if (saved.goal?.targetWeightKg !== undefined) setTargetWeightKg(saved.goal.targetWeightKg);
            if (saved.goal?.weeklyRatePercent !== undefined) setGoalRatePercent(saved.goal.weeklyRatePercent);
            if (saved.program?.programStyle) setProgramStyle(saved.program.programStyle);
            if (saved.program?.proteinTier) setProteinTier(saved.program.proteinTier);
            if (saved.program?.dietStyle) setDietStyle(saved.program.dietStyle);
          }
        }
      }
    } catch {
      // ignore draft parse error
    }
  }, [userEmail]);

  // Save draft state
  const saveDraft = () => {
    try {
      localStorage.setItem(
        'mf_onboarding_draft',
        JSON.stringify({
          birthDate,
          biologicalSex,
          heightCm,
          weightKg,
          weightUnit,
          bodyFatPercent,
          activityLevel,
          goalType,
          targetWeightKg,
          goalRatePercent,
          proteinTier,
          dietStyle,
        })
      );
    } catch {
      // ignore
    }
  };

  // --- DYNAMIC CALCULATIONS ---
  const age = useMemo(() => calculateAge(birthDate), [birthDate]);

  const tdeeCalc = useMemo(() => {
    return calculateInitialTDEE({
      birthDate,
      biologicalSex,
      heightCm,
      weightKg,
      bodyFatPercent,
      activityLevel,
      isAthlete,
      exerciseFrequencyDays: exerciseDays,
      strengthExperience,
      cardioLevel,
      isFastLane,
    });
  }, [
    birthDate,
    biologicalSex,
    heightCm,
    weightKg,
    bodyFatPercent,
    activityLevel,
    isAthlete,
    exerciseDays,
    strengthExperience,
    cardioLevel,
    isFastLane,
  ]);

  const activeTdee = manualTdee || tdeeCalc.calculatedTdee;

  const goalParams = useMemo(() => {
    return solveGoalParameters(
      goalType,
      weightKg,
      goalType === 'maintenance' ? weightKg : targetWeightKg,
      goalRatePercent,
      activeTdee,
      biologicalSex
    );
  }, [goalType, weightKg, targetWeightKg, goalRatePercent, activeTdee, biologicalSex]);

  const finalTargetCalories = goalParams.prescribedCalories;

  const distribution = useMemo(() => {
    if (distributionMode === 'flat') {
      return { dailyTargets: new Array(7).fill(finalTargetCalories), higherCalorieSurplus: 0 };
    }
    return redistributeShiftedCalories(finalTargetCalories, higherCalorieDays, higherCalorieSurplus);
  }, [distributionMode, finalTargetCalories, higherCalorieDays, higherCalorieSurplus]);

  const sampleMacros = useMemo(() => {
    return calculateMacros(finalTargetCalories, weightKg, dietStyle, proteinTier);
  }, [finalTargetCalories, weightKg, dietStyle, proteinTier]);

  // Step flow definition
  const stepFlow = useMemo(() => {
    const list: string[] = [
      'fast_lane',
      'birthday',
      'sex',
      'height',
      'weight',
      'body_fat',
      'activity',
    ];

    if (!isFastLane) {
      list.push('exercise');
      list.push('strength');
      list.push('cardio');
      list.push('athlete');
      list.push('lifetime_weight');
    }

    list.push('expenditure');
    list.push('goal_type');
    list.push('goal_rate');
    list.push('goal_summary');
    list.push('program_style');
    list.push('protein');
    list.push('diet_distribution');
    list.push('program_result');
    list.push('education_tour');

    return list;
  }, [isFastLane]);

  const currentStepName = stepFlow[currentStepIndex] || 'fast_lane';
  const totalSteps = stepFlow.length;

  const goNext = () => {
    saveDraft();
    setErrorMessage(null);

    // Validation checks per step
    if (currentStepName === 'birthday') {
      if (age < 18) {
        setErrorMessage('MacroFactor coaching requires users to be at least 18 years of age.');
        return;
      }
    }

    if (currentStepName === 'goal_rate') {
      if (goalType === 'weight_loss' && targetWeightKg >= weightKg) {
        setErrorMessage('Target weight for weight loss must be lower than your current scale weight.');
        return;
      }
      if (goalType === 'weight_gain' && targetWeightKg <= weightKg) {
        setErrorMessage('Target weight for weight gain must be higher than your current scale weight.');
        return;
      }
    }

    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const goBack = () => {
    setErrorMessage(null);
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  // Finalize onboarding
  const handleFinalize = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const effectiveEmail = userEmail || localStorage.getItem('mf_user_email') || '';
      const onboardingPayload = {
        email: effectiveEmail,
        biologicalSex,
        birthDate,
        heightCm,
        startingWeightKg: weightKg,
        baselineTdee: activeTdee,
        weightUnit,
        goal: {
          goalType,
          targetWeightKg: goalType === 'maintenance' ? null : targetWeightKg,
          weeklyRatePercent: goalRatePercent,
        },
        program: {
          programStyle,
          dietStyle,
          proteinTier,
          targetCalories: finalTargetCalories,
          higherCalorieDays: distributionMode === 'shifted' ? higherCalorieDays : [],
          higherCalorieSurplus: distributionMode === 'shifted' ? higherCalorieSurplus : 0,
        },
      };

      await api.completeOnboarding(onboardingPayload);

      triggerGoalCelebration();
      localStorage.setItem('isOnboardingComplete', 'true');
      if (effectiveEmail) {
        setUserOnboarding(effectiveEmail, onboardingPayload);
        seedUserInitialLog(effectiveEmail, weightKg, activeTdee);
      }
      localStorage.setItem('mf_user_onboarding', JSON.stringify(onboardingPayload));
      localStorage.removeItem('mf_onboarding_draft');
      onComplete();
    } catch (err: any) {
      console.error('Finalize error:', err);
      setErrorMessage(err?.message || 'Failed to complete setup. Please check connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- RENDER CURRENT STEP ---
  return (
    <div className="min-h-screen bg-[#0E0F12] text-white flex flex-col justify-between selection:bg-[#FF8660]/30 animate-in fade-in duration-200">
      {/* Top App Bar & Progress Bar */}
      <header className="sticky top-0 z-20 bg-[#0E0F12]/95 backdrop-blur border-b border-[#24262E]/50 px-4 sm:px-6 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={goBack}
            className="p-2 -ml-2 rounded-full text-gray-400 hover:text-white hover:bg-[#18191E] transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          {/* Module / Step counter badge */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF8660] bg-[#FF8660]/10 px-2.5 py-0.5 rounded-full border border-[#FF8660]/20 font-mono">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>

          <div className="w-8" />
        </div>

        {/* Linear Progress Bar */}
        <div className="max-w-xl mx-auto mt-2 h-1 bg-[#1F1F1F] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#FF8660] to-[#E6532B] transition-all duration-300 ease-out"
            style={{ width: `${((currentStepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </header>

      {/* Main Step Body */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-between">
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-[#DE5B5D]/15 border border-[#DE5B5D]/30 flex items-start gap-2.5 text-xs text-red-200 animate-in fade-in duration-150">
            <AlertTriangle className="w-4 h-4 text-[#DE5B5D] shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: FastLaneStep */}
        {currentStepName === 'fast_lane' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Setup Experience
              </span>
              <h2 className="text-2xl font-extrabold text-white">How would you like to build your profile?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Choose between MacroFactor's comprehensive metabolic questionnaire or an express streamlined setup.
              </p>
            </div>

            <div className="space-y-3.5 pt-2">
              <button
                type="button"
                onClick={() => setIsFastLane(false)}
                className={`w-full text-left p-5 rounded-2xl border transition-all ${
                  !isFastLane
                    ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                    : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FF8660]/15 text-[#FF8660] flex items-center justify-center font-bold">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Standard Setup (Recommended)</h3>
                      <span className="text-[11px] text-[#43AA71] font-semibold">Takes ~3 minutes</span>
                    </div>
                  </div>
                  {!isFastLane && <Check className="w-5 h-5 text-[#FF8660]" />}
                </div>
                <p className="text-xs text-[#8E8E93] mt-3 leading-relaxed">
                  Answers our full research-backed questionnaire across biometrics, resistance training experience, and activity to formulate the most accurate cold-start expenditure.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsFastLane(true)}
                className={`w-full text-left p-5 rounded-2xl border transition-all ${
                  isFastLane
                    ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                    : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#4D74FF]/15 text-[#4D74FF] flex items-center justify-center font-bold">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Fast Lane</h3>
                      <span className="text-[11px] text-[#4D74FF] font-semibold">Takes ~1 minute</span>
                    </div>
                  </div>
                  {isFastLane && <Check className="w-5 h-5 text-[#FF8660]" />}
                </div>
                <p className="text-xs text-[#8E8E93] mt-3 leading-relaxed">
                  Answers only the 5 essential physiological questions. MacroFactor's adaptive algorithm will automatically calibrate in the background over your first 2–3 weeks of logging.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: BirthdayStep */}
        {currentStepName === 'birthday' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Biometrics
              </span>
              <h2 className="text-2xl font-extrabold text-white">When were you born?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Your age is essential for evaluating your basal metabolic rate (BMR) and hormonal metabolic decline curves.
              </p>
            </div>

            <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3 text-gray-300">
                <Calendar className="w-5 h-5 text-[#FF8660]" />
                <span className="text-xs font-semibold">Date of Birth</span>
              </div>

              <input
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-[#121316] border border-[#24262E] focus:border-[#FF8660] rounded-xl px-4 py-3.5 text-base text-white outline-none font-mono transition-all"
              />

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[#8E8E93]">Calculated Age:</span>
                <span className="font-bold text-white font-mono text-sm">{age} years old</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: SexStep */}
        {currentStepName === 'sex' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Biometrics
              </span>
              <h2 className="text-2xl font-extrabold text-white">What is your biological sex?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Used strictly for physiological metabolic baseline equations (BMR) and sex-adjusted nutritional safety floors.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => setBiologicalSex('male')}
                className={`p-6 rounded-2xl border text-center transition-all flex flex-col items-center gap-3 ${
                  biologicalSex === 'male'
                    ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                    : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#23242A] border border-[#2E3038] flex items-center justify-center text-lg font-bold">
                  ♂
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Male</h3>
                  <span className="text-[10px] text-[#43AA71] font-semibold mt-1 block">
                    ≥ 1,500 kcal safety floor
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setBiologicalSex('female')}
                className={`p-6 rounded-2xl border text-center transition-all flex flex-col items-center gap-3 ${
                  biologicalSex === 'female'
                    ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                    : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#23242A] border border-[#2E3038] flex items-center justify-center text-lg font-bold">
                  ♀
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Female</h3>
                  <span className="text-[10px] text-[#43AA71] font-semibold mt-1 block">
                    ≥ 1,200 kcal safety floor
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: HeightStep */}
        {currentStepName === 'height' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Biometrics
              </span>
              <h2 className="text-2xl font-extrabold text-white">How tall are you?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Height establishes your lean tissue volumetric scale for metabolic expenditure.
              </p>
            </div>

            <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 space-y-5">
              {/* Unit Toggle */}
              <div className="flex justify-center">
                <div className="inline-flex p-1 bg-[#121316] border border-[#24262E] rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setHeightUnit('cm')}
                    className={`px-4 py-1.5 rounded-lg transition-all ${
                      heightUnit === 'cm' ? 'bg-[#FF8660] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Centimeters (cm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeightUnit('ft_in')}
                    className={`px-4 py-1.5 rounded-lg transition-all ${
                      heightUnit === 'ft_in' ? 'bg-[#FF8660] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Feet & Inches (ft/in)
                  </button>
                </div>
              </div>

              {/* Height Display & Slider */}
              <div className="text-center py-4">
                <div className="text-4xl font-extrabold font-mono text-white tracking-tight">
                  {heightUnit === 'cm' ? (
                    <>
                      {heightCm} <span className="text-sm font-normal text-[#8E8E93]">cm</span>
                    </>
                  ) : (
                    <>
                      {Math.floor(heightCm / 30.48)}′ {Math.round((heightCm % 30.48) / 2.54)}″
                    </>
                  )}
                </div>
              </div>

              <input
                type="range"
                min={120}
                max={225}
                step={1}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                className="w-full accent-[#FF8660] h-2 bg-[#121316] rounded-lg cursor-pointer"
              />

              <div className="flex justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>120 cm (3′11″)</span>
                <span>175 cm (5′9″)</span>
                <span>225 cm (7′5″)</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: WeightStep */}
        {currentStepName === 'weight' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Baseline Scale Weight
              </span>
              <h2 className="text-2xl font-extrabold text-white">What is your morning scale weight?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Weigh yourself in the morning right after waking up for optimal consistency. This seeds your baseline trend weight.
              </p>
            </div>

            <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 space-y-5">
              {/* Unit Toggle */}
              <div className="flex justify-center">
                <div className="inline-flex p-1 bg-[#121316] border border-[#24262E] rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setWeightUnit('kg')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      weightUnit === 'kg' ? 'bg-[#FF8660] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit('lbs')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      weightUnit === 'lbs' ? 'bg-[#FF8660] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    lbs
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeightUnit('st')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      weightUnit === 'st' ? 'bg-[#FF8660] text-white shadow-sm' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    stone
                  </button>
                </div>
              </div>

              {/* Weight Display */}
              <div className="text-center py-4">
                <div className="text-4xl font-extrabold font-mono text-white tracking-tight">
                  {weightUnit === 'kg' && (
                    <>
                      {weightKg.toFixed(1)} <span className="text-sm font-normal text-[#8E8E93]">kg</span>
                    </>
                  )}
                  {weightUnit === 'lbs' && (
                    <>
                      {(weightKg * 2.20462).toFixed(1)} <span className="text-sm font-normal text-[#8E8E93]">lbs</span>
                    </>
                  )}
                  {weightUnit === 'st' && (
                    <>
                      {Math.floor((weightKg * 2.20462) / 14)} st {((weightKg * 2.20462) % 14).toFixed(1)} lbs
                    </>
                  )}
                </div>
              </div>

              <input
                type="range"
                min={40}
                max={180}
                step={0.1}
                value={weightKg}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setWeightKg(val);
                  // Update target weight default if it was out of sync
                  if (goalType === 'weight_loss' && targetWeightKg >= val) {
                    setTargetWeightKg(Number((val - 4).toFixed(1)));
                  }
                }}
                className="w-full accent-[#FF8660] h-2 bg-[#121316] rounded-lg cursor-pointer"
              />

              <div className="flex justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>40 kg (88 lbs)</span>
                <span>80 kg (176 lbs)</span>
                <span>180 kg (396 lbs)</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: BodyCompositionStep */}
        {currentStepName === 'body_fat' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Body Composition
              </span>
              <h2 className="text-2xl font-extrabold text-white">Estimate your body fat percentage</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Refines lean tissue modeling using the Cunningham equation. If unsure, tap "Skip / I don't know" to activate demographic BMR modeling.
              </p>
            </div>

            {/* Physique Tiles Grid */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {(biologicalSex === 'male'
                ? [
                    { label: '< 10%', value: 8, subtitle: 'Very Lean / Shreaded' },
                    { label: '10–14%', value: 12, subtitle: 'Athletic / Visible Abs' },
                    { label: '15–19%', value: 17, subtitle: 'Fit / Normal' },
                    { label: '20–24%', value: 22, subtitle: 'Moderate' },
                    { label: '25–29%', value: 27, subtitle: 'Above Average' },
                    { label: '30%+', value: 32, subtitle: 'Heavy' },
                  ]
                : [
                    { label: '< 18%', value: 16, subtitle: 'Very Lean / Athletic' },
                    { label: '18–22%', value: 20, subtitle: 'Fit / Defined' },
                    { label: '23–27%', value: 25, subtitle: 'Healthy / Normal' },
                    { label: '28–32%', value: 30, subtitle: 'Moderate' },
                    { label: '33–37%', value: 35, subtitle: 'Above Average' },
                    { label: '38%+', value: 40, subtitle: 'Heavy' },
                  ]
              ).map((tile) => (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => setBodyFatPercent(tile.value)}
                  className={`p-3.5 rounded-xl border text-center transition-all flex flex-col justify-center items-center ${
                    bodyFatPercent === tile.value
                      ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                      : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                  }`}
                >
                  <span className="text-base font-extrabold text-white font-mono">{tile.label}</span>
                  <span className="text-[10px] text-[#8E8E93] mt-1 line-clamp-1">{tile.subtitle}</span>
                </button>
              ))}
            </div>

            {/* Custom Entry or Skip */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setBodyFatPercent(null)}
                className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-all ${
                  bodyFatPercent === null
                    ? 'bg-[#18191E] border-[#43AA71] text-[#43AA71]'
                    : 'border-[#24262E] text-gray-400 hover:text-white'
                }`}
              >
                Skip / I don't know (Demographic Fallback)
              </button>

              {bodyFatPercent !== null && (
                <span className="text-xs text-[#8E8E93] font-mono">Selected: {bodyFatPercent}%</span>
              )}
            </div>
          </div>
        )}

        {/* STEP 7: ActivityStep */}
        {currentStepName === 'activity' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Lifestyle Movement
              </span>
              <h2 className="text-2xl font-extrabold text-white">Describe your typical non-exercise movement</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Exclude intentional gym sessions or cardio. Focus strictly on your job, commute, and daily lifestyle steps.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {(['sedentary', 'mostlySedentary', 'moderatelyActive', 'veryActive'] as ActivityLevel[]).map(
                (level) => {
                  const pal = LIFESTYLE_PAL[level];
                  const isSelected = activityLevel === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setActivityLevel(level)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                          : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{pal.label}</h3>
                          <span className="text-[11px] text-[#FF8660] font-mono">({pal.multiplier}x BMR)</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono px-2 py-0.5 rounded bg-[#121316] border border-[#24262E]">
                          {pal.steps}
                        </span>
                      </div>
                      <p className="text-xs text-[#8E8E93] mt-1.5">{pal.desc}</p>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* STEP 8: ExerciseStep (Skipped in Fast Lane) */}
        {currentStepName === 'exercise' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Exercise Schedule
              </span>
              <h2 className="text-2xl font-extrabold text-white">How many days a week do you work out?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Includes lifting, running, group fitness, sports, or intentional physical training.
              </p>
            </div>

            <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 space-y-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#FF8660]/15 text-[#FF8660] flex items-center justify-center mx-auto">
                <Dumbbell className="w-7 h-7" />
              </div>
              <div className="text-4xl font-extrabold font-mono text-white">
                {exerciseDays} <span className="text-base font-normal text-[#8E8E93]">days / week</span>
              </div>
              <input
                type="range"
                min={0}
                max={7}
                step={1}
                value={exerciseDays}
                onChange={(e) => setExerciseDays(Number(e.target.value))}
                className="w-full accent-[#FF8660] h-2 bg-[#121316] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>0 days</span>
                <span>3–4 days</span>
                <span>7 days</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 9: StrengthExperienceStep (Skipped in Fast Lane) */}
        {currentStepName === 'strength' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Resistance Training
              </span>
              <h2 className="text-2xl font-extrabold text-white">What is your lifting experience?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Consistent resistance training elevates metabolic work and cellular tissue density.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {[
                { id: 'beginner', label: 'Beginner', time: '< 1 year', delta: '+0.04 PAL', desc: 'New to progressive resistance training or lifting infrequently.' },
                { id: 'intermediate', label: 'Intermediate', time: '1 – 4 years', delta: '+0.06 PAL', desc: 'Consistent structured lifting routines with continuous overload.' },
                { id: 'advanced', label: 'Advanced', time: '4+ years', delta: '+0.08 PAL', desc: 'Multiple years of dedicated bodybuilding, powerlifting, or strength training.' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStrengthExperience(item.id as ExperienceLevel)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    strengthExperience === item.id
                      ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                      : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{item.label}</h3>
                    <span className="text-[11px] text-[#43AA71] font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs text-[#8E8E93] mt-1">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 10: CardioExperienceStep (Skipped in Fast Lane) */}
        {currentStepName === 'cardio' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Aerobic Training
              </span>
              <h2 className="text-2xl font-extrabold text-white">How much cardio do you perform?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Planned cardiovascular sessions (running, cycling, swimming, rowing).
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {[
                { id: 'low', label: 'Low Cardio', time: '< 60 min / week', delta: '+0.03 PAL', desc: 'Light warmups or occasional cardio bouts.' },
                { id: 'moderate', label: 'Moderate Cardio', time: '60 – 180 min / week', delta: '+0.06 PAL', desc: 'Regular zone 2 or steady-state aerobic conditioning.' },
                { id: 'high', label: 'High Cardio', time: '> 180 min / week', delta: '+0.10 PAL', desc: 'Endurance athletes, marathon/triathlon training, high-volume cycling.' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCardioLevel(item.id as CardioLevel)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    cardioLevel === item.id
                      ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                      : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{item.label}</h3>
                    <span className="text-[11px] text-[#4D74FF] font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs text-[#8E8E93] mt-1">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 11: AthleteOptionsStep (Skipped in Fast Lane) */}
        {currentStepName === 'athlete' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Metabolic Classification
              </span>
              <h2 className="text-2xl font-extrabold text-white">Are you a competitive or intense athlete?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                MacroFactor's research team identified a consistent +6% elevated basal metabolic rate in high-level athletes due to increased organ work and muscular density.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAthlete(!isAthlete)}
              className={`w-full text-left p-5 rounded-2xl border transition-all ${
                isAthlete
                  ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                  : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#F5BC43]/15 text-[#F5BC43] flex items-center justify-center font-bold">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Enable Athlete Coefficient (+6% BMR)</h3>
                    <span className="text-[11px] text-[#8E8E93]">For varsity, competitive, or high-volume athletes</span>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                    isAthlete ? 'bg-[#FF8660] border-[#FF8660] text-white' : 'border-[#4B4B4B]'
                  }`}
                >
                  {isAthlete && <Check className="w-3.5 h-3.5" />}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* STEP 12: LifetimeWeightStep (Skipped in Fast Lane) */}
        {currentStepName === 'lifetime_weight' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Weight History
              </span>
              <h2 className="text-2xl font-extrabold text-white">What is your recent weight history?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Helps configure the Kalman filter trend weighting prior for smoothing daily water fluctuations.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {[
                { id: 'stable', label: 'Relatively Stable', desc: 'Weight has fluctuated by less than 2 kg over the past 3 months.' },
                { id: 'gaining', label: 'Recently Gained Weight', desc: 'Weight has increased noticeably over recent months.' },
                { id: 'losing', label: 'Recently Lost Weight', desc: 'Currently in a weight loss phase or recently dieted.' },
                { id: 'fluctuating', label: 'High Volatility', desc: 'Weight fluctuates widely due to travel, diet breaks, or water retention.' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLifetimeHistory(item.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    lifetimeHistory === item.id
                      ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                      : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                  }`}
                >
                  <h3 className="text-sm font-bold text-white">{item.label}</h3>
                  <p className="text-xs text-[#8E8E93] mt-1">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 14: InitialExpenditureStep (TDEE Result & Solver) */}
        {currentStepName === 'expenditure' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5 text-center">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Initial Metabolic Estimate
              </span>
              <h2 className="text-2xl font-extrabold text-white">Your Estimated Expenditure</h2>
              <p className="text-xs text-[#8E8E93] max-w-sm mx-auto leading-relaxed">
                Synthesized through MacroFactor's 2024 physiological research model.
              </p>
            </div>

            {/* Circular Hero Animated Dial */}
            <div className="bg-[#18191E] border border-[#24262E] rounded-3xl p-6 text-center space-y-4 shadow-xl">
              <div className="relative w-44 h-44 mx-auto flex flex-col items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#1F1F1F"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="url(#expenditureGrad)"
                    strokeWidth="8"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * Math.min(activeTdee, 4000)) / 4000}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="expenditureGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FF8660" />
                      <stop offset="100%" stopColor="#E6532B" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                    {activeTdee.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-[#8E8E93] font-medium uppercase tracking-wider">
                    kcal / day
                  </span>
                </div>
              </div>

              {/* Equation breakdown badges */}
              <div className="grid grid-cols-2 gap-3 pt-2 text-left">
                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                  <span className="text-[10px] text-[#8E8E93] uppercase font-semibold block">
                    Basal Metabolic Rate
                  </span>
                  <span className="text-sm font-bold text-white font-mono">{tdeeCalc.bmr} kcal</span>
                  <span className="text-[10px] text-gray-500 block capitalize">
                    {tdeeCalc.equationUsed.replace('_', ' ')}
                  </span>
                </div>

                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                  <span className="text-[10px] text-[#8E8E93] uppercase font-semibold block">
                    Total Multiplier
                  </span>
                  <span className="text-sm font-bold text-white font-mono">{tdeeCalc.totalMultiplier}x</span>
                  <span className="text-[10px] text-gray-500 block">
                    Lifestyle + Exercise
                  </span>
                </div>
              </div>

              {/* Manual Override Action */}
              <div className="pt-2">
                {!isManualTdeeOpen ? (
                  <button
                    type="button"
                    onClick={() => setIsManualTdeeOpen(true)}
                    className="text-xs text-[#FF8660] hover:underline font-semibold"
                  >
                    I know my expenditure (Manual Override)
                  </button>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-[#24262E] animate-in fade-in">
                    <label className="block text-xs text-gray-300 font-semibold">
                      Enter Custom Expenditure (kcal/day)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="e.g. 2400"
                        value={manualTdee ?? ''}
                        onChange={(e) => setManualTdee(e.target.value ? parseInt(e.target.value, 10) : null)}
                        className="flex-1 bg-[#121316] border border-[#24262E] focus:border-[#FF8660] rounded-xl px-3 py-2 text-sm text-white font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setManualTdee(null);
                          setIsManualTdeeOpen(false);
                        }}
                        className="px-3 py-2 text-xs bg-[#24262E] text-gray-300 rounded-xl hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 13: GoalTypeStep */}
        {currentStepName === 'goal_type' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Goal Objective
              </span>
              <h2 className="text-2xl font-extrabold text-white">What is your primary weight goal?</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Choose the metabolic direction for your coached nutritional targets.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              {[
                {
                  id: 'weight_loss',
                  title: 'Lose Weight (Cut)',
                  icon: TrendingDown,
                  color: '#4D74FF',
                  desc: 'Target a lower scale and trend weight through an evidence-based calorie deficit.',
                },
                {
                  id: 'maintenance',
                  title: 'Maintain Weight',
                  icon: Anchor,
                  color: '#43AA71',
                  desc: 'Keep your scale weight stable while tracking metabolic expenditure and body recomposition.',
                },
                {
                  id: 'weight_gain',
                  title: 'Gain Weight (Bulk)',
                  icon: TrendingUp,
                  color: '#F5BC43',
                  desc: 'Target a higher scale weight with a controlled calorie surplus to maximize lean muscle accretion.',
                },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = goalType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setGoalType(item.id as GoalType);
                      if (item.id === 'weight_loss') {
                        setGoalRatePercent(-0.50);
                        if (targetWeightKg >= weightKg) setTargetWeightKg(Number((weightKg - 4).toFixed(1)));
                      } else if (item.id === 'weight_gain') {
                        setGoalRatePercent(0.30);
                        if (targetWeightKg <= weightKg) setTargetWeightKg(Number((weightKg + 4).toFixed(1)));
                      } else {
                        setGoalRatePercent(0);
                        setTargetWeightKg(weightKg);
                      }
                    }}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex items-start gap-4 ${
                      isSelected
                        ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                        : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                    }`}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${item.color}20`, color: item.color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">{item.title}</h3>
                        {isSelected && <Check className="w-4 h-4 text-[#FF8660]" />}
                      </div>
                      <p className="text-xs text-[#8E8E93] leading-relaxed">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 14: GoalWeightRateStep */}
        {currentStepName === 'goal_rate' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Rate of Weight Change
              </span>
              <h2 className="text-2xl font-extrabold text-white">
                {goalType === 'maintenance' ? 'Confirm Maintenance Goal' : 'Configure Target Weight & Weekly Rate'}
              </h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                MacroFactor standardizes rate of change as % of body weight per week (% BW/wk) for metabolic safety.
              </p>
            </div>

            {/* Target Weight Field */}
            {goalType !== 'maintenance' ? (
              <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-gray-300">Target Weight</label>
                  <span className="text-xs text-[#8E8E93] font-mono">
                    Current: {weightKg.toFixed(1)} kg
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={targetWeightKg}
                    onChange={(e) => setTargetWeightKg(Number(e.target.value))}
                    className="flex-1 bg-[#121316] border border-[#24262E] focus:border-[#FF8660] rounded-xl px-4 py-3 text-xl text-white font-mono font-bold outline-none"
                  />
                  <span className="text-sm font-bold text-gray-400 font-mono">kg</span>
                </div>
              </div>
            ) : (
              <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-5 text-center space-y-1">
                <span className="text-xs text-[#8E8E93]">Maintenance Target</span>
                <div className="text-2xl font-bold font-mono text-white">{weightKg.toFixed(1)} kg</div>
                <span className="text-[11px] text-[#43AA71]">Zero caloric deficit or surplus</span>
              </div>
            )}

            {/* Rate Slider (if not maintenance) */}
            {goalType !== 'maintenance' && (
              <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-300">Weekly Rate of Change</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-bold font-mono text-white">
                        {goalRatePercent > 0 ? `+${goalRatePercent.toFixed(2)}` : goalRatePercent.toFixed(2)}% BW/wk
                      </span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          goalParams.zoneBand === 'standard'
                            ? 'bg-[#43AA71]/15 text-[#43AA71] border border-[#43AA71]/30'
                            : goalParams.zoneBand === 'conservative'
                            ? 'bg-[#4D74FF]/15 text-[#4D74FF] border border-[#4D74FF]/30'
                            : 'bg-[#F5BC43]/15 text-[#F5BC43] border border-[#F5BC43]/30'
                        }`}
                      >
                        {goalParams.zoneBand}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[#8E8E93] block">Weekly Rate</span>
                    <span className="text-sm font-bold font-mono text-white">
                      {goalParams.weeklyRateKg.toFixed(2)} kg/wk
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min={goalType === 'weight_loss' ? -1.5 : 0.1}
                  max={goalType === 'weight_loss' ? -0.1 : 0.75}
                  step={0.05}
                  value={goalRatePercent}
                  onChange={(e) => setGoalRatePercent(Number(e.target.value))}
                  className="w-full accent-[#FF8660] h-2 bg-[#121316] rounded-lg cursor-pointer"
                />

                <div className="flex justify-between text-[11px] text-[#8E8E93] font-mono">
                  <span>{goalType === 'weight_loss' ? '-1.5% (Aggressive)' : '+0.1% (Conservative)'}</span>
                  <span>{goalType === 'weight_loss' ? '-0.5% (Recommended)' : '+0.3% (Recommended)'}</span>
                  <span>{goalType === 'weight_loss' ? '-0.1% (Slow)' : '+0.75% (Aggressive)'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 15: GoalSummaryStep */}
        {currentStepName === 'goal_summary' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Projection Overview
              </span>
              <h2 className="text-2xl font-extrabold text-white">Goal & Milestone Projection</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Adherence-neutral mathematical forecast based on your biological biometrics and chosen rate.
              </p>
            </div>

            <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-[#24262E]">
                <span className="text-xs text-[#8E8E93]">Weight Trajectory</span>
                <span className="text-sm font-bold font-mono text-white">
                  {weightKg.toFixed(1)} kg → {goalType === 'maintenance' ? weightKg.toFixed(1) : targetWeightKg.toFixed(1)} kg
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3.5">
                  <span className="text-[11px] text-[#8E8E93] font-medium">Daily Energy Delta</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {goalType === 'maintenance'
                      ? '0 kcal'
                      : `${goalType === 'weight_loss' ? '-' : '+'}${goalParams.dailyDeltaKcal} kcal/day`}
                  </div>
                </div>

                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3.5">
                  <span className="text-[11px] text-[#8E8E93] font-medium">Target Daily Calories</span>
                  <div className="text-xl font-bold font-mono text-white mt-1">
                    {goalParams.prescribedCalories.toLocaleString()} <span className="text-xs font-normal text-gray-400">kcal</span>
                  </div>
                </div>
              </div>

              {goalType !== 'maintenance' && (
                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs text-[#8E8E93] font-medium">Estimated Milestone Arrival</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {goalParams.estimatedDate}
                    </div>
                  </div>
                  <span className="text-xs text-[#43AA71] font-mono font-bold bg-[#43AA71]/15 px-2.5 py-1 rounded-full border border-[#43AA71]/30">
                    ~{goalParams.durationWeeks} weeks
                  </span>
                </div>
              )}

              {/* Safety Calorie Floor Notice */}
              {goalParams.isBelowCalorieFloor && (
                <div className="p-3.5 rounded-xl bg-[#F5BC43]/15 border border-[#F5BC43]/30 text-xs text-yellow-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-[#F5BC43]" />
                    <span>Biological Calorie Floor Safeguard Active</span>
                  </div>
                  <p className="text-[11px] text-yellow-300 leading-relaxed">
                    Your aggressive rate calculated a calorie budget below your biological floor ({goalParams.calorieFloor} kcal). MacroFactor has automatically clamped your target to protect hormone and metabolic health.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 16: ProgramStyleStep */}
        {currentStepName === 'program_style' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Program Architecture
              </span>
              <h2 className="text-2xl font-extrabold text-white">Select your program coaching style</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Defines how much hands-on control MacroFactor exercises over your weekly macronutrients.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              {[
                {
                  id: 'coached',
                  title: 'Coached (Recommended)',
                  desc: 'MacroFactor calculates your calories, protein, carbs, and fat, and updates them automatically at weekly check-in.',
                },
                {
                  id: 'collaborative',
                  title: 'Collaborative',
                  desc: 'MacroFactor strictly manages your weekly calorie budget, while you customize daily macronutrient ratios.',
                },
                {
                  id: 'manual',
                  title: 'Manual',
                  desc: 'You enter your own static targets. MacroFactor tracks expenditure and progress without modifying your numbers.',
                },
              ].map((item) => {
                const isSelected = programStyle === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProgramStyle(item.id as any)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                        : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">{item.title}</h3>
                      {isSelected && <Check className="w-5 h-5 text-[#FF8660]" />}
                    </div>
                    <p className="text-xs text-[#8E8E93] mt-2 leading-relaxed">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 17: ProteinPreferenceStep */}
        {currentStepName === 'protein' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Macronutrient Partitioning
              </span>
              <h2 className="text-2xl font-extrabold text-white">Select your protein preference</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Higher protein preserves lean muscle tissue during a caloric deficit and maximizes fullness.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {(['low', 'moderate', 'high', 'extra_high'] as ProteinTier[]).map((tier) => {
                const info = PROTEIN_TIERS[tier];
                const grams = Math.round(weightKg * info.perKg);
                const isSelected = proteinTier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setProteinTier(tier)}
                    className={`w-full text-left p-4.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[#18191E] border-[#43AA71] ring-1 ring-[#43AA71]'
                        : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">{info.label}</h3>
                      </div>
                      <span className="text-xs font-bold text-[#43AA71] font-mono">
                        {grams} g/day ({grams * 4} kcal)
                      </span>
                    </div>
                    <p className="text-xs text-[#8E8E93] mt-1.5">{info.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 18: PreferredDietStep & HigherCalorieDaysStep */}
        {currentStepName === 'diet_distribution' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Dietary Architecture
              </span>
              <h2 className="text-2xl font-extrabold text-white">Preferred Diet & Day Distribution</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Choose your macronutrient balance and whether to keep daily calories even or shifted higher on weekends.
              </p>
            </div>

            {/* Diet Style Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300">Diet Style</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['balanced', 'low_fat', 'low_carb', 'keto'] as DietStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setDietStyle(style)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      dietStyle === style
                        ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                        : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                    }`}
                  >
                    <span className="text-xs font-bold text-white block">{DIET_STYLES[style].label}</span>
                    <span className="text-[10px] text-[#8E8E93] line-clamp-1 mt-0.5">
                      {DIET_STYLES[style].subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Calorie Distribution Mode */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-gray-300">7-Day Calorie Distribution</label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDistributionMode('flat')}
                  className={`p-3.5 rounded-xl border text-center transition-all ${
                    distributionMode === 'flat'
                      ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                      : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                  }`}
                >
                  <span className="text-xs font-bold text-white block">Even / Flat</span>
                  <span className="text-[10px] text-[#8E8E93] mt-0.5 block">Same calories every day</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDistributionMode('shifted')}
                  className={`p-3.5 rounded-xl border text-center transition-all ${
                    distributionMode === 'shifted'
                      ? 'bg-[#18191E] border-[#FF8660] ring-1 ring-[#FF8660]'
                      : 'bg-[#18191E] border-[#24262E] hover:border-[#383B46]'
                  }`}
                >
                  <span className="text-xs font-bold text-white block">Shifted / High Days</span>
                  <span className="text-[10px] text-[#8E8E93] mt-0.5 block">Higher weekends / training</span>
                </button>
              </div>

              {/* Day Chips if Shifted */}
              {distributionMode === 'shifted' && (
                <div className="p-4 rounded-xl bg-[#18191E] border border-[#24262E] space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-[11px] text-[#8E8E93]">
                    <span>Tap to mark higher calorie days:</span>
                    <div className="flex items-center gap-1 font-mono">
                      {[200, 300, 400, 500].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setHigherCalorieSurplus(s)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            higherCalorieSurplus === s
                              ? 'bg-[#FF8660] text-white shadow-sm'
                              : 'bg-[#121316] border border-[#24262E] text-gray-400 hover:text-white'
                          }`}
                        >
                          +{s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, idx) => {
                      const isHigh = higherCalorieDays.includes(idx);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            if (isHigh) {
                              setHigherCalorieDays(higherCalorieDays.filter((d) => d !== idx));
                            } else {
                              setHigherCalorieDays([...higherCalorieDays, idx]);
                            }
                          }}
                          className={`py-2 rounded-lg text-xs font-bold font-mono transition-all ${
                            isHigh
                              ? 'bg-[#FF8660] text-white shadow-sm'
                              : 'bg-[#121316] text-gray-400 border border-[#24262E]'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 19: CalorieFloorStep & CoachedResultStep */}
        {currentStepName === 'program_result' && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold tracking-wider text-[#FF8660] uppercase font-mono">
                Program Review
              </span>
              <h2 className="text-2xl font-extrabold text-white">Your 7-Day Nutrition Plan</h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                Locked weekly budget configured to preserve steady metabolic progress without dietary whiplash.
              </p>
            </div>

            {/* Macro Summary Tile */}
            <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#24262E]">
                <div>
                  <span className="text-xs text-[#8E8E93]">Average Target</span>
                  <div className="text-2xl font-bold font-mono text-white mt-0.5">
                    {finalTargetCalories.toLocaleString()} <span className="text-xs font-normal text-gray-400">kcal/day</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#FF8660] bg-[#FF8660]/10 px-3 py-1 rounded-full border border-[#FF8660]/20 capitalize">
                  {programStyle} • {DIET_STYLES[dietStyle].label}
                </span>
              </div>

              {/* Macro Trio */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                  <span className="text-[10px] text-[#43AA71] font-bold uppercase tracking-wider block">
                    Protein
                  </span>
                  <span className="text-lg font-bold font-mono text-white block mt-0.5">
                    {sampleMacros.proteinGrams}g
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{sampleMacros.proteinPercent}%</span>
                </div>

                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                  <span className="text-[10px] text-[#F5BC43] font-bold uppercase tracking-wider block">
                    Fat
                  </span>
                  <span className="text-lg font-bold font-mono text-white block mt-0.5">
                    {sampleMacros.fatGrams}g
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{sampleMacros.fatPercent}%</span>
                </div>

                <div className="bg-[#121316] border border-[#24262E] rounded-xl p-3">
                  <span className="text-[10px] text-[#4D74FF] font-bold uppercase tracking-wider block">
                    Carbs
                  </span>
                  <span className="text-lg font-bold font-mono text-white block mt-0.5">
                    {sampleMacros.carbGrams}g
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{sampleMacros.carbPercent}%</span>
                </div>
              </div>

              {/* 7-Day Day Chips Grid */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider block">
                  7-Day Distribution
                </span>
                <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px]">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, idx) => (
                    <div
                      key={name}
                      className={`py-2 rounded-lg border ${
                        distribution.dailyTargets[idx] > finalTargetCalories
                          ? 'bg-[#FF8660]/15 border-[#FF8660]/40 text-[#FF8660]'
                          : 'bg-[#121316] border-[#24262E] text-gray-300'
                      }`}
                    >
                      <span className="block text-[9px] text-[#8E8E93] uppercase">{name}</span>
                      <span className="font-bold">{distribution.dailyTargets[idx]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 20: EducationTour (4 Slides) */}
        {currentStepName === 'education_tour' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Slide 1: WelcomeStep */}
            {eduSlide === 0 && (
              <div className="space-y-5 text-center py-6 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FF8660] to-[#E6532B] text-white flex items-center justify-center mx-auto shadow-xl shadow-[#FF8660]/20">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-white">Welcome to Your Plan</h2>
                  <p className="text-xs text-[#8E8E93] max-w-md mx-auto leading-relaxed">
                    Your baseline targets are ready. Before entering your dashboard, take 30 seconds to learn the three core principles that make MacroFactor unique.
                  </p>
                </div>
              </div>
            )}

            {/* Slide 2: ModulesExplainedStep */}
            {eduSlide === 1 && (
              <div className="space-y-5 text-center py-6 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-[#FF8660]/15 text-[#FF8660] border border-[#FF8660]/30 flex items-center justify-center mx-auto shadow-xl">
                  <Flame className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-white">The Dynamic Expenditure Engine</h2>
                  <p className="text-xs text-[#8E8E93] max-w-md mx-auto leading-relaxed">
                    MacroFactor is a closed-loop thermodynamic solver. Unlike static calorie calculators that guess your expenditure once and stay wrong, MacroFactor learns your true metabolism from your food and weight logs.
                  </p>
                </div>
              </div>
            )}

            {/* Slide 3: CheckinAnatomyStep */}
            {eduSlide === 2 && (
              <div className="space-y-5 text-center py-6 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-[#7262D4]/15 text-[#7262D4] border border-[#7262D4]/30 flex items-center justify-center mx-auto shadow-xl">
                  <Calendar className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-white">Weekly Check-Ins & 7-Day Locks</h2>
                  <p className="text-xs text-[#8E8E93] max-w-md mx-auto leading-relaxed">
                    Every week, the coach evaluates your rate of progress and expenditure trends. Your calorie and macro targets remain firmly locked for 7 days between check-ins to prevent grocery and meal planning whiplash.
                  </p>
                </div>
              </div>
            )}

            {/* Slide 4: StayOnTrackStep */}
            {eduSlide === 3 && (
              <div className="space-y-5 text-center py-6 animate-in fade-in">
                <div className="w-16 h-16 rounded-3xl bg-[#43AA71]/15 text-[#43AA71] border border-[#43AA71]/30 flex items-center justify-center mx-auto shadow-xl">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-white">Adherence Neutrality</h2>
                  <p className="text-xs text-[#8E8E93] max-w-md mx-auto leading-relaxed">
                    Missed a target or ate over budget? MacroFactor never displays red numbers or scolds you. Data is empirical input, not guilt. Log accurately so the coach can continuously optimize your results.
                  </p>
                </div>
              </div>
            )}

            {/* Carousel Dots */}
            <div className="flex justify-center items-center gap-2 pt-4">
              {[0, 1, 2, 3].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setEduSlide(idx)}
                  className={`h-2 rounded-full transition-all ${
                    eduSlide === idx ? 'w-6 bg-[#FF8660]' : 'w-2 bg-[#2E3038]'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer Navigation Buttons */}
      <footer className="sticky bottom-0 bg-[#0E0F12]/95 backdrop-blur border-t border-[#24262E]/50 px-4 sm:px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          {currentStepName === 'education_tour' ? (
            eduSlide < 3 ? (
              <button
                type="button"
                onClick={() => setEduSlide((prev) => prev + 1)}
                className="w-full py-4 rounded-full bg-gradient-to-r from-[#FF8660] to-[#E6532B] hover:opacity-95 active:scale-[0.99] transition-all text-white font-bold text-sm shadow-xl shadow-[#FF8660]/20 flex items-center justify-center gap-2"
              >
                <span>Continue Tour</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleFinalize}
                className="w-full py-4 rounded-full bg-gradient-to-r from-[#43AA71] to-[#36885a] hover:opacity-95 active:scale-[0.99] transition-all text-white font-bold text-sm shadow-xl shadow-[#43AA71]/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Let's Go! — Enter Dashboard</span>
                    <Sparkles className="w-4 h-4" />
                  </>
                )}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="w-full py-4 rounded-full bg-gradient-to-r from-[#FF8660] to-[#E6532B] hover:opacity-95 active:scale-[0.99] transition-all text-white font-bold text-sm shadow-xl shadow-[#FF8660]/20 flex items-center justify-center gap-2"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

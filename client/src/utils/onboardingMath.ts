/**
 * MacroFactor Physiological & Metabolic Calculation Engine
 * Reverse-engineered from MacroFactor production binary (features/newaccount.md Section 2)
 */

export type BiologicalSex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'mostlySedentary' | 'moderatelyActive' | 'veryActive';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type CardioLevel = 'low' | 'moderate' | 'high';
export type GoalType = 'weight_loss' | 'maintenance' | 'weight_gain';

export interface BiometricsInput {
  birthDate: string; // YYYY-MM-DD
  biologicalSex: BiologicalSex;
  heightCm: number;
  weightKg: number;
  bodyFatPercent?: number | null;
  activityLevel: ActivityLevel;
  isAthlete?: boolean;
  exerciseFrequencyDays?: number;
  strengthExperience?: ExperienceLevel;
  cardioLevel?: CardioLevel;
  isFastLane?: boolean;
}

export interface BmrResult {
  bmr: number;
  equationUsed: 'cunningham' | 'mifflin_st_jeor';
  leanBodyMassKg?: number;
  athleteBoostKcal: number;
}

export interface TdeeResult {
  bmr: number;
  equationUsed: 'cunningham' | 'mifflin_st_jeor';
  lifestyleMultiplier: number;
  exerciseDelta: number;
  totalMultiplier: number;
  calculatedTdee: number;
}

export const LIFESTYLE_PAL: Record<ActivityLevel, { multiplier: number; label: string; steps: string; desc: string }> = {
  sedentary: {
    multiplier: 1.20,
    label: 'Sedentary',
    steps: '< 3,000 steps',
    desc: 'Desk job, driving, minimal daily walking or movement.',
  },
  mostlySedentary: {
    multiplier: 1.35,
    label: 'Mostly Sedentary',
    steps: '3,000 – 6,000 steps',
    desc: 'Desk work with occasional walking, light errands, or standing breaks.',
  },
  moderatelyActive: {
    multiplier: 1.50,
    label: 'Moderately Active',
    steps: '6,000 – 10,000 steps',
    desc: 'Standing job, retail, teaching, nursing, or regular active daily transit.',
  },
  veryActive: {
    multiplier: 1.70,
    label: 'Very Active',
    steps: '> 10,000 steps',
    desc: 'Heavy manual labor, construction, agricultural work, or courier transit.',
  },
};

export const BIOLOGICAL_FLOORS: Record<BiologicalSex, number> = {
  male: 1500,
  female: 1200,
};

/**
 * Calculate chronological age from ISO birthdate string
 */
export function calculateAge(birthDateStr: string): number {
  if (!birthDateStr) return 25;
  const parts = birthDateStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return 25;
  const birth = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * 2.1 Basal Metabolic Rate (BMR) Solver
 * If body fat % is provided: Cunningham Equation (lean mass driven)
 * If body fat % is omitted: Mifflin-St Jeor demographic equation
 * If athlete flag is true: apply +6% athletic metabolic coefficient
 */
export function calculateBMR(
  sex: BiologicalSex,
  weightKg: number,
  heightCm: number,
  age: number,
  bodyFatPercent?: number | null,
  isAthlete: boolean = false
): BmrResult {
  const safeWeight = Math.max(30, weightKg);
  const safeHeight = Math.max(100, heightCm);
  const safeAge = Math.max(18, age);

  let bmrBase = 0;
  let equation: 'cunningham' | 'mifflin_st_jeor' = 'mifflin_st_jeor';
  let lbm: number | undefined = undefined;

  if (bodyFatPercent !== null && bodyFatPercent !== undefined && bodyFatPercent > 3 && bodyFatPercent < 60) {
    equation = 'cunningham';
    lbm = safeWeight * (1 - bodyFatPercent / 100);
    bmrBase = 500 + 22 * lbm;
  } else {
    equation = 'mifflin_st_jeor';
    if (sex === 'male') {
      bmrBase = 10 * safeWeight + 6.25 * safeHeight - 5 * safeAge + 5;
    } else {
      bmrBase = 10 * safeWeight + 6.25 * safeHeight - 5 * safeAge - 161;
    }
  }

  const athleteBoost = isAthlete ? bmrBase * 0.06 : 0;
  const finalBmr = Math.round(bmrBase + athleteBoost);

  return {
    bmr: finalBmr,
    equationUsed: equation,
    leanBodyMassKg: lbm ? Number(lbm.toFixed(1)) : undefined,
    athleteBoostKcal: Math.round(athleteBoost),
  };
}

/**
 * 2.2 Physical Activity Level (PAL) & Initial TDEE Solver
 */
export function calculateInitialTDEE(input: BiometricsInput): TdeeResult {
  const age = calculateAge(input.birthDate);
  const bmrRes = calculateBMR(
    input.biologicalSex,
    input.weightKg,
    input.heightCm,
    age,
    input.bodyFatPercent,
    input.isAthlete
  );

  const lifestylePal = LIFESTYLE_PAL[input.activityLevel]?.multiplier ?? 1.35;

  let exerciseDelta = 0;
  if (input.isFastLane) {
    // Fast Lane: standard moderate baseline activity add-on
    exerciseDelta = 0.05;
  } else {
    // Strength experience delta
    if (input.strengthExperience === 'beginner') exerciseDelta += 0.04;
    else if (input.strengthExperience === 'intermediate') exerciseDelta += 0.06;
    else if (input.strengthExperience === 'advanced') exerciseDelta += 0.08;

    // Cardio experience delta
    if (input.cardioLevel === 'low') exerciseDelta += 0.03;
    else if (input.cardioLevel === 'moderate') exerciseDelta += 0.06;
    else if (input.cardioLevel === 'high') exerciseDelta += 0.10;
  }

  const totalMultiplier = Number((lifestylePal + exerciseDelta).toFixed(2));
  const calculatedTdee = Math.round(bmrRes.bmr * totalMultiplier);

  return {
    bmr: bmrRes.bmr,
    equationUsed: bmrRes.equationUsed,
    lifestyleMultiplier: lifestylePal,
    exerciseDelta: Number(exerciseDelta.toFixed(2)),
    totalMultiplier,
    calculatedTdee,
  };
}

/**
 * 2.3 & 2.4 Goal Rate, Deficit/Surplus & ETA Solver
 */
export interface GoalCalculationResult {
  weeklyRateKg: number;
  dailyDeltaKcal: number;
  targetCalories: number;
  prescribedCalories: number;
  isBelowCalorieFloor: boolean;
  calorieFloor: number;
  totalDeltaKg: number;
  durationWeeks: number;
  estimatedDate: string;
  zoneBand: 'conservative' | 'standard' | 'aggressive';
}

export function solveGoalParameters(
  goalType: GoalType,
  currentWeightKg: number,
  targetWeightKg: number | null,
  ratePercent: number, // e.g. -0.50 for -0.50% BW/wk
  tdeeKcal: number,
  sex: BiologicalSex
): GoalCalculationResult {
  const safeWeight = Math.max(30, currentWeightKg);
  const floor = BIOLOGICAL_FLOORS[sex];

  if (goalType === 'maintenance') {
    return {
      weeklyRateKg: 0,
      dailyDeltaKcal: 0,
      targetCalories: tdeeKcal,
      prescribedCalories: Math.max(floor, tdeeKcal),
      isBelowCalorieFloor: tdeeKcal < floor,
      calorieFloor: floor,
      totalDeltaKg: 0,
      durationWeeks: 0,
      estimatedDate: new Date().toISOString().split('T')[0],
      zoneBand: 'standard',
    };
  }

  const absRate = Math.abs(ratePercent);
  const weeklyRateKg = Number(((absRate / 100.0) * safeWeight).toFixed(2));
  // Daily delta = (weeklyRateKg * 7700) / 7 = safeWeight * absRate * 11
  const dailyDeltaKcal = Math.round(safeWeight * absRate * 11);

  let targetCalories = tdeeKcal;
  let zoneBand: 'conservative' | 'standard' | 'aggressive' = 'standard';

  if (goalType === 'weight_loss') {
    targetCalories = tdeeKcal - dailyDeltaKcal;
    if (absRate < 0.40) zoneBand = 'conservative';
    else if (absRate <= 0.79) zoneBand = 'standard';
    else zoneBand = 'aggressive';
  } else {
    // weight_gain
    targetCalories = tdeeKcal + dailyDeltaKcal;
    if (absRate < 0.20) zoneBand = 'conservative';
    else if (absRate <= 0.40) zoneBand = 'standard';
    else zoneBand = 'aggressive';
  }

  const prescribedCalories = Math.max(floor, targetCalories);
  const isBelowCalorieFloor = targetCalories < floor;

  // ETA Calculation
  const targetW = targetWeightKg ?? safeWeight;
  const totalDeltaKg = Number(Math.abs(safeWeight - targetW).toFixed(2));
  const durationWeeks = weeklyRateKg > 0 ? Math.round((totalDeltaKg / weeklyRateKg) * 10) / 10 : 0;
  const totalDays = Math.round(durationWeeks * 7);

  const etaDate = new Date();
  etaDate.setDate(etaDate.getDate() + totalDays);
  const estimatedDate = etaDate.toISOString().split('T')[0];

  return {
    weeklyRateKg,
    dailyDeltaKcal,
    targetCalories,
    prescribedCalories,
    isBelowCalorieFloor,
    calorieFloor: floor,
    totalDeltaKg,
    durationWeeks,
    estimatedDate,
    zoneBand,
  };
}

/**
 * 2.6 Shifted 7-Day Calorie Redistribution
 * Invariant: Sum(dailyCalories) === 7 * targetCalories
 */
export function redistributeShiftedCalories(
  targetCalories: number,
  higherCalorieDays: number[], // 0 = Sun, 1 = Mon ... 6 = Sat
  surplusKcal: number = 300
): { dailyTargets: number[]; higherCalorieSurplus: number } {
  const weeklyBudget = targetCalories * 7;
  const result = new Array(7).fill(targetCalories);

  if (higherCalorieDays.length === 0 || higherCalorieDays.length >= 7) {
    return { dailyTargets: result, higherCalorieSurplus: 0 };
  }

  const highTarget = targetCalories + surplusKcal;
  const totalHighBudget = higherCalorieDays.length * highTarget;
  const remainingBudget = weeklyBudget - totalHighBudget;
  const lowCount = 7 - higherCalorieDays.length;
  const lowTarget = Math.round(remainingBudget / lowCount);

  for (let i = 0; i < 7; i++) {
    result[i] = higherCalorieDays.includes(i) ? highTarget : lowTarget;
  }

  // Adjust for any minor rounding difference to strictly satisfy weekly budget invariant
  const sum = result.reduce((acc, c) => acc + c, 0);
  const diff = weeklyBudget - sum;
  if (diff !== 0) {
    // Add diff to the first non-higher day
    const firstLowIndex = result.findIndex((_, idx) => !higherCalorieDays.includes(idx));
    if (firstLowIndex !== -1) {
      result[firstLowIndex] += diff;
    }
  }

  return { dailyTargets: result, higherCalorieSurplus: surplusKcal };
}

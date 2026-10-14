import { prisma } from '../db.js';

export const MACROFACTOR_TREND_ALPHA = 0.13;
export const KCAL_PER_KG_TISSUE_LOSS = 7700.0;
export const KCAL_PER_KG_TISSUE_GAIN = 8500.0;
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface DailyLogInput {
  date: string;              // 'YYYY-MM-DD'
  scaleWeight: number | null;// kg
  calories: number | null;   // kcal
  isFasting?: boolean;       // true = deliberate 0 kcal fast
  isPartial?: boolean;       // true = incomplete day, exclude from TDEE
}

export interface ProcessedDay {
  date: string;
  rawWeight: number | null;
  interpolatedWeight: number;
  trendWeight: number;
  weightVelocityKgPerDay: number;
  rawIntake: number | null;
  isFasting: boolean;
  isValidIntake: boolean;
  tdee: number;
  tdeeDelta: number;
  fluxUpper: number;
  fluxLower: number;
  isHolding: boolean;
  noiseRangeLower: number;
  noiseRangeUpper: number;
}

export interface EngineConfig {
  trendAlpha: number;             // Default: 0.13 (~15-day smoothing)
  tissueDensityKcalPerKg: number; // Default: 7700
  baselineTdee: number;           // Default: 2340
}

export const DEFAULT_CONFIG: EngineConfig = {
  trendAlpha: 0.13,
  tissueDensityKcalPerKg: 7700,
  baselineTdee: 2340
};

export type HorizonStatus = 'Increase' | 'Decrease' | 'Plateau' | 'No Change' | 'Waiting';

export interface HorizonChangeItem {
  horizonDays: number;
  label: string; // '3-day', '7-day', etc.
  isWaiting: boolean;
  weightDeltaFormatted: string; // e.g. "−0.4 kg" or "-- kg"
  weightStatus: HorizonStatus;
  expenditureDeltaFormatted: string; // e.g. "+8 kcal" or "-- kcal"
  expenditureStatus: HorizonStatus;
  sparklineTrendPoints: number[];
  sparklineTdeePoints: number[];
}

export interface HeaderMetricsResult {
  dateRangeSubtitle: string;
  weight: {
    average: number;
    differenceFormatted: string;
    rawDifference: number;
  };
  expenditure: {
    average: number;
    differenceFormatted: string;
    rawDifference: number;
  };
}

export interface TypicalMetricsResult {
  currentTrendWeightKg: number;
  weeklyRateKg: number;
  weeklyRateFormatted: string;
  dailyDeficitKcal: number;
  dailyDeficitFormatted: string;
  projected30dKg: number;
}

export interface NutritionProgramResult {
  calories: number;
  proteinGrams: number;
  proteinCalories: number;
  fatGrams: number;
  fatCalories: number;
  carbGrams: number;
  carbCalories: number;
  dailyDeficitKcal: number;
  weeklyLossRateKg: number;
  weeksToGoal: number;
  estimatedEndDateStr: string;
}

export type CalorieFloorWarning = 'none' | 'standard_floor' | 'low_floor';
export type GoalClassificationBand = 'slow' | 'moderate' | 'fast';

export interface GoalEtaResult {
  etaWeeks: number | null;
  targetDate: string | null;
  totalDeltaKg: number;
  remainingDeltaKg: number;
  percentComplete: number;
}

export interface GoalSummaryProjection {
  currentTrendWeightKg: number;
  targetWeightKg: number | null;
  totalDeltaKg: number;
  remainingDeltaKg: number;
  percentComplete: number;
  weeklyRatePercent: number;
  weeklyRateKg: number;
  dailyDeficitKcal: number;
  projectedTargetCalories: number;
  estimatedWeeks: number | null;
  estimatedCompletionDate: string | null;
  calorieFloorWarning: CalorieFloorWarning;
  classificationBand: GoalClassificationBand;
}

/**
 * Helper to determine if a day has valid intake for TDEE and safeguards
 */
export function isValidIntakeDay(d: DailyLogInput): boolean {
  if (d.isPartial) return false;
  if (d.isFasting) return true;
  return d.calories !== null && d.calories > 0;
}

/**
 * 1. Build a continuous calendar sequence without date gaps from earliest log to latest log.
 */
export function buildContinuousCalendar(logs: DailyLogInput[]): DailyLogInput[] {
  if (logs.length === 0) return [];
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  const map = new Map<string, DailyLogInput>();
  sorted.forEach(l => map.set(l.date, l));

  const start = new Date(sorted[0].date + 'T00:00:00Z');
  const end = new Date(sorted[sorted.length - 1].date + 'T00:00:00Z');
  const continuous: DailyLogInput[] = [];

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().split('T')[0];
    if (map.has(iso)) {
      continuous.push(map.get(iso)!);
    } else {
      continuous.push({ date: iso, scaleWeight: null, calories: null, isFasting: false, isPartial: false });
    }
  }
  return continuous;
}

/**
 * 2. Main MacroFactor Pipeline:
 * - Pass 1: Piecewise linear interpolation for scale weights (gap fill and flat trailing edge)
 * - Pass 2: Exponential moving average (alpha ~ 0.13) with trailing edge hold and velocity decay
 * - Pass 3: Dynamic expenditure engine with 4-of-7 nutrition, 1-of-7 weigh-in, trailing gap safeguards,
 *           and state-space adaptive damping.
 * - Dynamic Flux corridor and noise envelope.
 */
export function executeMacroFactorPipeline(
  rawLogs: DailyLogInput[],
  baselineTdee: number = 2340,
  initialWeightKg: number = 78.0,
  trendAlpha: number = MACROFACTOR_TREND_ALPHA
): ProcessedDay[] {
  const continuous = buildContinuousCalendar(rawLogs);
  if (continuous.length === 0) return [];

  const n = continuous.length;
  const processed: ProcessedDay[] = [];

  // --- PASS 1: PIECEWISE LINEAR INTERPOLATION FOR SCALE WEIGHT ---
  const interpolatedWeights = new Array<number>(n);
  const firstWeightIdx = continuous.findIndex(l => l.scaleWeight !== null && !isNaN(l.scaleWeight));

  if (firstWeightIdx === -1) {
    interpolatedWeights.fill(initialWeightKg);
  } else {
    // Fill backwards from first known weigh-in
    for (let i = 0; i < firstWeightIdx; i++) {
      interpolatedWeights[i] = continuous[firstWeightIdx].scaleWeight!;
    }

    let lastKnownIdx = firstWeightIdx;
    for (let i = firstWeightIdx + 1; i < n; i++) {
      if (continuous[i].scaleWeight !== null && !isNaN(continuous[i].scaleWeight!)) {
        const gap = i - lastKnownIdx;
        const startW = continuous[lastKnownIdx].scaleWeight!;
        const endW = continuous[i].scaleWeight!;
        for (let j = lastKnownIdx; j < i; j++) {
          interpolatedWeights[j] = startW + ((endW - startW) / gap) * (j - lastKnownIdx);
        }
        lastKnownIdx = i;
      }
    }
    // Trailing edge: hold flat from last known weigh-in forward (no unverified velocity extrapolation)
    for (let i = lastKnownIdx; i < n; i++) {
      interpolatedWeights[i] = continuous[lastKnownIdx].scaleWeight!;
    }
  }

  // --- PASS 2: EXPONENTIAL MOVING AVERAGE (EMA) WEIGHT TREND WITH TRAILING EDGE HOLD ---
  let lastActualWeighInIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (continuous[i].scaleWeight !== null && !isNaN(continuous[i].scaleWeight!)) {
      lastActualWeighInIdx = i;
      break;
    }
  }

  let currentTrend = interpolatedWeights[0];
  const trendWeights = new Array<number>(n);
  const velocities = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    // Trailing edge rule (Section 3.1):
    // "If the user has not weighed in today or yesterday, the trend weight holds flat at the last calculated value with decay toward zero velocity."
    const isTrailingEdgeGap = lastActualWeighInIdx !== -1 && (i - lastActualWeighInIdx >= 2);

    if (isTrailingEdgeGap && i > 0) {
      trendWeights[i] = trendWeights[i - 1];
      currentTrend = trendWeights[i];
      velocities[i] = Math.round(velocities[i - 1] * 0.7 * 1000) / 1000;
      if (Math.abs(velocities[i]) < 0.005) velocities[i] = 0;
    } else {
      currentTrend = (trendAlpha * interpolatedWeights[i]) + ((1 - trendAlpha) * currentTrend);
      trendWeights[i] = Math.round(currentTrend * 100) / 100;

      // 7-day velocity span (Section 3.3)
      const lookback = Math.min(i, 7);
      if (lookback === 0) {
        velocities[i] = 0;
      } else {
        velocities[i] = Math.round(((trendWeights[i] - trendWeights[i - lookback]) / lookback) * 1000) / 1000;
      }
    }
  }

  // --- PASS 3: DYNAMIC EXPENDITURE ENGINE WITH MACROFACTOR V3 ADAPTIVE MODEL ---
  let runningTdee = baselineTdee;
  let lastActiveDelta = 0;
  let consecutiveMissingIntake = 0;
  let consecutiveLoggedIntake = 0;
  let inHolding = true; // Cold start starts in holding

  for (let i = 0; i < n; i++) {
    const item = continuous[i];
    const isFasting = !!item.isFasting;
    const isPartial = !!item.isPartial;
    const isValidIntake = isValidIntakeDay(item);

    if (isValidIntake) {
      consecutiveMissingIntake = 0;
      consecutiveLoggedIntake++;
    } else {
      consecutiveMissingIntake++;
      consecutiveLoggedIntake = 0;
    }

    // Evaluate rolling 7 calendar days [i - 6, i] for weigh-in compliance
    const windowStart = Math.max(0, i - 6);
    const windowSlice = continuous.slice(windowStart, i + 1);

    let validIntakeCount = 0;
    let weighInCount = 0;

    windowSlice.forEach(day => {
      if (day.scaleWeight !== null && !isNaN(day.scaleWeight)) {
        weighInCount++;
      }
      if (isValidIntakeDay(day)) {
        validIntakeCount++;
      }
    });

    // MacroFactor V3 Safeguard & Recovery State Machine:
    // 1. Cold start: First 3 days held at baseline while collecting initial observations.
    // 2. Resuming from a Hold (The "3-Day" Recovery Rule):
    //    When in Holding (e.g., following a tracking hiatus), the algorithm requires 3 consecutive
    //    days of complete nutrition logs (consecutiveLoggedIntake >= 3) PLUS at least one scale
    //    weight entry in the rolling 7-day window (weighInCount >= 1) before unpausing.
    // 3. Entering Holding:
    //    Triggered when 7 consecutive days lack intake logs or when weigh-in frequency drops to 0 across the rolling 7-day window.
    const isColdStart = i < 3;
    if (isColdStart) {
      inHolding = true;
    } else if (inHolding) {
      if (consecutiveLoggedIntake >= 3 && weighInCount >= 1) {
        inHolding = false;
      }
    } else {
      if (consecutiveMissingIntake >= 7 || (weighInCount === 0 && i >= 6)) {
        inHolding = true;
      }
    }

    const isHolding = inHolding;

    let delta = 0;
    if (isHolding) {
      delta = 0;
      lastActiveDelta = 0;
      // runningTdee remains constant
      // Coasting / Uncertainty Decay:
      // When intake logging is temporarily missing, MacroFactor does not freeze immediately.
      // It smoothly tapers the last active delta towards zero as information uncertainty increases.
      // Day 1: 1.00, Day 2: 0.70, Day 3: 0.44, Day 4: 0.44, Day 5: 0.18, Day 6: 0.14, Day 7: Holding
      const decayFactors = [1.0, 0.70, 0.44, 0.44, 0.18, 0.14, 0.0];
      const factorIdx = Math.max(0, Math.min(consecutiveMissingIntake - 1, decayFactors.length - 1));
      const factor = decayFactors[factorIdx];
      delta = Math.round(lastActiveDelta * factor);
      runningTdee += delta;
    } else {
      // Rolling intake over a stable window (up to 10-12 days)
      const intakeLookback = continuous.slice(Math.max(0, i - 10), i + 1).filter(isValidIntakeDay);
      const sumCalories = intakeLookback.reduce((sum, d) => sum + (d.isFasting ? 0 : (d.calories ?? 0)), 0);
      const avgIntake = intakeLookback.length > 0 ? (sumCalories / intakeLookback.length) : runningTdee;

      // Effective tissue energy density:
      // Accounts for glycogen and water depletion in early deficit phases (~4500 kcal/kg effective density).
      const effectiveDensity = 4500;
      const dailyFlux = velocities[i] * effectiveDensity;
      const rawDemand = Math.round(avgIntake - dailyFlux);

      const rawGap = rawDemand - runningTdee;

      // Adaptive Gain:
      // Smooth adaptive gain ramping gently from cold-start (0.016) up to mature state (0.035)
      const ramp = Math.min(1.0, i / 25);
      const adaptiveGain = 0.016 + ramp * 0.018;
      delta = Math.round(rawGap * adaptiveGain);

      // Trajectory safety limit (prevents extreme single-day outliers exceeding +-7 kcal)
      delta = Math.max(-7, Math.min(7, delta));

      lastActiveDelta = delta;
      runningTdee += delta;
    }

    // Weight residual variance (RMSE) over 14-day window (Section 4.4)
    const varStart = Math.max(0, i - 13);
    let sqResidualSum = 0;
    let rawWeightCount = 0;
    for (let k = varStart; k <= i; k++) {
      if (continuous[k].scaleWeight !== null && !isNaN(continuous[k].scaleWeight!)) {
        const diff = continuous[k].scaleWeight! - trendWeights[k];
        sqResidualSum += diff * diff;
        rawWeightCount++;
      }
    }
    const weightRmse = rawWeightCount > 0 ? Math.sqrt(sqResidualSum / rawWeightCount) : 0.25;

    // Dynamic Flux Range calculation (Section 4.4):
    // FluxRadius = BaseRadius * (1 + sigma_weight / 0.5) * (7 / N_logged)
    const baseFluxRadius = isHolding ? 60 : 35;
    const weightNoiseFactor = 1 + (weightRmse / 0.5);
    const densityRatio = 7 / Math.max(validIntakeCount, 1);

    let dynamicFluxRadius = Math.round(
      baseFluxRadius * (0.6 + 0.4 * weightNoiseFactor) * (0.7 + 0.3 * (densityRatio / 1.75))
    );
    dynamicFluxRadius = isHolding
      ? Math.max(60, Math.min(140, dynamicFluxRadius))
      : Math.max(30, Math.min(95, dynamicFluxRadius));

    const fluxUpper = runningTdee + dynamicFluxRadius;
    const fluxLower = runningTdee - dynamicFluxRadius;

    const noiseBand = Math.round(Math.max(0.2, Math.min(0.8, weightRmse)) * 10) / 10;
    const noiseRangeLower = Math.round((trendWeights[i] - noiseBand) * 10) / 10;
    const noiseRangeUpper = Math.round((trendWeights[i] + noiseBand) * 10) / 10;

    processed.push({
      date: item.date,
      rawWeight: item.scaleWeight,
      interpolatedWeight: Math.round(interpolatedWeights[i] * 100) / 100,
      trendWeight: trendWeights[i],
      weightVelocityKgPerDay: velocities[i],
      rawIntake: isFasting ? 0 : item.calories,
      isFasting,
      isValidIntake,
      tdee: runningTdee,
      tdeeDelta: delta,
      fluxUpper,
      fluxLower,
      isHolding,
      noiseRangeLower,
      noiseRangeUpper
    });
  }

  return processed;
}

/**
 * 3. Program Solver: Generates locked weekly macro targets according to Section 6.2 & 7.
 */
export function solveWeeklyNutritionProgram(
  latestTdee: number,
  latestTrendWeightKg: number,
  goalRatePercentBwPerWeek: number, // e.g. -0.50 for -0.5% BW loss/week
  targetWeightKg?: number | null,
  biologicalSex: string = 'male',
  proteinGramsPerKg: number = 2.0,
  dietStyle: 'balanced' | 'low_fat' | 'low_carb' | 'keto' = 'balanced'
): NutritionProgramResult {
  // 1. Deficit Calculation
  const weeklyWeightDeltaKg = latestTrendWeightKg * (goalRatePercentBwPerWeek / 100.0);
  const dailyCalorieDeficit = Math.round((weeklyWeightDeltaKg * KCAL_PER_KG_TISSUE_LOSS) / 7.0);

  // 2. Calorie Floor (1,200 kcal for females, 1,500 kcal for males)
  const minFloor = biologicalSex === 'female' ? 1200 : 1500;
  let targetCalories = latestTdee + dailyCalorieDeficit;
  targetCalories = Math.max(minFloor, targetCalories);

  // 3. Protein Allocation
  const proteinGrams = Math.round(latestTrendWeightKg * proteinGramsPerKg);
  const proteinCalories = proteinGrams * 4;

  // 4. Fat Allocation
  let fatPct = 0.27;
  if (dietStyle === 'low_fat') fatPct = 0.20;
  if (dietStyle === 'low_carb') fatPct = 0.45;
  if (dietStyle === 'keto') fatPct = 0.70;

  const minFatGrams = Math.round(latestTrendWeightKg * 0.6); // Essential lipid floor
  let fatGrams = Math.max(minFatGrams, Math.round((targetCalories * fatPct) / 9.0));
  const fatCalories = fatGrams * 9;

  // 5. Carbohydrates (Exact Closure)
  const remainingCals = targetCalories - (proteinCalories + fatCalories);
  const carbGrams = Math.max(0, Math.round(remainingCals / 4.0));
  const carbCalories = carbGrams * 4;

  // Estimated completion date and weeks to goal
  let estimatedEndDateStr = 'N/A';
  let weeksToGoal = 0;
  if (targetWeightKg && weeklyWeightDeltaKg !== 0) {
    const delta = Math.abs(latestTrendWeightKg - targetWeightKg);
    weeksToGoal = delta / Math.abs(weeklyWeightDeltaKg);
    const days = Math.round(weeksToGoal * 7);
    const end = new Date();
    end.setDate(end.getDate() + days);
    estimatedEndDateStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return {
    calories: targetCalories,
    proteinGrams,
    proteinCalories,
    fatGrams,
    fatCalories,
    carbGrams,
    carbCalories,
    dailyDeficitKcal: dailyCalorieDeficit,
    weeklyLossRateKg: Math.abs(weeklyWeightDeltaKg),
    weeksToGoal: Number(weeksToGoal.toFixed(1)),
    estimatedEndDateStr
  };
}

/**
 * Backwards compatibility helper
 */
export function solveCalorieProgram(
  tdee: number,
  goalRatePercent: number,
  currentWeightKg: number,
  goalWeightKg?: number | null,
  biologicalSex: string = 'male'
) {
  const solved = solveWeeklyNutritionProgram(
    tdee,
    currentWeightKg,
    goalRatePercent,
    goalWeightKg,
    biologicalSex
  );
  return {
    targetCalories: solved.calories,
    dailyDeficitKcal: solved.dailyDeficitKcal,
    weeklyLossRateKg: solved.weeklyLossRateKg,
    estimatedEndDateStr: solved.estimatedEndDateStr,
    weeksToGoal: solved.weeksToGoal
  };
}

/**
 * Evaluates whether daily calories drop below physiological floors:
 * Standard floor: 1500 kcal (male) / 1200 kcal (female)
 * Low floor: 1200 kcal (male) / 1000 kcal (female)
 */
export function evaluateCalorieFloors(
  projectedCalories: number,
  biologicalSex: string = 'male'
): CalorieFloorWarning {
  const isFemale = biologicalSex.toLowerCase() === 'female';
  const standardFloor = isFemale ? 1200 : 1500;
  const lowFloor = isFemale ? 1000 : 1200;

  if (projectedCalories < lowFloor) {
    return 'low_floor';
  }
  if (projectedCalories < standardFloor) {
    return 'standard_floor';
  }
  return 'none';
}

/**
 * Calculates projected completion weeks, date, and completion percentage towards goal.
 */
export function calculateGoalEta(
  currentTrendWeightKg: number,
  targetWeightKg: number | null,
  weeklyRateKg: number,
  startTrendWeightKg?: number | null
): GoalEtaResult {
  if (targetWeightKg === null || targetWeightKg === undefined) {
    return {
      etaWeeks: null,
      targetDate: null,
      totalDeltaKg: 0,
      remainingDeltaKg: 0,
      percentComplete: 100
    };
  }

  const remainingDeltaKg = Math.max(0, Number(Math.abs(currentTrendWeightKg - targetWeightKg).toFixed(2)));
  const anchorWeight = (startTrendWeightKg !== null && startTrendWeightKg !== undefined)
    ? startTrendWeightKg
    : currentTrendWeightKg;
  const totalDeltaKg = Number(Math.abs(anchorWeight - targetWeightKg).toFixed(2));

  let percentComplete = 0;
  if (totalDeltaKg <= 0.05) {
    percentComplete = 100;
  } else {
    const progressMade = Math.max(0, totalDeltaKg - remainingDeltaKg);
    percentComplete = Math.min(100, Math.max(0, Math.round((progressMade / totalDeltaKg) * 100)));
  }

  const absRate = Math.abs(weeklyRateKg);
  if (absRate <= 0.001 || remainingDeltaKg === 0) {
    return {
      etaWeeks: remainingDeltaKg === 0 ? 0 : null,
      targetDate: remainingDeltaKg === 0 ? new Date().toISOString().split('T')[0] : null,
      totalDeltaKg,
      remainingDeltaKg,
      percentComplete
    };
  }

  const exactWeeks = remainingDeltaKg / absRate;
  const etaWeeks = Math.ceil(exactWeeks);
  const days = Math.round(exactWeeks * 7);

  const etaDate = new Date();
  etaDate.setDate(etaDate.getDate() + days);
  const targetDate = etaDate.toISOString().split('T')[0];

  return {
    etaWeeks,
    targetDate,
    totalDeltaKg,
    remainingDeltaKg,
    percentComplete
  };
}

/**
 * Solves comprehensive goal metrics, rate velocity, calorie deficit, floor warnings, and projections.
 */
export function solveGoalMetrics(
  currentTdee: number,
  currentTrendWeightKg: number,
  weeklyRatePercent: number,
  targetWeightKg: number | null,
  biologicalSex: string = 'male',
  startTrendWeightKg?: number | null
): GoalSummaryProjection {
  const absRatePct = Math.abs(weeklyRatePercent);
  const weeklyRateKg = Number(((absRatePct / 100.0) * currentTrendWeightKg).toFixed(2));

  let dailyDeficitKcal = 0;
  if (weeklyRatePercent < 0) {
    // Loss
    dailyDeficitKcal = Math.round((weeklyRatePercent / 100.0 * currentTrendWeightKg * KCAL_PER_KG_TISSUE_LOSS) / 7.0);
  } else if (weeklyRatePercent > 0) {
    // Gain
    dailyDeficitKcal = Math.round((weeklyRatePercent / 100.0 * currentTrendWeightKg * KCAL_PER_KG_TISSUE_GAIN) / 7.0);
  }

  const projectedTargetCalories = currentTdee + dailyDeficitKcal;
  const calorieFloorWarning = evaluateCalorieFloors(projectedTargetCalories, biologicalSex);

  let classificationBand: GoalClassificationBand = 'moderate';
  if (absRatePct < 0.50) {
    classificationBand = 'slow';
  } else if (absRatePct <= 0.75) {
    classificationBand = 'moderate';
  } else {
    classificationBand = 'fast';
  }

  const eta = calculateGoalEta(
    currentTrendWeightKg,
    targetWeightKg,
    weeklyRateKg,
    startTrendWeightKg ?? currentTrendWeightKg
  );

  return {
    currentTrendWeightKg,
    targetWeightKg,
    totalDeltaKg: eta.totalDeltaKg,
    remainingDeltaKg: eta.remainingDeltaKg,
    percentComplete: eta.percentComplete,
    weeklyRatePercent,
    weeklyRateKg,
    dailyDeficitKcal,
    projectedTargetCalories,
    estimatedWeeks: eta.etaWeeks,
    estimatedCompletionDate: eta.targetDate,
    calorieFloorWarning,
    classificationBand
  };
}

/**
 * 4. Header Metrics: Computes the "Average" and "Difference" across active timeframes according to Section 6.1.
 */
export function calculateHeaderMetrics(
  processedDays: ProcessedDay[],
  timeframe: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All' = '1W'
): HeaderMetricsResult | null {
  if (processedDays.length === 0) return null;

  const daysMap: Record<string, number> = {
    '1W': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    'All': Infinity
  };
  const span = daysMap[timeframe] || 7;

  const latestDate = new Date(processedDays[processedDays.length - 1].date + 'T00:00:00Z');
  const cutoff = new Date(latestDate);
  if (isFinite(span)) {
    cutoff.setUTCDate(cutoff.getUTCDate() - (span - 1));
  }

  const windowSlice = processedDays.filter(d => new Date(d.date + 'T00:00:00Z') >= cutoff);
  if (windowSlice.length === 0) return null;

  const first = windowSlice[0];
  const last = windowSlice[windowSlice.length - 1];

  // Weight Trend Header
  const sumWeight = windowSlice.reduce((acc, d) => acc + d.trendWeight, 0);
  const avgWeight = Math.round((sumWeight / windowSlice.length) * 10) / 10;
  const rawWeightDiff = Math.round((last.trendWeight - first.trendWeight) * 10) / 10;
  const weightDiffStr = rawWeightDiff > 0
    ? `+${rawWeightDiff.toFixed(1)}`
    : rawWeightDiff < 0
      ? `\u2212${Math.abs(rawWeightDiff).toFixed(1)}`
      : '0.0';

  // Expenditure Header
  const sumTdee = windowSlice.reduce((acc, d) => acc + d.tdee, 0);
  const avgTdee = Math.round(sumTdee / windowSlice.length);
  const rawTdeeDiff = last.tdee - first.tdee;
  const tdeeDiffStr = rawTdeeDiff > 0
    ? `+${rawTdeeDiff}`
    : rawTdeeDiff < 0
      ? `\u2212${Math.abs(rawTdeeDiff)}`
      : '0';

  // Subtitle format: e.g. "28 Sept – 13 Oct 2026"
  const d1 = new Date(first.date + 'T00:00:00Z');
  const d2 = new Date(last.date + 'T00:00:00Z');
  const m1 = d1.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const m2 = d2.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  const y2 = d2.getUTCFullYear();
  const dateRangeSubtitle = m1 === m2
    ? `${d1.getUTCDate()} – ${d2.getUTCDate()} ${m2} ${y2}`
    : `${d1.getUTCDate()} ${m1} – ${d2.getUTCDate()} ${m2} ${y2}`;

  return {
    dateRangeSubtitle,
    weight: {
      average: avgWeight,
      differenceFormatted: `${weightDiffStr} kg`,
      rawDifference: rawWeightDiff
    },
    expenditure: {
      average: avgTdee,
      differenceFormatted: `${tdeeDiffStr} kcal`,
      rawDifference: rawTdeeDiff
    }
  };
}

/**
 * 5. Multi-Horizon Changes (3d, 7d, 14d, 30d, 90d) with Waiting Prerequisites according to Section 6.2.
 */
export function calculateMultiHorizonChanges(processedDays: ProcessedDay[]): HorizonChangeItem[] {
  const horizons = [3, 7, 14, 30, 90];
  if (processedDays.length === 0) return [];

  const latest = processedDays[processedDays.length - 1];
  const earliestDate = new Date(processedDays[0].date + 'T00:00:00Z');
  const latestDate = new Date(latest.date + 'T00:00:00Z');
  const totalCalendarSpanDays = Math.round((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));

  return horizons.map(h => {
    const label = `${h}-day`;
    if (totalCalendarSpanDays < h) {
      return {
        horizonDays: h,
        label,
        isWaiting: true,
        weightDeltaFormatted: '-- kg',
        weightStatus: 'Waiting',
        expenditureDeltaFormatted: '-- kcal',
        expenditureStatus: 'Waiting',
        sparklineTrendPoints: [],
        sparklineTdeePoints: []
      };
    }

  

    const targetDate = new Date(latestDate);
targetDate.setUTCDate(targetDate.getUTCDate() - h);

// Find closest anchor day in history
let anchor = processedDays[0];
let minDiff = Infinity;
for (const d of processedDays) {
  const cur = new Date(d.date + 'T00:00:00Z');
  const diff = Math.abs(cur.getTime() - targetDate.getTime());
  if (diff < minDiff) {
    minDiff = diff;
    anchor = d;
  }
}

    // Weight delta
    const wDelta = Math.round((latest.trendWeight - anchor.trendWeight) * 10) / 10;
    const wStr = wDelta > 0
      ? `+${wDelta.toFixed(1)} kg`
      : wDelta < 0
        ? `\u2212${Math.abs(wDelta).toFixed(1)} kg`
        : '0.0 kg';
    let wStatus: HorizonStatus = 'Plateau';
    if (wDelta <= -0.05) wStatus = 'Decrease';
    else if (wDelta >= 0.05) wStatus = 'Increase';

    // Expenditure delta
    const expDelta = latest.tdee - anchor.tdee;
    const expStr = expDelta > 0
      ? `+${expDelta} kcal`
      : expDelta < 0
        ? `\u2212${Math.abs(expDelta)} kcal`
        : '0 kcal';
    let expStatus: HorizonStatus = 'No Change';
    if (expDelta > 0) expStatus = 'Increase';
    else if (expDelta < 0) expStatus = 'Decrease';

    // Sparkline historical curve slice
    const slice = processedDays.filter(d => {
      const t = new Date(d.date + 'T00:00:00Z');
      return t >= targetDate && t <= latestDate;
    });

    return {
      horizonDays: h,
      label,
      isWaiting: false,
      weightDeltaFormatted: wStr,
      weightStatus: wStatus,
      expenditureDeltaFormatted: expStr,
      expenditureStatus: expStatus,
      sparklineTrendPoints: slice.map(s => s.trendWeight),
      sparklineTdeePoints: slice.map(s => s.tdee)
    };
  });
}

/**
 * 6. Typical Weekly Rate & Energy Deficit (21-Day / 3-Week Anchor) according to Section 6.3.
 */
export function calculate21DayTypicalMetrics(processedDays: ProcessedDay[]): TypicalMetricsResult | null {
  if (processedDays.length < 2) return null;
  const latest = processedDays[processedDays.length - 1];
  const targetDate = new Date(latest.date + 'T00:00:00Z');
  targetDate.setUTCDate(targetDate.getUTCDate() - 21);

  let anchor = processedDays[0];
  for (let i = processedDays.length - 1; i >= 0; i--) {
    if (new Date(processedDays[i].date + 'T00:00:00Z') <= targetDate) {
      anchor = processedDays[i];
      break;
    }
  }

  const d1 = new Date(anchor.date + 'T00:00:00Z');
  const d2 = new Date(latest.date + 'T00:00:00Z');
  const daysDiff = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

  const massDelta = latest.trendWeight - anchor.trendWeight;
  const weeklyRateKg = Math.round(((massDelta / daysDiff) * 7.0) * 100) / 100;
  const dailyDeficitKcal = Math.round((weeklyRateKg * KCAL_PER_KG_TISSUE_LOSS) / 7.0);
  const projected30dKg = Math.round((latest.trendWeight + ((weeklyRateKg / 7.0) * 30.0)) * 10) / 10;

  return {
    currentTrendWeightKg: latest.trendWeight,
    weeklyRateKg,
    weeklyRateFormatted: weeklyRateKg > 0 ? `+${weeklyRateKg.toFixed(2)}` : `\u2212${Math.abs(weeklyRateKg).toFixed(2)}`,
    dailyDeficitKcal,
    dailyDeficitFormatted: dailyDeficitKcal > 0 ? `+${dailyDeficitKcal}` : `\u2212${Math.abs(dailyDeficitKcal)}`,
    projected30dKg
  };
}

/**
 * 7. Re-runs the full MacroFactor pipeline and persists calculations to PostgreSQL:
 */
export async function recalculatePipeline(): Promise<void> {
  // 1. Fetch Profile & Baseline
  let profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
  if (!profile) {
    profile = await prisma.userProfile.create({
      data: {
        id: 1,
        initialWeightKg: 78.0,
        baselineTdee: 2340,
        checkInDay: 1,
        fastCheckIn: false
      }
    });
  }

  // 2. Fetch Scale Weights and Daily Nutrition Rollups
  const scaleEntries = await prisma.scaleWeightEntry.findMany({
    orderBy: { loggedAt: 'asc' }
  });
  const nutritionRollups = await prisma.dailyNutritionRollup.findMany({
    orderBy: { logDate: 'asc' }
  });

  const scaleByDate = new Map<string, number>();
  for (const entry of scaleEntries) {
    scaleByDate.set(entry.logDate, entry.weightKg);
  }

  const nutritionByDate = new Map<string, { totalCalories: number; isFasting: boolean; isPartial: boolean }>();
  for (const rollup of nutritionRollups) {
    nutritionByDate.set(rollup.logDate, {
      totalCalories: rollup.totalCaloriesKcal,
      isFasting: rollup.isFasting,
      isPartial: rollup.isPartial
    });
  }

  // Collect all unique dates
  const allDatesSet = new Set<string>();
  scaleByDate.forEach((_, date) => allDatesSet.add(date));
  nutritionByDate.forEach((_, date) => allDatesSet.add(date));

  const sortedDates = Array.from(allDatesSet).sort(
    (a, b) => a.localeCompare(b)
  );

  if (sortedDates.length === 0) {
    return;
  }

  const rawInputs: DailyLogInput[] = sortedDates.map(date => {
    const nut = nutritionByDate.get(date);
    return {
      date,
      scaleWeight: scaleByDate.get(date) ?? null,
      calories: nut ? nut.totalCalories : null,
      isFasting: nut ? nut.isFasting : false,
      isPartial: nut ? nut.isPartial : false
    };
  });

  const processed = executeMacroFactorPipeline(
    rawInputs,
    profile.baselineTdee || 2340,
    profile.initialWeightKg || 78.0
  );

  // 3. Persist to DB in Upserts
  for (const item of processed) {
    await prisma.weightTrendEntry.upsert({
      where: { logDate: item.date },
      create: {
        logDate: item.date,
        trendWeightKg: item.trendWeight,
        velocityKgPerDay: item.weightVelocityKgPerDay,
        noiseRangeLowerKg: item.noiseRangeLower,
        noiseRangeUpperKg: item.noiseRangeUpper,
        algorithmVersion: 'v2_kalman'
      },
      update: {
        trendWeightKg: item.trendWeight,
        velocityKgPerDay: item.weightVelocityKgPerDay,
        noiseRangeLowerKg: item.noiseRangeLower,
        noiseRangeUpperKg: item.noiseRangeUpper
      }
    });

    await prisma.tdeeEntry.upsert({
      where: { logDate: item.date },
      create: {
        logDate: item.date,
        expenditureKcal: item.tdee,
        status: item.isHolding ? 'holding' : 'updating',
        tdeeDeltaKcal: item.tdeeDelta,
        fluxLowerKcal: item.fluxLower,
        fluxUpperKcal: item.fluxUpper,
        algorithmVersion: 'v3'
      },
      update: {
        expenditureKcal: item.tdee,
        status: item.isHolding ? 'holding' : 'updating',
        tdeeDeltaKcal: item.tdeeDelta,
        fluxLowerKcal: item.fluxLower,
        fluxUpperKcal: item.fluxUpper
      }
    });
  }

  // 4. Ensure active weekly plan exists
  const activePlan = await prisma.weeklyPlan.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  });

  const latestDay = processed[processed.length - 1];
  let activeGoal = await prisma.goal.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' }
  });

  if (!activeGoal) {
    activeGoal = await prisma.goal.create({
      data: {
        goalType: 'fat_loss',
        startWeightKg: profile.initialWeightKg,
        targetWeightKg: 76.0,
        weeklyRatePercent: -0.50,
        weeklyRateKg: 0.39,
        startDate: processed[0].date,
        status: 'active'
      }
    });
  }

  if (!activePlan) {
    const solved = solveWeeklyNutritionProgram(
      latestDay.tdee,
      latestDay.trendWeight,
      activeGoal.weeklyRatePercent,
      activeGoal.targetWeightKg,
      profile.biologicalSex
    );

    const createdPlan = await prisma.weeklyPlan.create({
      data: {
        goalId: activeGoal.goalId,
        startDate: processed[0].date,
        endDate: latestDay.date,
        checkInDate: latestDay.date,
        programStyle: 'coached',
        dietStyle: 'balanced',
        proteinPrefGPerKg: 2.0,
        tdeeAtCheckin: latestDay.tdee,
        weightAtCheckin: latestDay.trendWeight,
        dailyDeficitKcal: solved.dailyDeficitKcal,
        weeklyBudgetKcal: solved.calories * 7,
        targetCalories: solved.calories,
        isActive: true
      }
    });

    for (let day = 0; day <= 6; day++) {
      await prisma.dailyCalorieTarget.create({
        data: {
          planId: createdPlan.planId,
          dayOfWeek: day,
          targetCalories: solved.calories
        }
      });
    }
  }
}

/**
 * 8. 7-Day compliance evaluator according to Section 5.1 & 7
 */
export async function evaluate7DayQuality(): Promise<{
  nutritionDays: number;
  weightDays: number;
  meetsNutrition: boolean;
  meetsWeight: boolean;
  isHolding: boolean;
  partialDays: string[];
  statusText: string;
}> {
  // Find latest logged date across weights and nutrition
  const latestWeight = await prisma.scaleWeightEntry.findFirst({ orderBy: { logDate: 'desc' } });
  const latestNutrition = await prisma.dailyNutritionRollup.findFirst({ orderBy: { logDate: 'desc' } });

  const latestStr = [latestWeight?.logDate, latestNutrition?.logDate]
    .filter(Boolean)
    .sort()
    .pop() || new Date().toISOString().split('T')[0];

  const latestDate = new Date(latestStr + 'T00:00:00Z');
  const calendarDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(latestDate);
    d.setUTCDate(d.getUTCDate() - i);
    calendarDates.push(d.toISOString().split('T')[0]);
  }

  const rollups = await prisma.dailyNutritionRollup.findMany({
    where: { logDate: { in: calendarDates } }
  });
  const rollupMap = new Map(rollups.map(r => [r.logDate, r]));

  const weights = await prisma.scaleWeightEntry.findMany({
    where: { logDate: { in: calendarDates } }
  });
  const weightMap = new Map(weights.map(w => [w.logDate, w]));

  let nutritionDays = 0;
  let weightDays = 0;
  const partialDays: string[] = [];

  for (const date of calendarDates) {
    const r = rollupMap.get(date);
    if (r) {
      if (r.isPartial) {
        partialDays.push(date);
      } else if (r.totalCaloriesKcal > 0 || r.isFasting) {
        nutritionDays++;
      }
    }

    if (weightMap.has(date)) {
      weightDays++;
    }
  }

  const meetsNutrition = nutritionDays >= 4;
  const meetsWeight = weightDays >= 1;
  const isHolding = !meetsNutrition || !meetsWeight;

  return {
    nutritionDays,
    weightDays,
    meetsNutrition,
    meetsWeight,
    isHolding,
    partialDays,
    statusText: isHolding ? 'Holding Safeguard Active' : 'Updating'
  };
}

/**
 * 9. Check-in schedule calculator
 */
export async function computeCheckInSchedule() {
  const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
  const checkInDay = profile?.checkInDay ?? 1; // default Monday
  const lastCheckin = await prisma.checkinHistory.findFirst({
    orderBy: { completedAt: 'desc' }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nextDate: Date;
  if (lastCheckin?.checkinDate) {
    const lastDate = new Date(lastCheckin.checkinDate);
    lastDate.setHours(0, 0, 0, 0);

    let candidate = new Date(lastDate);
    candidate.setDate(candidate.getDate() + 1);
    while (
      candidate.getDay() !== checkInDay ||
      Math.round((candidate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) < 4
    ) {
      candidate.setDate(candidate.getDate() + 1);
    }
    nextDate = candidate;
  } else {
    let candidate = new Date(today);
    if (candidate.getDay() === checkInDay) {
      nextDate = candidate;
    } else {
      const daysToAdd = (checkInDay - candidate.getDay() + 7) % 7;
      candidate.setDate(candidate.getDate() + daysToAdd);
      nextDate = candidate;
    }
  }

  const diffTime = nextDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let state: 'upcoming' | 'early_available' | 'ready' | 'overdue' = 'upcoming';
  if (diffDays > 2) {
    state = 'upcoming';
  } else if (diffDays === 1 || diffDays === 2) {
    state = 'early_available';
  } else if (diffDays === 0) {
    state = 'ready';
  } else {
    state = 'overdue';
  }

  return {
    checkInDay,
    checkInWeekday: WEEKDAY_NAMES[checkInDay],
    nextCheckInDate: nextDate.toISOString().split('T')[0],
    diffDays,
    state,
    fastCheckIn: profile?.fastCheckIn ?? false
  };
}

// Re-export production-grade Metabolic & Weight Trend Analytics Engine
export * as MetabolicEngine from './metabolicEngine.js';
export {
  type DailyLogInput as MetabolicDailyLogInput,
  type UserMetabolicProfile,
  PredictionStyle,
  type DailyAnalyticsOutput,
  type ProjectedPoint,
  processDailyAnalytics,
  project30DayWeightTrend,
  WEIGHT_TREND_ALPHA as METABOLIC_TREND_ALPHA,
  WEIGHT_TREND_WINDOW_N,
  EXPENDITURE_ALPHA as METABOLIC_EXPENDITURE_ALPHA,
  EXPENDITURE_WINDOW_N,
  resolveTissueEnergyDensity,
  interpolateScaleWeights,
  computeWeightTrend,
  computeWeeklyRateOfChange
} from './metabolicEngine.js';


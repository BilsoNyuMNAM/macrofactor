export const MACROFACTOR_TREND_ALPHA = 0.10;
export const KCAL_PER_KG_TISSUE_V3 = 7700.0;

// In V3, tissue energy density is strictly symmetrical (7,700 kcal/kg for both loss and gain)
export const KCAL_PER_KG_TISSUE_LOSS = KCAL_PER_KG_TISSUE_V3;
export const KCAL_PER_KG_TISSUE_GAIN = KCAL_PER_KG_TISSUE_V3;

// MacroFactor Expenditure Algorithm V3 Constants
export const V3_ADAPTIVE_GAIN_SMALL = 0.08;
export const V3_ADAPTIVE_GAIN_LARGE = 0.16;
export const V3_BASE_FLUX_RADIUS_UPDATING = 35;
export const V3_BASE_FLUX_RADIUS_HOLDING = 60;
export const V3_MIN_VIABLE_TDEE_FLOOR = 1000;
export const V3_MAX_INTERPOLATION_GAP_DAYS = 7;
export const V3_DAILY_DELTA_CLAMP_KCAL = 8;
export const V3_EXPENDITURE_VELOCITY_LOOKBACK_DAYS = 19; // Grounded in StrongerModels.trendWeightDays19
export const V3_EXPENDITURE_DAMPING_DAYS = 9; // Grounded in StrongerModels.expenditureDays9

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ExpenditureStrategy = 'updating' | 'holding' | 'static';

export interface DailyLogInput {
  date: string;               // 'YYYY-MM-DD'
  scaleWeight: number | null; // kg
  calories: number | null;    // kcal
  isFasting?: boolean;        // true = deliberate 0 kcal fast
  isPartial?: boolean;        // true = incomplete day, exclude from TDEE
}

export interface ProcessedDay {
  date: string;
  rawWeight: number | null;
  interpolatedWeight: number;
  trendWeight: number;
  weightVelocityKgPerDay: number;
  rawIntake: number | null;
  imputedIntake: number | null;
  isFasting: boolean;
  isValidIntake: boolean;
  tdee: number;
  tdeeDelta: number;
  fluxUpper: number;
  fluxLower: number;
  fluxRadius: number;
  strategy: ExpenditureStrategy;
  isHolding: boolean;
  isColdStart: boolean;
  confidenceScore: number;
  noiseRangeLower: number;
  noiseRangeUpper: number;
}

export interface EngineConfig {
  trendAlpha: number;                 // Default: 0.10 (~19-day effective window)
  tissueDensityKcalPerKg: number;     // Default: 7700 (Symmetrical V3)
  baselineTdee: number;               // Default: 2340
  staticTdeeOverride?: number | null; // Optional pinned TDEE when strategy is 'static'
}

export const DEFAULT_CONFIG: EngineConfig = {
  trendAlpha: MACROFACTOR_TREND_ALPHA,
  tissueDensityKcalPerKg: KCAL_PER_KG_TISSUE_V3,
  baselineTdee: 2340,
  staticTdeeOverride: null
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
 * Build a continuous calendar sequence without date gaps from earliest log to latest log.
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
      continuous.push({
        date: iso,
        scaleWeight: null,
        calories: null,
        isFasting: false,
        isPartial: false
      });
    }
  }
  return continuous;
}

/**
 * 2. Main MacroFactor V3 Pipeline:
 * Pass 1: Piecewise linear interpolation for scale weights (with >7-day hiatus flat hold and trailing edge flat hold)
 * Pass 2: Exponential moving average (alpha = 0.13) with trailing edge hold and velocity decay
 * Pass 3: Dynamic Expenditure V3 engine with Velocity-Inversion Caloric Imputation,
 *         4-of-7 nutrition compliance, 1-of-7 weigh-in compliance, 3-day consecutive recovery,
 *         symmetrical 7,700 kcal/kg mass-balance solver, adaptive trajectory damping, and 1,000 kcal floor.
 */
export function executeMacroFactorPipeline(
  rawLogs: DailyLogInput[],
  baselineTdee: number = 2340,
  initialWeightKg?: number | null,
  trendAlpha: number = MACROFACTOR_TREND_ALPHA,
  staticTdeeOverride: number | null = null
): ProcessedDay[] {
  const continuous = buildContinuousCalendar(rawLogs);
  if (continuous.length === 0) return [];

  const n = continuous.length;
  const processed: ProcessedDay[] = [];

  // --- PASS 1: PIECEWISE LINEAR INTERPOLATION FOR SCALE WEIGHT ---
  const interpolatedWeights = new Array<number>(n);
  const isLongWeightHiatus = new Array<boolean>(n).fill(false);
  const firstWeightIdx = continuous.findIndex(l => l.scaleWeight !== null && !isNaN(l.scaleWeight));

  if (firstWeightIdx === -1) {
    interpolatedWeights.fill(initialWeightKg ?? 78.0);
    isLongWeightHiatus.fill(true);
  } else {
    // Fill backwards from first known weigh-in
    for (let i = 0; i < firstWeightIdx; i++) {
      interpolatedWeights[i] = continuous[firstWeightIdx].scaleWeight!;
    }

    let lastKnownIdx = firstWeightIdx;
    for (let i = firstWeightIdx + 1; i < n; i++) {
      if (continuous[i].scaleWeight !== null && !isNaN(continuous[i].scaleWeight!)) {
        const gap = i - lastKnownIdx;
        const missingDaysBetween = gap - 1;
        const startW = continuous[lastKnownIdx].scaleWeight!;
        const endW = continuous[i].scaleWeight!;

        if (missingDaysBetween > V3_MAX_INTERPOLATION_GAP_DAYS) {
          // Spec Section 2.3: Missing Scale Weigh-ins (>7 Days) holds flat at last known weight
          for (let j = lastKnownIdx; j < i; j++) {
            interpolatedWeights[j] = startW;
            if (j - lastKnownIdx > V3_MAX_INTERPOLATION_GAP_DAYS) {
              isLongWeightHiatus[j] = true;
            }
          }
        } else {
          for (let j = lastKnownIdx; j < i; j++) {
            interpolatedWeights[j] = startW + ((endW - startW) / gap) * (j - lastKnownIdx);
          }
        }
        lastKnownIdx = i;
      }
    }

    // Trailing edge: hold flat from last known weigh-in forward (no unverified velocity extrapolation)
    for (let i = lastKnownIdx; i < n; i++) {
      interpolatedWeights[i] = continuous[lastKnownIdx].scaleWeight!;
      if (i - lastKnownIdx > V3_MAX_INTERPOLATION_GAP_DAYS) {
        isLongWeightHiatus[i] = true;
      }
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

  let currentTrend =
    initialWeightKg !== null && initialWeightKg !== undefined && !isNaN(initialWeightKg)
      ? initialWeightKg
      : interpolatedWeights[0];
  const trendWeights = new Array<number>(n);
  const velocities = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const isTrailingEdgeGap = lastActualWeighInIdx !== -1 && (i - lastActualWeighInIdx >= 2);

    if (isLongWeightHiatus[i] && i > 0) {
      // >7 days without scale weigh-ins: hold flat at last trend weight with zero velocity
      trendWeights[i] = trendWeights[i - 1];
      currentTrend = trendWeights[i];
      velocities[i] = 0;
    } else if (isTrailingEdgeGap && i > 0) {
      // Trailing edge hold with velocity decay toward zero
      trendWeights[i] = trendWeights[i - 1];
      currentTrend = trendWeights[i];
      velocities[i] = Math.round(velocities[i - 1] * 0.7 * 1000) / 1000;
      if (Math.abs(velocities[i]) < 0.005) velocities[i] = 0;
    } else {
      if (i === 0) {
        trendWeights[0] = Math.round(currentTrend * 100) / 100;
      } else {
        currentTrend = (trendAlpha * interpolatedWeights[i]) + ((1 - trendAlpha) * currentTrend);
        trendWeights[i] = Math.round(currentTrend * 100) / 100;
      }

      // 7-day velocity span: V_t = (T_t - T_{t-7}) / 7
      const lookback = Math.min(i, 7);
      if (lookback === 0) {
        velocities[i] = 0;
      } else {
        velocities[i] = Math.round(((trendWeights[i] - trendWeights[i - lookback]) / lookback) * 1000) / 1000;
      }
    }
  }

  // --- PASS 3: DYNAMIC EXPENDITURE ENGINE WITH MACROFACTOR V3 ADAPTIVE MODEL ---
  let runningTdee = staticTdeeOverride ?? Math.max(V3_MIN_VIABLE_TDEE_FLOOR, baselineTdee);
  let consecutiveMissingIntake = 0;
  let consecutiveLoggedIntake = 0;
  let inHolding = true; // Cold start begins in Holding on Days 1 & 2

  const imputedIntakes: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const item = continuous[i];
    const isFasting = !!item.isFasting;
    const isValidIntake = isValidIntakeDay(item);

    if (isValidIntake) {
      consecutiveMissingIntake = 0;
      consecutiveLoggedIntake++;
    } else {
      consecutiveMissingIntake++;
      consecutiveLoggedIntake = 0;
    }

    // Evaluate rolling 7 calendar days [windowStart, i] for compliance
    const windowStart = Math.max(0, i - 6);
    const windowSlice = continuous.slice(windowStart, i + 1);

    let validIntakeCount = 0;
    let weighInCount = 0;

    for (const day of windowSlice) {
      if (day.scaleWeight !== null && !isNaN(day.scaleWeight)) {
        weighInCount++;
      }
      if (isValidIntakeDay(day)) {
        validIntakeCount++;
      }
    }

    // MacroFactor V3 Caloric Imputation on Missing Days (Velocity-Inversion Solver):
    // \hat{I}_k = TDEE_{k-1} + (V_k * 7700)
    let dayImputedIntake: number | null = null;
    if (!isValidIntake) {
      const prevTdee = i > 0 ? runningTdee : baselineTdee;
      const expectedImputed = Math.round(prevTdee + (velocities[i] * KCAL_PER_KG_TISSUE_V3));
      dayImputedIntake = Math.max(0, expectedImputed);
      imputedIntakes[i] = dayImputedIntake;
    }

    // MacroFactor V3 Safeguard & Recovery State Machine (finding.md):
    // 1. Cold start: Days 1 & 2 (indices 0 and 1) held at baseline. Day 3 (index 2) unlocks.
    // 2. Resuming from a Hold (3-Day Recovery Rule):
    //    Requires 3 consecutive days of complete nutrition logs (consecutiveLoggedIntake >= 3)
    //    PLUS at least 1 weigh-in in the rolling 7-day window (weighInCount >= 1).
    // 3. Entering Holding:
    //    - Hiatus: 7 consecutive days without food logging (consecutiveMissingIntake >= 7).
    //    - Weigh-in hiatus: 0 scale weigh-ins in rolling 7-day window (weighInCount === 0).
    //    - Resuming tracking: when user logs food (isValidIntake), if rolling 7-day data
    //      completeness is < 4 days AND consecutive logged days < 3, engine enters Holding.
    //      On unlogged days (isValidIntake is false), velocity-inversion imputation keeps the
    //      engine updating dynamically (verified across 5 consecutive missing days Oct 8–12).
    const isColdStart = i < 3;

    if (staticTdeeOverride !== null && staticTdeeOverride !== undefined) {
      inHolding = false;
    } else if (isColdStart) {
      inHolding = true;
    } else if (inHolding) {
      // On Day 4 (index 3), unlock if compliant; otherwise enforce 3-day consecutive recovery rule
      if (i === 3 && validIntakeCount >= 2 && weighInCount >= 1 && consecutiveMissingIntake === 0) {
        inHolding = false;
      } else if (consecutiveLoggedIntake >= 3 && weighInCount >= 1) {
        inHolding = false;
      }
    } else {
      if (consecutiveMissingIntake >= 7 || weighInCount === 0) {
        inHolding = true;
      } else if (isValidIntake && validIntakeCount < 4 && consecutiveLoggedIntake < 3) {
        inHolding = true;
      }
    }

    const strategy: ExpenditureStrategy =
      staticTdeeOverride !== null && staticTdeeOverride !== undefined
        ? 'static'
        : inHolding
          ? 'holding'
          : 'updating';

    const isHolding = strategy === 'holding';
    let delta = 0;

    if (strategy === 'static') {
      runningTdee = Math.max(V3_MIN_VIABLE_TDEE_FLOOR, Math.round(staticTdeeOverride!));
      delta = 0;
    } else if (isHolding) {
      // In Holding state, TDEE is strictly frozen at the previous day's baseline
      delta = 0;
    } else {
      // MacroFactor V3 Expenditure Velocity Estimation:
      // Uses 19-day lookback horizon (grounded in StrongerModels.trendWeightDays19)
      // to prevent short-term weight noise from creating exaggerated metabolic flux
      const expLookback = Math.min(i, V3_EXPENDITURE_VELOCITY_LOOKBACK_DAYS);
      const expVelocity = expLookback === 0
        ? 0
        : Math.round(((trendWeights[i] - trendWeights[i - expLookback]) / expLookback) * 1000) / 1000;

      // Matched intake trailing window [expWindowStart, i]:
      // Combines verified logged calories with velocity-inversion imputed calories for skipped days
      const expWindowStart = Math.max(0, i - (expLookback > 0 ? expLookback - 1 : 0));
      let sumIntake = 0;
      for (let k = expWindowStart; k <= i; k++) {
        if (isValidIntakeDay(continuous[k])) {
          sumIntake += continuous[k].isFasting ? 0 : (continuous[k].calories ?? 0);
        } else {
          sumIntake += (imputedIntakes[k] ?? runningTdee);
        }
      }
      const windowDays = i - expWindowStart + 1;
      const avgIntake = sumIntake / windowDays;

      // Symmetrical Thermodynamic Solver (V3):
      // TDEE_raw = avgIntake - (V_exp * 7,700)
      const rawDemand = avgIntake - (expVelocity * KCAL_PER_KG_TISSUE_V3);
      const rawGap = rawDemand - runningTdee;

      // Adaptive Trajectory Damping (V3):
      // Small noisy fluctuations (|rawGap| <= 150): K = 0.08
      // Sustained directional shifts (|rawGap| > 250): K = 0.16
      // Smooth linear transition between 150 and 250
      // Scaled by V3_EXPENDITURE_DAMPING_DAYS (9 days, grounded in StrongerModels.expenditureDays9)
      const absGap = Math.abs(rawGap);
      let adaptiveGain = V3_ADAPTIVE_GAIN_SMALL;
      if (absGap > 250) {
        adaptiveGain = V3_ADAPTIVE_GAIN_LARGE;
      } else if (absGap > 150) {
        adaptiveGain =
          V3_ADAPTIVE_GAIN_SMALL +
          ((absGap - 150) / 100) * (V3_ADAPTIVE_GAIN_LARGE - V3_ADAPTIVE_GAIN_SMALL);
      }

      const effectiveGain = adaptiveGain / V3_EXPENDITURE_DAMPING_DAYS;
      const rawDelta = Math.round(rawGap * effectiveGain);

      // Strict Daily Adjustment Limit Clamp (Spec Section 2.3 & MacroFactor Ground Truth):
      // Enforces strict [-8, +8] kcal/day limit to prevent daily metabolic whiplash
      const clampedDelta = Math.max(-V3_DAILY_DELTA_CLAMP_KCAL, Math.min(V3_DAILY_DELTA_CLAMP_KCAL, rawDelta));
      const unclampedTdee = runningTdee + clampedDelta;

      // Physiological Safety Floor (Spec Section 2.3): Clamp TDEE at 1,000 kcal
      const nextTdee = Math.max(V3_MIN_VIABLE_TDEE_FLOOR, unclampedTdee);
      delta = nextTdee - runningTdee;
      runningTdee = nextTdee;
    }

    // Weight residual variance (RMSE) over 14-day window (Section 2.2 #6)
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

    // Dynamic Flux Range calculation (Section 2.2 #6):
    // FluxRadius = BaseRadius * (1 + sigma_weight / 0.5) * (7 / N_logged)
    const baseFluxRadius = isHolding ? V3_BASE_FLUX_RADIUS_HOLDING : V3_BASE_FLUX_RADIUS_UPDATING;
    const weightNoiseFactor = 1 + (weightRmse / 0.5);
    const densityRatio = 7 / Math.max(validIntakeCount, 1);

    const dynamicFluxRadius = Math.round(baseFluxRadius * weightNoiseFactor * densityRatio);
    const fluxUpper = runningTdee + dynamicFluxRadius;
    const fluxLower = Math.max(0, runningTdee - dynamicFluxRadius);

    // Statistical Confidence Score in [0.0, 1.0] (Spec Section 1.1 #3)
    const intakeConfidence = Math.min(1, validIntakeCount / 7);
    const weightConfidence = Math.min(1, weighInCount / 3);
    const noisePenalty = Math.max(0.5, 1 - (weightRmse / 2.0));
    const rawConfidence = (intakeConfidence * 0.6 + weightConfidence * 0.4) * noisePenalty;
    const confidenceScore = isColdStart
      ? 0.25
      : Math.round(Math.max(0, Math.min(1, rawConfidence)) * 100) / 100;

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
      imputedIntake: dayImputedIntake,
      isFasting,
      isValidIntake,
      tdee: runningTdee,
      tdeeDelta: delta,
      fluxUpper,
      fluxLower,
      fluxRadius: dynamicFluxRadius,
      strategy,
      isHolding,
      isColdStart,
      confidenceScore,
      noiseRangeLower,
      noiseRangeUpper
    });
  }

  return processed;
}

/**
 * 3. Program Solver: Generates locked weekly macro targets using V3 symmetrical tissue density.
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
  // 1. Symmetrical Deficit/Surplus Calculation (7,700 kcal/kg)
  const weeklyWeightDeltaKg = latestTrendWeightKg * (goalRatePercentBwPerWeek / 100.0);
  const dailyCalorieDeficit = Math.round((weeklyWeightDeltaKg * KCAL_PER_KG_TISSUE_V3) / 7.0);

  // 2. Calorie Floor (1,200 kcal for females, 1,500 kcal for males)
  const minFloor = biologicalSex.toLowerCase() === 'female' ? 1200 : 1500;
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
  const fatGrams = Math.max(minFatGrams, Math.round((targetCalories * fatPct) / 9.0));
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
    estimatedEndDateStr = end.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
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
  const anchorWeight =
    startTrendWeightKg !== null && startTrendWeightKg !== undefined
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
 * Uses V3 symmetrical energy density (7,700 kcal/kg) for both weight loss and weight gain.
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

  const dailyDeficitKcal =
    weeklyRatePercent === 0
      ? 0
      : Math.round(((weeklyRatePercent / 100.0) * currentTrendWeightKg * KCAL_PER_KG_TISSUE_V3) / 7.0);

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
 * 4. Header Metrics: Computes the "Average" and "Difference" across active timeframes.
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
  const weightDiffStr =
    rawWeightDiff > 0
      ? `+${rawWeightDiff.toFixed(1)}`
      : rawWeightDiff < 0
        ? `\u2212${Math.abs(rawWeightDiff).toFixed(1)}`
        : '0.0';

  // Expenditure Header
  const sumTdee = windowSlice.reduce((acc, d) => acc + d.tdee, 0);
  const avgTdee = Math.round(sumTdee / windowSlice.length);
  const rawTdeeDiff = last.tdee - first.tdee;
  const tdeeDiffStr =
    rawTdeeDiff > 0
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
  const dateRangeSubtitle =
    m1 === m2
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
 * 5. Multi-Horizon Changes (3d, 7d, 14d, 30d, 90d) with Waiting Prerequisites.
 */
export function calculateMultiHorizonChanges(processedDays: ProcessedDay[]): HorizonChangeItem[] {
  const horizons = [3, 7, 14, 30, 90];
  if (processedDays.length === 0) return [];

  const latest = processedDays[processedDays.length - 1];
  const earliestDate = new Date(processedDays[0].date + 'T00:00:00Z');
  const latestDate = new Date(latest.date + 'T00:00:00Z');
  const totalCalendarSpanDays = Math.round((latestDate.getTime() - earliestDate.getTime()) / MS_PER_DAY);

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
    const wStr =
      wDelta > 0
        ? `+${wDelta.toFixed(1)} kg`
        : wDelta < 0
          ? `\u2212${Math.abs(wDelta).toFixed(1)} kg`
          : '0.0 kg';
    let wStatus: HorizonStatus = 'Plateau';
    if (wDelta <= -0.05) wStatus = 'Decrease';
    else if (wDelta >= 0.05) wStatus = 'Increase';

    // Expenditure delta
    const expDelta = latest.tdee - anchor.tdee;
    const expStr =
      expDelta > 0
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
 * 6. Typical Weekly Rate & Energy Deficit (21-Day / 3-Week Anchor).
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
  const daysDiff = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / MS_PER_DAY));

  const massDelta = latest.trendWeight - anchor.trendWeight;
  const weeklyRateKg = Math.round(((massDelta / daysDiff) * 7.0) * 100) / 100;
  const dailyDeficitKcal = Math.round((weeklyRateKg * KCAL_PER_KG_TISSUE_V3) / 7.0);
  const projected30dKg = Math.round((latest.trendWeight + ((weeklyRateKg / 7.0) * 30.0)) * 10) / 10;

  return {
    currentTrendWeightKg: latest.trendWeight,
    weeklyRateKg,
    weeklyRateFormatted:
      weeklyRateKg > 0 ? `+${weeklyRateKg.toFixed(2)}` : `\u2212${Math.abs(weeklyRateKg).toFixed(2)}`,
    dailyDeficitKcal,
    dailyDeficitFormatted:
      dailyDeficitKcal > 0 ? `+${dailyDeficitKcal}` : `\u2212${Math.abs(dailyDeficitKcal)}`,
    projected30dKg
  };
}

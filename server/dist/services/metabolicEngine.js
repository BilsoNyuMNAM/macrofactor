"use strict";
/**
 * MacroFactor-Grade Metabolic & Weight Trend Analytics Engine
 *
 * Implements:
 * 1. True Weight Trend (EMA N=19, alpha=0.10 with piecewise linear interpolation).
 * 2. Weekly Rate of Weight Change (7-day delta on trend curve & percentage velocity).
 * 3. Dynamic Daily Energy Expenditure (TDEE) & Energy Deficit/Surplus (thermodynamic mass-balance inversion).
 * 4. 30-Day Weight Trend Projections (GOAL_RATE, RECENT_RATE, BLENDED with widening uncertainty cone).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Z_SCORE_90_PERCENT_CI = exports.DEFAULT_FALLBACK_NOISE_KG = exports.MAX_EXPENDITURE_CLAMP_KCAL = exports.MIN_EXPENDITURE_CLAMP_KCAL = exports.MAX_FORBES_DENSITY = exports.MIN_FORBES_DENSITY = exports.STANDARD_TISSUE_DENSITY_KCAL_KG = exports.EXPENDITURE_ALPHA = exports.EXPENDITURE_WINDOW_N = exports.WEIGHT_TREND_ALPHA = exports.WEIGHT_TREND_WINDOW_N = exports.PredictionStyle = void 0;
exports.isValidIsoDate = isValidIsoDate;
exports.addDaysToIso = addDaysToIso;
exports.diffDaysIso = diffDaysIso;
exports.buildContiguousDailyLogs = buildContiguousDailyLogs;
exports.interpolateScaleWeights = interpolateScaleWeights;
exports.computeWeightTrend = computeWeightTrend;
exports.computeWeeklyRateOfChange = computeWeeklyRateOfChange;
exports.resolveTissueEnergyDensity = resolveTissueEnergyDensity;
exports.resolveInitialExpenditure = resolveInitialExpenditure;
exports.computeResidualNoise = computeResidualNoise;
exports.project30DayWeightTrend = project30DayWeightTrend;
exports.processDailyAnalytics = processDailyAnalytics;
var PredictionStyle;
(function (PredictionStyle) {
    PredictionStyle["GOAL_RATE"] = "GOAL_RATE";
    PredictionStyle["RECENT_RATE"] = "RECENT_RATE";
    PredictionStyle["BLENDED"] = "BLENDED"; // 50/50 blend of goal rate and empirical recent rate
})(PredictionStyle || (exports.PredictionStyle = PredictionStyle = {}));
// ============================================================================
// CONSTANTS & PARAMETERS
// ============================================================================
exports.WEIGHT_TREND_WINDOW_N = 19;
exports.WEIGHT_TREND_ALPHA = 2 / (exports.WEIGHT_TREND_WINDOW_N + 1); // 0.10
exports.EXPENDITURE_WINDOW_N = 9;
exports.EXPENDITURE_ALPHA = 2 / (exports.EXPENDITURE_WINDOW_N + 1); // 0.20
exports.STANDARD_TISSUE_DENSITY_KCAL_KG = 7700;
exports.MIN_FORBES_DENSITY = 6000;
exports.MAX_FORBES_DENSITY = 8200;
exports.MIN_EXPENDITURE_CLAMP_KCAL = 1000;
exports.MAX_EXPENDITURE_CLAMP_KCAL = 6000;
exports.DEFAULT_FALLBACK_NOISE_KG = 0.45;
exports.Z_SCORE_90_PERCENT_CI = 1.645;
// ============================================================================
// DATE & CALENDAR UTILITIES
// ============================================================================
/**
 * Validates ISO date format YYYY-MM-DD.
 */
function isValidIsoDate(dateStr) {
    return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr + 'T00:00:00Z'));
}
/**
 * Adds integer days in UTC to a YYYY-MM-DD string.
 */
function addDaysToIso(isoDate, days) {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}
/**
 * Computes difference in calendar days between two ISO dates (b - a).
 */
function diffDaysIso(dateA, dateB) {
    const tA = Date.parse(dateA + 'T00:00:00Z');
    const tB = Date.parse(dateB + 'T00:00:00Z');
    return Math.round((tB - tA) / (1000 * 60 * 60 * 24));
}
/**
 * Sorts inputs strictly chronologically and fills missing calendar dates.
 */
function buildContiguousDailyLogs(inputs) {
    if (inputs.length === 0)
        return [];
    // Filter and validate dates
    const sorted = [...inputs]
        .filter(i => isValidIsoDate(i.date))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0)
        return [];
    // Deduplicate by taking the latest entry for each date
    const dateMap = new Map();
    for (const item of sorted) {
        dateMap.set(item.date, item);
    }
    const startDate = sorted[0].date;
    const endDate = sorted[sorted.length - 1].date;
    const totalDays = diffDaysIso(startDate, endDate);
    const contiguous = [];
    for (let i = 0; i <= totalDays; i++) {
        const currentDate = addDaysToIso(startDate, i);
        if (dateMap.has(currentDate)) {
            contiguous.push(dateMap.get(currentDate));
        }
        else {
            contiguous.push({ date: currentDate });
        }
    }
    return contiguous;
}
/**
 * Piecewise linear interpolation for scale weights:
 * - Linearly interpolates gaps between valid weigh-ins at t1 and t2.
 * - Skips leading edge before first weigh-in.
 * - Holds trailing edge flat at last known scale weight.
 */
function interpolateScaleWeights(logs) {
    const n = logs.length;
    if (n === 0) {
        return { interpolatedSeries: [], startIndex: 0 };
    }
    // Find all indices with valid scale weight
    const validIndices = [];
    for (let i = 0; i < n; i++) {
        const w = logs[i].scaleWeightKg;
        if (w !== undefined && w !== null && !isNaN(w) && w > 0) {
            validIndices.push(i);
        }
    }
    if (validIndices.length === 0) {
        throw new Error('No valid scale weigh-ins found in dataset to initialize weight trend engine.');
    }
    const firstValidIdx = validIndices[0];
    const lastValidIdx = validIndices[validIndices.length - 1];
    const results = [];
    // Fill between firstValidIdx and lastValidIdx
    let currentValidPointer = 0;
    for (let i = firstValidIdx; i < n; i++) {
        const log = logs[i];
        const rawW = log.scaleWeightKg;
        const hasRaw = rawW !== undefined && rawW !== null && !isNaN(rawW) && rawW > 0;
        if (i <= lastValidIdx) {
            if (hasRaw) {
                results.push({
                    date: log.date,
                    rawWeightKg: rawW,
                    interpolatedWeightKg: rawW,
                    isInterpolated: false
                });
                if (i === validIndices[currentValidPointer + 1]) {
                    currentValidPointer++;
                }
            }
            else {
                // Linearly interpolate between validIndices[currentValidPointer] and validIndices[currentValidPointer + 1]
                const t1 = validIndices[currentValidPointer];
                const t2 = validIndices[currentValidPointer + 1];
                const w1 = logs[t1].scaleWeightKg;
                const w2 = logs[t2].scaleWeightKg;
                const interp = w1 + ((i - t1) * (w2 - w1)) / (t2 - t1);
                results.push({
                    date: log.date,
                    rawWeightKg: null,
                    interpolatedWeightKg: interp,
                    isInterpolated: true
                });
            }
        }
        else {
            // Trailing edge: hold last known scale weight
            const lastW = logs[lastValidIdx].scaleWeightKg;
            results.push({
                date: log.date,
                rawWeightKg: null,
                interpolatedWeightKg: lastW,
                isInterpolated: true
            });
        }
    }
    return {
        interpolatedSeries: results,
        startIndex: firstValidIdx
    };
}
/**
 * Computes Exponential Moving Average (EMA) with alpha = 0.10 (N = 19).
 * Optionally performs Zero-Phase Retroactive Revision over the most recent 7-14 days.
 */
function computeWeightTrend(interpolated, options) {
    const m = interpolated.length;
    if (m === 0)
        return [];
    const trend = new Array(m);
    trend[0] = interpolated[0].interpolatedWeightKg;
    for (let t = 1; t < m; t++) {
        trend[t] = (exports.WEIGHT_TREND_ALPHA * interpolated[t].interpolatedWeightKg) +
            ((1 - exports.WEIGHT_TREND_ALPHA) * trend[t - 1]);
    }
    // Optional Zero-Phase Retroactive Revision (Weight Trend V2)
    if (options?.enableRetroactiveRevision && m >= 7) {
        const lookback = Math.min(m, options.retroactiveLookbackDays ?? 14);
        const startIdx = m - lookback;
        // Backward pass EMA from trailing edge
        const backwardTrend = new Array(lookback);
        backwardTrend[lookback - 1] = trend[m - 1];
        for (let j = lookback - 2; j >= 0; j--) {
            const idx = startIdx + j;
            backwardTrend[j] = (exports.WEIGHT_TREND_ALPHA * interpolated[idx].interpolatedWeightKg) +
                ((1 - exports.WEIGHT_TREND_ALPHA) * backwardTrend[j + 1]);
        }
        // Blend forward and backward passes (zero-phase smoothing)
        for (let j = 0; j < lookback; j++) {
            const idx = startIdx + j;
            trend[idx] = (0.5 * trend[idx]) + (0.5 * backwardTrend[j]);
        }
    }
    return trend;
}
/**
 * 7-Day Rolling Delta evaluated on the trend curve.
 * Delta_W(t) = TrendWeight_t - TrendWeight_{t-7}
 * RatePercent(t) = (Delta_W(t) / TrendWeight_{t-7}) * 100%
 */
function computeWeeklyRateOfChange(trendWeights, t) {
    if (t < 7) {
        return {
            weeklyChangeKg: null,
            weeklyChangePercent: null
        };
    }
    const prevTrend = trendWeights[t - 7];
    const currTrend = trendWeights[t];
    const deltaKg = Math.round((currTrend - prevTrend) * 1000) / 1000;
    const percent = prevTrend !== 0 ? Math.round(((deltaKg / prevTrend) * 100) * 100) / 100 : 0;
    return {
        weeklyChangeKg: deltaKg,
        weeklyChangePercent: percent
    };
}
// ============================================================================
// MODULE 3: DYNAMIC EXPENDITURE (TDEE) & ENERGY DEFICITS
// ============================================================================
/**
 * Resolves tissue energy density using Forbes/Hall adjustment or standard 7,700 kcal/kg.
 */
function resolveTissueEnergyDensity(profile) {
    if (profile?.bodyFatPercentage !== undefined) {
        let bf = profile.bodyFatPercentage;
        if (bf > 1.0) {
            bf = bf / 100.0; // convert percentage like 20 -> 0.20
        }
        const forbesDensity = (bf * 9400) + ((1.0 - bf) * 1800);
        return Math.max(exports.MIN_FORBES_DENSITY, Math.min(exports.MAX_FORBES_DENSITY, forbesDensity));
    }
    return exports.STANDARD_TISSUE_DENSITY_KCAL_KG;
}
/**
 * Resolves initial starting expenditure estimate.
 */
function resolveInitialExpenditure(profile) {
    if (profile?.initialExpenditureKcal !== undefined && profile.initialExpenditureKcal > 0) {
        return profile.initialExpenditureKcal;
    }
    if (profile?.gender === 'female') {
        return 1900;
    }
    return 2340;
}
// ============================================================================
// MODULE 4: 30-DAY WEIGHT TREND PROJECTION
// ============================================================================
/**
 * Calculates empirical residual scale weight noise (RMSE) over the past 14-30 days.
 * sigma_noise = sqrt( (1 / M) * sum((ScaleWeight_k - TrendWeight_k)^2) )
 * Fallback to 0.45 kg if fewer than 7 points exist.
 */
function computeResidualNoise(history, lookbackDays = 30) {
    const slice = history.slice(-lookbackDays);
    const residuals = [];
    for (const item of slice) {
        if (item.scaleWeightKg !== null && item.scaleWeightKg !== undefined && !isNaN(item.scaleWeightKg)) {
            const diff = item.scaleWeightKg - item.trendWeightKg;
            residuals.push(diff * diff);
        }
    }
    if (residuals.length < 7) {
        return exports.DEFAULT_FALLBACK_NOISE_KG;
    }
    const meanSq = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const rmse = Math.sqrt(meanSq);
    return Math.max(0.05, rmse);
}
/**
 * Computes 30-day projection points with widening uncertainty cone.
 */
function project30DayWeightTrend(currentDay, history, profile, predictionStyle) {
    const goalRateKgPerWeek = profile.goalRatePerWeekKg ?? 0;
    const goalDailyRate = goalRateKgPerWeek / 7.0;
    const hasRecentRate = currentDay.weeklyWeightChangeKg !== null && !isNaN(currentDay.weeklyWeightChangeKg);
    const recentDailyRate = hasRecentRate
        ? (currentDay.weeklyWeightChangeKg / 7.0)
        : goalDailyRate; // fallback to GOAL_RATE if insufficient recent data
    let dailyRate;
    switch (predictionStyle) {
        case PredictionStyle.GOAL_RATE:
            dailyRate = goalDailyRate;
            break;
        case PredictionStyle.RECENT_RATE:
            dailyRate = recentDailyRate;
            break;
        case PredictionStyle.BLENDED:
            dailyRate = hasRecentRate
                ? (0.5 * goalDailyRate) + (0.5 * recentDailyRate)
                : goalDailyRate;
            break;
        default:
            dailyRate = goalDailyRate;
    }
    const sigmaNoise = computeResidualNoise(history, 30);
    const z = exports.Z_SCORE_90_PERCENT_CI;
    const currentTrend = currentDay.trendWeightKg;
    const projections = [];
    for (let d = 1; d <= 30; d++) {
        const projectedWeight = Math.round((currentTrend + (dailyRate * d)) * 100) / 100;
        const margin = z * sigmaNoise * Math.sqrt(d / 7.0);
        const upperConfidenceBound = Math.round((projectedWeight + margin) * 100) / 100;
        const lowerConfidenceBound = Math.round((projectedWeight - margin) * 100) / 100;
        projections.push({
            dayOffset: d,
            date: addDaysToIso(currentDay.date, d),
            projectedWeightKg: projectedWeight,
            upperConfidenceBoundKg: upperConfidenceBound,
            lowerConfidenceBoundKg: lowerConfidenceBound
        });
    }
    return projections;
}
// ============================================================================
// MAIN PIPELINE ENGINE
// ============================================================================
/**
 * Executes the full MacroFactor-grade metabolic & weight trend analytics pipeline.
 */
function processDailyAnalytics(inputs, profile, options) {
    if (inputs.length === 0)
        return [];
    // 1. Build contiguous calendar timeline
    const contiguousLogs = buildContiguousDailyLogs(inputs);
    if (contiguousLogs.length === 0)
        return [];
    // 2. Interpolate scale weights
    const { interpolatedSeries, startIndex } = interpolateScaleWeights(contiguousLogs);
    if (interpolatedSeries.length === 0)
        return [];
    // 3. Compute Weight Trend (EMA N=19, alpha=0.10)
    const trendWeights = computeWeightTrend(interpolatedSeries, options);
    // 4. Calibrate Dynamic Expenditure and Energy Balances
    const tissueDensity = resolveTissueEnergyDensity(profile);
    let runningExpenditure = resolveInitialExpenditure(profile);
    const outputs = [];
    const activeLogs = contiguousLogs.slice(startIndex);
    let validLoggingDaysCount = 0;
    let consecutiveMissingScaleDays = 0;
    for (let t = 0; t < interpolatedSeries.length; t++) {
        const item = interpolatedSeries[t];
        const log = activeLogs[t];
        const currTrend = Math.round(trendWeights[t] * 100) / 100;
        // Track consecutive missing scale weight days for Continuity Threshold
        if (item.rawWeightKg !== null) {
            consecutiveMissingScaleDays = 0;
        }
        else {
            consecutiveMissingScaleDays++;
        }
        // Determine intake status
        const isFasted = log.isFasted === true;
        const hasExplicitCalories = log.caloriesConsumed !== undefined &&
            log.caloriesConsumed !== null &&
            !isNaN(log.caloriesConsumed);
        const isValidIntake = isFasted || hasExplicitCalories;
        const intakeKcal = isFasted ? 0 : (hasExplicitCalories ? log.caloriesConsumed : null);
        // Track valid observations for Cold Start
        if (isValidIntake && item.rawWeightKg !== null) {
            validLoggingDaysCount++;
        }
        // Check guardrails:
        // - Cold start: requires at least 3 days of valid intake + weigh-ins before dynamic updates
        const isColdStart = validLoggingDaysCount < 3;
        // - Missing Food Log Hold: if caloriesConsumed is missing AND not fasted
        const isMissingFoodLog = !isValidIntake;
        // - Continuity Threshold: if no scale weight logged for > 7 consecutive days
        const isScaleFrozen = consecutiveMissingScaleDays > 7;
        let isExpenditureOnHold = false;
        if (isMissingFoodLog || isScaleFrozen || isColdStart) {
            isExpenditureOnHold = true;
            // Expenditure holds constant
        }
        else {
            // Dynamic thermodynamic mass-balance update:
            // Expenditure_t = Intake_t - Delta_EnergyStored_t
            // Delta_EnergyStored_t = (TrendWeight_t - TrendWeight_{t-1}) * rho_tissue
            const prevTrend = t > 0 ? trendWeights[t - 1] : trendWeights[0];
            const deltaStoredEnergy = (trendWeights[t] - prevTrend) * tissueDensity;
            const rawExpenditure = intakeKcal - deltaStoredEnergy;
            // Clamp raw expenditure between [1000, 6000] kcal/day
            const clampedRaw = Math.max(exports.MIN_EXPENDITURE_CLAMP_KCAL, Math.min(exports.MAX_EXPENDITURE_CLAMP_KCAL, rawExpenditure));
            // Recursive EMA update for expenditure (alpha = 0.20, N = 9)
            const nextExpenditure = (exports.EXPENDITURE_ALPHA * clampedRaw) +
                ((1.0 - exports.EXPENDITURE_ALPHA) * runningExpenditure);
            runningExpenditure = Math.round(Math.max(exports.MIN_EXPENDITURE_CLAMP_KCAL, Math.min(exports.MAX_EXPENDITURE_CLAMP_KCAL, nextExpenditure)));
            isExpenditureOnHold = false;
        }
        // Energy balance computations
        let energyBalanceKcal = null;
        let energyDeficitKcal = null;
        let energySurplusKcal = null;
        if (isValidIntake) {
            energyBalanceKcal = intakeKcal - runningExpenditure;
            energyDeficitKcal = Math.max(0, runningExpenditure - intakeKcal);
            energySurplusKcal = Math.max(0, intakeKcal - runningExpenditure);
        }
        // Weekly Rate of Change
        const { weeklyChangeKg, weeklyChangePercent } = computeWeeklyRateOfChange(trendWeights, t);
        outputs.push({
            date: item.date,
            scaleWeightKg: item.rawWeightKg,
            isInterpolatedWeight: item.isInterpolated,
            trendWeightKg: currTrend,
            weeklyWeightChangeKg: weeklyChangeKg,
            weeklyWeightChangePercent: weeklyChangePercent,
            expenditureKcal: runningExpenditure,
            isExpenditureOnHold,
            energyBalanceKcal,
            energyDeficitKcal,
            energySurplusKcal
        });
    }
    return outputs;
}

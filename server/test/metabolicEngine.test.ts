import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDailyAnalytics,
  project30DayWeightTrend,
  PredictionStyle,
  DailyLogInput,
  UserMetabolicProfile,
  WEIGHT_TREND_ALPHA,
  resolveTissueEnergyDensity,
  addDaysToIso
} from '../src/services/metabolicEngine.js';

describe('MacroFactor-Grade Metabolic & Weight Trend Analytics Engine', () => {

  // ==========================================================================
  // TEST SCENARIO 1: Gap Test
  // ==========================================================================
  test('Scenario 1: Gap Test - Linear weight interpolation over missing days without NaN/null', () => {
    // Days 1-3 logged, Day 4-5 missing weight, Day 6 logged
    const logs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeightKg: 80.0, caloriesConsumed: 2200 },
      { date: '2026-01-02', scaleWeightKg: 80.0, caloriesConsumed: 2200 },
      { date: '2026-01-03', scaleWeightKg: 80.0, caloriesConsumed: 2200 },
      { date: '2026-01-04', caloriesConsumed: 2200 }, // missing weight
      { date: '2026-01-05', caloriesConsumed: 2200 }, // missing weight
      { date: '2026-01-06', scaleWeightKg: 83.0, caloriesConsumed: 2200 },
    ];

    const results = processDailyAnalytics(logs);

    assert.equal(results.length, 6, 'Should output 6 contiguous daily records');

    // Day 4 and Day 5 must be interpolated
    assert.equal(results[3].isInterpolatedWeight, true, 'Day 4 weight should be marked interpolated');
    assert.equal(results[3].scaleWeightKg, null, 'Day 4 raw scale weight should be null');
    assert.ok(!isNaN(results[3].trendWeightKg), 'Day 4 trend weight should not be NaN');
    assert.ok(results[3].trendWeightKg !== null, 'Day 4 trend weight should not be null');

    assert.equal(results[4].isInterpolatedWeight, true, 'Day 5 weight should be marked interpolated');
    assert.equal(results[4].scaleWeightKg, null, 'Day 5 raw scale weight should be null');
    assert.ok(!isNaN(results[4].trendWeightKg), 'Day 5 trend weight should not be NaN');

    // Day 6 is a direct weigh-in
    assert.equal(results[5].isInterpolatedWeight, false, 'Day 6 weight should not be interpolated');
    assert.equal(results[5].scaleWeightKg, 83.0, 'Day 6 raw scale weight should be 83.0');

    // Weights linearly interpolated between Day 3 (80.0) and Day 6 (83.0):
    // Day 4 = 80 + 1 * (83 - 80) / 3 = 81.0
    // Day 5 = 80 + 2 * (83 - 80) / 3 = 82.0
    // Smooth trend progression:
    assert.ok(results[3].trendWeightKg > results[2].trendWeightKg, 'Trend weight should smoothly increase on Day 4');
    assert.ok(results[4].trendWeightKg > results[3].trendWeightKg, 'Trend weight should smoothly increase on Day 5');
    assert.ok(results[5].trendWeightKg > results[4].trendWeightKg, 'Trend weight should smoothly increase on Day 6');
  });

  // ==========================================================================
  // TEST SCENARIO 2: Outlier Resistance Test
  // ==========================================================================
  test('Scenario 2: Outlier Resistance Test - EMA alpha=0.10 damps 90% of single-day salt/water spike', () => {
    // Stable weigh-ins at 80.0 kg for 10 days. On Day 11, a 83.0 kg salt/water spike occurs.
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 10; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-01-${dayStr}`,
        scaleWeightKg: 80.0,
        caloriesConsumed: 2200
      });
    }
    // Day 11 spike
    logs.push({
      date: '2026-01-11',
      scaleWeightKg: 83.0,
      caloriesConsumed: 2200
    });

    const results = processDailyAnalytics(logs);

    // On days 1-10, trend is exactly 80.0
    for (let i = 0; i < 10; i++) {
      assert.equal(results[i].trendWeightKg, 80.0, `Day ${i + 1} trend weight should be 80.0 kg`);
    }

    // Day 11 expected trend weight:
    // 80.0 * 0.90 + 83.0 * 0.10 = 72.0 + 8.3 = 80.3 kg
    const day11Trend = results[10].trendWeightKg;
    assert.equal(day11Trend, 80.3, 'Day 11 trend weight must be exactly 80.3 kg, damping 90% of outlier');
  });

  // ==========================================================================
  // TEST SCENARIO 3: Expenditure Hold Test
  // ==========================================================================
  test('Scenario 3: Expenditure Hold Test - Holds Day 7 expenditure and deficits return null when food logs missing', () => {
    // Days 1-7: complete logging
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 7; i++) {
      logs.push({
        date: `2026-01-0${i}`,
        scaleWeightKg: 80.0,
        caloriesConsumed: 2400
      });
    }
    // Days 8-10: user stops logging food (calories missing, isFasted false)
    for (let i = 8; i <= 10; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-01-${dayStr}`,
        scaleWeightKg: 80.0
        // caloriesConsumed missing
      });
    }

    const results = processDailyAnalytics(logs);
    const day7Expenditure = results[6].expenditureKcal;

    assert.equal(results[6].isExpenditureOnHold, false, 'Day 7 should not be on hold');

    // Days 8, 9, 10 must hold Day 7 expenditure and deficits must be null
    for (let i = 7; i < 10; i++) {
      const r = results[i];
      assert.equal(r.expenditureKcal, day7Expenditure, `Day ${i + 1} expenditure must hold Day 7 value`);
      assert.equal(r.isExpenditureOnHold, true, `Day ${i + 1} isExpenditureOnHold must be true`);
      assert.equal(r.energyBalanceKcal, null, `Day ${i + 1} energyBalanceKcal must be null`);
      assert.equal(r.energyDeficitKcal, null, `Day ${i + 1} energyDeficitKcal must be null`);
      assert.equal(r.energySurplusKcal, null, `Day ${i + 1} energySurplusKcal must be null`);
    }
  });

  // ==========================================================================
  // TEST SCENARIO 4: Fasting Day Test
  // ==========================================================================
  test('Scenario 4: Fasting Day Test - isFasted: true updates expenditure and deficit equals expenditure', () => {
    // Days 1-7 complete logging
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 7; i++) {
      logs.push({
        date: `2026-01-0${i}`,
        scaleWeightKg: 80.0,
        caloriesConsumed: 2400
      });
    }
    // Day 8: fasting day
    logs.push({
      date: '2026-01-08',
      scaleWeightKg: 79.9,
      isFasted: true // intentional 0 kcal
    });

    const results = processDailyAnalytics(logs);
    const day8 = results[7];

    assert.equal(day8.isExpenditureOnHold, false, 'Fasting day should not be on hold');
    assert.ok(day8.expenditureKcal > 0, 'Calibrated expenditure should be positive');
    assert.equal(day8.energyDeficitKcal, day8.expenditureKcal, 'Energy deficit on fasting day must equal calibrated expenditure');
    assert.equal(day8.energySurplusKcal, 0, 'Energy surplus on fasting day must be 0');
    assert.equal(day8.energyBalanceKcal, -day8.expenditureKcal, 'Energy balance on fasting day must be negative expenditure');
  });

  // ==========================================================================
  // TEST SCENARIO 5: Projection Cone Test
  // ==========================================================================
  test('Scenario 5: Projection Cone Test - Bounds expand monotonically by sqrt(30/1) ≈ 5.47x', () => {
    // Generate 14 days of realistic logs to calibrate
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 14; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-01-${dayStr}`,
        scaleWeightKg: 80.0 + (Math.sin(i) * 0.4), // natural water fluctuations
        caloriesConsumed: 2200
      });
    }

    const profile: UserMetabolicProfile = {
      goalRatePerWeekKg: -0.5,
      gender: 'male',
      initialExpenditureKcal: 2400
    };

    const results = processDailyAnalytics(logs, profile);
    const latestDay = results[results.length - 1];

    const projections = project30DayWeightTrend(
      latestDay,
      results,
      profile,
      PredictionStyle.GOAL_RATE
    );

    assert.equal(projections.length, 30, 'Should return exactly 30 projected days');

    const d1 = projections[0];
    const d30 = projections[29];

    // Margin at day offset
    const margin1 = d1.upperConfidenceBoundKg - d1.projectedWeightKg;
    const margin30 = d30.upperConfidenceBoundKg - d30.projectedWeightKg;

    // Check monotonic expansion of uncertainty cone
    let prevMargin = 0;
    for (let i = 0; i < projections.length; i++) {
      const pt = projections[i];
      const margin = pt.upperConfidenceBoundKg - pt.projectedWeightKg;
      assert.ok(pt.upperConfidenceBoundKg >= pt.projectedWeightKg, `Day ${i + 1} upper bound >= projected`);
      assert.ok(pt.lowerConfidenceBoundKg <= pt.projectedWeightKg, `Day ${i + 1} lower bound <= projected`);
      if (i > 0) {
        assert.ok(margin >= prevMargin, `Uncertainty margin should monotonically expand at day ${i + 1}`);
      }
      prevMargin = margin;
    }

    // Ratio check: sqrt(30 / 1) ≈ 5.477
    const expectedRatio = Math.sqrt(30 / 1);
    const actualRatio = margin30 / margin1;

    // Allow delta for 2-decimal point discretization: e.g. 1.07 / 0.19 = 5.63 vs 5.48
    assert.ok(
      Math.abs(actualRatio - expectedRatio) < 0.25,
      `Uncertainty cone expansion factor (${actualRatio.toFixed(2)}) must be approximately ${expectedRatio.toFixed(2)}x`
    );
  });

  // ==========================================================================
  // ADDITIONAL TESTS: Prediction Styles, Forbes/Hall Model & Guardrails
  // ==========================================================================
  describe('Additional Prediction Styles & Guardrail Validations', () => {
    test('Supports RECENT_RATE and BLENDED prediction styles', () => {
      const logs: DailyLogInput[] = [];
      for (let i = 1; i <= 14; i++) {
        const dayStr = i < 10 ? `0${i}` : `${i}`;
        logs.push({
          date: `2026-01-${dayStr}`,
          scaleWeightKg: 80.0 - (i * 0.1), // losing 0.1 kg/day = -0.7 kg/week
          caloriesConsumed: 2000
        });
      }

      const profile: UserMetabolicProfile = {
        goalRatePerWeekKg: -0.35, // Coaching target: -0.35 kg/week
        gender: 'male'
      };

      const results = processDailyAnalytics(logs, profile);
      const latest = results[results.length - 1];

      const projGoal = project30DayWeightTrend(latest, results, profile, PredictionStyle.GOAL_RATE);
      const projRecent = project30DayWeightTrend(latest, results, profile, PredictionStyle.RECENT_RATE);
      const projBlended = project30DayWeightTrend(latest, results, profile, PredictionStyle.BLENDED);

      // Verify that blended projection sits between goal and recent
      const d30Goal = projGoal[29].projectedWeightKg;
      const d30Recent = projRecent[29].projectedWeightKg;
      const d30Blended = projBlended[29].projectedWeightKg;

      assert.ok(d30Recent < d30Goal, 'Recent rate (-0.7 kg/wk) loses weight faster than goal (-0.35 kg/wk)');
      assert.ok(
        d30Blended < d30Goal && d30Blended > d30Recent,
        'Blended projection at day 30 should sit strictly between goal rate and recent rate'
      );
    });

    test('Tissue energy density adjusts dynamically via Forbes/Hall and clamps within [6000, 8200]', () => {
      // 15% body fat
      const density15 = resolveTissueEnergyDensity({ bodyFatPercentage: 0.15 });
      assert.equal(density15, 6000, 'Low body fat should clamp at 6,000 kcal/kg');

      // 80% body fat: 0.8 * 9400 + 0.2 * 1800 = 7520 + 360 = 7880
      const density80 = resolveTissueEnergyDensity({ bodyFatPercentage: 80 });
      assert.equal(density80, 7880, '80% body fat should resolve to 7,880 kcal/kg');

      // 95% body fat: 0.95 * 9400 + 0.05 * 1800 = 8930 + 90 = 9020 -> clamps to 8200
      const density95 = resolveTissueEnergyDensity({ bodyFatPercentage: 0.95 });
      assert.equal(density95, 8200, 'Extreme body fat should clamp at 8,200 kcal/kg');

      // Default when omitted
      const defaultDensity = resolveTissueEnergyDensity();
      assert.equal(defaultDensity, 7700, 'Default tissue density should be standard 7,700 kcal/kg');
    });

    test('Continuity Threshold: Freezes expenditure when weigh-ins absent for > 7 consecutive days', () => {
      const logs: DailyLogInput[] = [];
      // Days 1-5 logged with weights
      for (let i = 1; i <= 5; i++) {
        logs.push({
          date: `2026-01-0${i}`,
          scaleWeightKg: 80.0,
          caloriesConsumed: 2200
        });
      }
      // Days 6-15 have food logged, but NO weigh-ins (>7 days missing scale weight)
      for (let i = 6; i <= 15; i++) {
        const dayStr = i < 10 ? `0${i}` : `${i}`;
        logs.push({
          date: `2026-01-${dayStr}`,
          caloriesConsumed: 2200
        });
      }

      const results = processDailyAnalytics(logs);

      // On Day 14 (9 consecutive days without scale weight > 7), expenditure must be on hold
      const day14 = results[13];
      assert.equal(day14.isExpenditureOnHold, true, 'Expenditure should freeze when scale weigh-ins absent > 7 days');
    });
  });
});

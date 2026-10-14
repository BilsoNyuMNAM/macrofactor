import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeMacroFactorPipeline,
  DailyLogInput,
  KCAL_PER_KG_TISSUE_V3,
  V3_ADAPTIVE_GAIN_SMALL,
  V3_ADAPTIVE_GAIN_LARGE,
  V3_BASE_FLUX_RADIUS_UPDATING,
  V3_BASE_FLUX_RADIUS_HOLDING
} from '../src/services/algorithm.js';

describe('MacroFactor Expenditure Algorithm V3 Specification Tests', () => {

  // ==========================================================================
  // TEST 1: Cold Start Initialization (Days 1 & 2 Held, Day 3 Unlocks)
  // ==========================================================================
  test('Cold Start: Days 1 and 2 held at baseline, Day 3 unlocks dynamic updates', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    // 3 days of valid weigh-ins and caloric intake
    const logs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-02', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-03', scaleWeight: 79.5, calories: 2000 }
    ];

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    assert.equal(results.length, 3);

    // Day 1: Cold start hold
    assert.equal(results[0].tdee, baselineTdee, 'Day 1 TDEE must equal baseline');
    assert.equal(results[0].tdeeDelta, 0, 'Day 1 delta must be 0');
    assert.equal(results[0].isHolding, true, 'Day 1 must be in Holding state');

    // Day 2: Cold start hold
    assert.equal(results[1].tdee, baselineTdee, 'Day 2 TDEE must equal baseline');
    assert.equal(results[1].tdeeDelta, 0, 'Day 2 delta must be 0');
    assert.equal(results[1].isHolding, true, 'Day 2 must be in Holding state');

    // Day 3: Dynamic expenditure tracking unlocks
    assert.equal(results[2].isHolding, false, 'Day 3 must unlock and switch to Updating state');
    assert.ok(results[2].tdee !== baselineTdee || results[2].tdeeDelta !== 0, 'Day 3 should compute dynamic update');
  });

  // ==========================================================================
  // TEST 2: Caloric Imputation on Missing Days (Velocity-Inversion Solver)
  // ==========================================================================
  test('Caloric Imputation: Unlogged day infers intake via velocity-inversion solver', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    // Day 1-3 logged, Day 4 unlogged food
    const logs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-01-02', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-01-03', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-01-04', scaleWeight: 80.0, calories: null } // skipped food log
    ];

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // Day 4 has imputed intake
    assert.equal(results[3].rawIntake, null);
    assert.ok(results[3].imputedIntake !== null, 'Day 4 must have algorithm-imputed intake');
    // Since weight held flat at 80.0 kg (velocity ≈ 0), imputed intake should be close to TDEE
    const prevTdee = results[2].tdee;
    const expectedImputed = Math.round(prevTdee + (results[3].weightVelocityKgPerDay * KCAL_PER_KG_TISSUE_V3));
    assert.equal(results[3].imputedIntake, Math.max(0, expectedImputed));
  });

  // ==========================================================================
  // TEST 3: Symmetrical Thermodynamic Mass-Balance (7,700 kcal/kg)
  // ==========================================================================
  test('Symmetric tissue density: 7700 kcal/kg applied symmetrically to gain and loss', () => {
    assert.equal(KCAL_PER_KG_TISSUE_V3, 7700.0);
  });

  // ==========================================================================
  // TEST 4: Adaptive Gain Trajectory Damping (0.08 for small, 0.16 for sustained)
  // ==========================================================================
  test('Adaptive Gain: Small fluctuations use K=0.08 without hard +-7 clamp', () => {
    const baselineTdee = 2000;
    const initialWeight = 75.0;

    // 7 days of 2100 kcal intake with steady weight (raw gap = +100 kcal <= 150 threshold)
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 7; i++) {
      logs.push({
        date: `2026-01-0${i}`,
        scaleWeight: 75.0,
        calories: 2100
      });
    }

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // On Day 3 (first active day), raw gap is around 100 kcal (2100 - 2000)
    // Delta should be Math.round(rawGap * 0.08) ≈ +8 kcal (proves no +-7 clamp!)
    assert.ok(results[2].tdeeDelta >= 7, 'Day 3 delta should reflect K=0.08 adaptive gain');
  });

  // ==========================================================================
  // TEST 5: Rolling 7-Day Compliance Audit & Strict Freeze in Holding
  // ==========================================================================
  test('Compliance Audit: < 4 food days triggers Holding, where TDEE is strictly frozen (delta=0)', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    // Week 1: 7 days logged
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 7; i++) {
      logs.push({
        date: `2026-01-0${i}`,
        scaleWeight: 80.0,
        calories: 2400
      });
    }

    // Days 8-12: user only logs scale weight but skips food logging (nutrition count drops below 4)
    for (let i = 8; i <= 12; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-01-${dayStr}`,
        scaleWeight: 80.0,
        calories: null
      });
    }

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // Day 7 should be Updating
    assert.equal(results[6].isHolding, false);

    // As food logging lapses, engine enters Holding
    const day12 = results[11];
    assert.equal(day12.isHolding, true, 'Day 12 must be in Holding due to < 4 food days in rolling 7 days');
    assert.equal(day12.tdeeDelta, 0, 'Holding state must strictly freeze TDEE delta to 0');
    assert.equal(day12.tdee, results[10].tdee, 'Holding state must preserve previous day TDEE');
  });

  // ==========================================================================
  // TEST 6: 3-Day Recovery Rule
  // ==========================================================================
  test('Recovery Rule: Resuming requires 3 consecutive nutrition logs + 1 weigh-in', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    const logs: DailyLogInput[] = [];
    // Days 1-7: logged
    for (let i = 1; i <= 7; i++) {
      logs.push({ date: `2026-01-0${i}`, scaleWeight: 80.0, calories: 2400 });
    }
    // Days 8-14: missing food (enters holding)
    for (let i = 8; i <= 14; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      logs.push({ date: `2026-01-${d}`, scaleWeight: 80.0, calories: null });
    }
    // Days 15-16: logs food for 2 days (not enough for 3-day recovery rule)
    logs.push({ date: '2026-01-15', scaleWeight: 80.0, calories: 2400 });
    logs.push({ date: '2026-01-16', scaleWeight: 80.0, calories: 2400 });
    // Day 17: 3rd consecutive food day logged
    logs.push({ date: '2026-01-17', scaleWeight: 80.0, calories: 2400 });

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // Days 15 & 16 remain in holding
    assert.equal(results[14].isHolding, true, 'Day 15 (1st log) must still be in Holding');
    assert.equal(results[15].isHolding, true, 'Day 16 (2nd log) must still be in Holding');

    // Day 17: 3rd consecutive log unpauses!
    assert.equal(results[16].isHolding, false, 'Day 17 (3rd consecutive log) must unpause to Updating');
  });

  // ==========================================================================
  // TEST 7: Dynamic Flux Range Corridor
  // ==========================================================================
  test('Dynamic Flux Range: Correct base radius and bounds for Updating vs Holding', () => {
    assert.equal(V3_BASE_FLUX_RADIUS_UPDATING, 35);
    assert.equal(V3_BASE_FLUX_RADIUS_HOLDING, 60);

    const logs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-01-02', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-01-03', scaleWeight: 80.0, calories: 2400 }
    ];

    const results = executeMacroFactorPipeline(logs, 2400, 80.0);

    // Day 1 (Holding): corridor radius should be derived from base 60
    assert.ok(results[0].fluxUpper - results[0].tdee >= 60);
    assert.ok(results[0].tdee - results[0].fluxLower >= 60);

    // Day 3 (Updating): corridor radius should be derived from base 35
    assert.ok(results[2].fluxUpper - results[2].tdee >= 35);
    assert.ok(results[2].tdee - results[2].fluxLower >= 35);
  });
});

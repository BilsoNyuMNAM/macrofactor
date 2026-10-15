import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeMacroFactorPipeline,
  DailyLogInput,
  calculateHeaderMetrics,
  V3_DAILY_DELTA_CLAMP_KCAL
} from '../src/services/algorithm.js';
import { GROUND_TRUTH_FIXTURE } from './expenditureDifferential.test.js';

describe('MacroFactor Dynamic Expenditure Regression Suite', () => {

  // ==========================================================================
  // REGRESSION TEST 1: Short-term 0.7 kg weight drop
  // ==========================================================================
  test('Regression 1: Short-term 0.7 kg weight drop does not cause metabolic spike', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    // 14 days of stable weight 80.0 kg and 2400 kcal intake
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-02-${d}`,
        scaleWeight: 80.0,
        calories: 2400
      });
    }

    // Days 15-17: Rapid water weight drop of 0.7 kg (down to 79.3 kg) with stable intake
    logs.push({ date: '2026-02-15', scaleWeight: 79.7, calories: 2400 });
    logs.push({ date: '2026-02-16', scaleWeight: 79.5, calories: 2400 });
    logs.push({ date: '2026-02-17', scaleWeight: 79.3, calories: 2400 });

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // In old 7-day velocity without damping, raw demand spiked to 2900+ kcal/day.
    // In reference 19-day horizon, the change is smoothly damped.
    const day17 = results[16];
    assert.ok(Math.abs(day17.tdeeDelta) <= V3_DAILY_DELTA_CLAMP_KCAL, 'Day 17 delta strictly respects +-8 clamp');
    // Ensure TDEE didn't jump by more than 15 kcal total over the 3-day drop
    const tdeeJump = day17.tdee - results[13].tdee;
    assert.ok(tdeeJump <= 15, `3-day TDEE rise was ${tdeeJump} kcal, which is safely damped`);
  });

  // ==========================================================================
  // REGRESSION TEST 2: Large raw TDEE deviation
  // ==========================================================================
  test('Regression 2: Extreme raw TDEE deviation strictly clamped to +-8 kcal/day', () => {
    const baselineTdee = 2000;
    const initialWeight = 75.0;

    // 7 days of tracking, day 5 has an extreme 5,000 kcal intake (raw gap > 1,000 kcal)
    const logs: DailyLogInput[] = [
      { date: '2026-03-01', scaleWeight: 75.0, calories: 2000 },
      { date: '2026-03-02', scaleWeight: 75.0, calories: 2000 },
      { date: '2026-03-03', scaleWeight: 75.0, calories: 2000 },
      { date: '2026-03-04', scaleWeight: 75.0, calories: 2000 },
      { date: '2026-03-05', scaleWeight: 75.0, calories: 5000 }, // massive binge
      { date: '2026-03-06', scaleWeight: 75.0, calories: 2000 },
      { date: '2026-03-07', scaleWeight: 75.0, calories: 2000 }
    ];

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    for (let i = 0; i < results.length; i++) {
      assert.ok(
        Math.abs(results[i].tdeeDelta) <= 8,
        `Day ${i} delta ${results[i].tdeeDelta} exceeded +-8 clamp despite 5,000 kcal binge`
      );
    }
    // Day 5 (index 4) delta must be bounded at +8 max
    assert.ok(results[4].tdeeDelta <= 8 && results[4].tdeeDelta >= 0);
  });

  // ==========================================================================
  // REGRESSION TEST 3: Strict +-8 kcal/day daily limit on erratic inputs
  // ==========================================================================
  test('Regression 3: Strict +-8 kcal/day limit invariant holds across 30 erratic days', () => {
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 30; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-04-${d}`,
        scaleWeight: 70.0 + (Math.sin(i) * 3.0), // erratic +-3 kg fluctuations
        calories: 1500 + (Math.cos(i) * 1500)   // erratic 0 to 3000 kcal intake
      });
    }

    const results = executeMacroFactorPipeline(logs, 2200, 70.0);

    for (const r of results) {
      assert.ok(
        Math.abs(r.tdeeDelta) <= 8,
        `Date ${r.date}: delta ${r.tdeeDelta} violated strict +-8 kcal/day invariant`
      );
    }
  });

  // ==========================================================================
  // REGRESSION TEST 4: Sustained expenditure changes
  // ==========================================================================
  test('Regression 4: Sustained caloric surplus adapts smoothly without oscillation', () => {
    const baselineTdee = 2000;
    const initialWeight = 70.0;

    // 21 days of continuous surplus: 2600 kcal every day (+600 surplus)
    const logs: DailyLogInput[] = [];
    for (let i = 1; i <= 21; i++) {
      const d = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-05-${d}`,
        scaleWeight: 70.0 + (i * 0.05), // steadily gaining 0.35 kg/week
        calories: 2600
      });
    }

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // Days 1-3: held at baseline
    assert.equal(results[0].tdee, 2000);
    assert.equal(results[1].tdee, 2000);
    assert.equal(results[2].tdee, 2000);

    // Days 4-21: TDEE moves monotonically upward toward surplus
    for (let i = 4; i < results.length; i++) {
      assert.ok(results[i].tdee >= results[i - 1].tdee, `TDEE on day ${i} did not move upward`);
      assert.ok(results[i].tdeeDelta >= 0, `Delta on day ${i} was negative during sustained surplus`);
      assert.ok(results[i].tdeeDelta <= 8, `Delta on day ${i} exceeded 8 kcal`);
    }
    assert.ok(results[20].tdee > baselineTdee, 'TDEE successfully adapted upward');
  });

  // ==========================================================================
  // REGRESSION TEST 5: Missing and incomplete logging days
  // ==========================================================================
  test('Regression 5: Fasting, partial days, and unlogged days handled according to specification', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    const logs: DailyLogInput[] = [
      { date: '2026-06-01', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-06-02', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-06-03', scaleWeight: 80.0, calories: 2400 },
      // Day 4: Fasting day (isFasting: true, 0 kcal)
      { date: '2026-06-04', scaleWeight: 79.9, calories: null, isFasting: true },
      // Day 5: Partial day (isPartial: true, incomplete food log)
      { date: '2026-06-05', scaleWeight: 79.9, calories: 800, isPartial: true },
      // Day 6: Missing day (unlogged)
      { date: '2026-06-06', scaleWeight: 79.9, calories: null }
    ];

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // Day 4: Fasting day is valid intake (0 kcal)
    assert.equal(results[3].isFasting, true);
    assert.equal(results[3].rawIntake, 0);
    assert.equal(results[3].isValidIntake, true);

    // Day 5: Partial day is invalid intake, uses velocity-inversion imputed calories
    assert.equal(results[4].isValidIntake, false);
    assert.ok(results[4].imputedIntake !== null, 'Partial day must have imputed intake');

    // Day 6: Missing day has imputed calories
    assert.equal(results[5].isValidIntake, false);
    assert.ok(results[5].imputedIntake !== null, 'Unlogged day must have imputed intake');
  });

  // ==========================================================================
  // REGRESSION TEST 6: Repeated execution idempotency
  // ==========================================================================
  test('Regression 6: Repeated execution on identical data produces deterministic output', () => {
    const inputs: DailyLogInput[] = GROUND_TRUTH_FIXTURE.map(row => ({
      date: row.date,
      scaleWeight: row.scaleWeight,
      calories: row.calories
    }));

    const run1 = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);
    const run2 = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);

    assert.equal(run1.length, run2.length);
    for (let i = 0; i < run1.length; i++) {
      assert.equal(run1[i].tdee, run2[i].tdee);
      assert.equal(run1[i].tdeeDelta, run2[i].tdeeDelta);
      assert.equal(run1[i].trendWeight, run2[i].trendWeight);
      assert.equal(run1[i].strategy, run2[i].strategy);
    }
  });

  // ==========================================================================
  // REGRESSION TEST 7: Empirical reference dataset (+397 kcal vs +20 kcal mismatch)
  // ==========================================================================
  test('Regression 7: Empirical MacroFactor dataset produces ~+20 kcal Difference KPI, not +397 kcal', () => {
    const inputs: DailyLogInput[] = GROUND_TRUTH_FIXTURE.map(row => ({
      date: row.date,
      scaleWeight: row.scaleWeight,
      calories: row.calories
    }));

    const results = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);
    const metrics = calculateHeaderMetrics(results, '1M');

    // Ground truth starting TDEE
    assert.equal(results[0].tdee, 2353);

    // Difference KPI must be near MacroFactor ground truth (+20 kcal), NOT the erroneous +397 kcal
    const rawDiff = metrics?.expenditure.rawDifference ?? 0;
    assert.ok(
      rawDiff < 60 && rawDiff > 0,
      `Difference KPI was ${rawDiff} kcal. Must track MacroFactor reference (+20 kcal) and NOT blow up to +397 kcal`
    );

    // Final stored TDEE must be near MacroFactor ground truth (2373 kcal), NOT 2750 kcal
    const finalTdee = results[results.length - 1].tdee;
    assert.ok(
      Math.abs(finalTdee - 2373) <= 30,
      `Final TDEE was ${finalTdee} kcal. Must be near reference 2373 kcal, NOT 2750 kcal`
    );

    // Day 4 delta must be clamped to -8 kcal (near reference -7 kcal), NOT plunging -85 kcal
    assert.equal(results[3].tdeeDelta, -8);
    assert.equal(results[3].tdee, 2345);
  });
});

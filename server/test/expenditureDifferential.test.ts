import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executeMacroFactorPipeline, DailyLogInput } from '../src/services/algorithm.js';

/**
 * Empirical Ground-Truth Dataset from MacroFactor-20261014193702.xlsx
 * User App Export: 31 calendar days (2026-09-14 to 2026-10-14)
 */
export const GROUND_TRUTH_FIXTURE = [
  { date: '2026-09-14', scaleWeight: 81.1, calories: 1810, expTrend: 80.80, expTdee: 2353, expDelta: 0, expHolding: true },
  { date: '2026-09-15', scaleWeight: 80.3, calories: 1700, expTrend: 80.75, expTdee: 2353, expDelta: 0, expHolding: true },
  { date: '2026-09-16', scaleWeight: 80.5, calories: 1713, expTrend: 80.72, expTdee: 2353, expDelta: 0, expHolding: true },
  { date: '2026-09-17', scaleWeight: 81.2, calories: 1750, expTrend: 80.77, expTdee: 2346, expDelta: -7, expHolding: false },
  { date: '2026-09-18', scaleWeight: null, calories: null, expTrend: 80.73, expTdee: 2338, expDelta: -8, expHolding: false },
  { date: '2026-09-19', scaleWeight: 79.5, calories: 1900, expTrend: 80.60, expTdee: 2333, expDelta: -5, expHolding: false },
  { date: '2026-09-20', scaleWeight: 80.2, calories: 1900, expTrend: 80.56, expTdee: 2328, expDelta: -5, expHolding: false },
  { date: '2026-09-21', scaleWeight: 80.6, calories: 1750, expTrend: 80.57, expTdee: 2323, expDelta: -5, expHolding: false },
  { date: '2026-09-22', scaleWeight: 79.4, calories: 1800, expTrend: 80.45, expTdee: 2318, expDelta: -5, expHolding: false },
  { date: '2026-09-23', scaleWeight: 78.7, calories: 1800, expTrend: 80.28, expTdee: 2317, expDelta: -1, expHolding: false },
  { date: '2026-09-24', scaleWeight: 79.1, calories: 1800, expTrend: 80.16, expTdee: 2316, expDelta: -1, expHolding: false },
  { date: '2026-09-25', scaleWeight: 79.5, calories: 1800, expTrend: 80.09, expTdee: 2315, expDelta: -1, expHolding: false },
  { date: '2026-09-26', scaleWeight: 79.1, calories: 3500, expTrend: 79.99, expTdee: 2314, expDelta: -1, expHolding: false },
  { date: '2026-09-27', scaleWeight: 79.4, calories: 1800, expTrend: 79.93, expTdee: 2319, expDelta: 5, expHolding: false },
  { date: '2026-09-28', scaleWeight: 78.5, calories: 1700, expTrend: 79.79, expTdee: 2325, expDelta: 6, expHolding: false },
  { date: '2026-09-29', scaleWeight: null, calories: 1900, expTrend: 79.68, expTdee: 2329, expDelta: 4, expHolding: false },
  { date: '2026-09-30', scaleWeight: 78.8, calories: 1900, expTrend: 79.59, expTdee: 2333, expDelta: 4, expHolding: false },
  { date: '2026-10-01', scaleWeight: 78.9, calories: 2000, expTrend: 79.52, expTdee: 2336, expDelta: 3, expHolding: false },
  { date: '2026-10-02', scaleWeight: null, calories: 1950, expTrend: 79.43, expTdee: 2340, expDelta: 4, expHolding: false },
  { date: '2026-10-03', scaleWeight: 78.3, calories: null, expTrend: 79.32, expTdee: 2343, expDelta: 3, expHolding: false },
  { date: '2026-10-04', scaleWeight: null, calories: 3500, expTrend: 79.20, expTdee: 2346, expDelta: 3, expHolding: false },
  { date: '2026-10-05', scaleWeight: null, calories: 1650, expTrend: 79.09, expTdee: 2354, expDelta: 8, expHolding: false },
  { date: '2026-10-06', scaleWeight: null, calories: 1650, expTrend: 78.97, expTdee: 2360, expDelta: 6, expHolding: false },
  { date: '2026-10-07', scaleWeight: 77.8, calories: 1627, expTrend: 78.85, expTdee: 2365, expDelta: 5, expHolding: false },
  { date: '2026-10-08', scaleWeight: null, calories: null, expTrend: 78.74, expTdee: 2369, expDelta: 4, expHolding: false },
  { date: '2026-10-09', scaleWeight: null, calories: null, expTrend: 78.64, expTdee: 2371, expDelta: 2, expHolding: false },
  { date: '2026-10-10', scaleWeight: 77.7, calories: null, expTrend: 78.55, expTdee: 2372, expDelta: 1, expHolding: false },
  { date: '2026-10-11', scaleWeight: 77.3, calories: null, expTrend: 78.42, expTdee: 2374, expDelta: 2, expHolding: false },
  { date: '2026-10-12', scaleWeight: null, calories: null, expTrend: 78.34, expTdee: 2373, expDelta: -1, expHolding: false },
  { date: '2026-10-13', scaleWeight: 77.8, calories: 2000, expTrend: 78.28, expTdee: 2373, expDelta: 0, expHolding: true },
  { date: '2026-10-14', scaleWeight: 77.8, calories: 1946, expTrend: 78.23, expTdee: 2373, expDelta: 0, expHolding: true }
];

describe('MacroFactor Behavioral Equivalence Differential Suite', () => {

  const inputs: DailyLogInput[] = GROUND_TRUTH_FIXTURE.map(row => ({
    date: row.date,
    scaleWeight: row.scaleWeight,
    calories: row.calories
  }));

  test('Trend Weight Behavioral Equivalence: alpha = 0.10 matches empirical EMA within 0.02 kg', () => {
    const results = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);
    assert.equal(results.length, GROUND_TRUTH_FIXTURE.length);

    for (let i = 0; i < results.length; i++) {
      const actual = results[i].trendWeight;
      const expected = GROUND_TRUTH_FIXTURE[i].expTrend;
      const diff = Math.abs(actual - expected);
      assert.ok(
        diff <= 0.02,
        `Day ${i} (${GROUND_TRUTH_FIXTURE[i].date}): TrendWeight ${actual} vs expected ${expected} (diff: ${diff.toFixed(2)} exceeds 0.02 kg)`
      );
    }
  });

  test('Cold Start Behavioral Equivalence: First 3 calendar days (indices 0, 1, 2) held flat', () => {
    const results = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);

    // Days 1, 2, and 3 must be strictly held
    for (let i = 0; i < 3; i++) {
      assert.equal(results[i].tdee, 2353, `Day ${i + 1} TDEE must match baseline 2353`);
      assert.equal(results[i].tdeeDelta, 0, `Day ${i + 1} delta must be 0`);
      assert.equal(results[i].isHolding, true, `Day ${i + 1} must be in Holding state`);
    }

    // Day 4 unlocks dynamic updating
    assert.equal(results[3].isHolding, false, 'Day 4 must unlock and switch to Updating state');
  });

  test('Daily Step Rate Limiter: Daily deltas never exceed [-8, +8] kcal/day bound', () => {
    const results = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);

    for (let i = 0; i < results.length; i++) {
      const delta = results[i].tdeeDelta;
      assert.ok(
        delta >= -8 && delta <= 8,
        `Day ${i} (${GROUND_TRUTH_FIXTURE[i].date}): Delta ${delta} exceeds daily rate limit [-8, +8]`
      );
    }
  });

  test('Holding Safeguard Recovery Rule: Days 30 and 31 (Oct 13, 14) frozen at 2373 kcal', () => {
    const results = executeMacroFactorPipeline(inputs, 2353, 80.80, 0.10);

    const oct13 = results.find(r => r.date === '2026-10-13')!;
    const oct14 = results.find(r => r.date === '2026-10-14')!;

    assert.equal(oct13.isHolding, true, 'Oct 13 must be in Holding');
    assert.equal(oct13.tdeeDelta, 0, 'Oct 13 delta must be 0');

    assert.equal(oct14.isHolding, true, 'Oct 14 must be in Holding');
    assert.equal(oct14.tdeeDelta, 0, 'Oct 14 delta must be 0');
  });
});

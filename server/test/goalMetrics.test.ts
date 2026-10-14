import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCalorieFloors,
  calculateGoalEta,
  solveGoalMetrics
} from '../src/services/algorithm.js';

describe('Goal Math & Physiological Calorie Floor Service', () => {

  describe('evaluateCalorieFloors()', () => {
    test('Male standard floor (1500 kcal) and low floor (1200 kcal)', () => {
      assert.equal(evaluateCalorieFloors(1600, 'male'), 'none');
      assert.equal(evaluateCalorieFloors(1500, 'male'), 'none');
      assert.equal(evaluateCalorieFloors(1499, 'male'), 'standard_floor');
      assert.equal(evaluateCalorieFloors(1200, 'male'), 'standard_floor');
      assert.equal(evaluateCalorieFloors(1199, 'male'), 'low_floor');
      assert.equal(evaluateCalorieFloors(900, 'male'), 'low_floor');
    });

    test('Female standard floor (1200 kcal) and low floor (1000 kcal)', () => {
      assert.equal(evaluateCalorieFloors(1300, 'female'), 'none');
      assert.equal(evaluateCalorieFloors(1200, 'female'), 'none');
      assert.equal(evaluateCalorieFloors(1199, 'female'), 'standard_floor');
      assert.equal(evaluateCalorieFloors(1000, 'female'), 'standard_floor');
      assert.equal(evaluateCalorieFloors(999, 'female'), 'low_floor');
      assert.equal(evaluateCalorieFloors(850, 'female'), 'low_floor');
    });
  });

  describe('calculateGoalEta()', () => {
    test('Calculates accurate ETA and progress percentage for weight loss', () => {
      // Start: 81.1 kg, Current Trend: 78.07 kg, Target: 76.0 kg, Rate: 0.39 kg/wk
      const result = calculateGoalEta(78.07, 76.0, 0.39, 81.1);

      assert.equal(result.totalDeltaKg, 5.1); // |81.1 - 76.0|
      assert.equal(result.remainingDeltaKg, 2.07); // |78.07 - 76.0|
      // Progress made = 5.1 - 2.07 = 3.03 kg -> 3.03 / 5.1 = 59.4% -> 59%
      assert.equal(result.percentComplete, 59);
      // Weeks = 2.07 / 0.39 = 5.30 -> ceil = 6 weeks
      assert.equal(result.etaWeeks, 6);
      assert.ok(result.targetDate !== null);
    });

    test('Maintenance goal has null ETA and 100% completion', () => {
      const result = calculateGoalEta(78.0, null, 0, 78.0);
      assert.equal(result.etaWeeks, null);
      assert.equal(result.targetDate, null);
      assert.equal(result.totalDeltaKg, 0);
      assert.equal(result.remainingDeltaKg, 0);
      assert.equal(result.percentComplete, 100);
    });

    test('Goal reached condition returns 100% complete and 0 weeks remaining', () => {
      const result = calculateGoalEta(76.0, 76.0, 0.40, 81.1);
      assert.equal(result.remainingDeltaKg, 0);
      assert.equal(result.percentComplete, 100);
      assert.equal(result.etaWeeks, 0);
    });
  });

  describe('solveGoalMetrics()', () => {
    test('Calculates correct deficit, calories, classification and floor for fat loss', () => {
      // TDEE: 2372 kcal, Weight: 78.07 kg, Rate: -0.50% BW/wk, Target: 76.0 kg, Male, Start: 81.1 kg
      const metrics = solveGoalMetrics(2372, 78.07, -0.50, 76.0, 'male', 81.1);

      // weeklyRateKg = 0.5% of 78.07 = 0.39 kg/wk
      assert.equal(metrics.weeklyRateKg, 0.39);
      // dailyDeficit = -0.5% * 78.07 * 7700 / 7 = -429.385 -> -429 kcal
      assert.equal(metrics.dailyDeficitKcal, -429);
      // projected calories = 2372 - 429 = 1943 kcal
      assert.equal(metrics.projectedTargetCalories, 1943);
      // Floor warning: 1943 > 1500 -> none
      assert.equal(metrics.calorieFloorWarning, 'none');
      assert.equal(metrics.classificationBand, 'moderate');
      assert.equal(metrics.estimatedWeeks, 6);
      assert.equal(metrics.percentComplete, 59);
    });

    test('Flags aggressive rate hitting calorie floor', () => {
      // Low TDEE with high loss rate pushing calories under standard floor
      // TDEE: 1600 kcal, Weight: 70 kg, Rate: -1.20% BW/wk, Male
      const metrics = solveGoalMetrics(1600, 70.0, -1.20, 65.0, 'male', 70.0);

      // weeklyRateKg = 0.84 kg
      assert.equal(metrics.weeklyRateKg, 0.84);
      // dailyDeficit = -1.2% * 70 * 7700 / 7 = -924 kcal
      assert.equal(metrics.dailyDeficitKcal, -924);
      // projected calories = 1600 - 924 = 676 kcal (< 1200) -> low_floor!
      assert.equal(metrics.calorieFloorWarning, 'low_floor');
      assert.equal(metrics.classificationBand, 'fast');
    });

    test('Handles weight gain surplus calculation', () => {
      // TDEE: 2500, Weight: 75 kg, Rate: +0.25% BW/wk, Target: 80 kg
      const metrics = solveGoalMetrics(2500, 75.0, 0.25, 80.0, 'male', 75.0);

      assert.equal(metrics.weeklyRateKg, 0.19);
      // surplus using 8500 kcal/kg tissue gain: +0.25% * 75 * 8500 / 7 = +228 kcal
      assert.equal(metrics.dailyDeficitKcal, 228);
      assert.equal(metrics.projectedTargetCalories, 2728);
      assert.equal(metrics.calorieFloorWarning, 'none');
      assert.equal(metrics.classificationBand, 'slow');
    });
  });
});

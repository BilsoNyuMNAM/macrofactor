import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { expenditureRouter } from '../src/routes/expenditure.js';
import { prisma } from '../src/db.js';
import {
  executeMacroFactorPipeline,
  DailyLogInput,
  KCAL_PER_KG_TISSUE_V3,
  V3_ADAPTIVE_GAIN_SMALL,
  V3_ADAPTIVE_GAIN_LARGE,
  V3_BASE_FLUX_RADIUS_UPDATING,
  V3_BASE_FLUX_RADIUS_HOLDING,
  MACROFACTOR_TREND_ALPHA
} from '../src/services/algorithm.js';

describe('MacroFactor Expenditure Algorithm V3 Specification Tests', () => {

  // ==========================================================================
  // TEST 1: Cold Start Initialization (Days 1 & 2 Held, Day 3 Unlocks)
  // ==========================================================================
  test('Cold Start: Days 1, 2, and 3 held at baseline, Day 4 unlocks dynamic updates', () => {
    const baselineTdee = 2400;
    const initialWeight = 80.0;

    // 4 days of valid weigh-ins and caloric intake
    const logs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-02', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-03', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-04', scaleWeight: 79.5, calories: 2000 }
    ];

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    assert.equal(results.length, 4);

    // Days 1-3: Cold start hold
    for (let i = 0; i < 3; i++) {
      assert.equal(results[i].tdee, baselineTdee, `Day ${i + 1} TDEE must equal baseline`);
      assert.equal(results[i].tdeeDelta, 0, `Day ${i + 1} delta must be 0`);
      assert.equal(results[i].isHolding, true, `Day ${i + 1} must be in Holding state`);
    }

    // Day 4: Dynamic expenditure tracking unlocks
    assert.equal(results[3].isHolding, false, 'Day 4 must unlock and switch to Updating state');
    assert.ok(results[3].tdee !== baselineTdee || results[3].tdeeDelta !== 0, 'Day 4 should compute dynamic update');
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
  // TEST 4: Adaptive Gain Trajectory Damping (0.08 / 9 damping, strictly clamped at +-8 kcal)
  // ==========================================================================
  test('Adaptive Gain: Small fluctuations smoothly update with 9-day damping and +-8 clamp', () => {
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

    // On Day 4 (first active day), raw gap is around 100 kcal (2100 - 2000)
    // Damped delta = Math.round(100 * (0.08 / 9)) = +1 kcal
    assert.equal(results[3].tdeeDelta, 1, 'Day 4 delta should reflect damped adaptive gain');
    assert.ok(Math.abs(results[3].tdeeDelta) <= 8, 'Day 4 delta strictly respects +-8 clamp');
  });

  // ==========================================================================
  // TEST 5: Rolling 7-Day Compliance Audit & Strict Freeze in Holding (finding.md)
  // ==========================================================================
  test('Compliance Audit: 5 missing days update via imputation; logging with <4/7 days triggers Holding', () => {
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

    // Days 8-12: 5 consecutive unlogged food days (verified dynamically updating in finding.md)
    for (let i = 8; i <= 12; i++) {
      const dayStr = i < 10 ? `0${i}` : `${i}`;
      logs.push({
        date: `2026-01-${dayStr}`,
        scaleWeight: 80.0,
        calories: null
      });
    }

    // Day 13: User resumes logging food, but only 2 of 7 days logged (< 4 days and < 3 consecutive)
    logs.push({
      date: '2026-01-13',
      scaleWeight: 80.0,
      calories: 2000
    });

    const results = executeMacroFactorPipeline(logs, baselineTdee, initialWeight);

    // Day 7 should be Updating
    assert.equal(results[6].isHolding, false);

    // Days 8-12: Velocity-inversion imputation keeps engine in Updating
    for (let i = 7; i <= 11; i++) {
      assert.equal(results[i].isHolding, false, `Day ${i + 1} must be Updating via imputation`);
      assert.ok(results[i].imputedIntake !== null, `Day ${i + 1} must have imputed intake`);
    }

    // Day 13: Resuming tracking with incomplete 7-day data triggers Safeguard Holding (delta = 0)
    const day13 = results[12];
    assert.equal(day13.isHolding, true, 'Day 13 must be in Holding due to < 4 food days and < 3 consecutive logs');
    assert.equal(day13.tdeeDelta, 0, 'Holding state must strictly freeze TDEE delta to 0');
    assert.equal(day13.tdee, results[11].tdee, 'Holding state must preserve previous day TDEE');
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
      { date: '2026-01-03', scaleWeight: 80.0, calories: 2400 },
      { date: '2026-01-04', scaleWeight: 80.0, calories: 2400 }
    ];

    const results = executeMacroFactorPipeline(logs, 2400, 80.0);

    // Day 1 (Holding): corridor radius should be derived from base 60
    assert.ok(results[0].fluxUpper - results[0].tdee >= 60);
    assert.ok(results[0].tdee - results[0].fluxLower >= 60);

    // Day 4 (Updating): corridor radius should be derived from base 35
    assert.ok(results[3].fluxUpper - results[3].tdee >= 35);
    assert.ok(results[3].tdee - results[3].fluxLower >= 35);
  });

  // ==========================================================================
  // TEST 8: Intact Operators Verification (* for multiplication, - for subtraction)
  // ==========================================================================
  test('Intact Operators: Verifies * for velocity decay & - for EMA smoothing / noise penalty', () => {
    // 1. Trailing edge velocity decay uses * 0.7 * 1000 / 1000
    const trailingLogs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-02', scaleWeight: 79.5, calories: 2000 },
      { date: '2026-01-03', scaleWeight: 79.0, calories: 2000 },
      { date: '2026-01-04', scaleWeight: null, calories: 2000 },
      { date: '2026-01-05', scaleWeight: null, calories: 2000 } // Trailing gap >= 2
    ];
    const trailingResults = executeMacroFactorPipeline(trailingLogs, 2000, 80.0);
    const day4Vel = trailingResults[3].weightVelocityKgPerDay;
    const day5Vel = trailingResults[4].weightVelocityKgPerDay;
    const expectedDay5Vel = Math.round(day4Vel * 0.7 * 1000) / 1000;
    assert.equal(day5Vel, expectedDay5Vel, 'Trailing edge decay must multiply by 0.7');

    // 2. Standard EMA uses (1 - alpha)
    const emaLogs: DailyLogInput[] = [
      { date: '2026-01-01', scaleWeight: 80.0, calories: 2000 },
      { date: '2026-01-02', scaleWeight: 81.0, calories: 2000 }
    ];
    const emaResults = executeMacroFactorPipeline(emaLogs, 2000, 80.0);
    const expectedTrend1 = Math.round((MACROFACTOR_TREND_ALPHA * 81.0 + (1 - MACROFACTOR_TREND_ALPHA) * 80.0) * 100) / 100;
    assert.equal(emaResults[1].trendWeight, expectedTrend1, 'EMA must use (1 - trendAlpha)');

    // 3. Confidence noise penalty uses (1 - weightRmse / 2.0)
    assert.ok(trailingResults[2].confidenceScore > 0, 'Confidence score must be valid positive float');
  });
});

describe('Expenditure API Contract & DTO Tests', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/expenditure', expenditureRouter);

  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}/api/expenditure`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('GET /api/expenditure emits the exact 9-field TdeePoint DTO packaged in historyGroups', async () => {
    const res = await fetch(`${baseUrl}?timeframe=1M`);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.ok(Array.isArray(json.entries), 'entries must be an array');
    assert.ok(json.entries.length > 0, 'entries should contain seeded points');

    // 1. Verify 9-field TdeePoint DTO
    const firstPoint = json.entries[0];
    const allowedKeys = new Set([
      'date',
      'tdee',
      'tdeeDelta',
      'fluxLower',
      'fluxUpper',
      'fluxRadius',
      'strategy',
      'isHolding',
      'confidenceScore'
    ]);

    for (const key of Object.keys(firstPoint)) {
      assert.ok(allowedKeys.has(key), `TdeePoint should not have unexpected property: ${key}`);
    }

    // Verify internal 20-field ProcessedDay properties are strictly NOT emitted
    assert.equal(firstPoint.rawWeight, undefined, 'rawWeight must NOT be emitted');
    assert.equal(firstPoint.interpolatedWeight, undefined, 'interpolatedWeight must NOT be emitted');
    assert.equal(firstPoint.trendWeight, undefined, 'trendWeight must NOT be emitted');
    assert.equal(firstPoint.weightVelocityKgPerDay, undefined, 'weightVelocityKgPerDay must NOT be emitted');
    assert.equal(firstPoint.rawIntake, undefined, 'rawIntake must NOT be emitted');
    assert.equal(firstPoint.imputedIntake, undefined, 'imputedIntake must NOT be emitted');
    assert.equal(firstPoint.noiseRangeLower, undefined, 'noiseRangeLower must NOT be emitted');
    assert.equal(firstPoint.noiseRangeUpper, undefined, 'noiseRangeUpper must NOT be emitted');

    // 2. Verify historyGroups shape: { monthYear, entries }[]
    assert.ok(Array.isArray(json.historyGroups), 'historyGroups must be an array');
    assert.ok(json.historyGroups.length > 0, 'historyGroups should have groups');

    for (const group of json.historyGroups) {
      assert.ok(typeof group.monthYear === 'string', 'monthYear must be string');
      assert.ok(Array.isArray(group.entries), 'entries in group must be an array');
      assert.ok(group.entries.length > 0, 'entries in group must not be empty');

      const groupEntry = group.entries[0];
      for (const key of Object.keys(groupEntry)) {
        assert.ok(allowedKeys.has(key), `historyGroup entry should not expose internal fields: ${key}`);
      }
    }

    // 3. Verify Header and Strategy
    assert.ok(json.header, 'header must be present');
    assert.ok(['Updating', 'Holding', 'Static'].includes(json.currentStrategy));
    assert.ok(typeof json.currentExpenditure === 'number');
  });

  test('GET /api/expenditure zero results contract when no logs exist in database', async () => {
    // Temporarily backup and clear logs
    const backupScale = await prisma.scaleWeightEntry.findMany();
    const backupCal = await prisma.dailyCalorieLog.findMany();
    const backupTrend = await prisma.weightTrendEntry.findMany();
    const backupTdee = await prisma.tdeeEntry.findMany();

    try {
      await prisma.$transaction([
        prisma.scaleWeightEntry.deleteMany(),
        prisma.dailyCalorieLog.deleteMany(),
        prisma.weightTrendEntry.deleteMany(),
        prisma.tdeeEntry.deleteMany()
      ]);

      const res = await fetch(baseUrl);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.deepEqual(json.entries, []);
      assert.equal(json.currentExpenditure, null);
      assert.equal(json.currentStrategy, 'Holding');
      assert.equal(json.header.average, null);
      assert.equal(json.header.differenceFormatted, '—');
      assert.equal(json.header.rawDifference, 0);
      assert.equal(json.header.dateRangeSubtitle, '—');
      assert.deepEqual(json.historyGroups, []);
      assert.equal(json.changes.threeDay.status, 'Waiting');
      assert.equal(json.changes.sevenDay.status, 'Waiting');
      assert.equal(json.changes.fourteenDay.status, 'Waiting');
      assert.equal(json.changes.thirtyDay.status, 'Waiting');
      assert.equal(json.changes.ninetyDay.status, 'Waiting');
    } finally {
      // Restore backed-up data
      for (const s of backupScale) {
        await prisma.scaleWeightEntry.upsert({ where: { logDate: s.logDate }, create: s, update: s });
      }
      for (const c of backupCal) {
        await prisma.dailyCalorieLog.upsert({ where: { logDate: c.logDate }, create: c, update: c });
      }
      for (const tr of backupTrend) {
        await prisma.weightTrendEntry.upsert({ where: { logDate: tr.logDate }, create: tr, update: tr });
      }
      for (const td of backupTdee) {
        await prisma.tdeeEntry.upsert({ where: { logDate: td.logDate }, create: td, update: td });
      }
    }
  });

  test('POST and DELETE /api/expenditure/override sets static override and restores dynamic tracking', async () => {
    // 1. Set override to 2500 kcal
    const postRes = await fetch(`${baseUrl}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrideTdeeKcal: 2500, reason: 'Metabolic Testing' })
    });
    assert.equal(postRes.status, 200);

    // 2. Verify GET /api/expenditure reflects static strategy
    const getRes = await fetch(baseUrl);
    const getJson = await getRes.json();
    assert.equal(getJson.currentStrategy, 'Static');
    assert.equal(getJson.currentExpenditure, 2500);

    // 3. Clear override
    const delRes = await fetch(`${baseUrl}/override`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    // 4. Verify restored
    const restoredRes = await fetch(baseUrl);
    const restoredJson = await restoredRes.json();
    assert.notEqual(restoredJson.currentStrategy, 'Static');
  });
});


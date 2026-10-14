import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import http from 'http';
import { strategyRouter } from '../src/routes/strategy.js';
import { prisma } from '../src/db.js';

describe('Strategy Program & Goal Management Service', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/strategy', strategyRouter);

  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}/api/strategy`;
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

  it('POST /api/strategy/program creates a new coached program with overall calories and 7 daily targets', async () => {
    const res = await fetch(`${baseUrl}/program`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programStyle: 'coached'
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.plan);
    assert.strictEqual(json.plan.isActive, true);
    assert.strictEqual(json.plan.programStyle, 'coached');
    assert.strictEqual(json.plan.dailyTargets.length, 7);
    assert.strictEqual(json.plan.weeklyBudgetKcal, json.plan.targetCalories * 7);
  });

  it('POST /api/strategy/program allocates higher calorie days conserving weekly calorie budget', async () => {
    const res = await fetch(`${baseUrl}/program`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programStyle: 'collaborative',
        targetCalories: 2000,
        higherCalorieDays: [5, 6], // Fri, Sat
        higherCalorieSurplus: 250
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.plan.targetCalories, 2000);
    assert.strictEqual(json.plan.weeklyBudgetKcal, 14000);

    // Sum of the 7 daily targets must equal weekly budget
    const targets = json.plan.dailyTargets;
    assert.strictEqual(targets.length, 7);
    const sumCalories = targets.reduce((acc: number, t: any) => acc + t.targetCalories, 0);
    assert.strictEqual(sumCalories, 14000);

    // Friday and Saturday should be higher calorie days
    const fri = targets.find((t: any) => t.dayOfWeek === 5);
    const sat = targets.find((t: any) => t.dayOfWeek === 6);
    const sun = targets.find((t: any) => t.dayOfWeek === 0);

    assert.strictEqual(fri.isHigherCalorieDay, true);
    assert.strictEqual(fri.targetCalories, 2250);
    assert.strictEqual(sat.isHigherCalorieDay, true);
    assert.strictEqual(sat.targetCalories, 2250);
    assert.strictEqual(sun.isHigherCalorieDay, false);
    assert.strictEqual(sun.targetCalories, 1900); // (14000 - 4500) / 5 = 9500 / 5 = 1900
  });

  it('PUT /api/strategy/program updates program style and target calories', async () => {
    const res = await fetch(`${baseUrl}/program`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        programStyle: 'manual',
        targetCalories: 2100
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.plan.programStyle, 'manual');
    assert.strictEqual(json.plan.targetCalories, 2100);
    assert.strictEqual(json.plan.dailyTargets.length, 7);
  });
});

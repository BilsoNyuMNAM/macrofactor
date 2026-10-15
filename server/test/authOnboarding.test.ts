import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import http from 'http';
import { authRouter } from '../src/routes/auth.js';
import { prisma } from '../src/db.js';

describe('Auth & Onboarding Service', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}/api/auth`;
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

  it('POST /api/auth/register creates a new user with isOnboarded = false regardless of existing DB profile', async () => {
    const testEmail = `newuser_${Date.now()}@example.com`;
    const res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
        displayName: 'New Trainee',
      }),
    });

    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.user.email, testEmail);
    assert.strictEqual(json.user.isOnboarded, false, 'New user must NOT be marked as onboarded upon signup');
    assert.ok(json.token, 'Token must be issued');

    // Verify login for this un-onboarded user also reports isOnboarded: false
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
      }),
    });
    assert.strictEqual(loginRes.status, 200);
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.user.isOnboarded, false, 'Login must reflect user is not yet onboarded');
  });

  it('POST /api/auth/login returns isOnboarded = true for the pre-seeded demo user', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@macrofactor.app',
        password: 'password123',
      }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.user.email, 'demo@macrofactor.app');
    assert.strictEqual(json.user.isOnboarded, true, 'Demo account is pre-onboarded');
  });

  it('POST /api/auth/complete-onboarding isolates new user and preserves seed database', async () => {
    const testEmail = `isolate_${Date.now()}@example.com`;
    // Register new account
    await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
        displayName: 'Isolated User',
      }),
    });

    // Complete onboarding with unique weight (88.5 kg)
    const onboardRes = await fetch(`${baseUrl}/complete-onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        startingWeightKg: 88.5,
        baselineTdee: 2600,
        goal: { goalType: 'weight_loss', targetWeightKg: 82.0, weeklyRatePercent: -0.6 },
        program: { programStyle: 'coached', dietStyle: 'balanced', targetCalories: 2100 },
      }),
    });

    assert.strictEqual(onboardRes.status, 200);
    const onboardJson = await onboardRes.json();
    assert.strictEqual(onboardJson.success, true);
    assert.ok(onboardJson.onboardingData, 'Must return onboardingData');
    assert.strictEqual(onboardJson.onboardingData.startingWeightKg, 88.5);

    // Verify seed profile id: 1 is NOT overwritten (still 81.1 kg initialWeightKg from seed.ts)
    const seedProfile = await prisma.userProfile.findUnique({ where: { id: 1 } });
    assert.ok(seedProfile);
    assert.strictEqual(seedProfile.initialWeightKg, 81.1, 'Seed profile initialWeightKg must remain 81.1');

    // Verify Oct 14 scale weight is NOT overwritten (still 77.8 kg from seed.ts)
    const oct14 = await prisma.scaleWeightEntry.findFirst({ where: { logDate: '2026-10-14' } });
    assert.ok(oct14);
    assert.strictEqual(oct14.scaleWeight, 77.8, 'Oct 14 scale weight must remain 77.8 kg');

    // Verify login returns isOnboarded: true and onboardingData
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!',
      }),
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginJson.user.isOnboarded, true);
    assert.strictEqual(loginJson.user.onboardingData?.startingWeightKg, 88.5);
  });
});


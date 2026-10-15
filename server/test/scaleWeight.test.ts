import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import http from 'http';
import { scaleWeightRouter } from '../src/routes/scaleWeight.js';
import { prisma } from '../src/db.js';
import { recalculatePipeline } from '../src/services/algorithm.js';

describe('Scale Weight API & Data Aggregation Service', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/scale-weight', scaleWeightRouter);

  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await prisma.scaleWeightEntry.deleteMany({ where: { logDate: '2026-10-15' } });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}/api/scale-weight`;
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

  it('GET /api/scale-weight?timeframe=1W returns exact 7-day timeline with interpolation and metrics', async () => {
    const res = await fetch(`${baseUrl}?timeframe=1W`);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.ok(json.header, 'Header metrics must be present');
    assert.ok(json.header.average >= 77.0 && json.header.average <= 78.5, 'Average weight should be around ~77.6 kg');
    assert.strictEqual(json.header.unit, 'kg');
    assert.ok(json.header.differenceFormatted.includes('kg'), 'Difference must include kg unit');
    assert.ok(json.header.dateRangeSubtitle.includes('Oct 2026'), 'Subtitle must include Oct 2026');

    // Chart points
    assert.strictEqual(json.chart.points.length, 7, '1W window must contain exactly 7 daily points');
    const oct14 = json.chart.points.find((p: any) => p.date === '2026-10-14');
    assert.ok(oct14, 'Oct 14 point must exist');
    assert.strictEqual(oct14.hasEntry, true);
    assert.strictEqual(oct14.scaleWeight, 77.8);

    // Missing day interpolation test (Oct 12 had no log)
    const oct12 = json.chart.points.find((p: any) => p.date === '2026-10-12');
    assert.ok(oct12, 'Oct 12 point must exist');
    assert.strictEqual(oct12.hasEntry, false);
    assert.strictEqual(oct12.scaleWeight, null);
    assert.ok(oct12.interpolatedWeight > 77.0 && oct12.interpolatedWeight < 78.0, 'Interpolation must bridge Oct 11 and Oct 13');
  });

  it('GET /api/scale-weight groups history entries chronologically by month', async () => {
    const res = await fetch(`${baseUrl}`);
    assert.strictEqual(res.status, 200);

    const json = await res.json();
    assert.ok(Array.isArray(json.history), 'History must be an array of month groups');
    assert.ok(json.history.length >= 1, 'At least October 2026 should be present');

    const octGroup = json.history.find((g: any) => g.monthYear === 'October 2026');
    assert.ok(octGroup, 'October 2026 group must exist');
    assert.ok(octGroup.entries.length >= 6, 'October group should contain at least 6 entries');

    // Check first entry in descending order is Oct 14
    const firstEntry = octGroup.entries[0];
    assert.strictEqual(firstEntry.logDate, '2026-10-14');
    assert.strictEqual(firstEntry.weightKg, 77.8);
    assert.strictEqual(firstEntry.formattedDate, 'Wed, 14 Oct');
  });

  it('POST /api/scale-weight creates or updates a scale weight entry and triggers recalculation', async () => {
    const testDate = '2026-10-15';
    const testWeight = 77.5;

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: testDate, weightKg: testWeight, notes: 'Automated test weigh-in' })
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);

    const entry = await prisma.scaleWeightEntry.findFirst({ where: { logDate: testDate } });
    assert.ok(entry);
    assert.strictEqual(entry.scaleWeight, testWeight);

    // Clean up test entry
    await prisma.scaleWeightEntry.delete({ where: { logDate: testDate } });
    await recalculatePipeline();
  });
});

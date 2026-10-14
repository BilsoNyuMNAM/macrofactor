import { Router } from 'express';
import { prisma } from '../db.js';
import {
  calculateHeaderMetrics,
  calculateMultiHorizonChanges,
  calculate21DayTypicalMetrics,
  ProcessedDay
} from '../services/algorithm.js';

export const trendRouter = Router();

trendRouter.get('/', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') || '1W';

    const trendEntries = await prisma.weightTrendEntry.findMany({
      orderBy: { logDate: 'asc' }
    });

    const scaleEntries = await prisma.scaleWeightEntry.findMany({
      orderBy: { loggedAt: 'asc' }
    });

    const tdeeEntries = await prisma.tdeeEntry.findMany({
      orderBy: { logDate: 'asc' }
    });

    const scaleMap = new Map<string, number>();
    for (const s of scaleEntries) {
      scaleMap.set(s.logDate, s.weightKg);
    }

    const tdeeMap = new Map(tdeeEntries.map(t => [t.logDate, t]));

    if (trendEntries.length === 0) {
      return res.json({
        entries: [],
        header: {
          average: null,
          differenceFormatted: '—',
          rawDifference: 0,
          dateRangeSubtitle: '—'
        },
        changes: {
          threeDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
          sevenDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
          fourteenDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
          thirtyDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
          ninetyDay: { delta: '—', status: 'Waiting', sparklinePoints: [] }
        },
        analytics: {
          currentWeight: null,
          weeklyRateKg: null,
          weeklyRateFormatted: '—',
          dailyDeficitKcal: null,
          dailyDeficitFormatted: '—',
          projected30d: null
        }
      });
    }

    const processedDays: ProcessedDay[] = trendEntries.map(t => {
      const td = tdeeMap.get(t.logDate);
      return {
        date: t.logDate,
        rawWeight: scaleMap.get(t.logDate) ?? null,
        interpolatedWeight: t.trendWeightKg,
        trendWeight: t.trendWeightKg,
        weightVelocityKgPerDay: t.velocityKgPerDay,
        rawIntake: null,
        imputedIntake: null,
        isFasting: false,
        isValidIntake: true,
        tdee: td?.expenditureKcal ?? 2340,
        tdeeDelta: td?.tdeeDeltaKcal ?? 0,
        fluxUpper: td?.fluxUpperKcal ?? 2400,
        fluxLower: td?.fluxLowerKcal ?? 2300,
        fluxRadius: (td?.fluxUpperKcal && td?.fluxLowerKcal) ? (td.fluxUpperKcal - td.fluxLowerKcal) / 2 : 45,
        strategy: (td?.status as any) ?? 'updating',
        isHolding: td?.status === 'holding',
        isColdStart: false,
        confidenceScore: 1,
        noiseRangeLower: t.noiseRangeLowerKg ?? t.trendWeightKg - 0.3,
        noiseRangeUpper: t.noiseRangeUpperKg ?? t.trendWeightKg + 0.3
      };
    });

    const header = calculateHeaderMetrics(processedDays, timeframe);
    const horizonChanges = calculateMultiHorizonChanges(processedDays);
    const typicalMetrics = calculate21DayTypicalMetrics(processedDays);

    const latest = trendEntries[trendEntries.length - 1];

    const mergedEntries = trendEntries.map(t => ({
      date: t.logDate,
      scaleWeight: scaleMap.get(t.logDate) ?? null,
      trendWeight: t.trendWeightKg,
      velocity: t.velocityKgPerDay,
      noiseRangeLower: t.noiseRangeLowerKg,
      noiseRangeUpper: t.noiseRangeUpperKg
    }));

    const changeByHorizon: Record<string, any> = {};
    const keyMap: Record<number, string> = {
      3: 'threeDay',
      7: 'sevenDay',
      14: 'fourteenDay',
      30: 'thirtyDay',
      90: 'ninetyDay'
    };
    for (const h of horizonChanges) {
      const key = keyMap[h.horizonDays];
      if (key) {
        changeByHorizon[key] = {
          delta: h.weightDeltaFormatted,
          status: h.weightStatus,
          sparklinePoints: h.sparklineTrendPoints
        };
      }
    }

    res.json({
      entries: mergedEntries,
      header: {
        average: header?.weight.average ?? latest.trendWeightKg,
        differenceFormatted: header?.weight.differenceFormatted ?? '0.0 kg',
        rawDifference: header?.weight.rawDifference ?? 0,
        dateRangeSubtitle: header?.dateRangeSubtitle ?? '--'
      },
      changes: changeByHorizon,
      analytics: {
        currentWeight: typicalMetrics?.currentTrendWeightKg ?? latest.trendWeightKg,
        weeklyRateKg: typicalMetrics?.weeklyRateKg ?? null,
        weeklyRateFormatted: typicalMetrics?.weeklyRateFormatted ?? '—',
        dailyDeficitKcal: typicalMetrics?.dailyDeficitKcal ?? null,
        dailyDeficitFormatted: typicalMetrics?.dailyDeficitFormatted ?? '—',
        projected30d: typicalMetrics?.projected30dKg ?? null
      }
    });
  } catch (error) {
    console.error('Error fetching weight trend:', error);
    res.status(500).json({ error: 'Failed to load weight trend data' });
  }
});

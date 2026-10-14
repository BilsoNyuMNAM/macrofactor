import { Router } from 'express';
import { prisma } from '../db.js';
import {
  calculateHeaderMetrics,
  calculateMultiHorizonChanges,
  ProcessedDay
} from '../services/algorithm.js';

export const expenditureRouter = Router();

expenditureRouter.get('/', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') || '1W';

    const tdeeEntries = await prisma.tdeeEntry.findMany({
      orderBy: { logDate: 'asc' }
    });

    const trendEntries = await prisma.weightTrendEntry.findMany({
      orderBy: { logDate: 'asc' }
    });

    const trendMap = new Map(trendEntries.map(t => [t.logDate, t]));

    if (tdeeEntries.length === 0) {
      return res.json({
        entries: [],
        header: {
          average: 2340,
          differenceFormatted: '0 kcal',
          rawDifference: 0,
          dateRangeSubtitle: '--'
        },
        changes: {
          threeDay: { delta: '-- kcal', status: 'Waiting', sparklinePoints: [] },
          sevenDay: { delta: '-- kcal', status: 'Waiting', sparklinePoints: [] },
          fourteenDay: { delta: '-- kcal', status: 'Waiting', sparklinePoints: [] },
          thirtyDay: { delta: '-- kcal', status: 'Waiting', sparklinePoints: [] },
          ninetyDay: { delta: '-- kcal', status: 'Waiting', sparklinePoints: [] }
        },
        currentExpenditure: 2340,
        currentStrategy: 'Holding',
        historyGroups: []
      });
    }

    const processedDays: ProcessedDay[] = tdeeEntries.map(e => {
      const tr = trendMap.get(e.logDate);
      return {
        date: e.logDate,
        rawWeight: null,
        interpolatedWeight: tr?.trendWeightKg ?? 78.0,
        trendWeight: tr?.trendWeightKg ?? 78.0,
        weightVelocityKgPerDay: tr?.velocityKgPerDay ?? 0,
        rawIntake: null,
        isFasting: false,
        isValidIntake: true,
        tdee: e.expenditureKcal,
        tdeeDelta: e.tdeeDeltaKcal,
        fluxUpper: e.fluxUpperKcal,
        fluxLower: e.fluxLowerKcal,
        isHolding: e.status === 'holding',
        noiseRangeLower: tr?.noiseRangeLowerKg ?? 77.7,
        noiseRangeUpper: tr?.noiseRangeUpperKg ?? 78.3
      };
    });

    const header = calculateHeaderMetrics(processedDays, timeframe);
    const horizonChanges = calculateMultiHorizonChanges(processedDays);

    const latest = tdeeEntries[tdeeEntries.length - 1];

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
          delta: h.expenditureDeltaFormatted,
          status: h.expenditureStatus,
          sparklinePoints: h.sparklineTdeePoints
        };
      }
    }

    // Group entries by month for history view
    const historyGroupsMap = new Map<string, typeof tdeeEntries>();
    const reversed = [...tdeeEntries].reverse();
    for (const item of reversed) {
      const dObj = new Date(item.logDate + 'T00:00:00Z');
      const monthKey = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      if (!historyGroupsMap.has(monthKey)) {
        historyGroupsMap.set(monthKey, []);
      }
      historyGroupsMap.get(monthKey)!.push(item);
    }

    const historyGroups = Array.from(historyGroupsMap.entries()).map(([monthName, items]) => ({
      monthName,
      items: items.map(i => ({
        date: i.logDate,
        tdee: i.expenditureKcal,
        tdeeDelta: i.tdeeDeltaKcal,
        isHolding: i.status === 'holding'
      }))
    }));

    res.json({
      entries: tdeeEntries.map(e => ({
        date: e.logDate,
        tdee: e.expenditureKcal,
        fluxUpper: e.fluxUpperKcal,
        fluxLower: e.fluxLowerKcal,
        tdeeDelta: e.tdeeDeltaKcal,
        isHolding: e.status === 'holding'
      })),
      header: {
        average: header?.expenditure.average ?? latest.expenditureKcal,
        differenceFormatted: header?.expenditure.differenceFormatted ?? '0 kcal',
        rawDifference: header?.expenditure.rawDifference ?? 0,
        dateRangeSubtitle: header?.dateRangeSubtitle ?? '--'
      },
      changes: changeByHorizon,
      currentExpenditure: latest.expenditureKcal,
      currentStrategy: latest.status === 'holding' ? 'Holding' : 'Updating',
      flux: {
        lower: latest.fluxLowerKcal,
        upper: latest.fluxUpperKcal
      },
      historyGroups
    });
  } catch (error) {
    console.error('Error fetching expenditure:', error);
    res.status(500).json({ error: 'Failed to load expenditure data' });
  }
});

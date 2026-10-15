import { Router } from 'express';
import { prisma } from '../db.js';
import {
  calculateHeaderMetrics,
  calculateMultiHorizonChanges,
  executeMacroFactorPipeline,
  ProcessedDay
} from '../services/algorithm.js';

export const expenditureRouter = Router();

export interface TdeePoint {
  date: string;                  // 'YYYY-MM-DD'
  tdee: number;                  // Integer kcal
  tdeeDelta: number;             // Signed integer delta
  fluxLower: number;             // Lower corridor bound
  fluxUpper: number;             // Upper corridor bound
  fluxRadius: number;            // Half-width radius
  strategy: 'updating' | 'holding' | 'static';
  isHolding: boolean;
  confidenceScore: number;       // 0.0 to 1.0
}

export interface HorizonChange {
  delta: string;                 // e.g. "+31 kcal" or "-- kcal"
  status: 'Increase' | 'Decrease' | 'Plateau' | 'No Change' | 'Waiting';
  sparklinePoints: number[];
}

export interface ExpenditureResponse {
  entries: TdeePoint[];
  header: {
    average: number | null;
    differenceFormatted: string; // e.g. "+268 kcal" or "−14 kcal"
    rawDifference: number;
    dateRangeSubtitle: string;   // e.g. "1 Apr – 15 Apr 2026"
  };
  changes: {
    threeDay: HorizonChange;
    sevenDay: HorizonChange;
    fourteenDay: HorizonChange;
    thirtyDay: HorizonChange;
    ninetyDay: HorizonChange;
  };
  currentExpenditure: number | null;
  currentStrategy: 'Updating' | 'Holding' | 'Static';
  historyGroups: {
    monthYear: string;
    entries: TdeePoint[];
  }[];
}

expenditureRouter.get('/', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') || '1W';

    const [profile, activeGoal, scaleEntries, calorieLogs] = await Promise.all([
      prisma.userProfile.findUnique({ where: { id: 1 } }),
      prisma.goal.findFirst({ where: { status: 'active' }, orderBy: { goalId: 'desc' } }),
      prisma.scaleWeightEntry.findMany({ orderBy: { logDate: 'asc' } }),
      prisma.dailyCalorieLog.findMany({ orderBy: { logDate: 'asc' } })
    ]);

    const scaleByDate = new Map<string, number>();
    for (const s of scaleEntries) scaleByDate.set(s.logDate, s.scaleWeight);

    const calByDate = new Map<string, { calories: number | null; isFasting: boolean; isPartial: boolean }>();
    for (const c of calorieLogs) {
      calByDate.set(c.logDate, { calories: c.calories, isFasting: c.isFasting, isPartial: c.isPartial });
    }

    const allDates = new Set<string>();
    scaleEntries.forEach(s => allDates.add(s.logDate));
    calorieLogs.forEach(c => allDates.add(c.logDate));

    const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b));

    if (sortedDates.length === 0) {
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
        currentExpenditure: null,
        currentStrategy: 'Holding',
        historyGroups: []
      });
    }

    const rawInputs = sortedDates.map(date => {
      const nut = calByDate.get(date);
      return {
        date,
        scaleWeight: scaleByDate.get(date) ?? null,
        calories: nut ? nut.calories : null,
        isFasting: nut ? nut.isFasting : false,
        isPartial: nut ? nut.isPartial : false
      };
    });

    // Run backend master pipeline to compute full internal ProcessedDay nodes
    const processedDays: ProcessedDay[] = executeMacroFactorPipeline(
      rawInputs,
      profile?.baselineTdee || 2353,
      activeGoal?.initialTrendWeightKg ?? profile?.initialWeightKg ?? 80.8
    );

    const header = calculateHeaderMetrics(processedDays, timeframe);
    const horizonChanges = calculateMultiHorizonChanges(processedDays);

    const latest = processedDays[processedDays.length - 1];

    const changeByHorizon: Record<string, HorizonChange> = {
      threeDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
      sevenDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
      fourteenDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
      thirtyDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
      ninetyDay: { delta: '—', status: 'Waiting', sparklinePoints: [] }
    };

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

    // Map 20-field internal ProcessedDay into the 9-field TdeePoint DTO
    const tdeePoints: TdeePoint[] = processedDays.map(p => ({
      date: p.date,
      tdee: p.tdee,
      tdeeDelta: p.tdeeDelta,
      fluxLower: p.fluxLower,
      fluxUpper: p.fluxUpper,
      fluxRadius: p.fluxRadius,
      strategy: p.strategy,
      isHolding: p.isHolding,
      confidenceScore: p.confidenceScore
    }));

    // Group into monthYear in reverse chronological order
    const historyGroupsMap = new Map<string, TdeePoint[]>();
    for (let i = tdeePoints.length - 1; i >= 0; i--) {
      const pt = tdeePoints[i];
      const dObj = new Date(pt.date + 'T00:00:00Z');
      const monthYear = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      if (!historyGroupsMap.has(monthYear)) {
        historyGroupsMap.set(monthYear, []);
      }
      historyGroupsMap.get(monthYear)!.push(pt);
    }

    const historyGroups = Array.from(historyGroupsMap.entries()).map(([monthYear, entries]) => ({
      monthYear,
      monthName: monthYear, // alias for frontend UI component compatibility
      entries,
      items: entries // alias for frontend UI component compatibility
    }));

    const currentStrategy: 'Updating' | 'Holding' | 'Static' =
      latest.strategy === 'static' ? 'Static' : latest.isHolding ? 'Holding' : 'Updating';

    res.json({
      entries: tdeePoints,
      header: {
        average: header?.expenditure.average ?? latest.tdee,
        differenceFormatted: header?.expenditure.differenceFormatted ?? '0 kcal',
        rawDifference: header?.expenditure.rawDifference ?? 0,
        dateRangeSubtitle: header?.dateRangeSubtitle ?? '--'
      },
      changes: changeByHorizon,
      currentExpenditure: latest.tdee,
      currentStrategy,
      flux: {
        lower: latest.fluxLower,
        upper: latest.fluxUpper
      },
      historyGroups
    });
  } catch (error) {
    console.error('Error fetching expenditure:', error);
    res.status(500).json({ error: 'Failed to load expenditure data' });
  }
});

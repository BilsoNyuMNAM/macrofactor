import { Router } from 'express';
import { prisma } from '../db.js';
import {
  calculateHeaderMetrics,
  calculateMultiHorizonChanges,
  recalculatePipeline
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

    // 1. Read cached rows from PostgreSQL
    let [tdeeEntries, trendEntries] = await Promise.all([
      prisma.tdeeEntry.findMany({ orderBy: { logDate: 'asc' } }),
      prisma.weightTrendEntry.findMany({ orderBy: { logDate: 'asc' } })
    ]);

    // 2. If cache empty but raw data exists, populate cache via recalculatePipeline()
    if (tdeeEntries.length === 0) {
      const [scaleCount, calCount] = await Promise.all([
        prisma.scaleWeightEntry.count(),
        prisma.dailyCalorieLog.count()
      ]);
      if (scaleCount > 0 || calCount > 0) {
        await recalculatePipeline();
        [tdeeEntries, trendEntries] = await Promise.all([
          prisma.tdeeEntry.findMany({ orderBy: { logDate: 'asc' } }),
          prisma.weightTrendEntry.findMany({ orderBy: { logDate: 'asc' } })
        ]);
      }
    }

    // 3. If still empty, return zero results contract
    if (tdeeEntries.length === 0) {
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

    // 4. Build helper nodes for Header & Horizon analytics
    const trendMap = new Map<string, number>();
    for (const tr of trendEntries) {
      trendMap.set(tr.logDate, tr.trendWeightKg);
    }

    const processedDays = tdeeEntries.map(td => ({
      date: td.logDate,
      tdee: td.expenditureKcal,
      trendWeight: trendMap.get(td.logDate) ?? 0
    })) as any;

    const header = calculateHeaderMetrics(processedDays, timeframe);
    const horizonChanges = calculateMultiHorizonChanges(processedDays);

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

    // 5. Map cached PostgreSQL records into exact 9-field TdeePoint DTO
    const tdeePoints: TdeePoint[] = tdeeEntries.map(entry => {
      const radius = Math.round((entry.fluxUpperKcal - entry.fluxLowerKcal) / 2);
      const isHolding = entry.status === 'holding';
      const strategy = entry.isManualOverride
        ? 'static'
        : (entry.status as 'updating' | 'holding' | 'static');
      return {
        date: entry.logDate,
        tdee: entry.expenditureKcal,
        tdeeDelta: entry.tdeeDeltaKcal,
        fluxLower: entry.fluxLowerKcal,
        fluxUpper: entry.fluxUpperKcal,
        fluxRadius: radius,
        strategy,
        isHolding,
        confidenceScore: isHolding ? 0.25 : 0.95
      };
    });

    // 6. Group into monthYear in reverse chronological order
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

    const latest = tdeePoints[tdeePoints.length - 1];
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

// POST /api/expenditure/override - Set manual static TDEE override
expenditureRouter.post('/override', async (req, res) => {
  try {
    const { overrideTdeeKcal, reason, startDate } = req.body;
    if (!overrideTdeeKcal || typeof overrideTdeeKcal !== 'number' || overrideTdeeKcal < 1000) {
      return res.status(400).json({ error: 'Valid overrideTdeeKcal (>= 1000) is required' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    await prisma.tdeeOverride.create({
      data: {
        startDate: startDate || todayStr,
        overrideTdeeKcal: Math.round(overrideTdeeKcal),
        reason: reason || null
      }
    });

    await recalculatePipeline();

    res.json({ success: true, message: `Expenditure override set to ${overrideTdeeKcal} kcal` });
  } catch (error) {
    console.error('Error setting expenditure override:', error);
    res.status(500).json({ error: 'Failed to set expenditure override' });
  }
});

// DELETE /api/expenditure/override - Clear manual static TDEE override
expenditureRouter.delete('/override', async (_req, res) => {
  try {
    await prisma.tdeeOverride.deleteMany();
    await recalculatePipeline();
    res.json({ success: true, message: 'Expenditure override cleared' });
  } catch (error) {
    console.error('Error clearing expenditure override:', error);
    res.status(500).json({ error: 'Failed to clear expenditure override' });
  }
});

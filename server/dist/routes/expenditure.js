"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenditureRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.expenditureRouter = (0, express_1.Router)();
exports.expenditureRouter.get('/', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '1W';
        // 1. Read cached rows from PostgreSQL
        let [tdeeEntries, trendEntries] = await Promise.all([
            db_js_1.prisma.tdeeEntry.findMany({ orderBy: { logDate: 'asc' } }),
            db_js_1.prisma.weightTrendEntry.findMany({ orderBy: { logDate: 'asc' } })
        ]);
        // 2. If cache empty but raw data exists, populate cache via recalculatePipeline()
        if (tdeeEntries.length === 0) {
            const [scaleCount, calCount] = await Promise.all([
                db_js_1.prisma.scaleWeightEntry.count(),
                db_js_1.prisma.dailyCalorieLog.count()
            ]);
            if (scaleCount > 0 || calCount > 0) {
                await (0, algorithm_js_1.recalculatePipeline)();
                [tdeeEntries, trendEntries] = await Promise.all([
                    db_js_1.prisma.tdeeEntry.findMany({ orderBy: { logDate: 'asc' } }),
                    db_js_1.prisma.weightTrendEntry.findMany({ orderBy: { logDate: 'asc' } })
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
        const trendMap = new Map();
        for (const tr of trendEntries) {
            trendMap.set(tr.logDate, tr.trendWeightKg);
        }
        const processedDays = tdeeEntries.map(td => ({
            date: td.logDate,
            tdee: td.expenditureKcal,
            trendWeight: trendMap.get(td.logDate) ?? 0
        }));
        const header = (0, algorithm_js_1.calculateHeaderMetrics)(processedDays, timeframe);
        const horizonChanges = (0, algorithm_js_1.calculateMultiHorizonChanges)(processedDays);
        const changeByHorizon = {
            threeDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
            sevenDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
            fourteenDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
            thirtyDay: { delta: '—', status: 'Waiting', sparklinePoints: [] },
            ninetyDay: { delta: '—', status: 'Waiting', sparklinePoints: [] }
        };
        const keyMap = {
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
        const tdeePoints = tdeeEntries.map(entry => {
            const radius = Math.round((entry.fluxUpperKcal - entry.fluxLowerKcal) / 2);
            const isHolding = entry.status === 'holding';
            const strategy = entry.isManualOverride
                ? 'static'
                : entry.status;
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
        const historyGroupsMap = new Map();
        for (let i = tdeePoints.length - 1; i >= 0; i--) {
            const pt = tdeePoints[i];
            const dObj = new Date(pt.date + 'T00:00:00Z');
            const monthYear = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
            if (!historyGroupsMap.has(monthYear)) {
                historyGroupsMap.set(monthYear, []);
            }
            historyGroupsMap.get(monthYear).push(pt);
        }
        const historyGroups = Array.from(historyGroupsMap.entries()).map(([monthYear, entries]) => ({
            monthYear,
            monthName: monthYear, // alias for frontend UI component compatibility
            entries,
            items: entries // alias for frontend UI component compatibility
        }));
        const latest = tdeePoints[tdeePoints.length - 1];
        const currentStrategy = latest.strategy === 'static' ? 'Static' : latest.isHolding ? 'Holding' : 'Updating';
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
    }
    catch (error) {
        console.error('Error fetching expenditure:', error);
        res.status(500).json({ error: 'Failed to load expenditure data' });
    }
});
// POST /api/expenditure/override - Set manual static TDEE override
exports.expenditureRouter.post('/override', async (req, res) => {
    try {
        const { overrideTdeeKcal, reason, startDate } = req.body;
        if (!overrideTdeeKcal || typeof overrideTdeeKcal !== 'number' || overrideTdeeKcal < 1000) {
            return res.status(400).json({ error: 'Valid overrideTdeeKcal (>= 1000) is required' });
        }
        const todayStr = new Date().toISOString().split('T')[0];
        await db_js_1.prisma.tdeeOverride.create({
            data: {
                startDate: startDate || todayStr,
                overrideTdeeKcal: Math.round(overrideTdeeKcal),
                reason: reason || null
            }
        });
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: `Expenditure override set to ${overrideTdeeKcal} kcal` });
    }
    catch (error) {
        console.error('Error setting expenditure override:', error);
        res.status(500).json({ error: 'Failed to set expenditure override' });
    }
});
// DELETE /api/expenditure/override - Clear manual static TDEE override
exports.expenditureRouter.delete('/override', async (_req, res) => {
    try {
        await db_js_1.prisma.tdeeOverride.deleteMany();
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: 'Expenditure override cleared' });
    }
    catch (error) {
        console.error('Error clearing expenditure override:', error);
        res.status(500).json({ error: 'Failed to clear expenditure override' });
    }
});

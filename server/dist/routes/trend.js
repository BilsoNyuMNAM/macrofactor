"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trendRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.trendRouter = (0, express_1.Router)();
exports.trendRouter.get('/', async (req, res) => {
    try {
        const timeframe = req.query.timeframe || '1W';
        const trendEntries = await db_js_1.prisma.weightTrendEntry.findMany({
            orderBy: { logDate: 'asc' }
        });
        const scaleEntries = await db_js_1.prisma.scaleWeightEntry.findMany({
            orderBy: { loggedAt: 'asc' }
        });
        const tdeeEntries = await db_js_1.prisma.tdeeEntry.findMany({
            orderBy: { logDate: 'asc' }
        });
        const scaleMap = new Map();
        for (const s of scaleEntries) {
            scaleMap.set(s.logDate, s.weightKg);
        }
        const tdeeMap = new Map(tdeeEntries.map(t => [t.logDate, t]));
        if (trendEntries.length === 0) {
            return res.json({
                entries: [],
                header: {
                    average: 78.0,
                    differenceFormatted: '0.0 kg',
                    rawDifference: 0,
                    dateRangeSubtitle: '--'
                },
                changes: {
                    threeDay: { delta: '-- kg', status: 'Waiting', sparklinePoints: [] },
                    sevenDay: { delta: '-- kg', status: 'Waiting', sparklinePoints: [] },
                    fourteenDay: { delta: '-- kg', status: 'Waiting', sparklinePoints: [] },
                    thirtyDay: { delta: '-- kg', status: 'Waiting', sparklinePoints: [] },
                    ninetyDay: { delta: '-- kg', status: 'Waiting', sparklinePoints: [] }
                },
                analytics: {
                    currentWeight: 78.0,
                    weeklyRateKg: 0,
                    weeklyRateFormatted: '0.00',
                    dailyDeficitKcal: 0,
                    dailyDeficitFormatted: '0',
                    projected30d: 78.0
                }
            });
        }
        const processedDays = trendEntries.map(t => {
            const td = tdeeMap.get(t.logDate);
            return {
                date: t.logDate,
                rawWeight: scaleMap.get(t.logDate) ?? null,
                interpolatedWeight: t.trendWeightKg,
                trendWeight: t.trendWeightKg,
                weightVelocityKgPerDay: t.velocityKgPerDay,
                rawIntake: null,
                isFasting: false,
                isValidIntake: true,
                tdee: td?.expenditureKcal ?? 2340,
                tdeeDelta: td?.tdeeDeltaKcal ?? 0,
                fluxUpper: td?.fluxUpperKcal ?? 2400,
                fluxLower: td?.fluxLowerKcal ?? 2300,
                isHolding: td?.status === 'holding',
                noiseRangeLower: t.noiseRangeLowerKg ?? t.trendWeightKg - 0.3,
                noiseRangeUpper: t.noiseRangeUpperKg ?? t.trendWeightKg + 0.3
            };
        });
        const header = (0, algorithm_js_1.calculateHeaderMetrics)(processedDays, timeframe);
        const horizonChanges = (0, algorithm_js_1.calculateMultiHorizonChanges)(processedDays);
        const typicalMetrics = (0, algorithm_js_1.calculate21DayTypicalMetrics)(processedDays);
        const latest = trendEntries[trendEntries.length - 1];
        const mergedEntries = trendEntries.map(t => ({
            date: t.logDate,
            scaleWeight: scaleMap.get(t.logDate) ?? null,
            trendWeight: t.trendWeightKg,
            velocity: t.velocityKgPerDay,
            noiseRangeLower: t.noiseRangeLowerKg,
            noiseRangeUpper: t.noiseRangeUpperKg
        }));
        const changeByHorizon = {};
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
                weeklyRateKg: typicalMetrics?.weeklyRateKg ?? 0,
                weeklyRateFormatted: typicalMetrics?.weeklyRateFormatted ?? '0.00',
                dailyDeficitKcal: typicalMetrics?.dailyDeficitKcal ?? 0,
                dailyDeficitFormatted: typicalMetrics?.dailyDeficitFormatted ?? '0',
                projected30d: typicalMetrics?.projected30dKg ?? latest.trendWeightKg
            }
        });
    }
    catch (error) {
        console.error('Error fetching weight trend:', error);
        res.status(500).json({ error: 'Failed to load weight trend data' });
    }
});

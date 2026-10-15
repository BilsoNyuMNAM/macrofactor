"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logsRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.logsRouter = (0, express_1.Router)();
exports.logsRouter.get('/', async (_req, res) => {
    try {
        const scaleEntries = await db_js_1.prisma.scaleWeightEntry.findMany({
            orderBy: { logDate: 'desc' }
        });
        const calorieLogs = await db_js_1.prisma.dailyCalorieLog.findMany({
            orderBy: { logDate: 'desc' }
        });
        const trendEntries = await db_js_1.prisma.weightTrendEntry.findMany({
            orderBy: { logDate: 'desc' }
        });
        const tdeeEntries = await db_js_1.prisma.tdeeEntry.findMany({
            orderBy: { logDate: 'desc' }
        });
        const scaleMap = new Map();
        for (const s of scaleEntries)
            scaleMap.set(s.logDate, s.scaleWeight);
        const nutMap = new Map();
        for (const n of calorieLogs) {
            nutMap.set(n.logDate, { calories: n.calories, isFasting: n.isFasting, isPartial: n.isPartial });
        }
        const trendMap = new Map();
        for (const t of trendEntries)
            trendMap.set(t.logDate, t.trendWeightKg);
        const tdeeMap = new Map();
        for (const td of tdeeEntries) {
            tdeeMap.set(td.logDate, { tdee: td.expenditureKcal, isHolding: td.status === 'holding' });
        }
        const allDates = new Set();
        scaleEntries.forEach(s => allDates.add(s.logDate));
        calorieLogs.forEach(n => allDates.add(n.logDate));
        trendEntries.forEach(t => allDates.add(t.logDate));
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const logs = sortedDates.map(date => {
            const nut = nutMap.get(date);
            const td = tdeeMap.get(date);
            return {
                date,
                scaleWeight: scaleMap.get(date) ?? null,
                calories: nut ? nut.calories : null,
                isFasting: nut ? nut.isFasting : false,
                isPartial: nut ? nut.isPartial : false,
                trendWeight: trendMap.get(date) ?? null,
                tdee: td ? td.tdee : null,
                isHolding: td ? td.isHolding : false
            };
        });
        res.json({ logs });
    }
    catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});
exports.logsRouter.post('/', async (req, res) => {
    try {
        const { date, scaleWeight, calories, isFasting, isPartial } = req.body;
        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }
        // Save or update scale weight entry if provided
        if (scaleWeight !== undefined && scaleWeight !== null && scaleWeight !== '') {
            const weightNum = parseFloat(scaleWeight);
            if (!isNaN(weightNum) && weightNum > 0) {
                await db_js_1.prisma.scaleWeightEntry.upsert({
                    where: { logDate: date },
                    create: {
                        logDate: date,
                        scaleWeight: weightNum
                    },
                    update: {
                        scaleWeight: weightNum
                    }
                });
            }
        }
        // Save or update daily calorie log
        const fastingBool = !!isFasting;
        const partialBool = !!isPartial;
        let calNum = null;
        if (fastingBool) {
            calNum = 0;
        }
        else if (calories !== undefined && calories !== null && calories !== '') {
            calNum = parseInt(calories, 10);
        }
        if (calNum !== null && !isNaN(calNum)) {
            await db_js_1.prisma.dailyCalorieLog.upsert({
                where: { logDate: date },
                create: {
                    logDate: date,
                    calories: calNum,
                    isFasting: fastingBool,
                    isPartial: partialBool
                },
                update: {
                    calories: calNum,
                    isFasting: fastingBool,
                    isPartial: partialBool
                }
            });
        }
        // Recalculate full smoothing & TDEE pipeline
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: `Entry saved for ${date}` });
    }
    catch (error) {
        console.error('Error saving daily log:', error);
        res.status(500).json({ error: 'Failed to save log entry' });
    }
});
exports.logsRouter.delete('/:date', async (req, res) => {
    try {
        const { date } = req.params;
        await db_js_1.prisma.$transaction([
            db_js_1.prisma.scaleWeightEntry.deleteMany({ where: { logDate: date } }),
            db_js_1.prisma.dailyCalorieLog.deleteMany({ where: { logDate: date } }),
            db_js_1.prisma.weightTrendEntry.deleteMany({ where: { logDate: date } }),
            db_js_1.prisma.tdeeEntry.deleteMany({ where: { logDate: date } })
        ]);
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: `Entry deleted for ${date}` });
    }
    catch (error) {
        console.error('Error deleting log:', error);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

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
        const nutritionRollups = await db_js_1.prisma.dailyNutritionRollup.findMany({
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
            scaleMap.set(s.logDate, s.weightKg);
        const nutMap = new Map();
        for (const n of nutritionRollups) {
            nutMap.set(n.logDate, { calories: n.totalCaloriesKcal, isFasting: n.isFasting, isPartial: n.isPartial });
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
        nutritionRollups.forEach(n => allDates.add(n.logDate));
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
        const { date, scaleWeight, calories, isFasting, isPartial, notes } = req.body;
        if (!date) {
            return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
        }
        // Save or update scale weight entry if provided
        if (scaleWeight !== undefined && scaleWeight !== null && scaleWeight !== '') {
            const weightNum = parseFloat(scaleWeight);
            if (!isNaN(weightNum)) {
                const existingScale = await db_js_1.prisma.scaleWeightEntry.findFirst({
                    where: { logDate: date }
                });
                if (existingScale) {
                    await db_js_1.prisma.scaleWeightEntry.update({
                        where: { entryId: existingScale.entryId },
                        data: { weightKg: weightNum, notes }
                    });
                }
                else {
                    await db_js_1.prisma.scaleWeightEntry.create({
                        data: {
                            logDate: date,
                            weightKg: weightNum,
                            source: 'manual',
                            notes
                        }
                    });
                }
            }
        }
        // Save or update daily nutrition rollup
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
            await db_js_1.prisma.dailyNutritionRollup.upsert({
                where: { logDate: date },
                create: {
                    logDate: date,
                    totalCaloriesKcal: calNum,
                    isFasting: fastingBool,
                    isPartial: partialBool,
                    isLoggingComplete: !partialBool,
                    notes
                },
                update: {
                    totalCaloriesKcal: calNum,
                    isFasting: fastingBool,
                    isPartial: partialBool,
                    isLoggingComplete: !partialBool,
                    notes
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
        await db_js_1.prisma.scaleWeightEntry.deleteMany({ where: { logDate: date } });
        await db_js_1.prisma.dailyNutritionRollup.deleteMany({ where: { logDate: date } });
        await db_js_1.prisma.weightTrendEntry.deleteMany({ where: { logDate: date } });
        await db_js_1.prisma.tdeeEntry.deleteMany({ where: { logDate: date } });
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: `Entry deleted for ${date}` });
    }
    catch (error) {
        console.error('Error deleting log:', error);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.profileRouter = (0, express_1.Router)();
exports.profileRouter.get('/', async (_req, res) => {
    try {
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const goal = await db_js_1.prisma.goal.findFirst({
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' }
        });
        const checkinHistory = await db_js_1.prisma.checkinHistory.findMany({
            orderBy: { completedAt: 'desc' },
            take: 10
        });
        res.json({ profile, goal, checkinHistory });
    }
    catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to load profile' });
    }
});
exports.profileRouter.put('/', async (req, res) => {
    try {
        const { currentWeight, goalWeight, baselineTdee, biologicalSex } = req.body;
        const curW = currentWeight ? parseFloat(currentWeight) : undefined;
        const gW = goalWeight ? parseFloat(goalWeight) : undefined;
        const baseTdee = baselineTdee ? parseInt(baselineTdee, 10) : undefined;
        if (curW !== undefined || baseTdee !== undefined || biologicalSex !== undefined) {
            await db_js_1.prisma.userProfile.update({
                where: { id: 1 },
                data: {
                    initialWeightKg: curW,
                    baselineTdee: baseTdee,
                    biologicalSex: biologicalSex || undefined
                }
            });
        }
        if (gW !== undefined || curW !== undefined) {
            const activeGoal = await db_js_1.prisma.goal.findFirst({
                where: { status: 'active' },
                orderBy: { createdAt: 'desc' }
            });
            if (activeGoal) {
                await db_js_1.prisma.goal.update({
                    where: { goalId: activeGoal.goalId },
                    data: {
                        targetWeightKg: gW ?? activeGoal.targetWeightKg,
                        startWeightKg: curW ?? activeGoal.startWeightKg
                    }
                });
            }
        }
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: 'Profile updated' });
    }
    catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});
exports.profileRouter.post('/reset-logs', async (_req, res) => {
    try {
        await db_js_1.prisma.scaleWeightEntry.deleteMany();
        await db_js_1.prisma.dailyCalorieLog.deleteMany();
        await db_js_1.prisma.weightTrendEntry.deleteMany();
        await db_js_1.prisma.tdeeEntry.deleteMany();
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({ success: true, message: 'All daily logs cleared' });
    }
    catch (error) {
        console.error('Error clearing logs:', error);
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

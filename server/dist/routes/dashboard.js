"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.dashboardRouter = (0, express_1.Router)();
exports.dashboardRouter.get('/', async (_req, res) => {
    try {
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const goal = await db_js_1.prisma.goal.findFirst({
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' }
        });
        const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const activePlan = await db_js_1.prisma.weeklyPlan.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        const currentWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
        const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
        const tdeeStatus = latestTdee?.status ?? 'updating';
        const goalRatePercent = goal?.weeklyRatePercent ?? -0.50;
        const goalWeight = goal?.targetWeightKg ?? 76.0;
        const solved = (0, algorithm_js_1.solveWeeklyNutritionProgram)(currentTdee, currentWeight, goalRatePercent, goalWeight, profile?.biologicalSex ?? 'male');
        const program = activePlan
            ? {
                calories: activePlan.targetCalories,
                dailyDeficitKcal: activePlan.dailyDeficitKcal,
                weeklyLossRateKg: ((Math.abs(goalRatePercent) / 100.0) * currentWeight),
                estimatedEndDateStr: solved.estimatedEndDateStr,
                weeksToGoal: solved.weeksToGoal,
                proteinGrams: solved.proteinGrams,
                fatGrams: solved.fatGrams,
                carbGrams: solved.carbGrams
            }
            : solved;
        const schedule = await (0, algorithm_js_1.computeCheckInSchedule)();
        const latestScale = await db_js_1.prisma.scaleWeightEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        // Chart series for mini expenditure graph (last 7 days for the dashboard)
        const recentTdee = await db_js_1.prisma.tdeeEntry.findMany({
            orderBy: { logDate: 'desc' },
            take: 7
        });
        recentTdee.reverse();
        const recentTrend = await db_js_1.prisma.weightTrendEntry.findMany({
            orderBy: { logDate: 'desc' },
            take: 7
        });
        recentTrend.reverse();
        const recentScale = await db_js_1.prisma.scaleWeightEntry.findMany({
            orderBy: { logDate: 'desc' },
            take: 7
        });
        recentScale.reverse();
        res.json({
            profile,
            goal,
            currentWeight,
            currentScaleWeight: latestScale?.weightKg ?? 77.8,
            currentTdee,
            tdeeStatus,
            program,
            schedule,
            bodyFatPercent: 20.0,
            recentTdee: recentTdee.map(t => ({
                date: t.logDate,
                tdee: t.expenditureKcal,
                fluxUpper: t.fluxUpperKcal,
                fluxLower: t.fluxLowerKcal,
                status: t.status
            })),
            recentTrend: recentTrend.map(t => ({
                date: t.logDate,
                weight: t.trendWeightKg
            })),
            recentScale: recentScale.map(s => ({
                date: s.logDate,
                weight: s.weightKg
            }))
        });
    }
    catch (error) {
        console.error('Error fetching dashboard:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

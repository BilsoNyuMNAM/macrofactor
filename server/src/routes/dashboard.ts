import { Router } from 'express';
import { prisma } from '../db.js';
import { computeCheckInSchedule, solveWeeklyNutritionProgram } from '../services/algorithm.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (_req, res) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
    const goal = await prisma.goal.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' }
    });
    const latestTrend = await prisma.weightTrendEntry.findFirst({
      orderBy: { logDate: 'desc' }
    });
    const latestTdee = await prisma.tdeeEntry.findFirst({
      orderBy: { logDate: 'desc' }
    });
    const activePlan = await prisma.weeklyPlan.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    const currentWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? null;
    const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? null;
    const tdeeStatus = latestTdee?.status ?? 'updating';

    const goalRatePercent = goal?.weeklyRatePercent ?? -0.50;
    const goalWeight = goal?.targetWeightKg ?? 76.0;

    const programTdee = currentTdee ?? profile?.baselineTdee ?? 2340;
    const programWeight = currentWeight ?? profile?.initialWeightKg ?? 78.0;

    const solved = solveWeeklyNutritionProgram(
      programTdee,
      programWeight,
      goalRatePercent,
      goalWeight,
      profile?.biologicalSex ?? 'male'
    );

    const program = activePlan
      ? {
          calories: activePlan.targetCalories,
          dailyDeficitKcal: activePlan.dailyDeficitKcal,
          weeklyLossRateKg: ((Math.abs(goalRatePercent) / 100.0) * programWeight),
          estimatedEndDateStr: solved.estimatedEndDateStr,
          weeksToGoal: solved.weeksToGoal,
          proteinGrams: solved.proteinGrams,
          fatGrams: solved.fatGrams,
          carbGrams: solved.carbGrams
        }
      : solved;

    const schedule = await computeCheckInSchedule();

    const latestScale = await prisma.scaleWeightEntry.findFirst({
      orderBy: { logDate: 'desc' }
    });

    // Chart series for mini expenditure graph (last 7 days for the dashboard)
    const recentTdee = await prisma.tdeeEntry.findMany({
      orderBy: { logDate: 'desc' },
      take: 7
    });
    recentTdee.reverse();

    const recentTrend = await prisma.weightTrendEntry.findMany({
      orderBy: { logDate: 'desc' },
      take: 7
    });
    recentTrend.reverse();

    const recentScale = await prisma.scaleWeightEntry.findMany({
      orderBy: { logDate: 'desc' },
      take: 7
    });
    recentScale.reverse();

    res.json({
      profile,
      goal,
      currentWeight,
      currentScaleWeight: latestScale?.scaleWeight ?? null,
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
        weight: s.scaleWeight
      }))
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

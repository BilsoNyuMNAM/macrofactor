import { Router } from 'express';
import { prisma } from '../db.js';
import { recalculatePipeline } from '../services/algorithm.js';

export const profileRouter = Router();

profileRouter.get('/', async (_req, res) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
    const goal = await prisma.goal.findFirst({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' }
    });
    const checkinHistory = await prisma.checkinHistory.findMany({
      orderBy: { completedAt: 'desc' },
      take: 10
    });

    res.json({ profile, goal, checkinHistory });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

profileRouter.put('/', async (req, res) => {
  try {
    const { currentWeight, goalWeight, baselineTdee, biologicalSex } = req.body;

    const curW = currentWeight ? parseFloat(currentWeight) : undefined;
    const gW = goalWeight ? parseFloat(goalWeight) : undefined;
    const baseTdee = baselineTdee ? parseInt(baselineTdee, 10) : undefined;

    if (curW !== undefined || baseTdee !== undefined || biologicalSex !== undefined) {
      await prisma.userProfile.update({
        where: { id: 1 },
        data: {
          initialWeightKg: curW,
          baselineTdee: baseTdee,
          biologicalSex: biologicalSex || undefined
        }
      });
    }

    if (gW !== undefined || curW !== undefined) {
      const activeGoal = await prisma.goal.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' }
      });
      if (activeGoal) {
        await prisma.goal.update({
          where: { goalId: activeGoal.goalId },
          data: {
            targetWeightKg: gW ?? activeGoal.targetWeightKg,
            startWeightKg: curW ?? activeGoal.startWeightKg
          }
        });
      }
    }

    await recalculatePipeline();

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

profileRouter.post('/reset-logs', async (_req, res) => {
  try {
    await prisma.scaleWeightEntry.deleteMany();
    await prisma.dailyNutritionRollup.deleteMany();
    await prisma.weightTrendEntry.deleteMany();
    await prisma.tdeeEntry.deleteMany();

    await recalculatePipeline();

    res.json({ success: true, message: 'All daily logs cleared' });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

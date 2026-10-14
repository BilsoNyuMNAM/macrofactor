"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.strategyRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.strategyRouter = (0, express_1.Router)();
exports.strategyRouter.get('/', async (_req, res) => {
    try {
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const schedule = await (0, algorithm_js_1.computeCheckInSchedule)();
        const compliance = await (0, algorithm_js_1.evaluate7DayQuality)();
        const activePlan = await db_js_1.prisma.weeklyPlan.findFirst({
            where: { isActive: true },
            include: {
                dailyTargets: {
                    orderBy: { dayOfWeek: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const rawGoal = await db_js_1.prisma.goal.findFirst({
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' }
        });
        const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
        const currentTrendWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
        if (latestTdee?.status === 'holding') {
            compliance.isHolding = true;
            compliance.statusText = 'Holding Safeguard Active';
        }
        let goal = rawGoal;
        if (rawGoal) {
            const biologicalSex = profile?.biologicalSex ?? 'male';
            const metrics = (0, algorithm_js_1.solveGoalMetrics)(currentTdee, currentTrendWeight, rawGoal.weeklyRatePercent, rawGoal.targetWeightKg, biologicalSex, rawGoal.initialTrendWeightKg ?? rawGoal.startWeightKg);
            // Check if goal target has been achieved
            let isGoalReached = false;
            const isLoss = rawGoal.goalType === 'weight_loss' || rawGoal.goalType === 'fat_loss';
            const isGain = rawGoal.goalType === 'weight_gain' || rawGoal.goalType === 'muscle_gain';
            if (rawGoal.targetWeightKg !== null) {
                if (isLoss && currentTrendWeight <= rawGoal.targetWeightKg) {
                    isGoalReached = true;
                }
                else if (isGain && currentTrendWeight >= rawGoal.targetWeightKg) {
                    isGoalReached = true;
                }
            }
            goal = {
                ...rawGoal,
                metrics,
                isGoalReached
            };
        }
        res.json({
            schedule,
            compliance,
            activePlan,
            currentTdee,
            currentTrendWeight,
            goal,
            fastCheckIn: profile?.fastCheckIn ?? false,
            biologicalSex: profile?.biologicalSex ?? 'male'
        });
    }
    catch (error) {
        console.error('Error fetching strategy:', error);
        res.status(500).json({ error: 'Failed to load strategy data' });
    }
});
exports.strategyRouter.post('/check-in', async (req, res) => {
    try {
        const { holdExisting, goalRatePercent } = req.body;
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const goal = await db_js_1.prisma.goal.findFirst({
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' }
        });
        if (!goal) {
            return res.status(400).json({ error: 'No active goal found' });
        }
        const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const previousPlan = await db_js_1.prisma.weeklyPlan.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
        const currentTrendWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
        const todayStr = new Date().toISOString().split('T')[0];
        const compliance = await (0, algorithm_js_1.evaluate7DayQuality)();
        if (latestTdee?.status === 'holding') {
            compliance.isHolding = true;
            compliance.statusText = 'Holding Safeguard Active';
        }
        let newTargetCalories = previousPlan?.targetCalories ?? 1944;
        let newDailyDeficit = previousPlan?.dailyDeficitKcal ?? -429;
        if (!holdExisting) {
            const selectedRate = goalRatePercent !== undefined ? parseFloat(goalRatePercent) : goal.weeklyRatePercent;
            // Update goal rate
            await db_js_1.prisma.goal.update({
                where: { goalId: goal.goalId },
                data: {
                    weeklyRatePercent: selectedRate,
                    weeklyRateKg: (Math.abs(selectedRate) / 100.0) * currentTrendWeight
                }
            });
            const solved = (0, algorithm_js_1.solveCalorieProgram)(currentTdee, selectedRate, currentTrendWeight, goal.targetWeightKg, profile?.biologicalSex ?? 'male');
            newTargetCalories = solved.targetCalories;
            newDailyDeficit = solved.dailyDeficitKcal;
        }
        // Deactivate previous active plans
        await db_js_1.prisma.weeklyPlan.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });
        // Create next 7-day end date
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        const endDateStr = endDate.toISOString().split('T')[0];
        const newPlan = await db_js_1.prisma.weeklyPlan.create({
            data: {
                goalId: goal.goalId,
                startDate: todayStr,
                endDate: endDateStr,
                checkInDate: todayStr,
                programStyle: 'coached',
                dietStyle: 'balanced',
                tdeeAtCheckin: currentTdee,
                weightAtCheckin: currentTrendWeight,
                dailyDeficitKcal: newDailyDeficit,
                weeklyBudgetKcal: newTargetCalories * 7,
                targetCalories: newTargetCalories,
                isActive: true
            }
        });
        // Record check-in history audit
        await db_js_1.prisma.checkinHistory.create({
            data: {
                checkinDate: todayStr,
                previousPlanId: previousPlan?.planId ?? null,
                newPlanId: newPlan.planId,
                loggedNutritionDays: compliance.nutritionDays,
                weighInDays: compliance.weightDays,
                tdeeSnapshot: currentTdee,
                trendWeightSnapshot: currentTrendWeight,
                coachNotes: holdExisting ? 'Held existing targets steady.' : 'Updated weekly calorie targets.'
            }
        });
        res.json({
            success: true,
            message: holdExisting ? 'Check-in finalized (targets held).' : 'Check-in finalized (new plan locked).',
            plan: newPlan
        });
    }
    catch (error) {
        console.error('Error during check-in:', error);
        res.status(500).json({ error: 'Failed to process check-in' });
    }
});
exports.strategyRouter.post('/check-in-day', async (req, res) => {
    try {
        const { checkInDay } = req.body;
        if (checkInDay === undefined || checkInDay < 0 || checkInDay > 6) {
            return res.status(400).json({ error: 'Invalid check-in day (0 to 6)' });
        }
        await db_js_1.prisma.userProfile.update({
            where: { id: 1 },
            data: { checkInDay: Number(checkInDay) }
        });
        res.json({ success: true, checkInDay });
    }
    catch (error) {
        console.error('Error updating check-in day:', error);
        res.status(500).json({ error: 'Failed to update check-in day' });
    }
});
exports.strategyRouter.post('/fast-check-in', async (req, res) => {
    try {
        const { fastCheckIn } = req.body;
        await db_js_1.prisma.userProfile.update({
            where: { id: 1 },
            data: { fastCheckIn: !!fastCheckIn }
        });
        res.json({ success: true, fastCheckIn: !!fastCheckIn });
    }
    catch (error) {
        console.error('Error toggling fast check-in:', error);
        res.status(500).json({ error: 'Failed to toggle fast check-in' });
    }
});
/**
 * GET /api/strategy/goals
 * Returns all goals and active goal projection
 */
exports.strategyRouter.get('/goals', async (_req, res) => {
    try {
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const goals = await db_js_1.prisma.goal.findMany({
            orderBy: { createdAt: 'desc' }
        });
        const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
        const currentTrendWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
        const activeGoal = goals.find(g => g.status === 'active');
        let activeMetrics = null;
        if (activeGoal) {
            activeMetrics = (0, algorithm_js_1.solveGoalMetrics)(currentTdee, currentTrendWeight, activeGoal.weeklyRatePercent, activeGoal.targetWeightKg, profile?.biologicalSex ?? 'male', activeGoal.initialTrendWeightKg ?? activeGoal.startWeightKg);
        }
        res.json({
            goals,
            activeGoal,
            activeMetrics,
            currentTrendWeight,
            currentTdee
        });
    }
    catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: 'Failed to load goals' });
    }
});
/**
 * POST /api/strategy/goals
 * Sets a new goal, retires previous active goal, and generates a new 7-Day locked nutrition program
 */
exports.strategyRouter.post('/goals', async (req, res) => {
    try {
        const { goalType = 'weight_loss', targetWeightKg, weeklyRatePercent = -0.50, programStyle = 'coached', dietStyle = 'balanced', startDate } = req.body;
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
        const currentTrendWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
        const todayStr = new Date().toISOString().split('T')[0];
        // Compute weekly rate in kg
        const selectedRatePct = goalType === 'maintenance' ? 0 : parseFloat(weeklyRatePercent);
        const selectedTargetWeight = goalType === 'maintenance' ? currentTrendWeight : (targetWeightKg ? parseFloat(targetWeightKg) : null);
        const weeklyRateKg = Number(((Math.abs(selectedRatePct) / 100.0) * currentTrendWeight).toFixed(2));
        // Calculate initial ETA
        const eta = (0, algorithm_js_1.calculateGoalEta)(currentTrendWeight, selectedTargetWeight, weeklyRateKg, currentTrendWeight);
        // 1. Retire existing active goals
        await db_js_1.prisma.goal.updateMany({
            where: { status: 'active' },
            data: {
                status: 'abandoned',
                endDate: todayStr,
                finalTrendWeightKg: currentTrendWeight
            }
        });
        // 2. Create new active goal
        const newGoal = await db_js_1.prisma.goal.create({
            data: {
                goalType,
                startWeightKg: currentTrendWeight,
                initialTrendWeightKg: currentTrendWeight,
                targetWeightKg: goalType === 'maintenance' ? null : selectedTargetWeight,
                weeklyRatePercent: selectedRatePct,
                weeklyRateKg,
                startDate: startDate || todayStr,
                targetDate: eta.targetDate,
                etaWeeks: eta.etaWeeks,
                status: 'active',
                scaleReached: false,
                hidden: false
            }
        });
        // 3. Deactivate previous weekly plans
        await db_js_1.prisma.weeklyPlan.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });
        // 4. Solve new 7-day program
        const biologicalSex = profile?.biologicalSex ?? 'male';
        const solved = (0, algorithm_js_1.solveWeeklyNutritionProgram)(currentTdee, currentTrendWeight, selectedRatePct, selectedTargetWeight, biologicalSex, 2.0, dietStyle);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
        const endDateStr = endDate.toISOString().split('T')[0];
        const newPlan = await db_js_1.prisma.weeklyPlan.create({
            data: {
                goalId: newGoal.goalId,
                startDate: todayStr,
                endDate: endDateStr,
                checkInDate: todayStr,
                programStyle,
                dietStyle,
                tdeeAtCheckin: currentTdee,
                weightAtCheckin: currentTrendWeight,
                dailyDeficitKcal: solved.dailyDeficitKcal,
                weeklyBudgetKcal: solved.calories * 7,
                targetCalories: solved.calories,
                isActive: true
            }
        });
        // Create daily targets
        for (let day = 0; day <= 6; day++) {
            await db_js_1.prisma.dailyCalorieTarget.create({
                data: {
                    planId: newPlan.planId,
                    dayOfWeek: day,
                    targetCalories: solved.calories
                }
            });
        }
        const metrics = (0, algorithm_js_1.solveGoalMetrics)(currentTdee, currentTrendWeight, selectedRatePct, selectedTargetWeight, biologicalSex, currentTrendWeight);
        res.json({
            success: true,
            message: 'New goal activated and 7-day program generated.',
            goal: { ...newGoal, metrics, isGoalReached: false },
            plan: newPlan
        });
    }
    catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create new goal' });
    }
});
/**
 * PUT /api/strategy/goals/:id
 * Updates goal target weight or weekly rate with optional immediate program recalculation
 */
exports.strategyRouter.put('/goals/:id', async (req, res) => {
    try {
        const goalId = parseInt(req.params.id, 10);
        const { targetWeightKg, weeklyRatePercent, recalculateProgramNow = false } = req.body;
        const existingGoal = await db_js_1.prisma.goal.findUnique({ where: { goalId } });
        if (!existingGoal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
        const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
            orderBy: { logDate: 'desc' }
        });
        const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
        const currentTrendWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
        const newTargetWeight = targetWeightKg !== undefined ? (targetWeightKg ? parseFloat(targetWeightKg) : null) : existingGoal.targetWeightKg;
        const newRatePct = weeklyRatePercent !== undefined ? parseFloat(weeklyRatePercent) : existingGoal.weeklyRatePercent;
        const newWeeklyRateKg = Number(((Math.abs(newRatePct) / 100.0) * currentTrendWeight).toFixed(2));
        const eta = (0, algorithm_js_1.calculateGoalEta)(currentTrendWeight, newTargetWeight, newWeeklyRateKg, existingGoal.initialTrendWeightKg ?? existingGoal.startWeightKg);
        const updatedGoal = await db_js_1.prisma.goal.update({
            where: { goalId },
            data: {
                targetWeightKg: newTargetWeight,
                weeklyRatePercent: newRatePct,
                weeklyRateKg: newWeeklyRateKg,
                targetDate: eta.targetDate,
                etaWeeks: eta.etaWeeks
            }
        });
        // If rate changed and immediate recalculation requested:
        if (recalculateProgramNow) {
            const biologicalSex = profile?.biologicalSex ?? 'male';
            const solved = (0, algorithm_js_1.solveWeeklyNutritionProgram)(currentTdee, currentTrendWeight, newRatePct, newTargetWeight, biologicalSex);
            const activePlan = await db_js_1.prisma.weeklyPlan.findFirst({
                where: { goalId, isActive: true },
                orderBy: { createdAt: 'desc' }
            });
            if (activePlan) {
                await db_js_1.prisma.weeklyPlan.update({
                    where: { planId: activePlan.planId },
                    data: {
                        targetCalories: solved.calories,
                        dailyDeficitKcal: solved.dailyDeficitKcal,
                        weeklyBudgetKcal: solved.calories * 7
                    }
                });
                await db_js_1.prisma.dailyCalorieTarget.updateMany({
                    where: { planId: activePlan.planId },
                    data: { targetCalories: solved.calories }
                });
            }
        }
        const metrics = (0, algorithm_js_1.solveGoalMetrics)(currentTdee, currentTrendWeight, newRatePct, newTargetWeight, profile?.biologicalSex ?? 'male', updatedGoal.initialTrendWeightKg ?? updatedGoal.startWeightKg);
        res.json({
            success: true,
            message: 'Goal parameters updated.',
            goal: { ...updatedGoal, metrics }
        });
    }
    catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});
/**
 * Helper function to instantiate a 7-day program
 */
async function instantiateProgram(reqBody) {
    const { programStyle = 'coached', targetCalories: customTargetCalories, dailyTargets: customDailyTargets, higherCalorieDays = [], higherCalorieSurplus = 200 } = reqBody;
    const profile = await db_js_1.prisma.userProfile.findUnique({ where: { id: 1 } });
    const activeGoal = await db_js_1.prisma.goal.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' }
    });
    if (!activeGoal) {
        throw new Error('No active goal found. Please create a goal first.');
    }
    const latestTrend = await db_js_1.prisma.weightTrendEntry.findFirst({
        orderBy: { logDate: 'desc' }
    });
    const latestTdee = await db_js_1.prisma.tdeeEntry.findFirst({
        orderBy: { logDate: 'desc' }
    });
    const currentTdee = latestTdee?.expenditureKcal ?? profile?.baselineTdee ?? 2340;
    const currentTrendWeight = latestTrend?.trendWeightKg ?? profile?.initialWeightKg ?? 78.0;
    const biologicalSex = profile?.biologicalSex ?? 'male';
    const isGain = activeGoal.goalType === 'weight_gain' || activeGoal.goalType === 'muscle_gain';
    const isMaintenance = activeGoal.goalType === 'maintenance';
    const tissueKcal = isGain ? 8500 : 7700;
    const defaultDeficit = isMaintenance
        ? 0
        : Math.round(((activeGoal.weeklyRatePercent / 100.0) * currentTrendWeight * tissueKcal) / 7.0);
    const minFloor = biologicalSex === 'female' ? 1200 : 1500;
    const recommendedCalories = Math.max(minFloor, currentTdee + defaultDeficit);
    const baseTargetCalories = (programStyle !== 'coached' && customTargetCalories)
        ? Math.max(800, parseInt(customTargetCalories, 10))
        : recommendedCalories;
    const dailyDeficitKcal = baseTargetCalories - currentTdee;
    const weeklyBudgetKcal = baseTargetCalories * 7;
    const todayStr = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    const endDateStr = endDate.toISOString().split('T')[0];
    // Deactivate previous active plans
    await db_js_1.prisma.weeklyPlan.updateMany({
        where: { isActive: true },
        data: { isActive: false }
    });
    // Create new active plan
    const newPlan = await db_js_1.prisma.weeklyPlan.create({
        data: {
            goalId: activeGoal.goalId,
            startDate: todayStr,
            endDate: endDateStr,
            checkInDate: todayStr,
            programStyle,
            dietStyle: 'balanced',
            tdeeAtCheckin: currentTdee,
            weightAtCheckin: currentTrendWeight,
            dailyDeficitKcal,
            weeklyBudgetKcal,
            targetCalories: baseTargetCalories,
            isActive: true
        }
    });
    // Build 7 daily calorie targets
    const dailyTargetRecords = [];
    if (Array.isArray(customDailyTargets) && customDailyTargets.length === 7) {
        for (const item of customDailyTargets) {
            dailyTargetRecords.push({
                dayOfWeek: item.dayOfWeek,
                targetCalories: Math.max(500, parseInt(item.targetCalories, 10)),
                isHigherCalorieDay: !!item.isHigherCalorieDay
            });
        }
    }
    else if (Array.isArray(higherCalorieDays) && higherCalorieDays.length > 0 && higherCalorieDays.length < 7) {
        const numHigher = higherCalorieDays.length;
        const numStandard = 7 - numHigher;
        const surplus = Math.max(50, Math.min(1000, parseInt(higherCalorieSurplus, 10) || 200));
        const standardDayCalories = Math.round((weeklyBudgetKcal - (numHigher * (baseTargetCalories + surplus))) / numStandard);
        for (let day = 0; day <= 6; day++) {
            const isHigher = higherCalorieDays.includes(day);
            dailyTargetRecords.push({
                dayOfWeek: day,
                targetCalories: isHigher ? baseTargetCalories + surplus : standardDayCalories,
                isHigherCalorieDay: isHigher
            });
        }
    }
    else {
        for (let day = 0; day <= 6; day++) {
            dailyTargetRecords.push({
                dayOfWeek: day,
                targetCalories: baseTargetCalories,
                isHigherCalorieDay: false
            });
        }
    }
    for (const rec of dailyTargetRecords) {
        await db_js_1.prisma.dailyCalorieTarget.create({
            data: {
                planId: newPlan.planId,
                dayOfWeek: rec.dayOfWeek,
                targetCalories: rec.targetCalories,
                isHigherCalorieDay: rec.isHigherCalorieDay
            }
        });
    }
    const createdTargets = await db_js_1.prisma.dailyCalorieTarget.findMany({
        where: { planId: newPlan.planId },
        orderBy: { dayOfWeek: 'asc' }
    });
    return {
        ...newPlan,
        dailyTargets: createdTargets
    };
}
/**
 * POST /api/strategy/program
 * Creates a new 7-day nutritional prescription (program)
 */
exports.strategyRouter.post('/program', async (req, res) => {
    try {
        const plan = await instantiateProgram(req.body);
        res.json({
            success: true,
            message: 'New 7-day program successfully activated.',
            plan
        });
    }
    catch (error) {
        console.error('Error creating program:', error);
        res.status(400).json({ error: error?.message || 'Failed to create program' });
    }
});
/**
 * PUT /api/strategy/program
 * Updates/changes the active program parameters and daily distribution
 */
exports.strategyRouter.put('/program', async (req, res) => {
    try {
        const plan = await instantiateProgram(req.body);
        res.json({
            success: true,
            message: 'Program successfully updated.',
            plan
        });
    }
    catch (error) {
        console.error('Error updating program:', error);
        res.status(400).json({ error: error?.message || 'Failed to update program' });
    }
});
/**
 * DELETE /api/strategy/goals/:id
 * Implements dual-branch deletion from Section 5 of strategyappreport.md:
 * - Past goal: deleted/hidden from history without active goal impact.
 * - Active goal: deleted and reopens previous goal with mandatory program rebuild requirement.
 */
exports.strategyRouter.delete('/goals/:id', async (req, res) => {
    try {
        const goalId = parseInt(req.params.id, 10);
        const goalToDelete = await db_js_1.prisma.goal.findUnique({ where: { goalId } });
        if (!goalToDelete) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        if (goalToDelete.status !== 'active') {
            // Branch 1: Past Goal Deletion
            await db_js_1.prisma.goal.update({
                where: { goalId },
                data: { hidden: true }
            });
            return res.json({
                success: true,
                isPastGoal: true,
                message: 'Past goal removed from history.'
            });
        }
        // Branch 2: Active Goal Deletion & Reopen Previous
        const previousGoal = await db_js_1.prisma.goal.findFirst({
            where: {
                goalId: { not: goalId },
                hidden: false
            },
            orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }]
        });
        if (!previousGoal) {
            return res.status(400).json({
                error: 'Cannot delete the only goal in history. Create a new goal instead.'
            });
        }
        // Hide/retire active goal
        await db_js_1.prisma.goal.update({
            where: { goalId },
            data: { hidden: true, status: 'abandoned' }
        });
        // Reopen previous goal
        const reopenedGoal = await db_js_1.prisma.goal.update({
            where: { goalId: previousGoal.goalId },
            data: {
                status: 'active',
                endDate: null,
                finalTrendWeightKg: null,
                scaleReached: false
            }
        });
        // Invalidate active weekly plan
        await db_js_1.prisma.weeklyPlan.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });
        return res.json({
            success: true,
            isPastGoal: false,
            reopenedGoal,
            requiresNewProgram: true,
            message: 'Active goal deleted. Previous goal reopened. To continue, you must create a new program.'
        });
    }
    catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const db_js_1 = require("../db.js");
const algorithm_js_1 = require("../services/algorithm.js");
exports.authRouter = (0, express_1.Router)();
function hashPassword(password) {
    return crypto_1.default.createHash('sha256').update(password).digest('hex');
}
/**
 * Ensure user_accounts table exists in PostgreSQL
 */
async function ensureAuthTable() {
    await db_js_1.prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_accounts (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      is_onboarded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
    // Ensure onboarding_data column exists
    await db_js_1.prisma.$executeRawUnsafe(`
    ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS onboarding_data JSONB
  `).catch(() => { });
    // Ensure default demo user exists for immediate login testing
    const demoExists = await db_js_1.prisma.$queryRawUnsafe('SELECT id FROM user_accounts WHERE email = $1 LIMIT 1', 'demo@macrofactor.app');
    if (!demoExists || demoExists.length === 0) {
        const demoHash = hashPassword('password123');
        await db_js_1.prisma.$executeRawUnsafe('INSERT INTO user_accounts (email, password_hash, display_name, is_onboarded) VALUES ($1, $2, $3, $4)', 'demo@macrofactor.app', demoHash, 'MacroFactor User', true);
    }
}
// Initialize table on router load
ensureAuthTable().catch((err) => console.error('Failed to ensure user_accounts table:', err));
/**
 * POST /api/auth/register
 * Only email and password (no social, no anonymous)
 */
exports.authRouter.post('/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        await ensureAuthTable();
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await db_js_1.prisma.$queryRawUnsafe('SELECT id FROM user_accounts WHERE email = $1 LIMIT 1', normalizedEmail);
        if (existing && existing.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
        }
        const passwordHash = hashPassword(password);
        const result = await db_js_1.prisma.$queryRawUnsafe('INSERT INTO user_accounts (email, password_hash, display_name, is_onboarded) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, is_onboarded', normalizedEmail, passwordHash, displayName?.trim() || null, false);
        const newUser = result[0];
        const token = crypto_1.default.randomBytes(32).toString('hex');
        res.status(201).json({
            success: true,
            user: {
                id: newUser.id,
                email: newUser.email,
                displayName: newUser.display_name,
                isOnboarded: false,
            },
            token,
            message: 'Account created successfully.',
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }
});
/**
 * POST /api/auth/login
 * Only email and password
 */
exports.authRouter.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        await ensureAuthTable();
        const normalizedEmail = email.trim().toLowerCase();
        const passwordHash = hashPassword(password);
        const rows = await db_js_1.prisma.$queryRawUnsafe('SELECT id, email, display_name, is_onboarded, onboarding_data FROM user_accounts WHERE email = $1 AND password_hash = $2 LIMIT 1', normalizedEmail, passwordHash);
        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        const user = rows[0];
        const token = crypto_1.default.randomBytes(32).toString('hex');
        let onboardingData = null;
        if (user.onboarding_data) {
            try {
                onboardingData = typeof user.onboarding_data === 'string' ? JSON.parse(user.onboarding_data) : user.onboarding_data;
            }
            catch { }
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
                isOnboarded: !!user.is_onboarded,
                onboardingData,
            },
            token,
            message: 'Logged in successfully.',
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to log in. Please try again.' });
    }
});
/**
 * GET /api/auth/me
 * Checks session or returns status of first active user
 */
exports.authRouter.get('/me', async (req, res) => {
    try {
        await ensureAuthTable();
        const emailQuery = req.query.email || req.headers['x-user-email'];
        let rows;
        if (emailQuery) {
            rows = await db_js_1.prisma.$queryRawUnsafe('SELECT id, email, display_name, is_onboarded, onboarding_data FROM user_accounts WHERE email = $1 LIMIT 1', emailQuery.trim().toLowerCase());
        }
        else {
            return res.json({ authenticated: false, user: null });
        }
        if (rows && rows.length > 0) {
            const user = rows[0];
            let onboardingData = null;
            if (user.onboarding_data) {
                try {
                    onboardingData = typeof user.onboarding_data === 'string' ? JSON.parse(user.onboarding_data) : user.onboarding_data;
                }
                catch { }
            }
            return res.json({
                authenticated: true,
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.display_name,
                    isOnboarded: !!user.is_onboarded,
                    onboardingData,
                },
            });
        }
        res.json({ authenticated: false, user: null });
    }
    catch (error) {
        console.error('Auth status check error:', error);
        res.status(500).json({ error: 'Failed to verify authentication status.' });
    }
});
/**
 * POST /api/auth/reset-onboarding
 * Resets user onboarding state so they can re-run the wizard
 */
exports.authRouter.post('/reset-onboarding', async (req, res) => {
    try {
        const { email } = req.body;
        await ensureAuthTable();
        if (email) {
            await db_js_1.prisma.$executeRawUnsafe('UPDATE user_accounts SET is_onboarded = false WHERE email = $1', email.trim().toLowerCase());
        }
        else {
            await db_js_1.prisma.$executeRawUnsafe('UPDATE user_accounts SET is_onboarded = false');
        }
        res.json({ success: true, message: 'Onboarding reset successfully.' });
    }
    catch (error) {
        console.error('Reset onboarding error:', error);
        res.status(500).json({ error: 'Failed to reset onboarding.' });
    }
});
/**
 * POST /api/auth/complete-onboarding
 * Atomic transaction finalizing Module 1 (Basics), Module 2 (Goal), and Module 3 (Program)
 */
exports.authRouter.post('/complete-onboarding', async (req, res) => {
    try {
        const { email, biologicalSex = 'male', birthDate = '1998-05-15', heightCm = 178.0, startingWeightKg = 78.0, baselineTdee = 2340, goal = {
            goalType: 'weight_loss',
            targetWeightKg: 74.0,
            weeklyRatePercent: -0.5,
        }, program = {
            programStyle: 'coached',
            dietStyle: 'balanced',
            proteinTier: 'moderate',
            targetCalories: 1950,
            higherCalorieDays: [],
            higherCalorieSurplus: 300,
        }, } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];
        const curW = Number(startingWeightKg) || 78.0;
        const baseTdee = Number(baselineTdee) || 2340;
        const hCm = Number(heightCm) || 178.0;
        const sex = biologicalSex === 'female' ? 'female' : 'male';
        const goalType = goal.goalType || 'weight_loss';
        const ratePct = goalType === 'maintenance' ? 0 : Number(goal.weeklyRatePercent ?? -0.5);
        const targetW = goalType === 'maintenance' ? null : (goal.targetWeightKg ? Number(goal.targetWeightKg) : null);
        const weeklyRateKg = Number(((Math.abs(ratePct) / 100.0) * curW).toFixed(2));
        const eta = (0, algorithm_js_1.calculateGoalEta)(curW, targetW, weeklyRateKg, curW);
        const isDemoUser = !email || email.trim().toLowerCase() === 'demo@macrofactor.app';
        if (!isDemoUser) {
            const userOnboarding = {
                biologicalSex: sex,
                birthDate: String(birthDate),
                heightCm: hCm,
                startingWeightKg: curW,
                baselineTdee: baseTdee,
                goal: {
                    goalType,
                    targetWeightKg: targetW,
                    weeklyRatePercent: ratePct,
                    weeklyRateKg,
                },
                program: {
                    programStyle: program.programStyle || 'coached',
                    dietStyle: program.dietStyle || 'balanced',
                    proteinTier: program.proteinTier || 'moderate',
                    targetCalories: Number(program.targetCalories) || 1950,
                    higherCalorieDays: program.higherCalorieDays || [],
                    higherCalorieSurplus: Number(program.higherCalorieSurplus) || 300,
                },
            };
            await db_js_1.prisma.$executeRawUnsafe('UPDATE user_accounts SET is_onboarded = true, onboarding_data = $1::jsonb WHERE email = $2', JSON.stringify(userOnboarding), email.trim().toLowerCase());
            return res.json({
                success: true,
                message: 'First-time onboarding finalized successfully. Active program and targets initialized.',
                onboardingData: userOnboarding,
            });
        }
        // Atomic execution
        await db_js_1.prisma.$transaction(async (tx) => {
            // 1. Update/Upsert UserProfile (id: 1)
            await tx.userProfile.upsert({
                where: { id: 1 },
                update: {
                    biologicalSex: sex,
                    birthDate: String(birthDate),
                    heightCm: hCm,
                    initialWeightKg: curW,
                    baselineTdee: baseTdee,
                    checkInDay: 1, // Default Monday check-in
                },
                create: {
                    id: 1,
                    biologicalSex: sex,
                    birthDate: String(birthDate),
                    heightCm: hCm,
                    initialWeightKg: curW,
                    baselineTdee: baseTdee,
                    checkInDay: 1,
                },
            });
            // 2. Insert or update today's scale weight entry
            await tx.scaleWeightEntry.upsert({
                where: { logDate: todayStr },
                create: {
                    logDate: todayStr,
                    scaleWeight: curW,
                },
                update: {
                    scaleWeight: curW,
                },
            });
            // 3. Upsert today's trend entry
            await tx.weightTrendEntry.upsert({
                where: { logDate: todayStr },
                update: {
                    trendWeightKg: curW,
                    velocityKgPerDay: 0.0,
                },
                create: {
                    logDate: todayStr,
                    trendWeightKg: curW,
                    velocityKgPerDay: 0.0,
                },
            });
            // 4. Upsert today's TDEE entry
            await tx.tdeeEntry.upsert({
                where: { logDate: todayStr },
                update: {
                    expenditureKcal: baseTdee,
                    fluxLowerKcal: baseTdee - 100,
                    fluxUpperKcal: baseTdee + 100,
                },
                create: {
                    logDate: todayStr,
                    expenditureKcal: baseTdee,
                    status: 'updating',
                    tdeeDeltaKcal: 0,
                    fluxLowerKcal: baseTdee - 100,
                    fluxUpperKcal: baseTdee + 100,
                },
            });
            // 5. Retire existing active goals
            await tx.goal.updateMany({
                where: { status: 'active' },
                data: {
                    status: 'abandoned',
                    endDate: todayStr,
                    finalTrendWeightKg: curW,
                },
            });
            // 6. Create new active Goal
            const createdGoal = await tx.goal.create({
                data: {
                    goalType,
                    startWeightKg: curW,
                    initialTrendWeightKg: curW,
                    targetWeightKg: targetW,
                    weeklyRatePercent: ratePct,
                    weeklyRateKg,
                    startDate: todayStr,
                    targetDate: eta.targetDate,
                    etaWeeks: eta.etaWeeks,
                    status: 'active',
                    scaleReached: false,
                    hidden: false,
                },
            });
            // 7. Deactivate previous weekly plans
            await tx.weeklyPlan.updateMany({
                where: { isActive: true },
                data: { isActive: false },
            });
            // 8. Solve and create 7-day WeeklyPlan
            const solved = (0, algorithm_js_1.solveWeeklyNutritionProgram)(baseTdee, curW, ratePct, targetW, sex, program.proteinTier === 'low' ? 1.6 : program.proteinTier === 'high' ? 2.4 : program.proteinTier === 'extra_high' ? 2.8 : 2.0, program.dietStyle || 'balanced');
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 7);
            const endDateStr = endDate.toISOString().split('T')[0];
            const targetCalories = Number(program.targetCalories) || solved.calories;
            const weeklyBudget = targetCalories * 7;
            const createdPlan = await tx.weeklyPlan.create({
                data: {
                    goalId: createdGoal.goalId,
                    startDate: todayStr,
                    endDate: endDateStr,
                    checkInDate: todayStr,
                    programStyle: program.programStyle || 'coached',
                    dietStyle: program.dietStyle || 'balanced',
                    proteinPrefGPerKg: program.proteinTier === 'low' ? 1.6 : program.proteinTier === 'high' ? 2.4 : program.proteinTier === 'extra_high' ? 2.8 : 2.0,
                    tdeeAtCheckin: baseTdee,
                    weightAtCheckin: curW,
                    dailyDeficitKcal: solved.dailyDeficitKcal,
                    weeklyBudgetKcal: weeklyBudget,
                    targetCalories,
                    isActive: true,
                },
            });
            // 9. Create 7 DailyCalorieTargets
            const higherDays = program.higherCalorieDays || [];
            const higherSurplus = Number(program.higherCalorieSurplus) || 300;
            let dailyCals = new Array(7).fill(targetCalories);
            if (higherDays.length > 0 && higherDays.length < 7) {
                const higherTarget = targetCalories + higherSurplus;
                const remainingBudget = weeklyBudget - (higherDays.length * higherTarget);
                const lowerTarget = Math.round(remainingBudget / (7 - higherDays.length));
                dailyCals = dailyCals.map((_, idx) => (higherDays.includes(idx) ? higherTarget : lowerTarget));
            }
            for (let day = 0; day <= 6; day++) {
                await tx.dailyCalorieTarget.create({
                    data: {
                        planId: createdPlan.planId,
                        dayOfWeek: day,
                        targetCalories: dailyCals[day],
                        isHigherCalorieDay: higherDays.includes(day),
                    },
                });
            }
            // 10. Update user_accounts is_onboarded flag if email provided
            if (email) {
                await tx.$executeRawUnsafe('UPDATE user_accounts SET is_onboarded = true WHERE email = $1', email.trim().toLowerCase());
            }
            else {
                await tx.$executeRawUnsafe('UPDATE user_accounts SET is_onboarded = true');
            }
        });
        // 11. Run analytics pipeline
        await (0, algorithm_js_1.recalculatePipeline)();
        res.json({
            success: true,
            message: 'First-time onboarding finalized successfully. Active program and targets initialized.',
        });
    }
    catch (error) {
        console.error('Finalize onboarding error:', error);
        res.status(500).json({ error: 'Failed to complete onboarding. Please try again.' });
    }
});

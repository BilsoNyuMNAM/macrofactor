import { PrismaClient } from '@prisma/client';
import { recalculatePipeline } from '../src/services/algorithm.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding MacroFactor database with user image dataset...');

  // 1. Create or update User Profile
  await prisma.userProfile.upsert({
    where: { id: 1 },
    update: {
      initialWeightKg: 81.1,
      baselineTdee: 2335,
      checkInDay: 1, // Monday
      fastCheckIn: false
    },
    create: {
      id: 1,
      biologicalSex: 'male',
      birthDate: '1998-05-15',
      heightCm: 178.0,
      initialWeightKg: 81.1,
      baselineTdee: 2335,
      bmrEquation: 'macrofactor_2024',
      checkInDay: 1,
      fastCheckIn: false,
      weightUnit: 'kg',
      energyUnit: 'kcal'
    }
  });

  // 2. Clear old entries
  await prisma.dailyCalorieTarget.deleteMany();
  await prisma.weeklyPlan.deleteMany();
  await prisma.checkinHistory.deleteMany();
  await prisma.scaleWeightEntry.deleteMany();
  await prisma.weightTrendEntry.deleteMany();
  await prisma.dailyNutritionRollup.deleteMany();
  await prisma.tdeeEntry.deleteMany();
  await prisma.goal.deleteMany();

  // 3. Create Goal
  await prisma.goal.create({
    data: {
      goalType: 'weight_loss',
      startWeightKg: 81.1,
      targetWeightKg: 76.0,
      initialTrendWeightKg: 81.1,
      weeklyRatePercent: -0.50,
      weeklyRateKg: 0.40,
      startDate: '2026-09-14',
      targetDate: '2026-11-19',
      etaWeeks: 9,
      status: 'active',
      scaleReached: false,
      hidden: false
    }
  });

  // 4. Exact logs from user images (September 14, 2026 to October 14, 2026)
  const seedLogs: Array<{
    date: string;
    scale: number | null;
    cals: number | null;
    isFasting?: boolean;
  }> = [
    { date: '2026-09-14', scale: 81.1, cals: 1810 },
    { date: '2026-09-15', scale: 80.3, cals: 1700 },
    { date: '2026-09-16', scale: 80.5, cals: 1713 },
    { date: '2026-09-17', scale: 81.2, cals: 1750 },
    // 2026-09-18: missing
    { date: '2026-09-19', scale: 79.5, cals: 1900 },
    { date: '2026-09-20', scale: 80.2, cals: 1900 },
    { date: '2026-09-21', scale: 80.6, cals: 1750 },
    { date: '2026-09-22', scale: 79.4, cals: 1800 },
    { date: '2026-09-23', scale: 78.7, cals: 1800 },
    { date: '2026-09-24', scale: 79.1, cals: 1800 },
    { date: '2026-09-25', scale: 79.5, cals: 1800 },
    { date: '2026-09-26', scale: 79.1, cals: 3500 },
    { date: '2026-09-27', scale: 79.4, cals: 1800 },
    { date: '2026-09-28', scale: 78.5, cals: 1700 },
    { date: '2026-09-29', scale: null, cals: 1900 },
    { date: '2026-09-30', scale: 78.8, cals: 1900 },
    { date: '2026-10-01', scale: 78.9, cals: 2000 },
    { date: '2026-10-02', scale: null, cals: 1950 },
    { date: '2026-10-03', scale: 78.3, cals: null },
    { date: '2026-10-04', scale: null, cals: 3500 },
    { date: '2026-10-05', scale: null, cals: 1650 },
    { date: '2026-10-06', scale: null, cals: 1650 },
    { date: '2026-10-07', scale: 77.8, cals: 1627 },
    // 2026-10-08: missing
    // 2026-10-09: missing
    { date: '2026-10-10', scale: 77.7, cals: null },
    { date: '2026-10-11', scale: 77.3, cals: null },
    // 2026-10-12: missing
    { date: '2026-10-13', scale: 77.8, cals: 2000 },
    { date: '2026-10-14', scale: 77.8, cals: 1946 }
  ];

  for (const item of seedLogs) {
    if (item.scale !== null) {
      await prisma.scaleWeightEntry.create({
        data: {
          logDate: item.date,
          loggedAt: new Date(`${item.date}T08:00:00Z`),
          weightKg: item.scale,
          source: 'manual'
        }
      });
    }

    if (item.cals !== null) {
      await prisma.dailyNutritionRollup.create({
        data: {
          logDate: item.date,
          totalCaloriesKcal: item.cals,
          isFasting: !!item.isFasting,
          isPartial: false,
          isLoggingComplete: true
        }
      });
    }
  }

  // 5. Run the recalculation pipeline to compute trend weight and adaptive TDEE
  await recalculatePipeline();

  console.log('Database seeded successfully with exact user image entries!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

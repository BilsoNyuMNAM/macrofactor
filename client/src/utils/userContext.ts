import {
  DashboardResponse,
  ExpenditureResponse,
  TrendResponse,
  LogItem,
  StrategyResponse,
  ScaleWeightResponse,
  UserProfile,
  Goal,
  CheckInSchedule,
  ProgramDerivation,
  ScaleWeightChartPoint,
  ScaleWeightMonthGroup,
  TdeePoint,
  WeightTrendPoint,
  ExpenditureHistoryGroup,
  LoggingCompliance,
} from '../types';
import { calculateMacros } from './macroMath';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = DAY_OF_WEEK[d.getUTCDay()];
  const mon = MONTH_NAMES[d.getUTCMonth()];
  return `${dow}, ${day} ${mon}`;
}

export function getIsDemoUser(email?: string | null): boolean {
  if (!email) return true;
  return email.trim().toLowerCase() === 'demo@macrofactor.app';
}

export function getUserOnboarding(email: string): any {
  if (!email) return null;
  const key = `mf_user_onboarding_${email.trim().toLowerCase()}`;
  try {
    const raw = localStorage.getItem(key) || localStorage.getItem('mf_user_onboarding');
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }

  // Sensible Day-1 fallback if not yet set
  return {
    biologicalSex: 'male',
    birthDate: '1998-05-15',
    heightCm: 178,
    startingWeightKg: 78.0,
    baselineTdee: 2340,
    goal: {
      goalType: 'weight_loss',
      targetWeightKg: 74.0,
      weeklyRatePercent: -0.5,
    },
    program: {
      programStyle: 'coached',
      dietStyle: 'balanced',
      proteinTier: 'moderate',
      targetCalories: 1950,
      higherCalorieDays: [],
      higherCalorieSurplus: 300,
    },
  };
}

export function setUserOnboarding(email: string, data: any) {
  if (!email) return;
  const key = `mf_user_onboarding_${email.trim().toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(data));
}

export function setUserLogs(email: string, logs: LogItem[]) {
  if (!email) return;
  const key = `mf_user_logs_${email.trim().toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(logs));
}

export function seedUserInitialLog(
  email: string,
  startingWeightKg: number,
  baselineTdee: number
): LogItem[] {
  if (!email) return [];
  const key = `mf_user_logs_${email.trim().toLowerCase()}`;
  const todayStr = new Date().toISOString().split('T')[0];
  const curW = Number(startingWeightKg) || 78.0;
  const baseTdee = Number(baselineTdee) || 2340;

  let existingLogs: LogItem[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        existingLogs = parsed;
      }
    }
  } catch {
    existingLogs = [];
  }

  if (existingLogs.length <= 1) {
    const initialLogs: LogItem[] = [
      {
        date: existingLogs[0]?.date || todayStr,
        scaleWeight: curW,
        calories: existingLogs[0]?.calories ?? null,
        isFasting: existingLogs[0]?.isFasting ?? false,
        isPartial: existingLogs[0]?.isPartial ?? false,
        trendWeight: curW,
        tdee: baseTdee,
        isHolding: true,
      },
    ];
    localStorage.setItem(key, JSON.stringify(initialLogs));
    return initialLogs;
  } else {
    const todayLog = existingLogs.find((l) => l.date === todayStr);
    if (todayLog) {
      todayLog.scaleWeight = curW;
      todayLog.trendWeight = curW;
      todayLog.tdee = baseTdee;
    }
    localStorage.setItem(key, JSON.stringify(existingLogs));
    return existingLogs;
  }
}

export function getUserLogs(email: string, onboarding?: any): LogItem[] {
  if (!email) return [];
  const key = `mf_user_logs_${email.trim().toLowerCase()}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If the log history contains only the auto-generated initial day entry, update its weight to match onboarding.startingWeightKg
        if (parsed.length === 1 && onboarding?.startingWeightKg) {
          const targetWeight = Number(onboarding.startingWeightKg);
          const targetTdee = Number(onboarding.baselineTdee) || parsed[0].tdee || 2340;
          if (parsed[0].scaleWeight !== targetWeight || (targetTdee && parsed[0].tdee !== targetTdee)) {
            parsed[0].scaleWeight = targetWeight;
            parsed[0].trendWeight = targetWeight;
            parsed[0].tdee = targetTdee;
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        }
        return parsed;
      }
    }
  } catch {
    // fallback
  }

  // Initial Day-1 clean weigh-in log entry
  const todayStr = new Date().toISOString().split('T')[0];
  const curW = Number(onboarding?.startingWeightKg) || 78.0;
  const baseTdee = Number(onboarding?.baselineTdee) || 2340;

  const initialLogs: LogItem[] = [
    {
      date: todayStr,
      scaleWeight: curW,
      calories: null,
      isFasting: false,
      isPartial: false,
      trendWeight: curW,
      tdee: baseTdee,
      isHolding: true,
    },
  ];

  localStorage.setItem(key, JSON.stringify(initialLogs));
  return initialLogs;
}

export function saveUserLog(
  email: string,
  entry: {
    date: string;
    scaleWeight?: number | null;
    calories?: number | null;
    isFasting?: boolean;
    isPartial?: boolean;
    notes?: string;
  }
): LogItem[] {
  const currentLogs = getUserLogs(email);
  const existingIdx = currentLogs.findIndex((l) => l.date === entry.date);

  const curW = entry.scaleWeight !== undefined ? entry.scaleWeight : null;
  const curCals = entry.calories !== undefined ? entry.calories : null;

  if (existingIdx >= 0) {
    const existing = currentLogs[existingIdx];
    currentLogs[existingIdx] = {
      ...existing,
      scaleWeight: entry.scaleWeight !== undefined ? entry.scaleWeight : existing.scaleWeight,
      calories: entry.calories !== undefined ? entry.calories : existing.calories,
      isFasting: entry.isFasting !== undefined ? entry.isFasting : existing.isFasting,
      isPartial: entry.isPartial !== undefined ? entry.isPartial : existing.isPartial,
    };
  } else {
    currentLogs.unshift({
      date: entry.date,
      scaleWeight: curW,
      calories: curCals,
      isFasting: !!entry.isFasting,
      isPartial: !!entry.isPartial,
      trendWeight: curW,
      tdee: null,
      isHolding: false,
    });
  }

  currentLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const key = `mf_user_logs_${email.trim().toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(currentLogs));
  return currentLogs;
}

export function deleteUserLog(email: string, date: string): LogItem[] {
  const currentLogs = getUserLogs(email).filter((l) => l.date !== date);
  const key = `mf_user_logs_${email.trim().toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(currentLogs));
  return currentLogs;
}

export function clearUserLogs(email: string): LogItem[] {
  const key = `mf_user_logs_${email.trim().toLowerCase()}`;
  localStorage.removeItem(key);
  return [];
}

export function buildUserDashboardData(
  _email: string,
  onboarding: any,
  logs: LogItem[]
): DashboardResponse {
  const curW = Number(onboarding?.startingWeightKg) || 78.0;
  const baseTdee = Number(onboarding?.baselineTdee) || 2340;
  const todayStr = new Date().toISOString().split('T')[0];

  const profile: UserProfile = {
    id: 2,
    biologicalSex: onboarding?.biologicalSex || 'male',
    birthDate: onboarding?.birthDate || '1998-05-15',
    heightCm: Number(onboarding?.heightCm) || 178,
    initialWeightKg: curW,
    baselineTdee: baseTdee,
    bmrEquation: 'mifflin_st_jeor',
    checkInDay: 1,
    fastCheckIn: false,
    weightUnit: onboarding?.weightUnit || 'kg',
    energyUnit: 'kcal',
  };

  const goalType = onboarding?.goal?.goalType || 'weight_loss';
  const targetW =
    goalType === 'maintenance'
      ? null
      : onboarding?.goal?.targetWeightKg
      ? Number(onboarding.goal.targetWeightKg)
      : null;
  const ratePct = goalType === 'maintenance' ? 0 : Number(onboarding?.goal?.weeklyRatePercent ?? -0.5);
  const weeklyRateKg = Number(((Math.abs(ratePct) / 100) * curW).toFixed(2));

  let weeks: number | null = null;
  let targetDateStr: string | null = null;
  if (targetW !== null && weeklyRateKg > 0) {
    weeks = Math.max(1, Math.ceil(Math.abs(curW - targetW) / weeklyRateKg));
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    targetDateStr = d.toISOString().split('T')[0];
  }

  const goal: Goal = {
    goalId: 1,
    goalType,
    startWeightKg: curW,
    targetWeightKg: targetW,
    initialTrendWeightKg: curW,
    weeklyRatePercent: ratePct,
    weeklyRateKg,
    startDate: todayStr,
    targetDate: targetDateStr,
    etaWeeks: weeks,
    status: 'active',
    scaleReached: false,
    hidden: false,
  };

  const targetCalories =
    Number(onboarding?.program?.targetCalories) ||
    Math.round(baseTdee - (weeklyRateKg * 7700) / 7);
  const dailyDeficit = Math.round(baseTdee - targetCalories);
  const macros = calculateMacros(
    targetCalories,
    curW,
    onboarding?.program?.dietStyle || 'balanced',
    onboarding?.program?.proteinTier || 'moderate'
  );

  const estimatedEndDateStr = targetDateStr
    ? new Date(targetDateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : goalType === 'maintenance'
    ? 'Ongoing Maintenance'
    : '—';

  const program: ProgramDerivation = {
    calories: targetCalories,
    dailyDeficitKcal: dailyDeficit,
    weeklyLossRateKg: weeklyRateKg,
    estimatedEndDateStr,
    weeksToGoal: weeks ?? 0,
    proteinGrams: macros.proteinGrams,
    fatGrams: macros.fatGrams,
    carbGrams: macros.carbGrams,
  };

  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffDays = (1 + 7 - dayOfWeek) % 7 || 7;
  const nextCheckIn = new Date();
  nextCheckIn.setDate(today.getDate() + diffDays);
  const nextCheckInDateStr = nextCheckIn.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const schedule: CheckInSchedule = {
    checkInDay: 1,
    checkInWeekday: 'Monday',
    nextCheckInDate: nextCheckInDateStr,
    diffDays,
    state: 'upcoming',
    fastCheckIn: false,
  };

  const latestWithWeight = logs.find(
    (l) => l.scaleWeight !== null && l.scaleWeight !== undefined
  );
  const currentWeight = latestWithWeight ? (latestWithWeight.scaleWeight as number) : curW;

  const recentScale = logs
    .filter((l) => l.scaleWeight !== null && l.scaleWeight !== undefined)
    .slice(0, 7)
    .reverse()
    .map((l) => ({ date: l.date, weight: l.scaleWeight as number }));

  const recentTrend = logs
    .slice(0, 7)
    .reverse()
    .map((l) => ({ date: l.date, weight: l.trendWeight ?? l.scaleWeight ?? curW }));

  const recentTdee = logs
    .slice(0, 7)
    .reverse()
    .map((l) => ({
      date: l.date,
      tdee: l.tdee ?? baseTdee,
      status: 'holding',
      fluxUpper: (l.tdee ?? baseTdee) + 45,
      fluxLower: (l.tdee ?? baseTdee) - 45,
    }));

  if (recentScale.length === 0) {
    recentScale.push({ date: todayStr, weight: curW });
  }
  if (recentTrend.length === 0) {
    recentTrend.push({ date: todayStr, weight: curW });
  }
  if (recentTdee.length === 0) {
    recentTdee.push({
      date: todayStr,
      tdee: baseTdee,
      status: 'holding',
      fluxUpper: baseTdee + 45,
      fluxLower: baseTdee - 45,
    });
  }

  return {
    profile,
    goal,
    currentWeight,
    currentScaleWeight: currentWeight,
    currentTdee: baseTdee,
    tdeeStatus: 'holding',
    program,
    schedule,
    recentTdee,
    recentTrend,
    recentScale,
  };
}

export function buildUserExpenditureData(
  _email: string,
  onboarding: any,
  logs: LogItem[]
): ExpenditureResponse {
  const baseTdee = Number(onboarding?.baselineTdee) || 2340;
  const todayStr = new Date().toISOString().split('T')[0];

  const entries: TdeePoint[] = logs
    .slice(0, 14)
    .reverse()
    .map((l) => ({
      date: l.date,
      tdee: l.tdee ?? baseTdee,
      fluxUpper: (l.tdee ?? baseTdee) + 45,
      fluxLower: (l.tdee ?? baseTdee) - 45,
      tdeeDelta: 0,
      isHolding: true,
    }));

  if (entries.length === 0) {
    entries.push({
      date: todayStr,
      tdee: baseTdee,
      fluxUpper: baseTdee + 45,
      fluxLower: baseTdee - 45,
      tdeeDelta: 0,
      isHolding: true,
    });
  }

  const historyGroups: ExpenditureHistoryGroup[] = [
    {
      monthName: 'October 2026',
      items: entries.map((e) => ({
        date: e.date,
        tdee: e.tdee,
        tdeeDelta: 0,
        isHolding: true,
      })),
    },
  ];

  return {
    entries,
    header: {
      average: baseTdee,
      differenceFormatted: '0 kcal',
      rawDifference: 0,
      dateRangeSubtitle: 'Day 1 Baseline',
    },
    changes: {
      threeDay: { delta: '0', status: 'Plateau' },
      sevenDay: { delta: '0', status: 'Plateau' },
      fourteenDay: { delta: '0', status: 'Plateau' },
      thirtyDay: { delta: '0', status: 'Plateau' },
      ninetyDay: { delta: '0', status: 'Plateau' },
    },
    currentExpenditure: baseTdee,
    currentStrategy: 'Holding',
    flux: {
      lower: baseTdee - 45,
      upper: baseTdee + 45,
    },
    historyGroups,
  };
}

export function buildUserTrendData(
  _email: string,
  onboarding: any,
  logs: LogItem[]
): TrendResponse {
  const curW = Number(onboarding?.startingWeightKg) || 78.0;
  const todayStr = new Date().toISOString().split('T')[0];

  const entries: WeightTrendPoint[] = logs
    .slice(0, 14)
    .reverse()
    .map((l) => ({
      date: l.date,
      scaleWeight: l.scaleWeight ?? null,
      trendWeight: l.trendWeight ?? l.scaleWeight ?? curW,
      velocity: 0,
      noiseRangeLower: curW - 0.2,
      noiseRangeUpper: curW + 0.2,
    }));

  if (entries.length === 0) {
    entries.push({
      date: todayStr,
      scaleWeight: curW,
      trendWeight: curW,
      velocity: 0,
      noiseRangeLower: curW - 0.2,
      noiseRangeUpper: curW + 0.2,
    });
  }

  const latestWithWeight = logs.find(
    (l) => l.scaleWeight !== null && l.scaleWeight !== undefined
  );
  const currentWeight = latestWithWeight ? (latestWithWeight.scaleWeight as number) : curW;

  return {
    entries,
    header: {
      average: currentWeight,
      differenceFormatted: '0.0 kg',
      rawDifference: 0,
      dateRangeSubtitle: 'Day 1 Baseline',
    },
    changes: {
      threeDay: { delta: '0.0 kg', status: 'Plateau' },
      sevenDay: { delta: '0.0 kg', status: 'Plateau' },
      fourteenDay: { delta: '0.0 kg', status: 'Plateau' },
      thirtyDay: { delta: '0.0 kg', status: 'Plateau' },
      ninetyDay: { delta: '0.0 kg', status: 'Plateau' },
    },
    analytics: {
      currentWeight,
      weeklyRateKg: 0,
      dailyDeficitKcal: 0,
      projected30d: currentWeight,
    },
  };
}

export function buildUserStrategyData(
  _email: string,
  onboarding: any
): StrategyResponse {
  const curW = Number(onboarding?.startingWeightKg) || 78.0;
  const baseTdee = Number(onboarding?.baselineTdee) || 2340;
  const todayStr = new Date().toISOString().split('T')[0];

  const goalType = onboarding?.goal?.goalType || 'weight_loss';
  const targetW =
    goalType === 'maintenance'
      ? null
      : onboarding?.goal?.targetWeightKg
      ? Number(onboarding.goal.targetWeightKg)
      : null;
  const ratePct = goalType === 'maintenance' ? 0 : Number(onboarding?.goal?.weeklyRatePercent ?? -0.5);
  const weeklyRateKg = Number(((Math.abs(ratePct) / 100) * curW).toFixed(2));

  let weeks: number | null = null;
  let targetDateStr: string | null = null;
  if (targetW !== null && weeklyRateKg > 0) {
    weeks = Math.max(1, Math.ceil(Math.abs(curW - targetW) / weeklyRateKg));
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    targetDateStr = d.toISOString().split('T')[0];
  }

  const goal: Goal = {
    goalId: 1,
    goalType,
    startWeightKg: curW,
    targetWeightKg: targetW,
    initialTrendWeightKg: curW,
    weeklyRatePercent: ratePct,
    weeklyRateKg,
    startDate: todayStr,
    targetDate: targetDateStr,
    etaWeeks: weeks,
    status: 'active',
    scaleReached: false,
    hidden: false,
  };

  const targetCalories =
    Number(onboarding?.program?.targetCalories) ||
    Math.round(baseTdee - (weeklyRateKg * 7700) / 7);
  const dailyDeficit = Math.round(baseTdee - targetCalories);

  const higherDays: number[] = onboarding?.program?.higherCalorieDays || [];
  const surplus = Number(onboarding?.program?.higherCalorieSurplus) || 300;
  const dailyTargets = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    let cals = targetCalories;
    if (higherDays.length > 0 && higherDays.length < 7) {
      if (higherDays.includes(day)) {
        cals = targetCalories + surplus;
      } else {
        const rem = targetCalories * 7 - higherDays.length * (targetCalories + surplus);
        cals = Math.round(rem / (7 - higherDays.length));
      }
    }
    return {
      targetId: day + 1,
      dayOfWeek: day,
      targetCalories: cals,
      isHigherCalorieDay: higherDays.includes(day),
    };
  });

  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffDays = (1 + 7 - dayOfWeek) % 7 || 7;
  const nextCheckIn = new Date();
  nextCheckIn.setDate(today.getDate() + diffDays);
  const nextCheckInDateStr = nextCheckIn.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const schedule: CheckInSchedule = {
    checkInDay: 1,
    checkInWeekday: 'Monday',
    nextCheckInDate: nextCheckInDateStr,
    diffDays,
    state: 'upcoming',
    fastCheckIn: false,
  };

  const compliance: LoggingCompliance = {
    nutritionDays: 0,
    weightDays: 1,
    meetsNutrition: false,
    meetsWeight: true,
    isHolding: true,
    partialDays: [],
    statusText: 'Day 1 setup',
  };

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  return {
    schedule,
    compliance,
    activePlan: {
      planId: 1,
      targetCalories,
      dailyDeficitKcal: dailyDeficit,
      startDate: todayStr,
      endDate: nextWeek.toISOString().split('T')[0],
      checkInDate: todayStr,
      programStyle: onboarding?.program?.programStyle || 'coached',
      dailyTargets,
    },
    currentTdee: baseTdee,
    currentTrendWeight: curW,
    goal,
    fastCheckIn: false,
    biologicalSex: onboarding?.biologicalSex || 'male',
  };
}

export function buildUserScaleWeightData(
  _email: string,
  onboarding: any,
  logs: LogItem[],
  timeframe: string = '1W',
  aggregation: string = 'D'
): ScaleWeightResponse {
  const curW = Number(onboarding?.startingWeightKg) || 78.0;
  const latestWithWeight = logs.find(
    (l) => l.scaleWeight !== null && l.scaleWeight !== undefined
  );
  const avgWeight = latestWithWeight ? (latestWithWeight.scaleWeight as number) : curW;

  const pointsCount = timeframe === '1M' ? 30 : 7;
  const chartPoints: ScaleWeightChartPoint[] = [];
  const now = new Date();

  for (let i = pointsCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const logMatch = logs.find((l) => l.date === dateStr && l.scaleWeight !== null);

    chartPoints.push({
      date: dateStr,
      dayLabel: formatDayLabel(dateStr),
      dayOfMonth: d.getDate(),
      scaleWeight: logMatch ? (logMatch.scaleWeight as number) : null,
      interpolatedWeight: logMatch ? (logMatch.scaleWeight as number) : avgWeight,
      hasEntry: !!logMatch,
    });
  }

  // Group logs into history
  const historyMap = new Map<string, ScaleWeightMonthGroup>();
  const logsWithWeight = logs.filter((l) => l.scaleWeight !== null && l.scaleWeight !== undefined);

  if (logsWithWeight.length === 0) {
    const todayStr = now.toISOString().split('T')[0];
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    historyMap.set(monthKey, {
      monthYear: `${FULL_MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
      monthKey,
      entries: [
        {
          entryId: 1,
          logDate: todayStr,
          formattedDate: formatDayLabel(todayStr),
          weightKg: curW,
          source: 'initial_setup',
          notes: null,
        },
      ],
    });
  } else {
    for (const l of logsWithWeight) {
      const [year, month] = l.date.split('-').map(Number);
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      if (!historyMap.has(monthKey)) {
        historyMap.set(monthKey, {
          monthYear: `${FULL_MONTH_NAMES[month - 1]} ${year}`,
          monthKey,
          entries: [],
        });
      }
      historyMap.get(monthKey)!.entries.push({
        entryId: Math.abs(new Date(l.date).getTime()),
        logDate: l.date,
        formattedDate: formatDayLabel(l.date),
        weightKg: l.scaleWeight as number,
        source: 'manual',
        notes: null,
      });
    }
  }

  return {
    header: {
      average: avgWeight,
      averageFormatted: `${avgWeight.toFixed(1)} kg`,
      differenceFormatted: '0.0 kg',
      rawDifference: 0,
      dateRangeSubtitle: 'Day 1 Baseline',
      unit: 'kg',
    },
    chart: {
      points: chartPoints,
      minWeight: avgWeight - 1.0,
      maxWeight: avgWeight + 1.0,
      timeframe,
      aggregation,
    },
    history: Array.from(historyMap.values()),
  };
}

export interface UserProfile {
  id: number;
  biologicalSex: string;
  birthDate: string;
  heightCm: number;
  initialWeightKg: number;
  baselineTdee: number;
  bmrEquation: string;
  checkInDay: number; // 0=Sun..6=Sat
  fastCheckIn: boolean;
  weightUnit: string;
  energyUnit: string;
}

export interface GoalSummaryMetrics {
  currentTrendWeightKg: number;
  targetWeightKg: number | null;
  totalDeltaKg: number;
  remainingDeltaKg: number;
  percentComplete: number;
  weeklyRatePercent: number;
  weeklyRateKg: number;
  dailyDeficitKcal: number;
  projectedTargetCalories: number;
  estimatedWeeks: number | null;
  estimatedCompletionDate: string | null;
  calorieFloorWarning: 'none' | 'standard_floor' | 'low_floor';
  classificationBand: 'slow' | 'moderate' | 'fast';
}

export interface Goal {
  goalId: number;
  goalType: 'weight_loss' | 'weight_gain' | 'maintenance' | string;
  startWeightKg: number;
  targetWeightKg: number | null;
  initialTrendWeightKg?: number;
  finalTrendWeightKg?: number | null;
  weeklyRatePercent: number;
  weeklyRateKg: number;
  startDate: string;
  endDate?: string | null;
  targetDate: string | null;
  etaWeeks?: number | null;
  status: 'active' | 'completed' | 'abandoned' | 'paused' | string;
  scaleReached?: boolean;
  hidden?: boolean;
  createdAt?: string;
  metrics?: GoalSummaryMetrics;
  isGoalReached?: boolean;
}

export interface CheckInSchedule {
  checkInDay: number;
  checkInWeekday: string;
  nextCheckInDate: string;
  diffDays: number;
  state: 'upcoming' | 'early_available' | 'ready' | 'overdue';
  fastCheckIn: boolean;
}

export interface LoggingCompliance {
  nutritionDays: number;
  weightDays: number;
  meetsNutrition: boolean;
  meetsWeight: boolean;
  isHolding: boolean;
  partialDays: string[];
  statusText: string;
}

export interface ProgramDerivation {
  calories: number;
  dailyDeficitKcal: number;
  weeklyLossRateKg: number;
  estimatedEndDateStr: string;
  weeksToGoal: number;
  proteinGrams?: number;
  fatGrams?: number;
  carbGrams?: number;
}

export interface DashboardResponse {
  profile: UserProfile | null;
  goal: Goal | null;
  currentWeight: number;
  currentScaleWeight?: number;
  currentTdee: number;
  tdeeStatus: 'updating' | 'holding' | 'static';
  program: ProgramDerivation;
  schedule: CheckInSchedule;
  bodyFatPercent?: number;
  recentTdee: Array<{
    date: string;
    tdee: number;
    status: string;
    fluxUpper?: number;
    fluxLower?: number;
  }>;
  recentTrend?: Array<{
    date: string;
    weight: number;
  }>;
  recentScale?: Array<{
    date: string;
    weight: number;
  }>;
}

export interface TdeePoint {
  date: string;
  tdee: number;
  fluxUpper: number;
  fluxLower: number;
  tdeeDelta: number;
  isHolding: boolean;
}

export interface IntervalChange {
  delta: number | string;
  rawDelta?: number;
  status: 'Increase' | 'Decrease' | 'No Change' | 'Plateau' | 'Waiting';
  sparklinePoints?: number[];
}

export interface ExpenditureHistoryGroup {
  monthName: string;
  items: Array<{
    date: string;
    tdee: number;
    tdeeDelta: number;
    isHolding: boolean;
  }>;
}

export interface HeaderMetrics {
  average: number;
  differenceFormatted: string;
  rawDifference: number;
  dateRangeSubtitle: string;
}

export interface ExpenditureResponse {
  entries: TdeePoint[];
  header?: HeaderMetrics;
  changes: {
    threeDay: IntervalChange;
    sevenDay: IntervalChange;
    fourteenDay: IntervalChange;
    thirtyDay: IntervalChange;
    ninetyDay: IntervalChange;
  };
  currentExpenditure: number;
  currentStrategy: 'Updating' | 'Holding';
  flux?: {
    lower: number;
    upper: number;
  };
  historyGroups: ExpenditureHistoryGroup[];
}

export interface WeightTrendPoint {
  date: string;
  scaleWeight: number | null;
  trendWeight: number;
  velocity: number;
  noiseRangeLower: number | null;
  noiseRangeUpper: number | null;
}

export interface TrendAnalytics {
  currentWeight: number;
  weeklyRateKg: number;
  weeklyRateFormatted?: string;
  dailyDeficitKcal: number;
  dailyDeficitFormatted?: string;
  projected30d: number;
}

export interface TrendResponse {
  entries: WeightTrendPoint[];
  header?: HeaderMetrics;
  changes: {
    threeDay: IntervalChange;
    sevenDay: IntervalChange;
    fourteenDay: IntervalChange;
    thirtyDay: IntervalChange;
    ninetyDay: IntervalChange;
  };
  analytics: TrendAnalytics;
}

export interface LogItem {
  date: string;
  scaleWeight: number | null;
  calories: number | null;
  isFasting: boolean;
  isPartial?: boolean;
  trendWeight: number | null;
  tdee: number | null;
  isHolding: boolean;
}

export interface StrategyResponse {
  schedule: CheckInSchedule;
  compliance: LoggingCompliance;
  activePlan: {
    planId: number;
    targetCalories: number;
    dailyDeficitKcal: number;
    startDate: string;
    endDate: string;
    checkInDate: string;
    programStyle?: string;
    dailyTargets?: Array<{
      targetId?: number;
      dayOfWeek: number;
      targetCalories: number;
      isHigherCalorieDay?: boolean;
    }>;
  } | null;
  currentTdee: number;
  currentTrendWeight: number;
  goal: Goal | null;
  fastCheckIn: boolean;
  biologicalSex?: string;
}

export interface ScaleWeightChartPoint {
  date: string;
  dayLabel: string;
  dayOfMonth: number;
  scaleWeight: number | null;
  interpolatedWeight: number;
  hasEntry: boolean;
  notes?: string | null;
}

export interface ScaleWeightHistoryEntry {
  entryId: number;
  logDate: string;
  formattedDate: string;
  weightKg: number;
  source: string;
  notes: string | null;
}

export interface ScaleWeightMonthGroup {
  monthYear: string;
  monthKey: string;
  entries: ScaleWeightHistoryEntry[];
}

export interface ScaleWeightHeader {
  average: number;
  averageFormatted: string;
  differenceFormatted: string;
  rawDifference: number;
  dateRangeSubtitle: string;
  unit: string;
}

export interface ScaleWeightResponse {
  header: ScaleWeightHeader;
  chart: {
    points: ScaleWeightChartPoint[];
    minWeight: number;
    maxWeight: number;
    timeframe: string;
    aggregation: string;
  };
  history: ScaleWeightMonthGroup[];
}


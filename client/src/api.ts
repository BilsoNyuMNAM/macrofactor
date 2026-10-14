import {
  DashboardResponse,
  ExpenditureResponse,
  TrendResponse,
  LogItem,
  StrategyResponse
} from './types';

const API_BASE = '/api';

export const api = {
  async getDashboard(): Promise<DashboardResponse> {
    const res = await fetch(`${API_BASE}/dashboard`);
    if (!res.ok) throw new Error('Failed to fetch dashboard');
    return res.json();
  },

  async getExpenditure(timeframe?: string): Promise<ExpenditureResponse> {
    const query = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : '';
    const res = await fetch(`${API_BASE}/expenditure${query}`);
    if (!res.ok) throw new Error('Failed to fetch expenditure');
    return res.json();
  },

  async getTrend(timeframe?: string): Promise<TrendResponse> {
    const query = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : '';
    const res = await fetch(`${API_BASE}/trend${query}`);
    if (!res.ok) throw new Error('Failed to fetch weight trend');
    return res.json();
  },

  async getScaleWeight(timeframe?: string, aggregation?: string): Promise<import('./types').ScaleWeightResponse> {
    const params = new URLSearchParams();
    if (timeframe) params.append('timeframe', timeframe);
    if (aggregation) params.append('aggregation', aggregation);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/scale-weight${query}`);
    if (!res.ok) throw new Error('Failed to fetch scale weight');
    return res.json();
  },

  async saveScaleWeight(data: {
    date: string;
    weightKg: number;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/scale-weight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to save scale weight');
    return res.json();
  },

  async updateScaleWeight(entryId: number, data: {
    weightKg: number;
    logDate?: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/scale-weight/${entryId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update scale weight');
    return res.json();
  },

  async deleteScaleWeight(entryId: number): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/scale-weight/${entryId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete scale weight');
    return res.json();
  },

  async getLogs(): Promise<{ logs: LogItem[] }> {
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) throw new Error('Failed to fetch logs');
    return res.json();
  },

  async saveLog(data: {
    date: string;
    scaleWeight?: number | string | null;
    calories?: number | string | null;
    isFasting?: boolean;
    isPartial?: boolean;
    notes?: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to save log');
    return res.json();
  },

  async deleteLog(date: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/logs/${date}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete log');
    return res.json();
  },

  async getStrategy(): Promise<StrategyResponse> {
    const res = await fetch(`${API_BASE}/strategy`);
    if (!res.ok) throw new Error('Failed to fetch strategy');
    return res.json();
  },

  async getGoals(): Promise<{
    goals: import('./types').Goal[];
    activeGoal: import('./types').Goal | null;
    activeMetrics: import('./types').GoalSummaryMetrics | null;
    currentTrendWeight: number;
    currentTdee: number;
  }> {
    const res = await fetch(`${API_BASE}/strategy/goals`);
    if (!res.ok) throw new Error('Failed to fetch goals');
    return res.json();
  },

  async createGoal(data: {
    goalType: string;
    targetWeightKg?: number | null;
    weeklyRatePercent: number;
    programStyle?: string;
    dietStyle?: string;
    startDate?: string;
  }): Promise<{ success: boolean; message: string; goal: import('./types').Goal; plan: any }> {
    const res = await fetch(`${API_BASE}/strategy/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create goal');
    return res.json();
  },

  async updateGoal(goalId: number, data: {
    targetWeightKg?: number | null;
    weeklyRatePercent?: number;
    recalculateProgramNow?: boolean;
  }): Promise<{ success: boolean; message: string; goal: import('./types').Goal }> {
    const res = await fetch(`${API_BASE}/strategy/goals/${goalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update goal');
    return res.json();
  },

  async deleteGoal(goalId: number): Promise<{
    success: boolean;
    isPastGoal: boolean;
    reopenedGoal?: import('./types').Goal;
    requiresNewProgram?: boolean;
    message: string;
  }> {
    const res = await fetch(`${API_BASE}/strategy/goals/${goalId}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to delete goal');
    }
    return res.json();
  },

  async createProgram(data: {
    programStyle: string;
    targetCalories?: number;
    dailyTargets?: Array<{ dayOfWeek: number; targetCalories: number; isHigherCalorieDay?: boolean }>;
    higherCalorieDays?: number[];
    higherCalorieSurplus?: number;
  }): Promise<{ success: boolean; message: string; plan: any }> {
    const res = await fetch(`${API_BASE}/strategy/program`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to create program');
    }
    return res.json();
  },

  async updateProgram(data: {
    programStyle?: string;
    targetCalories?: number;
    dailyTargets?: Array<{ dayOfWeek: number; targetCalories: number; isHigherCalorieDay?: boolean }>;
    higherCalorieDays?: number[];
    higherCalorieSurplus?: number;
  }): Promise<{ success: boolean; message: string; plan: any }> {
    const res = await fetch(`${API_BASE}/strategy/program`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to update program');
    }
    return res.json();
  },

  async submitCheckIn(data: {
    holdExisting: boolean;
    goalRatePercent?: number;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/strategy/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to submit check-in');
    return res.json();
  },

  async setCheckInDay(checkInDay: number): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/strategy/check-in-day`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkInDay })
    });
    if (!res.ok) throw new Error('Failed to update check-in day');
    return res.json();
  },

  async setFastCheckIn(fastCheckIn: boolean): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/strategy/fast-check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fastCheckIn })
    });
    if (!res.ok) throw new Error('Failed to update fast check-in');
    return res.json();
  },

  async getProfile(): Promise<any> {
    const res = await fetch(`${API_BASE}/profile`);
    if (!res.ok) throw new Error('Failed to fetch profile');
    return res.json();
  },

  async updateProfile(data: {
    currentWeight?: number;
    goalWeight?: number;
    baselineTdee?: number;
    biologicalSex?: string;
  }): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  async resetLogs(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/profile/reset-logs`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to reset logs');
    return res.json();
  },

  async register(data: { email: string; password: string; displayName?: string }): Promise<{
    success: boolean;
    user: { id: number; email: string; displayName: string | null; isOnboarded: boolean };
    token: string;
    message?: string;
  }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create account');
    return json;
  },

  async login(data: { email: string; password: string }): Promise<{
    success: boolean;
    user: { id: number; email: string; displayName: string | null; isOnboarded: boolean };
    token: string;
    message?: string;
  }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to log in');
    return json;
  },

  async getAuthMe(): Promise<{ authenticated: boolean; user: { id: number; email: string; displayName: string | null; isOnboarded: boolean } | null }> {
    const res = await fetch(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error('Failed to verify auth status');
    return res.json();
  },

  async resetOnboarding(email?: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/reset-onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error('Failed to reset onboarding');
    return res.json();
  },

  async completeOnboarding(data: any): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/auth/complete-onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to complete onboarding');
    return json;
  }
};


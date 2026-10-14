import React, { useState, useEffect, useCallback } from 'react';
import { Navigation, ViewType } from './components/Navigation';
import { ScaleWeightView } from './components/ScaleWeightView';
import { ExpenditureView } from './components/ExpenditureView';
import { WeightTrendView } from './components/WeightTrendView';
import { DashboardView } from './components/DashboardView';
import { StrategyView } from './components/StrategyView';
import { LogModal } from './components/LogModal';
import { CheckInModal } from './components/CheckInModal';
import { ChangeCheckInDayModal } from './components/ChangeCheckInDayModal';
import { OnboardingModal } from './components/OnboardingModal';
import { MoreModal } from './components/MoreModal';
import { EditGoalModal } from './components/EditGoalModal';
import { CreateGoalWizard } from './components/CreateGoalWizard';
import { NewProgramModal } from './components/NewProgramModal';
import { ChangeProgramModal } from './components/ChangeProgramModal';
import { HistoricalGoalsModal } from './components/HistoricalGoalsModal';
import { ProgramUpdateModal } from './components/ProgramUpdateModal';
import { Toast } from './components/Toast';
import { IntroView } from './components/onboarding/IntroView';
import { AuthModal } from './components/onboarding/AuthModal';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { api } from './api';
import {
  DashboardResponse,
  ExpenditureResponse,
  TrendResponse,
  LogItem,
  StrategyResponse,
} from './types';
import {
  getIsDemoUser,
  getUserOnboarding,
  setUserOnboarding,
  getUserLogs,
  saveUserLog,
  deleteUserLog,
  clearUserLogs,
  buildUserDashboardData,
  buildUserExpenditureData,
  buildUserTrendData,
  buildUserStrategyData,
} from './utils/userContext';

export const App: React.FC = () => {
  // Auth & Onboarding Navigation State
  const [authView, setAuthView] = useState<'checking' | 'intro' | 'auth_signup' | 'auth_login' | 'wizard' | 'dashboard'>(() => {
    const token = localStorage.getItem('mf_auth_token');
    const isCompleted = localStorage.getItem('isOnboardingComplete');
    if (token && isCompleted === 'true') {
      return 'dashboard';
    }
    if (token && isCompleted !== 'true') {
      return 'wizard';
    }
    return 'intro';
  });

  const [userEmail, setUserEmail] = useState<string>(() => {
    return localStorage.getItem('mf_user_email') || '';
  });
  const [activeView, setActiveView] = useState<ViewType>(() => {
    const hash = window.location.hash.replace('#', '') as ViewType;
    if (['dashboard', 'scale', 'trend', 'expenditure', 'strategy'].includes(hash)) {
      return hash;
    }
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') as ViewType;
    if (['dashboard', 'scale', 'trend', 'expenditure', 'strategy'].includes(view)) {
      return view;
    }
    return 'dashboard';
  });

  const handleSwitchView = (view: ViewType) => {
    setActiveView(view);
    window.location.hash = view;
  };

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '') as ViewType;
      if (['dashboard', 'scale', 'trend', 'expenditure', 'strategy'].includes(hash)) {
        setActiveView(hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Server Data States
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [expenditureData, setExpenditureData] = useState<ExpenditureResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [strategyData, setStrategyData] = useState<StrategyResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal States
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState<boolean>(false);
  const [isChangeDayModalOpen, setIsChangeDayModalOpen] = useState<boolean>(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState<boolean>(false);
  const [isMoreModalOpen, setIsMoreModalOpen] = useState<boolean>(false);
  const [isEditGoalModalOpen, setIsEditGoalModalOpen] = useState<boolean>(false);
  const [isCreateGoalModalOpen, setIsCreateGoalModalOpen] = useState<boolean>(false);
  const [isNewProgramModalOpen, setIsNewProgramModalOpen] = useState<boolean>(false);
  const [isChangeProgramModalOpen, setIsChangeProgramModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [isProgramUpdateModalOpen, setIsProgramUpdateModalOpen] = useState<boolean>(false);
  const [pendingGoalRate, setPendingGoalRate] = useState<number | null>(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastSuccess, setToastSuccess] = useState<boolean>(true);

  const showToast = useCallback((msg: string, success = true) => {
    setToastMessage(msg);
    setToastSuccess(success);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  const refreshAll = useCallback(async (targetEmail?: string) => {
    try {
      const effectiveEmail = targetEmail ?? localStorage.getItem('mf_user_email') ?? userEmail;
      const isDemo = getIsDemoUser(effectiveEmail);
      const token = localStorage.getItem('mf_auth_token');
      const isCompleted = localStorage.getItem('isOnboardingComplete') === 'true';

      // Guard: Do not generate placeholder data when user is in onboarding wizard mode
      if (!isDemo && (authView === 'wizard' || !isCompleted)) {
        if (!token) {
          setAuthView((prev) => (prev === 'checking' ? 'intro' : prev));
        } else if (!isCompleted) {
          setAuthView((prev) => (prev === 'checking' ? 'wizard' : prev));
        }
        if (!isCompleted) {
          setLoading(false);
          return;
        }
      }

      if (!isDemo) {
        // Build fresh Day-1 MacroFactor experience for newly registered users
        const onboarding = getUserOnboarding(effectiveEmail);
        const userLogs = getUserLogs(effectiveEmail, onboarding);
        const dash = buildUserDashboardData(effectiveEmail, onboarding, userLogs);
        const exp = buildUserExpenditureData(effectiveEmail, onboarding, userLogs);
        const trend = buildUserTrendData(effectiveEmail, onboarding, userLogs);
        const strat = buildUserStrategyData(effectiveEmail, onboarding);

        setDashboardData(dash);
        setExpenditureData(exp);
        setTrendData(trend);
        setLogs(userLogs);
        setStrategyData(strat);
      } else {
        const [dash, exp, trend, logsRes, strat] = await Promise.all([
          api.getDashboard(),
          api.getExpenditure(),
          api.getTrend(),
          api.getLogs(),
          api.getStrategy(),
        ]);

        setDashboardData(dash);
        setExpenditureData(exp);
        setTrendData(trend);
        setLogs(logsRes.logs);
        setStrategyData(strat);
      }

      // Respect authentication status and onboarding progress
      if (!token) {
        setAuthView((prev) => (prev === 'checking' ? 'intro' : prev));
      } else if (isCompleted) {
        setAuthView((prev) => (prev === 'checking' ? 'dashboard' : prev));
      } else {
        setAuthView((prev) => (prev === 'checking' ? 'wizard' : prev));
      }
    } catch (err) {
      console.error('Failed to load application data:', err);
      showToast('Error communicating with backend server', false);
      setAuthView((prev) => (prev === 'checking' ? 'intro' : prev));
    } finally {
      setLoading(false);
    }
  }, [userEmail, authView, showToast]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Handlers for modal actions
  const handleSaveLog = async (data: {
    date: string;
    scaleWeight?: number | null;
    calories?: number | null;
    isFasting?: boolean;
    isPartial?: boolean;
  }) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        saveUserLog(userEmail, data);
        showToast(`Saved entry for ${data.date}`);
        await refreshAll();
      } else {
        await api.saveLog(data);
        showToast(`Saved entry for ${data.date}`);
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to save entry', false);
    }
  };

  const handleDeleteLog = async (date: string) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        deleteUserLog(userEmail, date);
        showToast(`Deleted ${date}`);
        await refreshAll();
      } else {
        await api.deleteLog(date);
        showToast(`Deleted ${date}`);
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to delete entry', false);
    }
  };

  const handleCompleteCheckIn = async (holdExisting: boolean, goalRatePercent?: number) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        showToast('Check-in finalized successfully! Program updated.');
        await refreshAll();
      } else {
        const res = await api.submitCheckIn({ holdExisting, goalRatePercent });
        showToast(res.message);
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to finalize check-in', false);
    }
  };

  const handleSaveCheckInDay = async (day: number) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        onboarding.checkInDay = day;
        setUserOnboarding(userEmail, onboarding);
        showToast('Check-in day updated');
        await refreshAll();
      } else {
        await api.setCheckInDay(day);
        showToast('Check-in day updated');
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to update check-in day', false);
    }
  };

  const handleToggleFastCheckIn = async (val?: boolean) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        const nextVal = val !== undefined ? val : !onboarding.fastCheckIn;
        onboarding.fastCheckIn = nextVal;
        setUserOnboarding(userEmail, onboarding);
        showToast(`Fast Check-In ${nextVal ? 'Enabled' : 'Disabled'}`);
        await refreshAll();
      } else {
        const nextVal = val !== undefined ? val : !(strategyData?.fastCheckIn ?? false);
        await api.setFastCheckIn(nextVal);
        showToast(`Fast Check-In ${nextVal ? 'Enabled' : 'Disabled'}`);
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to toggle fast check-in', false);
    }
  };

  const handleSaveProfile = async (data: {
    currentWeight: number;
    goalWeight: number;
    baselineTdee: number;
    biologicalSex?: string;
  }) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        onboarding.startingWeightKg = data.currentWeight;
        onboarding.baselineTdee = data.baselineTdee;
        if (data.biologicalSex) onboarding.biologicalSex = data.biologicalSex;
        if (!onboarding.goal) onboarding.goal = {};
        onboarding.goal.targetWeightKg = data.goalWeight;
        setUserOnboarding(userEmail, onboarding);
        showToast(`Profile & baseline updated!`);
        await refreshAll();
      } else {
        await api.updateProfile(data);
        showToast(`Profile & baseline updated!`);
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to update profile', false);
    }
  };

  const handleConfirmClearLogs = async () => {
    if (window.confirm('Clear all log entries? Your program and metabolic baseline will be preserved.')) {
      try {
        if (!getIsDemoUser(userEmail)) {
          clearUserLogs(userEmail);
          showToast('All daily logs cleared');
          await refreshAll();
        } else {
          await api.resetLogs();
          showToast('All daily logs cleared');
          await refreshAll();
        }
      } catch (err) {
        showToast('Failed to clear logs', false);
      }
    }
  };

  const handleUpdateGoal = async (data: {
    targetWeightKg?: number | null;
    weeklyRatePercent?: number;
    recalculateProgramNow?: boolean;
  }) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        if (!onboarding.goal) onboarding.goal = {};
        if (data.targetWeightKg !== undefined) onboarding.goal.targetWeightKg = data.targetWeightKg;
        if (data.weeklyRatePercent !== undefined) onboarding.goal.weeklyRatePercent = data.weeklyRatePercent;
        setUserOnboarding(userEmail, onboarding);
        showToast('Goal parameters updated');
        await refreshAll();
      } else {
        if (!strategyData?.goal) return;
        await api.updateGoal(strategyData.goal.goalId, data);
        showToast('Goal parameters updated');
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to update goal', false);
      throw err;
    }
  };

  const handleCommitNewGoal = async (data: {
    goalType: string;
    targetWeightKg?: number | null;
    weeklyRatePercent: number;
  }) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        onboarding.goal = {
          goalType: data.goalType,
          targetWeightKg: data.targetWeightKg,
          weeklyRatePercent: data.weeklyRatePercent,
        };
        setUserOnboarding(userEmail, onboarding);
        showToast('New goal activated! Please configure your new nutrition program.');
        await refreshAll();
        setIsNewProgramModalOpen(true);
      } else {
        await api.createGoal(data);
        showToast('New goal activated! Please configure your new nutrition program.');
        await refreshAll();
        setIsNewProgramModalOpen(true);
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to activate new goal', false);
      throw err;
    }
  };

  const handleCommitNewProgram = async (data: {
    programStyle: string;
    targetCalories?: number;
    dailyTargets?: Array<{ dayOfWeek: number; targetCalories: number; isHigherCalorieDay?: boolean }>;
    higherCalorieDays?: number[];
    higherCalorieSurplus?: number;
  }) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        if (!onboarding.program) onboarding.program = {};
        onboarding.program.programStyle = data.programStyle;
        if (data.targetCalories) onboarding.program.targetCalories = data.targetCalories;
        if (data.higherCalorieDays) onboarding.program.higherCalorieDays = data.higherCalorieDays;
        if (data.higherCalorieSurplus) onboarding.program.higherCalorieSurplus = data.higherCalorieSurplus;
        setUserOnboarding(userEmail, onboarding);
        showToast('New program activated successfully');
        await refreshAll();
      } else {
        const res = await api.createProgram(data);
        showToast(res.message);
        await refreshAll();
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to activate new program', false);
      throw err;
    }
  };

  const handleUpdateProgram = async (data: {
    programStyle?: string;
    targetCalories?: number;
    dailyTargets?: Array<{ dayOfWeek: number; targetCalories: number; isHigherCalorieDay?: boolean }>;
    higherCalorieDays?: number[];
    higherCalorieSurplus?: number;
  }) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        if (!onboarding.program) onboarding.program = {};
        if (data.programStyle) onboarding.program.programStyle = data.programStyle;
        if (data.targetCalories) onboarding.program.targetCalories = data.targetCalories;
        if (data.higherCalorieDays) onboarding.program.higherCalorieDays = data.higherCalorieDays;
        if (data.higherCalorieSurplus) onboarding.program.higherCalorieSurplus = data.higherCalorieSurplus;
        setUserOnboarding(userEmail, onboarding);
        showToast('Program updated successfully');
        await refreshAll();
      } else {
        const res = await api.updateProgram(data);
        showToast(res.message);
        await refreshAll();
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to update program', false);
      throw err;
    }
  };

  const handleDeleteGoal = async (goalId: number) => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        delete onboarding.goal;
        setUserOnboarding(userEmail, onboarding);
        showToast('Goal retired');
        await refreshAll();
        setIsNewProgramModalOpen(true);
      } else {
        const res = await api.deleteGoal(goalId);
        showToast(res.message);
        await refreshAll();
        if (res.requiresNewProgram) {
          setIsNewProgramModalOpen(true);
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete goal', false);
      throw err;
    }
  };

  const handleTransitionToMaintenance = async () => {
    try {
      if (!getIsDemoUser(userEmail)) {
        const onboarding = getUserOnboarding(userEmail) || {};
        if (!onboarding.goal) onboarding.goal = {};
        onboarding.goal.goalType = 'maintenance';
        onboarding.goal.weeklyRatePercent = 0;
        onboarding.goal.targetWeightKg = null;
        setUserOnboarding(userEmail, onboarding);
        showToast('Transitioned to Maintenance Mode! Targets locked to expenditure.');
        await refreshAll();
      } else {
        await api.createGoal({
          goalType: 'maintenance',
          weeklyRatePercent: 0,
          targetWeightKg: null
        });
        showToast('Transitioned to Maintenance Mode! Targets locked to expenditure.');
        await refreshAll();
      }
    } catch (err) {
      showToast('Failed to transition to maintenance mode', false);
    }
  };

  // While checking initial authentication and database state
  if (loading && authView === 'checking') {
    return (
      <div className="min-h-screen bg-[#0E0F12] flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-9 h-9 border-3 border-[#FF8660] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-mono">Loading MacroFactor...</span>
      </div>
    );
  }

  // Onboarding & Auth Flow Interceptor
  if (authView === 'intro') {
    return (
      <IntroView
        onGetStarted={() => setAuthView('auth_signup')}
        onLogIn={() => setAuthView('auth_login')}
      />
    );
  }

  if (authView === 'auth_signup') {
    return (
      <AuthModal
        initialMode="signup"
        onBack={() => setAuthView('intro')}
        onAuthSuccess={(user) => {
          setUserEmail(user.email);
          localStorage.removeItem('isOnboardingComplete');
          // A newly created account must always begin the onboarding wizard
          setAuthView('wizard');
        }}
      />
    );
  }

  if (authView === 'auth_login') {
    return (
      <AuthModal
        initialMode="login"
        onBack={() => setAuthView('intro')}
        onAuthSuccess={(user) => {
          setUserEmail(user.email);
          if (user.isOnboarded) {
            localStorage.setItem('isOnboardingComplete', 'true');
            setAuthView('dashboard');
            refreshAll(user.email);
          } else {
            localStorage.removeItem('isOnboardingComplete');
            setAuthView('wizard');
          }
        }}
      />
    );
  }

  if (authView === 'wizard') {
    return (
      <OnboardingWizard
        userEmail={userEmail}
        onComplete={() => {
          localStorage.setItem('isOnboardingComplete', 'true');
          setAuthView('dashboard');
          refreshAll(userEmail || localStorage.getItem('mf_user_email') || undefined);
          showToast('Welcome to MacroFactor! Your personalized program is active.');
        }}
        onCancel={() => setAuthView('intro')}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0F12] flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-9 h-9 border-3 border-[#F6805B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0F12] text-white flex flex-col select-none">
      {/* Toast Alert */}
      <Toast message={toastMessage} isSuccess={toastSuccess} />

      {/* Modern Desktop Navigation Bar */}
      <Navigation
        activeView={activeView}
        onSwitchView={handleSwitchView}
        onOpenLogModal={() => setIsLogModalOpen(true)}
        onOpenMoreModal={() => setIsMoreModalOpen(true)}
      />

      {/* Main Desktop Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'dashboard' && dashboardData && (
          <DashboardView
            data={dashboardData}
            trendData={trendData}
            expenditureData={expenditureData}
            onNavigateToExpenditure={() => setActiveView('expenditure')}
            onNavigateToTrend={() => setActiveView('trend')}
            onNavigateToScale={() => setActiveView('scale')}
            onOpenCheckInModal={() => setIsCheckInModalOpen(true)}
            onOpenOnboardingModal={() => setIsOnboardingModalOpen(true)}
            onOpenLogModal={() => setIsLogModalOpen(true)}
          />
        )}

        {activeView === 'scale' && (
          <ScaleWeightView
            userEmail={userEmail}
            onShowToast={showToast}
            onRefreshAll={refreshAll}
          />
        )}

        {activeView === 'trend' && trendData && (
          <WeightTrendView
            data={trendData}
            onShowToast={showToast}
          />
        )}

        {activeView === 'expenditure' && expenditureData && (
          <ExpenditureView
            data={expenditureData}
            onRefresh={refreshAll}
            onShowToast={showToast}
          />
        )}

        {activeView === 'strategy' && strategyData && (
          <StrategyView
            data={strategyData}
            onOpenCheckInModal={() => setIsCheckInModalOpen(true)}
            onOpenChangeDayModal={() => setIsChangeDayModalOpen(true)}
            onToggleFastCheckIn={() => handleToggleFastCheckIn()}
            onOpenOnboardingModal={() => setIsOnboardingModalOpen(true)}
            onOpenEditGoalModal={() => setIsEditGoalModalOpen(true)}
            onOpenCreateGoalModal={() => setIsCreateGoalModalOpen(true)}
            onOpenNewProgramModal={() => setIsNewProgramModalOpen(true)}
            onOpenChangeProgramModal={() => setIsChangeProgramModalOpen(true)}
            onOpenHistoryModal={() => setIsHistoryModalOpen(true)}
            onTransitionToMaintenance={handleTransitionToMaintenance}
          />
        )}
      </main>



      {/* Modals */}
      <LogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        logs={logs}
        onSave={handleSaveLog}
        onDelete={handleDeleteLog}
      />

      {strategyData && (
        <CheckInModal
          isOpen={isCheckInModalOpen}
          onClose={() => setIsCheckInModalOpen(false)}
          data={strategyData}
          logs={logs}
          expenditureData={expenditureData}
          trendData={trendData}
          onComplete={handleCompleteCheckIn}
          onToggleFastCheckIn={handleToggleFastCheckIn}
          onSaveLog={handleSaveLog}
        />
      )}

      {strategyData && (
        <ChangeCheckInDayModal
          isOpen={isChangeDayModalOpen}
          onClose={() => setIsChangeDayModalOpen(false)}
          currentDay={strategyData.schedule.checkInDay}
          onSaveDay={handleSaveCheckInDay}
        />
      )}

      {dashboardData && (
        <OnboardingModal
          isOpen={isOnboardingModalOpen}
          onClose={() => setIsOnboardingModalOpen(false)}
          currentWeight={dashboardData.currentWeight}
          goalWeight={dashboardData.goal?.targetWeightKg ?? 76.0}
          baselineTdee={dashboardData.profile?.baselineTdee ?? 2340}
          biologicalSex={dashboardData.profile?.biologicalSex ?? 'male'}
          onSave={handleSaveProfile}
        />
      )}

      <MoreModal
        isOpen={isMoreModalOpen}
        onClose={() => setIsMoreModalOpen(false)}
        fastCheckIn={strategyData?.fastCheckIn ?? false}
        userEmail={userEmail}
        onOpenChangeDayModal={() => setIsChangeDayModalOpen(true)}
        onToggleFastCheckIn={() => handleToggleFastCheckIn()}
        onOpenOnboardingModal={() => setIsOnboardingModalOpen(true)}
        onNavigateToStrategy={() => setActiveView('strategy')}
        onConfirmClearLogs={handleConfirmClearLogs}
        onReRunOnboarding={() => {
          localStorage.removeItem('isOnboardingComplete');
          setAuthView('wizard');
        }}
        onLogOut={() => {
          localStorage.removeItem('mf_auth_token');
          localStorage.removeItem('mf_user_email');
          localStorage.removeItem('isOnboardingComplete');
          setUserEmail('');
          setDashboardData(null);
          setExpenditureData(null);
          setTrendData(null);
          setStrategyData(null);
          setLogs([]);
          setAuthView('intro');
          showToast('Signed out successfully.');
        }}
      />

      {strategyData && (
        <EditGoalModal
          isOpen={isEditGoalModalOpen}
          onClose={() => setIsEditGoalModalOpen(false)}
          goal={strategyData.goal}
          currentTrendWeight={strategyData.currentTrendWeight}
          currentTdee={strategyData.currentTdee}
          biologicalSex={strategyData.biologicalSex}
          onSave={handleUpdateGoal}
          onOpenProgramUpdate={(rate) => {
            setPendingGoalRate(rate);
            setIsProgramUpdateModalOpen(true);
          }}
        />
      )}

      {strategyData && (
        <CreateGoalWizard
          isOpen={isCreateGoalModalOpen}
          onClose={() => setIsCreateGoalModalOpen(false)}
          currentTrendWeight={strategyData.currentTrendWeight}
          currentTdee={strategyData.currentTdee}
          biologicalSex={strategyData.biologicalSex}
          isHolding={strategyData.compliance.isHolding}
          onCommitGoal={handleCommitNewGoal}
        />
      )}

      {strategyData && (
        <NewProgramModal
          isOpen={isNewProgramModalOpen}
          onClose={() => setIsNewProgramModalOpen(false)}
          currentTdee={strategyData.currentTdee}
          currentTrendWeight={strategyData.currentTrendWeight}
          goal={strategyData.goal}
          biologicalSex={strategyData.biologicalSex}
          onCommitProgram={handleCommitNewProgram}
        />
      )}

      {strategyData && (
        <ChangeProgramModal
          isOpen={isChangeProgramModalOpen}
          onClose={() => setIsChangeProgramModalOpen(false)}
          activePlan={strategyData.activePlan}
          currentTdee={strategyData.currentTdee}
          currentTrendWeight={strategyData.currentTrendWeight}
          goal={strategyData.goal}
          biologicalSex={strategyData.biologicalSex}
          onUpdateProgram={handleUpdateProgram}
        />
      )}

      <HistoricalGoalsModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        currentTrendWeight={strategyData?.currentTrendWeight}
        onDeleteGoal={handleDeleteGoal}
        onOpenNewProgramModal={() => setIsNewProgramModalOpen(true)}
        onOpenCreateGoalModal={() => setIsCreateGoalModalOpen(true)}
      />

      {strategyData && isProgramUpdateModalOpen && (() => {
        const isGain = strategyData.goal?.goalType === 'weight_gain' || strategyData.goal?.goalType === 'muscle_gain';
        const isMaint = strategyData.goal?.goalType === 'maintenance';
        const tissue = isGain ? 8500 : 7700;
        const rateToUse = pendingGoalRate ?? strategyData.goal?.weeklyRatePercent ?? -0.50;
        const weeklyRateKg = (Math.abs(rateToUse) / 100.0) * strategyData.currentTrendWeight;
        const deficit = isMaint ? 0 : (isGain ? Math.round((weeklyRateKg * tissue) / 7) : -Math.round((weeklyRateKg * tissue) / 7));
        const newCalories = Math.max(800, Math.round(strategyData.currentTdee + deficit));

        return (
          <ProgramUpdateModal
            isOpen={isProgramUpdateModalOpen}
            onClose={() => {
              setIsProgramUpdateModalOpen(false);
              setPendingGoalRate(null);
            }}
            currentTargets={{
              calories: strategyData.activePlan?.targetCalories ?? (strategyData.goal?.metrics?.projectedTargetCalories ?? 2000),
            }}
            newCalories={newCalories}
            currentTrendWeight={strategyData.currentTrendWeight}
            onApply={async () => {
              await handleUpdateGoal({
                weeklyRatePercent: rateToUse,
                recalculateProgramNow: true,
              });
              showToast('Program targets successfully updated!');
            }}
          />
        );
      })()}
    </div>
  );
};

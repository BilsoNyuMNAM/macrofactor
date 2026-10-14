import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  ChevronRight,
  AlertCircle,
  Lock,
  Minus,
  Plus,
  Scale,
  Pencil,
  UserCheck
} from 'lucide-react';
import { Goal } from '../types';
import {
  DietStyle,
  ProteinTier,
  DIET_STYLES,
  PROTEIN_TIERS,
  calculateMacros
} from '../utils/macroMath';

interface ChangeProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePlan: {
    planId: number;
    targetCalories: number;
    dailyDeficitKcal: number;
    programStyle?: string;
    dailyTargets?: Array<{
      dayOfWeek: number;
      targetCalories: number;
      isHigherCalorieDay?: boolean;
    }>;
  } | null;
  currentTdee: number;
  currentTrendWeight: number;
  goal: Goal | null;
  biologicalSex?: string;
  onUpdateProgram: (data: {
    programStyle?: string;
    targetCalories?: number;
    dailyTargets?: Array<{ dayOfWeek: number; targetCalories: number; isHigherCalorieDay?: boolean }>;
    higherCalorieDays?: number[];
    higherCalorieSurplus?: number;
  }) => Promise<void>;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ChangeProgramModal: React.FC<ChangeProgramModalProps> = ({
  isOpen,
  onClose,
  activePlan,
  currentTdee,
  currentTrendWeight,
  goal: _goal,
  biologicalSex: _biologicalSex = 'male',
  onUpdateProgram,
}) => {
  if (!isOpen) return null;

  const currentStyle = (activePlan?.programStyle as 'coached' | 'collaborative' | 'manual') || 'coached';
  const [activeTab, setActiveTab] = useState<'coached' | 'collaborative' | 'manual'>(currentStyle);

  // Coached Edit State (Screen 5)
  const [trainingDaysCount, setTrainingDaysCount] = useState<number>(4);
  const [distributionMode, setDistributionMode] = useState<'equal' | 'higher_weekends' | 'custom'>('equal');
  const [selectedDietStyle, setSelectedDietStyle] = useState<DietStyle>('balanced');
  const [selectedProteinTier, setSelectedProteinTier] = useState<ProteinTier>('moderate');

  // Sub-selector sheets in Coached Edit:
  const [activeSheet, setActiveSheet] = useState<'none' | 'training' | 'distribution' | 'diet' | 'protein'>('none');

  // Base calories
  const baseCalories = activePlan?.targetCalories ?? Math.round(currentTdee - 400);
  const weeklyBudget = baseCalories * 7;

  // Collaborative Edit State (Screen 6)
  const [collabDays, setCollabDays] = useState<
    Array<{
      dayOfWeek: number;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>
  >(() => {
    if (activePlan?.dailyTargets && activePlan.dailyTargets.length === 7) {
      return activePlan.dailyTargets.map((t) => {
        const m = calculateMacros(t.targetCalories, currentTrendWeight);
        return {
          dayOfWeek: t.dayOfWeek,
          calories: t.targetCalories,
          protein: m.proteinGrams,
          fat: m.fatGrams,
          carbs: m.carbGrams,
        };
      });
    }
    return Array.from({ length: 7 }, (_, i) => {
      const m = calculateMacros(baseCalories, currentTrendWeight);
      return {
        dayOfWeek: i,
        calories: baseCalories,
        protein: m.proteinGrams,
        fat: m.fatGrams,
        carbs: m.carbGrams,
      };
    });
  });

  // Manual Edit State (Screen 7)
  const [manualDays, setManualDays] = useState<
    Array<{
      dayOfWeek: number;
      calories: number;
      protein: number;
      fat: number;
      carbs: number;
    }>
  >(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const cals = activePlan?.dailyTargets?.[i]?.targetCalories ?? baseCalories;
      const m = calculateMacros(cals, currentTrendWeight);
      return {
        dayOfWeek: i,
        calories: cals,
        protein: m.proteinGrams,
        fat: m.fatGrams,
        carbs: m.carbGrams,
      };
    });
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview for Coached
  const coachedPreview = useMemo(() => {
    const higherDaysList = distributionMode === 'higher_weekends' ? [5, 6] : [];
    const surplus = distributionMode === 'higher_weekends' ? 200 : 0;
    const numHigher = higherDaysList.length;
    const numStandard = 7 - numHigher;
    const higherCal = baseCalories + surplus;
    const standardCal = numStandard > 0 ? Math.round((weeklyBudget - numHigher * higherCal) / numStandard) : baseCalories;

    return Array.from({ length: 7 }, (_, day) => {
      const isHigher = higherDaysList.includes(day);
      const c = isHigher ? higherCal : standardCal;
      const m = calculateMacros(c, currentTrendWeight, selectedDietStyle, selectedProteinTier);
      return {
        dayOfWeek: day,
        dayName: DAY_LABELS[day],
        calories: c,
        macros: m,
        isHigher,
      };
    });
  }, [baseCalories, weeklyBudget, distributionMode, currentTrendWeight, selectedDietStyle, selectedProteinTier]);

  // Collaborative Balance
  const collabTotal = collabDays.reduce((a, b) => a + b.calories, 0);
  const collabDiff = weeklyBudget - collabTotal;
  const isCollabBalanced = collabDiff === 0;

  const updateCollabCalories = (dayIndex: number, delta: number) => {
    setCollabDays((prev) => {
      const n = [...prev];
      const targetCals = Math.max(500, n[dayIndex].calories + delta);
      const m = calculateMacros(targetCals, currentTrendWeight);
      n[dayIndex] = {
        ...n[dayIndex],
        calories: targetCals,
        protein: m.proteinGrams,
        fat: m.fatGrams,
        carbs: m.carbGrams,
      };
      return n;
    });
  };

  // Quick Multiplier tools for Manual (Screen 7)
  const add100ToAllDays = () => {
    setManualDays((prev) =>
      prev.map((d) => {
        const nextCals = d.calories + 100;
        const m = calculateMacros(nextCals, currentTrendWeight);
        return { ...d, calories: nextCals, protein: m.proteinGrams, fat: m.fatGrams, carbs: m.carbGrams };
      })
    );
  };

  const copyMonToAllDays = () => {
    const mon = manualDays[1]; // Monday is index 1
    if (!mon) return;
    setManualDays((prev) =>
      prev.map((d) => ({
        ...d,
        calories: mon.calories,
        protein: mon.protein,
        fat: mon.fat,
        carbs: mon.carbs,
      }))
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (activeTab === 'coached') {
        const higherDaysList = distributionMode === 'higher_weekends' ? [5, 6] : [];
        await onUpdateProgram({
          programStyle: 'coached',
          targetCalories: baseCalories,
          higherCalorieDays: higherDaysList,
          higherCalorieSurplus: distributionMode === 'higher_weekends' ? 200 : 0,
        });
      } else if (activeTab === 'collaborative') {
        if (!isCollabBalanced) {
          setError(`Weekly calorie budget must be balanced (diff: ${collabDiff} kcal).`);
          setSaving(false);
          return;
        }
        await onUpdateProgram({
          programStyle: 'collaborative',
          targetCalories: Math.round(collabTotal / 7),
          dailyTargets: collabDays.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            targetCalories: d.calories,
            isHigherCalorieDay: d.calories > baseCalories,
          })),
        });
      } else {
        const avg = Math.round(manualDays.reduce((a, b) => a + b.calories, 0) / 7);
        await onUpdateProgram({
          programStyle: 'manual',
          targetCalories: avg,
          dailyTargets: manualDays.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            targetCalories: d.calories,
          })),
        });
      }

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update program');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#16171B] border border-[#272930] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#272930] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">
              {activeTab === 'coached'
                ? 'Edit Coached Program'
                : activeTab === 'collaborative'
                ? 'Edit Collaborative Program'
                : 'Edit Manual Program'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Modify program settings without altering your active goal or reset schedule.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#22242B] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Style Selector Tabs */}
        <div className="px-5 pt-3 pb-2 flex gap-2 border-b border-[#272930] bg-[#121316]">
          {[
            { id: 'coached', label: 'Coached', icon: UserCheck },
            { id: 'collaborative', label: 'Collaborative', icon: Scale },
            { id: 'manual', label: 'Manual', icon: Pencil },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setActiveSheet('none');
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  isSelected
                    ? 'bg-[#23242A] text-white border border-[#2E3038] shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#43AA71]' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* SCREEN 5: EDIT COACHED PROGRAM */}
          {activeTab === 'coached' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* 4 Configurable Setting Rows */}
              <div className="bg-[#18191E] border border-[#24262E] rounded-xl divide-y divide-[#24262E] overflow-hidden shadow-sm">
                {/* 1. Training Days Row */}
                <div
                  onClick={() => setActiveSheet(activeSheet === 'training' ? 'none' : 'training')}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#23242A]/40 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-300">Training Days</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white font-medium">{trainingDaysCount} days/week</span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
                {activeSheet === 'training' && (
                  <div className="p-3 bg-[#121316] flex items-center justify-around">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setTrainingDaysCount(num);
                          setActiveSheet('none');
                        }}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                          trainingDaysCount === num
                            ? 'bg-[#43AA71] text-black shadow-sm'
                            : 'bg-[#18191E] text-gray-300 border border-[#24262E]'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. Calorie Distribution Row */}
                <div
                  onClick={() => setActiveSheet(activeSheet === 'distribution' ? 'none' : 'distribution')}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#23242A]/40 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-300">Calorie Distribution</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white font-medium">
                      {distributionMode === 'equal' ? 'Equal Every Day' : 'Higher on Weekends'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
                {activeSheet === 'distribution' && (
                  <div className="p-3 bg-[#121316] grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDistributionMode('equal');
                        setActiveSheet('none');
                      }}
                      className={`py-2 rounded-xl text-xs font-semibold border ${
                        distributionMode === 'equal'
                          ? 'bg-[#23242A] border-[#43AA71] text-white'
                          : 'bg-[#18191E] border-[#24262E] text-gray-400'
                      }`}
                    >
                      Equal Every Day
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDistributionMode('higher_weekends');
                        setActiveSheet('none');
                      }}
                      className={`py-2 rounded-xl text-xs font-semibold border ${
                        distributionMode === 'higher_weekends'
                          ? 'bg-[#23242A] border-[#43AA71] text-white'
                          : 'bg-[#18191E] border-[#24262E] text-gray-400'
                      }`}
                    >
                      Higher on Weekends
                    </button>
                  </div>
                )}

                {/* 3. Diet Style Row */}
                <div
                  onClick={() => setActiveSheet(activeSheet === 'diet' ? 'none' : 'diet')}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#23242A]/40 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-300">Diet Style</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white font-medium capitalize">{selectedDietStyle.replace('_', ' ')}</span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
                {activeSheet === 'diet' && (
                  <div className="p-3 bg-[#121316] grid grid-cols-2 gap-2">
                    {(Object.keys(DIET_STYLES) as DietStyle[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSelectedDietStyle(key);
                          setActiveSheet('none');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold text-left border ${
                          selectedDietStyle === key
                            ? 'bg-[#23242A] border-[#43AA71] text-white'
                            : 'bg-[#18191E] border-[#24262E] text-gray-400'
                        }`}
                      >
                        {DIET_STYLES[key].label}
                      </button>
                    ))}
                  </div>
                )}

                {/* 4. Protein Preference Row */}
                <div
                  onClick={() => setActiveSheet(activeSheet === 'protein' ? 'none' : 'protein')}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-[#23242A]/40 transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-300">Protein</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white font-medium">{PROTEIN_TIERS[selectedProteinTier].label}</span>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
                {activeSheet === 'protein' && (
                  <div className="p-3 bg-[#121316] grid grid-cols-2 gap-2">
                    {(Object.keys(PROTEIN_TIERS) as ProteinTier[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSelectedProteinTier(key);
                          setActiveSheet('none');
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold text-left border ${
                          selectedProteinTier === key
                            ? 'bg-[#23242A] border-[#43AA71] text-white'
                            : 'bg-[#18191E] border-[#24262E] text-gray-400'
                        }`}
                      >
                        {PROTEIN_TIERS[key].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 7-Day Live Preview Mini-Card */}
              <div className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold block">
                  Live Preview
                </span>
                <div className="grid grid-cols-7 gap-1.5">
                  {coachedPreview.map((day) => (
                    <div
                      key={day.dayOfWeek}
                      className={`rounded-xl p-2 text-center border transition-all ${
                        day.isHigher
                          ? 'bg-[#23242A] border-[#43AA71] text-white'
                          : 'bg-[#121316] border-[#24262E] text-gray-300'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold text-[#8E8E93]">{day.dayName}</div>
                      <div className="text-xs font-bold font-mono text-white mt-1 tabular-nums">
                        {day.calories.toLocaleString()}
                      </div>
                      <div className="text-[9px] text-[#43AA71] font-mono mt-0.5">{day.macros.proteinGrams}P</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footnote */}
              <p className="text-xs text-[#8E8E93] leading-relaxed italic">
                Editing your program modifies targets immediately without resetting your check-in schedule or active goal.
              </p>
            </div>
          )}

          {/* SCREEN 6: EDIT COLLABORATIVE PROGRAM */}
          {activeTab === 'collaborative' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Weekly Budget Locked Pill */}
              <div className="bg-[#18191E] border border-[#24262E] rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#8E8E93]" />
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#8E8E93]">Weekly Calorie Budget</span>
                    <div className="text-lg font-bold font-mono text-white mt-0.5 tabular-nums">
                      {weeklyBudget.toLocaleString()} <span className="text-xs text-[#8E8E93]">kcal/week</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-[#8E8E93]">Variance</span>
                  <div
                    className={`text-sm font-bold font-mono tabular-nums ${
                      isCollabBalanced
                        ? 'text-[#43AA71]'
                        : collabDiff > 0
                        ? 'text-[#F5BC43]'
                        : 'text-rose-400'
                    }`}
                  >
                    {collabDiff === 0 ? 'Balanced (0 kcal)' : `${collabDiff > 0 ? `+${collabDiff}` : collabDiff} kcal`}
                  </div>
                </div>
              </div>

              {/* 7 Interactive Day Cards with Steppers */}
              <div className="space-y-2">
                <span className="text-xs uppercase tracking-wider text-[#8E8E93] font-bold block">
                  Daily Targets
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {collabDays.map((day, idx) => (
                    <div
                      key={day.dayOfWeek}
                      className="bg-[#18191E] border border-[#24262E] rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 text-xs font-bold text-[#8E8E93] uppercase">{DAY_LABELS[day.dayOfWeek]}</span>
                        <div className="text-sm font-bold font-mono text-white tabular-nums">
                          {day.calories.toLocaleString()} <span className="text-xs text-[#8E8E93]">kcal</span>
                        </div>
                        <span className="text-xs font-mono text-gray-400 ml-2">
                          ({day.protein}P · {day.fat}F · {day.carbs}C)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCollabCalories(idx, -50)}
                          className="w-8 h-8 rounded-lg bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white flex items-center justify-center transition-all active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCollabCalories(idx, 50)}
                          className="w-8 h-8 rounded-lg bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white flex items-center justify-center transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 7: EDIT MANUAL PROGRAM */}
          {activeTab === 'manual' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Quick Multiplier Tools */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={add100ToAllDays}
                  className="px-3 py-1.5 rounded-lg bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold transition-all active:scale-95"
                >
                  +100 kcal all days
                </button>
                <button
                  type="button"
                  onClick={copyMonToAllDays}
                  className="px-3 py-1.5 rounded-lg bg-[#23242A] hover:bg-[#2C2E35] border border-[#2E3038] text-white text-xs font-semibold transition-all active:scale-95"
                >
                  Copy Mon to all days
                </button>
              </div>

              {/* 7-Day Target Matrix */}
              <div className="space-y-2">
                {manualDays.map((d, idx) => (
                  <div key={d.dayOfWeek} className="bg-[#18191E] border border-[#24262E] rounded-xl p-3 flex items-center justify-between">
                    <span className="w-10 text-xs font-bold text-[#8E8E93] uppercase">{DAY_LABELS[d.dayOfWeek]}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={d.calories}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setManualDays((prev) => {
                            const n = [...prev];
                            n[idx] = { ...n[idx], calories: val };
                            return n;
                          });
                        }}
                        className="w-24 bg-[#121316] border border-[#24262E] focus:border-[#43AA71] rounded-lg px-2 py-1 text-center font-mono font-bold text-xs text-white tabular-nums"
                      />
                      <span className="text-xs text-gray-400">kcal</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#272930] bg-[#16171B] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[#2E3038] bg-[#1C1D22] hover:bg-[#23242A] text-gray-300 hover:text-white text-xs font-semibold transition-all active:scale-95"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || (activeTab === 'collaborative' && !isCollabBalanced)}
            onClick={handleSave}
            className="px-6 py-2 rounded-full bg-[#43AA71] hover:bg-[#399663] disabled:opacity-50 text-black text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-[#43AA71]/20"
          >
            {saving ? (
              <span>Saving...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

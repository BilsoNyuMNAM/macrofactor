export type DietStyle = 'balanced' | 'low_fat' | 'low_carb' | 'keto';
export type ProteinTier = 'low' | 'moderate' | 'high' | 'extra_high';
export type TrainingSchedule = 'lifting' | 'hybrid' | 'cardio' | 'none';

export interface MacroBreakdown {
  calories: number;
  proteinGrams: number;
  fatGrams: number;
  carbGrams: number;
  proteinCalories: number;
  fatCalories: number;
  carbCalories: number;
  proteinPercent: number;
  fatPercent: number;
  carbPercent: number;
}

export const PROTEIN_TIERS: Record<ProteinTier, { label: string; perKg: number; subtitle: string }> = {
  low: {
    label: 'Low (1.6 g/kg)',
    perKg: 1.6,
    subtitle: 'Sufficient for health and maintenance without resistance training.',
  },
  moderate: {
    label: 'Moderate (2.0 g/kg)',
    perKg: 2.0,
    subtitle: 'Recommended baseline for lifters and body composition maintenance.',
  },
  high: {
    label: 'High (2.4 g/kg)',
    perKg: 2.4,
    subtitle: 'Optimal for preserving lean muscle mass during a caloric deficit.',
  },
  extra_high: {
    label: 'Extra High (2.8 g/kg)',
    perKg: 2.8,
    subtitle: 'Maximum saturation for contest prep or aggressive cutting.',
  },
};

export const DIET_STYLES: Record<DietStyle, { label: string; subtitle: string; fatRatio: number }> = {
  balanced: {
    label: 'Balanced',
    subtitle: 'Moderate fat (20–30%), balanced carbs for overall performance.',
    fatRatio: 0.25,
  },
  low_fat: {
    label: 'Low Fat',
    subtitle: 'Essential fat (15–20%), higher carbs to fuel high training volume.',
    fatRatio: 0.18,
  },
  low_carb: {
    label: 'Low Carb',
    subtitle: 'Higher fat (35–50%), reduced carbs (50–100 g) for stable satiety.',
    fatRatio: 0.40,
  },
  keto: {
    label: 'Keto',
    subtitle: 'High fat (70–80%), strictly <50 g total carbs for ketogenic adaptation.',
    fatRatio: 0.75,
  },
};

export function calculateMacros(
  calories: number,
  weightKg: number,
  dietStyle: DietStyle = 'balanced',
  proteinTier: ProteinTier = 'moderate'
): MacroBreakdown {
  const safeCalories = Math.max(500, Math.round(calories));
  const safeWeight = Math.max(30, weightKg);
  const proteinPerKg = PROTEIN_TIERS[proteinTier]?.perKg ?? 2.0;

  // 1. Protein based on body weight tier
  const proteinGrams = Math.round(safeWeight * proteinPerKg);
  const proteinCalories = proteinGrams * 4;

  // 2. Fat based on diet style ratio
  let fatRatio = DIET_STYLES[dietStyle]?.fatRatio ?? 0.25;
  let fatCalories = Math.round(safeCalories * fatRatio);
  let fatGrams = Math.max(20, Math.round(fatCalories / 9));

  // 3. Carbohydrates fill remaining caloric budget
  let remainingCalories = safeCalories - proteinCalories - (fatGrams * 9);
  let carbGrams = Math.max(0, Math.round(remainingCalories / 4));

  // Keto safeguard: strictly clamp carbs < 50g and shift calories to fat
  if (dietStyle === 'keto' && carbGrams > 45) {
    carbGrams = 30;
    const remainingForFat = safeCalories - proteinCalories - (carbGrams * 4);
    fatGrams = Math.max(20, Math.round(remainingForFat / 9));
  }

  const finalProtCal = proteinGrams * 4;
  const finalFatCal = fatGrams * 9;
  const finalCarbCal = carbGrams * 4;
  const totalCal = Math.max(1, finalProtCal + finalFatCal + finalCarbCal);

  return {
    calories: safeCalories,
    proteinGrams,
    fatGrams,
    carbGrams,
    proteinCalories: finalProtCal,
    fatCalories: finalFatCal,
    carbCalories: finalCarbCal,
    proteinPercent: Math.round((finalProtCal / totalCal) * 100),
    fatPercent: Math.round((finalFatCal / totalCal) * 100),
    carbPercent: Math.round((finalCarbCal / totalCal) * 100),
  };
}

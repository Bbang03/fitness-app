import type { InbodyRecord, User } from '@/lib/types';

export interface PredictionInput {
  user: Pick<User, 'height_cm' | 'sex' | 'birth_year'>;
  latestInbody: InbodyRecord;
  avgDailyKcal: number;
  avgDailyProtein_g: number;
  weeklyVolume_kg: number;   // kg × reps summed over last 7 days
  days: number;              // days until next measurement (default 30)
}

export interface PredictionOutput {
  bmr: number;
  tdee: number;
  caloricBalance: number;   // total over `days`
  deltaWeight_kg: number;
  deltaSkeletal_kg: number;
  deltaBodyFat_kg: number;
  predictedWeight_kg: number;
  predictedSkeletal_kg: number;
  predictedBodyFat_kg: number;
  predictedBodyFatPct: number;
  confidence: 'low' | 'medium' | 'high';
}

function calcBMR(weightKg: number, heightCm: number, ageYears: number, sex: 'male' | 'female'): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

function activityMultiplier(weeklyVolume: number): number {
  if (weeklyVolume < 5_000)  return 1.375;
  if (weeklyVolume < 15_000) return 1.55;
  if (weeklyVolume < 30_000) return 1.725;
  return 1.9;
}

export function predict(input: PredictionInput): PredictionOutput {
  const { user, latestInbody, avgDailyKcal, avgDailyProtein_g, weeklyVolume_kg, days } = input;
  const age = new Date().getFullYear() - user.birth_year;
  const bmr = calcBMR(latestInbody.weight_kg, user.height_cm, age, user.sex);
  const tdee = bmr * activityMultiplier(weeklyVolume_kg);

  // If no meal data, assume caloric balance = 0 (maintenance) — can't predict without intake data
  const effectiveKcal = avgDailyKcal > 0 ? avgDailyKcal : tdee;
  const dailyBalance = effectiveKcal - tdee;
  const totalBalance = dailyBalance * days;

  // Body fat change: calorie balance / 7700 kcal per kg fat
  const fatChange = totalBalance / 7700;

  // Muscle change (conservative naturals estimate)
  const adequateProtein = avgDailyProtein_g >= latestInbody.weight_kg * 1.6;
  const hasTraining = weeklyVolume_kg > 5_000;
  const monthFactor = days / 30;

  let muscleChange = 0;
  if (totalBalance > 0 && adequateProtein && hasTraining) {
    // Caloric surplus + good training + protein → small hypertrophy
    muscleChange = Math.min(totalBalance / 7700 * 0.3, 0.3 * monthFactor);
  } else if (totalBalance < 0) {
    muscleChange = adequateProtein && hasTraining
      ? Math.max(fatChange * 0.05, -0.1 * monthFactor)   // deficit but protected
      : Math.max(fatChange * 0.2,  -0.3 * monthFactor);   // deficit with poor inputs
  }

  const deltaWeight = fatChange + muscleChange;
  const predictedWeight  = latestInbody.weight_kg        + deltaWeight;
  const predictedSkeletal = latestInbody.skeletal_muscle_kg + muscleChange;
  const predictedBodyFat  = latestInbody.body_fat_kg     + fatChange;
  const predictedBodyFatPct = predictedWeight > 0 ? (predictedBodyFat / predictedWeight) * 100 : 0;

  const hasKcal = avgDailyKcal > 0;
  const hasVolume = weeklyVolume_kg > 0;
  const confidence: PredictionOutput['confidence'] =
    hasKcal && hasVolume ? 'medium' : hasKcal || hasVolume ? 'low' : 'low';

  const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  return {
    bmr:                  Math.round(bmr),
    tdee:                 Math.round(tdee),
    caloricBalance:       Math.round(totalBalance),
    deltaWeight_kg:       r(deltaWeight),
    deltaSkeletal_kg:     r(muscleChange),
    deltaBodyFat_kg:      r(fatChange),
    predictedWeight_kg:   r(predictedWeight, 1),
    predictedSkeletal_kg: r(predictedSkeletal, 1),
    predictedBodyFat_kg:  r(predictedBodyFat, 1),
    predictedBodyFatPct:  r(predictedBodyFatPct, 1),
    confidence,
  };
}

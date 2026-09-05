export type PredictionConfidence =
  | 'low'
  | 'medium'
  | 'high';

export interface PredictionUser {
  height_cm: number;
  sex: 'male' | 'female';
  birth_year: number;
}

export interface PredictionInbody {
  weight_kg: number;
  skeletal_muscle_kg: number;
  body_fat_kg: number;
  body_fat_pct: number;
}

export interface PredictionInput {
  user: PredictionUser;
  latestInbody: PredictionInbody;

  avgDailyKcal: number;
  avgDailyProtein_g: number;

  weeklyVolume_kg: number;

  days?: number;
}

export interface PredictionFactor {
  label: string;
  description: string;

  effect:
    | 'positive'
    | 'neutral'
    | 'negative';
}

export interface PredictionResult {
  predictedWeight_kg: number;
  predictedSkeletal_kg: number;
  predictedBodyFatPct: number;
  predictedBodyFatKg: number;

  deltaWeight_kg: number;
  deltaSkeletal_kg: number;
  deltaBodyFatKg: number;
  deltaBodyFatPct: number;

  bmr: number;
  tdee: number;
  caloricBalance: number;

  confidence:
    PredictionConfidence;

  factors:
    PredictionFactor[];

  modelVersion: string;
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}

function round1(
  value: number,
) {
  return (
    Math.round(
      value * 10,
    ) / 10
  );
}

function calculateAge(
  birthYear: number,
) {
  const currentYear =
    new Date().getFullYear();

  return clamp(
    currentYear -
      birthYear,
    14,
    100,
  );
}

function calculateBmr(
  user: PredictionUser,
  weightKg: number,
) {
  const age =
    calculateAge(
      user.birth_year,
    );

  // Mifflin-St Jeor equation
  const base =
    10 * weightKg +
    6.25 *
      user.height_cm -
    5 * age;

  const sexAdjustment =
    user.sex === 'male'
      ? 5
      : -161;

  return Math.round(
    base +
      sexAdjustment,
  );
}

function calculateActivityFactor(
  weeklyVolumeKg: number,
  weightKg: number,
) {
  if (
    weeklyVolumeKg <= 0
  ) {
    return 1.30;
  }

  const normalizedVolume =
    weeklyVolumeKg /
    Math.max(
      weightKg * 100,
      1,
    );

  if (
    normalizedVolume <
    0.5
  ) {
    return 1.38;
  }

  if (
    normalizedVolume <
    1.0
  ) {
    return 1.45;
  }

  if (
    normalizedVolume <
    2.0
  ) {
    return 1.52;
  }

  return 1.58;
}

function calculateConfidence(
  avgDailyKcal: number,
  avgDailyProtein: number,
  weeklyVolume: number,
): PredictionConfidence {
  let score = 0;

  if (
    avgDailyKcal > 0
  ) {
    score += 2;
  }

  if (
    avgDailyProtein > 0
  ) {
    score += 1;
  }

  if (
    weeklyVolume > 0
  ) {
    score += 2;
  }

  if (score >= 5) {
    return 'high';
  }

  if (score >= 2) {
    return 'medium';
  }

  return 'low';
}

export function predict({
  user,
  latestInbody,
  avgDailyKcal,
  avgDailyProtein_g,
  weeklyVolume_kg,
  days = 30,
}: PredictionInput): PredictionResult {
  const weight =
    latestInbody.weight_kg;

  const bmr =
    calculateBmr(
      user,
      weight,
    );

  const activityFactor =
    calculateActivityFactor(
      weeklyVolume_kg,
      weight,
    );

  const tdee =
    Math.round(
      bmr *
        activityFactor,
    );

  /*
   * 식단 데이터가 아예 없으면
   * 0 kcal를 섭취했다고 해석하지 않는다.
   *
   * 데이터가 없을 때는 유지 칼로리 수준으로
   * 가정해서 임의의 큰 체중 감소가 발생하지 않게 한다.
   */
  const effectiveCalories =
    avgDailyKcal > 0
      ? avgDailyKcal
      : tdee;

  const caloricBalance =
    Math.round(
      effectiveCalories -
        tdee,
    );

  /*
   * 약 7,700 kcal ≈ 체중 1kg 변화라는
   * 단순 에너지 수지 베이스라인.
   *
   * 단기 예측이 과도하게 튀지 않도록
   * ±4kg 범위로 제한.
   */
  const rawWeightDelta =
    (
      caloricBalance *
      days
    ) /
    7700;

  const weightDelta =
    clamp(
      rawWeightDelta,
      -4,
      4,
    );

  /*
   * 단백질 충분도
   *
   * 1.6 g/kg/day를 기준점으로 두되
   * 부족/충분 정도만 반영한다.
   */
  const proteinTarget =
    weight * 1.6;

  const proteinScore =
    avgDailyProtein_g > 0
      ? clamp(
          avgDailyProtein_g /
            Math.max(
              proteinTarget,
              1,
            ),
          0,
          1.2,
        )
      : 0.45;

  /*
   * 웨이트 트레이닝 볼륨 정규화.
   *
   * 절대적인 생리학적 모델이 아니라
   * 개인 기록을 비교하기 위한
   * 설명 가능한 MVP 특징량이다.
   */
  const trainingScore =
    clamp(
      weeklyVolume_kg /
        Math.max(
          weight * 100,
          1,
        ),
      0,
      1.2,
    );

  const monthScale =
    days / 30;

  /*
   * 골격근량 변화 베이스라인
   *
   * 운동 + 단백질이 모두 충분할수록 +
   * 큰 칼로리 적자에서는 -
   */
  const trainingMuscleEffect =
    0.32 *
    trainingScore *
    proteinScore;

  const deficitPenalty =
    caloricBalance < -350
      ? clamp(
          Math.abs(
            caloricBalance,
          ) / 1000,
          0,
          0.45,
        )
      : 0;

  const surplusPenalty =
    caloricBalance > 900
      ? 0.08
      : 0;

  const skeletalDelta =
    clamp(
      (
        trainingMuscleEffect -
        deficitPenalty -
        surplusPenalty
      ) *
        monthScale,
      -0.7,
      0.7,
    );

  const predictedWeight =
    Math.max(
      30,
      weight +
        weightDelta,
    );

  /*
   * 체중 변화 중 골격근 변화 이외의 상당 부분을
   * 지방 변화로 보는 보수적 베이스라인.
   *
   * 수분·글리코겐 등의 영향을 고려해
   * 100%를 지방으로 처리하지 않고 80%만 반영한다.
   */
  const residualWeightDelta =
    weightDelta -
    skeletalDelta;

  const fatDelta =
    clamp(
      residualWeightDelta *
        0.8,
      -3.5,
      3.5,
    );

  const predictedFatKg =
    clamp(
      latestInbody.body_fat_kg +
        fatDelta,
      1,
      predictedWeight *
        0.6,
    );

  const predictedBodyFatPct =
    clamp(
      (
        predictedFatKg /
        predictedWeight
      ) *
        100,
      3,
      60,
    );

  const predictedSkeletal =
    Math.max(
      5,
      latestInbody
        .skeletal_muscle_kg +
        skeletalDelta,
    );

  const bodyFatPctDelta =
    predictedBodyFatPct -
    latestInbody.body_fat_pct;

  const confidence =
    calculateConfidence(
      avgDailyKcal,
      avgDailyProtein_g,
      weeklyVolume_kg,
    );

  const factors:
    PredictionFactor[] = [];

  if (
    avgDailyKcal <= 0
  ) {
    factors.push({
      label:
        '식단 데이터 부족',

      description:
        '최근 섭취 열량 기록이 부족해 유지 칼로리를 기준으로 계산했습니다.',

      effect:
        'neutral',
    });
  } else if (
    caloricBalance <
    -250
  ) {
    factors.push({
      label:
        '칼로리 적자',

      description:
        `최근 기록 기준 하루 약 ${Math.abs(
          caloricBalance,
        )}kcal 적자로 추정됩니다.`,

      effect:
        'positive',
    });
  } else if (
    caloricBalance >
    250
  ) {
    factors.push({
      label:
        '칼로리 흑자',

      description:
        `최근 기록 기준 하루 약 ${caloricBalance}kcal 흑자로 추정됩니다.`,

      effect:
        'negative',
    });
  } else {
    factors.push({
      label:
        '유지 칼로리 근접',

      description:
        '최근 섭취량이 추정 유지 칼로리와 비교적 가깝습니다.',

      effect:
        'neutral',
    });
  }

  if (
    weeklyVolume_kg <= 0
  ) {
    factors.push({
      label:
        '운동 기록 부족',

      description:
        '최근 7일 운동 기록이 없어 근육 변화 예측의 불확실성이 큽니다.',

      effect:
        'neutral',
    });
  } else if (
    trainingScore >= 0.8
  ) {
    factors.push({
      label:
        '저항운동 자극',

      description:
        '최근 운동 볼륨이 골격근량 유지·증가 방향으로 반영되었습니다.',

      effect:
        'positive',
    });
  } else {
    factors.push({
      label:
        '운동량 보통',

      description:
        '운동 기록은 존재하지만 근육 증가 효과는 보수적으로 반영했습니다.',

      effect:
        'neutral',
    });
  }

  if (
    avgDailyProtein_g <= 0
  ) {
    factors.push({
      label:
        '단백질 데이터 부족',

      description:
        '단백질 섭취 기록이 부족해 근육 변화 예측의 신뢰도가 낮아집니다.',

      effect:
        'neutral',
    });
  } else if (
    proteinScore >= 0.9
  ) {
    factors.push({
      label:
        '단백질 섭취 충분',

      description:
        `최근 평균 단백질 섭취가 체중 기준 목표치에 근접합니다.`,

      effect:
        'positive',
    });
  } else {
    factors.push({
      label:
        '단백질 섭취 부족 가능성',

      description:
        `현재 기록은 약 ${Math.round(
          avgDailyProtein_g,
        )}g/일로 근육 변화 예측에 보수적으로 반영했습니다.`,

      effect:
        'negative',
    });
  }

  return {
    predictedWeight_kg:
      round1(
        predictedWeight,
      ),

    predictedSkeletal_kg:
      round1(
        predictedSkeletal,
      ),

    predictedBodyFatPct:
      round1(
        predictedBodyFatPct,
      ),

    predictedBodyFatKg:
      round1(
        predictedFatKg,
      ),

    deltaWeight_kg:
      round1(
        weightDelta,
      ),

    deltaSkeletal_kg:
      round1(
        skeletalDelta,
      ),

    deltaBodyFatKg:
      round1(
        fatDelta,
      ),

    deltaBodyFatPct:
      round1(
        bodyFatPctDelta,
      ),

    bmr,
    tdee,
    caloricBalance,

    confidence,

    factors,

    modelVersion:
      'baseline-v1',
  };
}
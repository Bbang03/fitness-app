import trajectoryPolicyJson from '@/models/trajectory_policy_v1.json';


export type PredictionTrajectoryMetricKey =
  | 'weight_kg'
  | 'fat_mass_kg'
  | 'skeletal_muscle_kg'
  | 'body_fat_pct';


export interface PredictionTrajectoryPoint {
  day: number;
  weight_kg: number;
  fat_mass_kg: number;
  skeletal_muscle_kg: number;
  body_fat_pct: number;
  fat_trajectory_policy: string;
}


export interface TrajectoryEndpoint {
  weight_kg: number;
  fat_mass_kg: number;
  skeletal_muscle_kg: number;
  body_fat_pct?: number;
}


interface DirectionalPrior {
  phase: number[];
  progress: number[];
}


interface TrajectoryPolicy {
  version: string;
  research_version: string;
  horizon_default_days: number;

  policies: {
    weight: {
      type: string;
    };

    fat_mass: {
      type: string;
      small_change_fallback: string;
      absolute_delta_threshold_kg: number;
      increase: DirectionalPrior;
      decrease: DirectionalPrior;
    };

    skeletal_muscle: {
      type: string;
    };

    body_fat_pct: {
      type: string;
      formula: string;
    };
  };
}


const TRAJECTORY_POLICY =
  trajectoryPolicyJson as TrajectoryPolicy;


function clamp01(
  value: number,
) {
  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  );
}


function linearProgress(
  day: number,
  horizonDays: number,
) {
  if (horizonDays <= 0) {
    throw new Error(
      'horizonDays must be positive.',
    );
  }

  return clamp01(
    day / horizonDays,
  );
}


function interpolateProgress(
  phase: number,
  prior: DirectionalPrior,
) {
  const {
    phase: phases,
    progress,
  } = prior;

  if (
    phases.length !==
    progress.length
  ) {
    throw new Error(
      'Trajectory phase/progress length mismatch.',
    );
  }

  if (phases.length < 2) {
    throw new Error(
      'Trajectory prior requires at least two points.',
    );
  }

  if (
    phase <=
    phases[0]
  ) {
    return progress[0];
  }

  const lastIndex =
    phases.length - 1;

  if (
    phase >=
    phases[lastIndex]
  ) {
    return progress[lastIndex];
  }

  let rightIndex = 1;

  while (
    rightIndex <
      phases.length &&
    phases[rightIndex] <
      phase
  ) {
    rightIndex += 1;
  }

  const leftIndex =
    rightIndex - 1;

  const x0 =
    phases[leftIndex];

  const x1 =
    phases[rightIndex];

  const y0 =
    progress[leftIndex];

  const y1 =
    progress[rightIndex];

  if (x1 <= x0) {
    throw new Error(
      'Trajectory phases must be strictly increasing.',
    );
  }

  const fraction =
    (
      phase -
      x0
    ) /
    (
      x1 -
      x0
    );

  return clamp01(
    y0 +
      (
        y1 -
        y0
      ) *
        fraction,
  );
}


function fatProgress(
  day: number,
  horizonDays: number,
  currentFat: number,
  predictedFat: number,
): {
  progress: number;
  policy: string;
} {
  const phase =
    linearProgress(
      day,
      horizonDays,
    );

  const delta =
    predictedFat -
    currentFat;

  const fatPolicy =
    TRAJECTORY_POLICY
      .policies
      .fat_mass;

  if (
    Math.abs(
      delta,
    ) <
    fatPolicy
      .absolute_delta_threshold_kg
  ) {
    return {
      progress:
        phase,

      policy:
        'linear_small_change',
    };
  }

  const direction =
    delta > 0
      ? 'increase'
      : 'decrease';

  const prior =
    fatPolicy[
      direction
    ];

  return {
    progress:
      interpolateProgress(
        phase,
        prior,
      ),

    policy:
      `directional_empirical_${direction}`,
  };
}


export function generatePredictionTrajectory(
  current: TrajectoryEndpoint,
  prediction: TrajectoryEndpoint,
  horizonDays =
    TRAJECTORY_POLICY
      .horizon_default_days,
): PredictionTrajectoryPoint[] {
  if (horizonDays <= 0) {
    throw new Error(
      'horizonDays must be positive.',
    );
  }

  const points:
    PredictionTrajectoryPoint[] =
      [];

  for (
    let day = 0;
    day <= horizonDays;
    day += 1
  ) {
    const progress =
      linearProgress(
        day,
        horizonDays,
      );

    const weight =
      current.weight_kg +
      (
        prediction.weight_kg -
        current.weight_kg
      ) *
        progress;

    const {
      progress: fatPhase,
      policy: fatPolicy,
    } =
      fatProgress(
        day,
        horizonDays,
        current.fat_mass_kg,
        prediction.fat_mass_kg,
      );

    const fat =
      current.fat_mass_kg +
      (
        prediction.fat_mass_kg -
        current.fat_mass_kg
      ) *
        fatPhase;

    const skeletalMuscle =
      current.skeletal_muscle_kg +
      (
        prediction
          .skeletal_muscle_kg -
        current
          .skeletal_muscle_kg
      ) *
        progress;

    if (weight <= 0) {
      throw new Error(
        'Trajectory produced non-positive weight.',
      );
    }

    const bodyFatPct =
      100 *
      fat /
      weight;

    points.push({
      day,

      weight_kg:
        weight,

      fat_mass_kg:
        fat,

      skeletal_muscle_kg:
        skeletalMuscle,

      body_fat_pct:
        bodyFatPct,

      fat_trajectory_policy:
        fatPolicy,
    });
  }

  return points;
}


export function getTrajectoryPolicyMeta() {
  return {
    version:
      TRAJECTORY_POLICY
        .version,

    researchVersion:
      TRAJECTORY_POLICY
        .research_version,

    horizonDays:
      TRAJECTORY_POLICY
        .horizon_default_days,

    fatDeltaThresholdKg:
      TRAJECTORY_POLICY
        .policies
        .fat_mass
        .absolute_delta_threshold_kg,
  };
}
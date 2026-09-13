from __future__ import annotations

from bisect import bisect_left
from pathlib import Path
from typing import Any
import json
import math


# ================================================================================================
# PATHS
# ================================================================================================

BASE_DIR = (
    Path(__file__)
    .resolve()
    .parents[1]
)

TRAJECTORY_POLICY_PATH = (
    BASE_DIR
    / "models"
    / "trajectory_policy_v1.json"
)


# ================================================================================================
# LOAD POLICY
# ================================================================================================

if not TRAJECTORY_POLICY_PATH.exists():

    raise RuntimeError(
        "Missing trajectory policy artifact: "
        f"{TRAJECTORY_POLICY_PATH}"
    )


with open(
    TRAJECTORY_POLICY_PATH,
    "r",
    encoding="utf-8",
) as f:

    TRAJECTORY_POLICY = json.load(
        f
    )


TRAJECTORY_VERSION = str(
    TRAJECTORY_POLICY.get(
        "version",
        "unknown",
    )
)

TRAJECTORY_RESEARCH_VERSION = str(
    TRAJECTORY_POLICY.get(
        "research_version",
        "unknown",
    )
)

DEFAULT_HORIZON_DAYS = int(
    TRAJECTORY_POLICY.get(
        "horizon_default_days",
        30,
    )
)

POLICIES = (
    TRAJECTORY_POLICY.get(
        "policies"
    )
)


if not isinstance(
    POLICIES,
    dict,
):

    raise RuntimeError(
        "Invalid trajectory policy: "
        "missing policies."
    )


# ================================================================================================
# POLICY VALIDATION
# ================================================================================================

def _require_policy(
    name: str,
) -> dict[str, Any]:

    policy = (
        POLICIES.get(
            name
        )
    )

    if not isinstance(
        policy,
        dict,
    ):

        raise RuntimeError(
            "Invalid trajectory policy: "
            f"missing {name}."
        )

    return policy


WEIGHT_POLICY = (
    _require_policy(
        "weight"
    )
)

FAT_POLICY = (
    _require_policy(
        "fat_mass"
    )
)

SMM_POLICY = (
    _require_policy(
        "skeletal_muscle"
    )
)

BF_POLICY = (
    _require_policy(
        "body_fat_pct"
    )
)


if (
    WEIGHT_POLICY.get(
        "type"
    )
    !=
    "linear"
):

    raise RuntimeError(
        "Unexpected weight trajectory policy."
    )


if (
    FAT_POLICY.get(
        "type"
    )
    !=
    "directional_empirical"
):

    raise RuntimeError(
        "Unexpected fat trajectory policy."
    )


if (
    FAT_POLICY.get(
        "small_change_fallback"
    )
    !=
    "linear"
):

    raise RuntimeError(
        "Unexpected fat small-change fallback."
    )


if (
    SMM_POLICY.get(
        "type"
    )
    !=
    "linear"
):

    raise RuntimeError(
        "Unexpected skeletal muscle trajectory policy."
    )


if (
    BF_POLICY.get(
        "type"
    )
    !=
    "derived"
):

    raise RuntimeError(
        "Unexpected body-fat-percent trajectory policy."
    )


FAT_DELTA_THRESHOLD_KG = float(
    FAT_POLICY[
        "absolute_delta_threshold_kg"
    ]
)


# ================================================================================================
# NUMERIC HELPERS
# ================================================================================================

def _finite_float(
    value: Any,
    field_name: str,
) -> float:

    try:

        number = float(
            value
        )

    except (
        TypeError,
        ValueError,
    ) as exc:

        raise ValueError(
            f"{field_name} must be numeric."
        ) from exc


    if not math.isfinite(
        number
    ):

        raise ValueError(
            f"{field_name} must be finite."
        )


    return number


def _linear_progress(
    day: int,
    horizon_days: int,
) -> float:

    if horizon_days <= 0:

        raise ValueError(
            "horizon_days must be positive."
        )


    return min(
        1.0,
        max(
            0.0,
            float(day)
            /
            float(horizon_days),
        ),
    )


def _interpolate_progress(
    phase: float,
    phases: list[float],
    progresses: list[float],
) -> float:

    if (
        len(phases)
        !=
        len(progresses)
    ):

        raise RuntimeError(
            "Trajectory phase/progress length mismatch."
        )


    if len(
        phases
    ) < 2:

        raise RuntimeError(
            "Trajectory empirical prior "
            "requires at least two points."
        )


    if phase <= phases[0]:

        return float(
            progresses[0]
        )


    if phase >= phases[-1]:

        return float(
            progresses[-1]
        )


    right_index = (
        bisect_left(
            phases,
            phase,
        )
    )


    if right_index <= 0:

        return float(
            progresses[0]
        )


    if right_index >= len(
        phases
    ):

        return float(
            progresses[-1]
        )


    left_index = (
        right_index
        -
        1
    )


    x0 = float(
        phases[
            left_index
        ]
    )

    x1 = float(
        phases[
            right_index
        ]
    )

    y0 = float(
        progresses[
            left_index
        ]
    )

    y1 = float(
        progresses[
            right_index
        ]
    )


    if x1 <= x0:

        raise RuntimeError(
            "Trajectory phases must be "
            "strictly increasing."
        )


    fraction = (
        (
            phase
            -
            x0
        )
        /
        (
            x1
            -
            x0
        )
    )


    return (
        y0
        +
        (
            y1
            -
            y0
        )
        *
        fraction
    )


# ================================================================================================
# FAT EMPIRICAL PRIOR
# ================================================================================================

def _fat_empirical_progress(
    phase: float,
    direction: str,
) -> float:

    direction_policy = (
        FAT_POLICY.get(
            direction
        )
    )


    if not isinstance(
        direction_policy,
        dict,
    ):

        raise RuntimeError(
            "Missing fat directional prior: "
            f"{direction}"
        )


    raw_phases = (
        direction_policy.get(
            "phase"
        )
    )

    raw_progresses = (
        direction_policy.get(
            "progress"
        )
    )


    if (
        not isinstance(
            raw_phases,
            list,
        )
        or
        not isinstance(
            raw_progresses,
            list,
        )
    ):

        raise RuntimeError(
            "Invalid fat directional prior."
        )


    phases = [
        float(value)
        for value
        in raw_phases
    ]

    progresses = [
        float(value)
        for value
        in raw_progresses
    ]


    progress = (
        _interpolate_progress(
            phase,
            phases,
            progresses,
        )
    )


    # Defensive clamp only.
    # Production artifact itself should already
    # contain progress in the [0, 1] range.
    return min(
        1.0,
        max(
            0.0,
            progress,
        ),
    )


def _fat_progress(
    day: int,
    horizon_days: int,
    current_fat: float,
    predicted_fat: float,
) -> tuple[float, str]:

    phase = (
        _linear_progress(
            day,
            horizon_days,
        )
    )


    delta = (
        predicted_fat
        -
        current_fat
    )


    if (
        abs(
            delta
        )
        <
        FAT_DELTA_THRESHOLD_KG
    ):

        return (
            phase,
            "linear_small_change",
        )


    direction = (
        "increase"
        if delta > 0
        else "decrease"
    )


    return (
        _fat_empirical_progress(
            phase,
            direction,
        ),
        f"directional_empirical_{direction}",
    )


# ================================================================================================
# TRAJECTORY GENERATOR
# ================================================================================================

def generate_trajectory(
    current: dict[str, Any],
    prediction: dict[str, Any],
    horizon_days: int | None = None,
) -> list[dict[str, Any]]:

    if horizon_days is None:

        horizon_days = (
            DEFAULT_HORIZON_DAYS
        )


    horizon_days = int(
        horizon_days
    )


    if horizon_days <= 0:

        raise ValueError(
            "horizon_days must be positive."
        )


    current_weight = (
        _finite_float(
            current.get(
                "weight_kg"
            ),
            "current.weight_kg",
        )
    )

    current_fat = (
        _finite_float(
            current.get(
                "fat_mass_kg"
            ),
            "current.fat_mass_kg",
        )
    )

    current_smm = (
        _finite_float(
            current.get(
                "skeletal_muscle_kg"
            ),
            "current.skeletal_muscle_kg",
        )
    )


    predicted_weight = (
        _finite_float(
            prediction.get(
                "weight_kg"
            ),
            "prediction.weight_kg",
        )
    )

    predicted_fat = (
        _finite_float(
            prediction.get(
                "fat_mass_kg"
            ),
            "prediction.fat_mass_kg",
        )
    )

    predicted_smm = (
        _finite_float(
            prediction.get(
                "skeletal_muscle_kg"
            ),
            "prediction.skeletal_muscle_kg",
        )
    )


    if (
        current_weight <= 0
        or
        predicted_weight <= 0
    ):

        raise ValueError(
            "Weight must be positive."
        )


    if (
        current_fat < 0
        or
        predicted_fat < 0
    ):

        raise ValueError(
            "Fat mass must be non-negative."
        )


    if (
        current_smm <= 0
        or
        predicted_smm <= 0
    ):

        raise ValueError(
            "Skeletal muscle mass must be positive."
        )


    trajectory: list[
        dict[str, Any]
    ] = []


    for day in range(
        horizon_days + 1
    ):

        linear_progress = (
            _linear_progress(
                day,
                horizon_days,
            )
        )


        weight = (
            current_weight
            +
            (
                predicted_weight
                -
                current_weight
            )
            *
            linear_progress
        )


        fat_progress, fat_policy_used = (
            _fat_progress(
                day,
                horizon_days,
                current_fat,
                predicted_fat,
            )
        )


        fat = (
            current_fat
            +
            (
                predicted_fat
                -
                current_fat
            )
            *
            fat_progress
        )


        smm = (
            current_smm
            +
            (
                predicted_smm
                -
                current_smm
            )
            *
            linear_progress
        )


        if weight <= 0:

            raise RuntimeError(
                "Trajectory produced "
                "non-positive weight."
            )


        body_fat_pct = (
            100.0
            *
            fat
            /
            weight
        )


        trajectory.append({

            "day":
                day,

            "weight_kg":
                float(
                    weight
                ),

            "fat_mass_kg":
                float(
                    fat
                ),

            "skeletal_muscle_kg":
                float(
                    smm
                ),

            "body_fat_pct":
                float(
                    body_fat_pct
                ),

            "fat_trajectory_policy":
                fat_policy_used,
        })


    return trajectory


# ================================================================================================
# METADATA
# ================================================================================================

def trajectory_metadata() -> dict[str, Any]:

    return {

        "version":
            TRAJECTORY_VERSION,

        "research_version":
            TRAJECTORY_RESEARCH_VERSION,

        "horizon_days":
            DEFAULT_HORIZON_DAYS,

        "weight":
            "linear",

        "fat_mass": {
            "type":
                "directional_empirical",

            "small_change_fallback":
                "linear",

            "absolute_delta_threshold_kg":
                FAT_DELTA_THRESHOLD_KG,
        },

        "skeletal_muscle":
            "linear",

        "body_fat_pct":
            "derived_from_weight_and_fat",

        "recent_slope_personalization":
            False,

        "prediction_intervals":
            "not_calibrated",
    }
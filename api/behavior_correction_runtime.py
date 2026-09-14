from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional
import json

import pandas as pd
from catboost import CatBoostRegressor


BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = BASE_DIR / "models" / "behavior_correction_v1"
MANIFEST_PATH = MODEL_DIR / "manifest.json"


def _load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise RuntimeError(
            f"Missing behavior correction manifest: {MANIFEST_PATH}"
        )

    with MANIFEST_PATH.open(
        "r",
        encoding="utf-8",
    ) as f:
        return json.load(f)


MANIFEST = _load_manifest()


BODY_FEATURES = list(
    MANIFEST[
        "feature_contract"
    ][
        "body_features"
    ]
)

DIET_FEATURES = list(
    MANIFEST[
        "feature_contract"
    ][
        "diet_features"
    ]
)

CATEGORICAL_FEATURES = list(
    MANIFEST[
        "feature_contract"
    ][
        "categorical_features"
    ]
)

ROLLING_WINDOW_DAYS = int(
    MANIFEST[
        "gate"
    ][
        "rolling_window_days"
    ]
)

MIN_OBSERVED_MEAL_DAYS = int(
    MANIFEST[
        "gate"
    ][
        "minimum_observed_meal_days"
    ]
)


def _load_model(filename: str) -> CatBoostRegressor:
    path = MODEL_DIR / filename

    if not path.exists():
        raise RuntimeError(
            f"Missing behavior correction artifact: {path}"
        )

    model = CatBoostRegressor()
    model.load_model(str(path))
    return model


MODELS: dict[str, dict[str, CatBoostRegressor]] = {}

for target in (
    "weight_kg",
    "fat_mass_kg",
):
    config = MANIFEST[
        "targets"
    ][
        target
    ]

    MODELS[target] = {
        "body": _load_model(
            config[
                "body_model_file"
            ]
        ),
        "behavior": _load_model(
            config[
                "behavior_model_file"
            ]
        ),
    }


def _safe_float(
    value: Any,
) -> Optional[float]:
    if value is None:
        return None

    try:
        number = float(value)
    except (
        TypeError,
        ValueError,
    ):
        return None

    if number != number:
        return None

    return number


def _normalize_sex(
    value: Any,
) -> Optional[str]:
    if value is None:
        return None

    text = str(value).strip().lower()

    if text in {
        "male",
        "m",
        "man",
        "남",
        "남성",
    }:
        return "Male"

    if text in {
        "female",
        "f",
        "woman",
        "여",
        "여성",
    }:
        return "Female"

    return None


def _resolve_age_years(
    profile: Optional[dict],
    prediction_date: date,
) -> Optional[float]:
    if not profile:
        return None

    birth_year = profile.get(
        "birth_year"
    )

    if birth_year is None:
        return None

    try:
        birth_year = int(
            birth_year
        )
    except (
        TypeError,
        ValueError,
    ):
        return None

    age = (
        prediction_date.year
        - birth_year
    )

    if not (
        10
        <= age
        <= 100
    ):
        return None

    return float(age)


def _build_feature_rows(
    *,
    current_body: dict,
    profile: Optional[dict],
    behavior_context: dict,
    prediction_date: date,
) -> tuple[
    Optional[pd.DataFrame],
    Optional[pd.DataFrame],
    dict,
]:
    windows = (
        behavior_context.get(
            "windows"
        )
        or {}
    )

    seven_day = (
        windows.get("7d")
        or {}
    )

    meal_summary = (
        seven_day.get(
            "meals"
        )
        or {}
    )

    meal_average = (
        meal_summary.get(
            "observed_day_average"
        )
        or {}
    )

    observed_days = int(
        meal_summary.get(
            "observed_days",
            0,
        )
        or 0
    )

    coverage_ratio = _safe_float(
        meal_summary.get(
            "coverage_ratio"
        )
    )

    anchor_text = behavior_context.get(
        "anchor_date"
    )

    cutoff_text = behavior_context.get(
        "behavior_cutoff_date"
    )

    try:
        anchor_date = date.fromisoformat(
            str(anchor_text)
        )
        cutoff_date = date.fromisoformat(
            str(cutoff_text)
        )
    except (
        TypeError,
        ValueError,
    ):
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "invalid_behavior_dates",
                "observed_meal_days": observed_days,
                "coverage_ratio": coverage_ratio,
            },
        )

    earliest_eligible_cutoff = (
        anchor_date
        + timedelta(
            days=ROLLING_WINDOW_DAYS
        )
    )

    if cutoff_date < earliest_eligible_cutoff:
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "insufficient_post_inbody_elapsed_days",
                "observed_meal_days": observed_days,
                "coverage_ratio": coverage_ratio,
                "anchor_date": anchor_date.isoformat(),
                "behavior_cutoff_date": cutoff_date.isoformat(),
                "earliest_eligible_cutoff_date": (
                    earliest_eligible_cutoff.isoformat()
                ),
            },
        )

    if observed_days < MIN_OBSERVED_MEAL_DAYS:
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "insufficient_recent_meal_days",
                "observed_meal_days": observed_days,
                "minimum_observed_meal_days": (
                    MIN_OBSERVED_MEAL_DAYS
                ),
                "coverage_ratio": coverage_ratio,
            },
        )

    current_weight = _safe_float(
        current_body.get(
            "weight_kg"
        )
    )

    current_fat = _safe_float(
        current_body.get(
            "fat_mass_kg"
        )
    )

    current_bf = _safe_float(
        current_body.get(
            "body_fat_pct"
        )
    )

    if (
        current_weight is None
        or current_weight <= 0
        or current_fat is None
        or current_fat < 0
        or current_bf is None
    ):
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "invalid_current_body",
                "observed_meal_days": observed_days,
                "coverage_ratio": coverage_ratio,
            },
        )

    sex = _normalize_sex(
        None
        if not profile
        else profile.get(
            "sex"
        )
    )

    age_years = _resolve_age_years(
        profile,
        prediction_date,
    )

    if sex is None:
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "missing_or_unsupported_profile_sex",
                "observed_meal_days": observed_days,
                "coverage_ratio": coverage_ratio,
            },
        )

    if age_years is None:
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "missing_or_invalid_birth_year",
                "observed_meal_days": observed_days,
                "coverage_ratio": coverage_ratio,
            },
        )

    avg_carbs = _safe_float(
        meal_average.get(
            "carbs_g"
        )
    )

    avg_fat = _safe_float(
        meal_average.get(
            "fat_g"
        )
    )

    avg_protein = _safe_float(
        meal_average.get(
            "protein_g"
        )
    )

    if (
        avg_carbs is None
        or avg_fat is None
        or avg_protein is None
    ):
        return (
            None,
            None,
            {
                "eligible": False,
                "reason": "incomplete_recent_nutrition",
                "observed_meal_days": observed_days,
                "coverage_ratio": coverage_ratio,
            },
        )

    protein_per_kg = (
        avg_protein
        / current_weight
    )

    body_row = {
        "age_years": age_years,
        "sex": sex,
        "baseline_weight_kg": current_weight,
        "baseline_fat_mass_kg": current_fat,
        "baseline_body_fat_pct_tanita": current_bf,
    }

    diet_row = {
        "week1_carb_g_per_day": avg_carbs,
        "week1_fat_g_per_day": avg_fat,
        "week1_protein_g_per_kg": protein_per_kg,
    }

    body_frame = pd.DataFrame(
        [body_row]
    )[
        BODY_FEATURES
    ]

    behavior_frame = pd.DataFrame(
        [
            {
                **body_row,
                **diet_row,
            }
        ]
    )[
        BODY_FEATURES
        + DIET_FEATURES
    ]

    return (
        body_frame,
        behavior_frame,
        {
            "eligible": True,
            "reason": "eligible",
            "observed_meal_days": observed_days,
            "coverage_ratio": coverage_ratio,
            "window_days": ROLLING_WINDOW_DAYS,
            "anchor_date": anchor_date.isoformat(),
            "behavior_cutoff_date": cutoff_date.isoformat(),
            "features": {
                "avg_carbs_g": avg_carbs,
                "avg_fat_g": avg_fat,
                "avg_protein_g": avg_protein,
                "avg_protein_g_per_kg": protein_per_kg,
                "age_years": age_years,
                "sex": sex,
            },
        },
    )


def apply_behavior_correction(
    *,
    result: dict,
    current_body: dict,
    profile: Optional[dict],
    behavior_context: dict,
    prediction_date: date,
) -> dict:
    (
        body_frame,
        behavior_frame,
        gate,
    ) = _build_feature_rows(
        current_body=current_body,
        profile=profile,
        behavior_context=behavior_context,
        prediction_date=prediction_date,
    )

    correction_meta = {
        "model_name": MANIFEST[
            "model_name"
        ],
        "model_version": MANIFEST[
            "model_version"
        ],
        "cutoff_policy": "D-1",
        "rolling_window_days": ROLLING_WINDOW_DAYS,
        "minimum_observed_meal_days": (
            MIN_OBSERVED_MEAL_DAYS
        ),
        "gate": gate,
        "applied": False,
        "weight_kg": 0.0,
        "fat_mass_kg": 0.0,
        "smm_actual_kg": 0.0,
    }

    if (
        body_frame is None
        or behavior_frame is None
        or not gate.get(
            "eligible",
            False,
        )
    ):
        result[
            "behavior_correction"
        ] = correction_meta
        return result

    corrections = {}

    for target in (
        "weight_kg",
        "fat_mass_kg",
    ):
        body_delta = float(
            MODELS[
                target
            ][
                "body"
            ].predict(
                body_frame
            )[0]
        )

        behavior_delta = float(
            MODELS[
                target
            ][
                "behavior"
            ].predict(
                behavior_frame
            )[0]
        )

        corrections[
            target
        ] = {
            "body_delta_kg": body_delta,
            "behavior_delta_kg": behavior_delta,
            "correction_kg": (
                behavior_delta
                - body_delta
            ),
        }

    base_weight = float(
        result[
            "prediction"
        ][
            "weight_kg"
        ]
    )

    base_fat = float(
        result[
            "prediction"
        ][
            "fat_mass_kg"
        ]
    )

    base_smm = float(
        result[
            "prediction"
        ][
            "skeletal_muscle_kg"
        ]
    )

    corrected_weight = (
        base_weight
        + corrections[
            "weight_kg"
        ][
            "correction_kg"
        ]
    )

    corrected_fat = (
        base_fat
        + corrections[
            "fat_mass_kg"
        ][
            "correction_kg"
        ]
    )

    if corrected_weight <= 0:
        raise RuntimeError(
            "Behavior correction produced non-positive predicted weight."
        )

    if corrected_fat < 0:
        raise RuntimeError(
            "Behavior correction produced negative predicted fat mass."
        )

    if corrected_fat >= corrected_weight:
        raise RuntimeError(
            "Behavior correction produced fat mass >= body weight."
        )

    corrected_bf = (
        100.0
        * corrected_fat
        / corrected_weight
    )

    if not (
        0
        <= corrected_bf
        < 100
    ):
        raise RuntimeError(
            "Behavior correction produced invalid body-fat percentage."
        )

    result[
        "prediction"
    ][
        "weight_kg"
    ] = float(
        corrected_weight
    )

    result[
        "prediction"
    ][
        "fat_mass_kg"
    ] = float(
        corrected_fat
    )

    # SMM is intentionally untouched.
    result[
        "prediction"
    ][
        "skeletal_muscle_kg"
    ] = float(
        base_smm
    )

    result[
        "prediction"
    ][
        "body_fat_pct"
    ] = float(
        corrected_bf
    )

    result[
        "change"
    ][
        "weight_kg"
    ] = float(
        corrected_weight
        - current_body[
            "weight_kg"
        ]
    )

    result[
        "change"
    ][
        "fat_mass_kg"
    ] = float(
        corrected_fat
        - current_body[
            "fat_mass_kg"
        ]
    )

    result[
        "change"
    ][
        "skeletal_muscle_kg"
    ] = float(
        base_smm
        - current_body[
            "skeletal_muscle_kg"
        ]
    )

    result[
        "change"
    ][
        "body_fat_pct"
    ] = float(
        corrected_bf
        - current_body[
            "body_fat_pct"
        ]
    )

    correction_meta.update(
        {
            "applied": True,
            "weight_kg": float(
                corrections[
                    "weight_kg"
                ][
                    "correction_kg"
                ]
            ),
            "fat_mass_kg": float(
                corrections[
                    "fat_mass_kg"
                ][
                    "correction_kg"
                ]
            ),
            "targets": corrections,
        }
    )

    result[
        "behavior_correction"
    ] = correction_meta

    return result


def health_status() -> dict:
    return {
        "model_version": MANIFEST[
            "model_version"
        ],
        "loaded": all(
            MODELS[
                target
            ][
                kind
            ]
            is not None
            for target in MODELS
            for kind in (
                "body",
                "behavior",
            )
        ),
        "rolling_window_days": ROLLING_WINDOW_DAYS,
        "minimum_observed_meal_days": (
            MIN_OBSERVED_MEAL_DAYS
        ),
    }
